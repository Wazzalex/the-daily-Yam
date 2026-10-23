import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "@/lib/config";
import { itemsById, loadItems, loadLatestEdition } from "@/lib/data";
import { longDate } from "@/lib/format";
import type { Item } from "@/lib/types";

// "Ask the Yam": answers from today's stories first, with a web search in reserve.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = process.env.YAM_SMART_MODEL ?? "claude-sonnet-5-5";
const DAILY_LIMIT = Number(process.env.YAM_BOT_DAILY_LIMIT ?? 200);
const PER_IP_HOURLY = 30;

// Light, in-memory rate limiting (per instance). Enough for a one-reader paper.
const perIp = new Map<string, { count: number; reset: number }>();
let daily = { day: "", count: 0 };

function allow(ip: string): boolean {
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  if (daily.day !== day) daily = { day, count: 0 };
  if (daily.count >= DAILY_LIMIT) return false;
  const rec = perIp.get(ip);
  if (!rec || rec.reset < now) perIp.set(ip, { count: 1, reset: now + 3600_000 });
  else if (rec.count >= PER_IP_HOURLY) return false;
  else rec.count += 1;
  daily.count += 1;
  return true;
}

interface Body {
  question?: string;
  category?: string;
  itemIds?: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

function describe(i: Item, categoryName: string): string {
  const when = i.eventDate ? `event ${i.eventDate}${i.eventPlace ? " at " + i.eventPlace : ""}` : i.publishedAt.slice(0, 10);
  return `- [${categoryName} · ${i.type} · ${i.source} · ${when}] ${i.title}\n  ${i.summary}\n  ${i.url}`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("The Yam isn't connected yet (missing ANTHROPIC_API_KEY on the server).", { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(ip)) return new Response("The Yam needs a short rest — try again in a little while.", { status: 429 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const question = (body.question ?? "").toString().trim().slice(0, 600);
  if (!question) return new Response("Ask me something first.", { status: 400 });

  const config = loadConfig();
  const names = new Map(config.categories.map((c) => [c.id, c.name]));
  const all = loadItems();
  const byId = itemsById(all);
  const edition = loadLatestEdition();
  const category = config.categories.find((c) => c.id === body.category);

  const onScreen = (body.itemIds ?? []).slice(0, 30).map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
  const onScreenIds = new Set(onScreen.map((i) => i.id));
  const pool = (category ? all.filter((i) => i.category === category.id) : all)
    .filter((i) => !onScreenIds.has(i.id))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, category ? 25 : 30);

  const system = `You are "the Yam", the friendly voice of The Daily Yam, a private morning paper written for one reader, ${config.reader.name}. British English, warm, precise, no emojis. Keep answers short (under 150 words) unless she asks for detail; use short paragraphs, not headings.

About her: ${config.reader.profile.trim()}

Today is ${longDate(edition?.generatedAt ?? new Date())}.${category ? ` She is reading the "${category.name}" section: ${category.brief.trim()}` : " She is on the front page."}

How to answer:
1. Use the stories below first — they are what she is looking at. When you refer to one, name it and give its link on its own line.
2. If the question is about something not in those stories, or needs anything more recent or more precise, use web search (at most three searches), prefer reputable English-language sources, and give the links. Never use ${config.rules.blocked_domains.join(", ")}.
3. Never invent facts, dates or quotes. If you don't know, say so and suggest where to look.
4. French items keep their French titles; explain them in English.

STORIES ON HER SCREEN:
${onScreen.map((i) => describe(i, names.get(i.category) ?? i.category)).join("\n") || "(none)"}

OTHER RECENT STORIES ON THE SITE:
${pool.map((i) => describe(i, names.get(i.category) ?? i.category)).join("\n") || "(none)"}`;

  const history = (body.history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const client = new Anthropic({ maxRetries: 2, timeout: 55_000 });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const run = client.messages.stream({
          model: MODEL,
          max_tokens: 900,
          system,
          messages: [...history, { role: "user", content: question }],
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3,
              blocked_domains: config.rules.blocked_domains,
              user_location: { type: "approximate", city: "Grenoble", region: "Auvergne-Rhône-Alpes", country: "FR", timezone: "Europe/Paris" },
            },
          ],
        });
        for await (const event of run) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          } else if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
            controller.enqueue(encoder.encode(""));
          }
        }
        const final = await run.finalMessage();
        const urls: string[] = [];
        for (const block of final.content) {
          if (block.type === "text" && block.citations) {
            for (const c of block.citations) {
              if (c.type === "web_search_result_location" && !urls.includes(c.url)) urls.push(c.url);
            }
          }
        }
        if (urls.length) controller.enqueue(encoder.encode(`\n\nSources: ${urls.slice(0, 5).join("  ")}`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(encoder.encode(`\n\n(The Yam stumbled: ${msg.slice(0, 160)})`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
