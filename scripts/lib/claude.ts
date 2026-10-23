// Everything the robot asks Claude: reading agenda pages, summarising and
// scoring items, writing the spoken recaps and the morning greeting.

import Anthropic from "@anthropic-ai/sdk";
import type { CategoryConfig, Item, SiteConfig } from "../../lib/types";
import type { PageContent, RawItem } from "./fetchers";
import { countWords, extractJson, truncate } from "./text";

export const FAST_MODEL = process.env.YAM_FAST_MODEL ?? "claude-haiku-5-5";
export const SMART_MODEL = process.env.YAM_SMART_MODEL ?? "claude-sonnet-5-5";

export const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (GitHub secret / .env.local)");
  }
  if (!client) client = new Anthropic({ maxRetries: 4, timeout: 120000 });
  return client;
}

async function ask(model: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  usage.calls += 1;
  usage.inputTokens += res.usage?.input_tokens ?? 0;
  usage.outputTokens += res.usage?.output_tokens ?? 0;
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function readerBlock(config: SiteConfig): string {
  const r = config.reader;
  return [
    `READER: ${r.name}.`,
    r.profile.trim(),
    `She loves: ${r.loves.join("; ")}.`,
    `She avoids: ${r.avoids.join("; ")}.`,
  ].join("\n");
}

function categoryBlock(cat: CategoryConfig): string {
  const extra: string[] = [];
  if (cat.geo) extra.push(`Local area: ${cat.geo.center}, within ${cat.geo.radius_km} km. Places that count as local: ${cat.geo.places.join(", ")}.`);
  if (cat.platforms) extra.push(`Her platforms: ${cat.platforms.join(", ")}.`);
  if (cat.works) {
    const all = Object.entries(cat.works).map(([k, v]) => `${k}: ${v.join("; ")}`).join("\n");
    extra.push(`Works on the programme:\n${all}`);
  }
  return [`SECTION "${cat.name}": ${cat.brief.trim()}`, ...extra].join("\n");
}

// ---------------------------------------------------------------- page → items

interface ExtractedEvent {
  title: string;
  url?: string;
  date?: string | null;
  date_end?: string | null;
  place?: string | null;
  blurb?: string;
  kind?: "event" | "article";
}

export async function extractItemsFromPage(
  config: SiteConfig,
  cat: CategoryConfig,
  page: PageContent,
  sourceName: string,
  lang: string,
  today: string,
): Promise<RawItem[]> {
  const system = `You read a web page for a personal morning paper and extract the dated items it announces (exhibitions, events, markets, concerts, talks, new articles). Reply with JSON only.`;
  const links = page.links.map((l) => `- ${l.text} → ${l.href}`).join("\n");
  const user = `${categoryBlock(cat)}

Today is ${today}. Page: ${page.title} (${page.url})

PAGE TEXT (truncated):
"""
${page.text}
"""

LINKS ON THE PAGE:
${links}

Extract up to 15 distinct items that a reader would want to know about: things happening between today and 60 days from now, or pieces published in the last 7 days. Ignore navigation, menus, newsletters, generic category pages, and anything without a real title.
For each item give: "title" (original language), "url" (the most specific link for that item, absolute; if none matches use the page url), "date" (start date YYYY-MM-DD, or null if unknown), "date_end" (YYYY-MM-DD or null), "place" (venue or town, or null), "blurb" (one or two sentences in English, factual, mention dates and place when known), "kind" ("event" for something to attend, "article" otherwise).
Return a JSON array. Return [] if there is nothing relevant.`;

  const text = await ask(FAST_MODEL, system, user, 3500);
  let parsed: ExtractedEvent[] = [];
  try {
    parsed = extractJson<ExtractedEvent[]>(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: RawItem[] = [];
  for (const e of parsed) {
    if (!e?.title || typeof e.title !== "string") continue;
    const url = (e.url && /^https?:\/\//.test(e.url) ? e.url : page.url).trim();
    const date = e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : undefined;
    const dateEnd = e.date_end && /^\d{4}-\d{2}-\d{2}$/.test(e.date_end) ? e.date_end : undefined;
    out.push({
      title: e.title.trim(),
      url,
      publishedAt: new Date().toISOString(),
      description: truncate((e.blurb ?? "").trim(), 500),
      type: e.kind === "article" ? "article" : "event",
      source: sourceName,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      lang,
      eventDate: date,
      eventEnd: dateEnd,
      eventPlace: e.place ?? undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------- summarise + score

export interface Enriched {
  keep: boolean;
  relevance: number;
  summary: string;
  goodNews: boolean;
}

export async function enrichItems(
  config: SiteConfig,
  cat: CategoryConfig,
  items: RawItem[],
  today: string,
): Promise<Enriched[]> {
  const system = `You are the editor of "The Daily Yam", a private English-language morning paper written for one reader. You judge whether each item belongs in a section and you write its summary. British English, warm but precise, no hype, no emojis. Reply with JSON only.`;
  const list = items
    .map((it, i) => {
      const bits = [
        `#${i} [${it.type}] ${it.title}`,
        `source: ${it.source} (${it.domain}) · lang: ${it.lang}${it.publishedAt ? ` · published: ${it.publishedAt.slice(0, 16)}` : ""}${it.eventDate ? ` · event: ${it.eventDate}${it.eventEnd ? "→" + it.eventEnd : ""}${it.eventPlace ? " at " + it.eventPlace : ""}` : ""}${it.duration ? ` · ${it.duration}` : ""}`,
        it.description ? `text: ${truncate(it.description, 600)}` : "",
      ].filter(Boolean);
      return bits.join("\n");
    })
    .join("\n\n");

  const user = `${readerBlock(config)}

${categoryBlock(cat)}

Today is ${today}. Judge each item below for this section and this reader.

Rules:
- "keep": false for anything off-topic for the section, duplicated, purely promotional, paywalled-teaser with no substance, sports, crime, party politics, markets, or clickbait.
- "relevance": 0–10 for how much Yamuna herself would want to read, watch or listen to it this morning (10 = drop everything). Local, timely and beautifully written things score higher; generic industry news scores lower.
- "summary": 2–3 sentences in English (max 60 words) that tell her what it is and why it might matter to her, written in your own words. For French items, still write the summary in English and keep proper nouns. For events, start with the date and place. Never invent facts not in the text; if the text is thin, say what the piece is about in one sentence.
- "goodNews": true only if the item is genuinely uplifting (something went right for people, nature or culture).

ITEMS:
${list}

Return a JSON array with exactly ${items.length} objects in the same order: {"i": index, "keep": boolean, "relevance": number, "summary": string, "goodNews": boolean}.`;

  const text = await ask(FAST_MODEL, system, user, 4000);
  let parsed: Array<{ i?: number; keep?: boolean; relevance?: number; summary?: string; goodNews?: boolean }> = [];
  try {
    parsed = extractJson(text);
  } catch (err) {
    throw new Error(`Could not parse Claude's JSON for ${cat.id}: ${(err as Error).message}`);
  }
  const byIndex = new Map<number, (typeof parsed)[number]>();
  parsed.forEach((p, idx) => byIndex.set(typeof p.i === "number" ? p.i : idx, p));
  return items.map((_, i) => {
    const p = byIndex.get(i);
    return {
      keep: Boolean(p?.keep),
      relevance: Math.max(0, Math.min(10, Number(p?.relevance ?? 0))),
      summary: (p?.summary ?? "").trim(),
      goodNews: Boolean(p?.goodNews),
    };
  });
}

// ---------------------------------------------------------------- spoken recap

export async function writeRecap(
  config: SiteConfig,
  cat: CategoryConfig,
  items: Item[],
  minutes: number,
  today: string,
): Promise<{ text: string; words: number }> {
  const targetWords = Math.round(minutes * 150);
  const system = `You write short spoken briefings for one listener, read aloud by a text-to-speech voice. British English. Warm, clear, unhurried. No headings, no bullet points, no URLs, no emojis, no stage directions. Write numbers and dates as words where natural. Mention the source outlet by name when it helps ("The Guardian reports…").`;
  const list = items
    .map((it, i) => `${i + 1}. [${it.type}] ${it.title} — ${it.source}${it.eventDate ? ` — ${it.eventDate}${it.eventPlace ? ", " + it.eventPlace : ""}` : ""}\n   ${it.summary}`)
    .join("\n");
  const user = `${readerBlock(config)}

${categoryBlock(cat)}

Today is ${today}. Write the "${cat.name}" briefing for Yamuna covering the last 48 hours, about ${targetWords} words (${minutes} minutes aloud). Open with "Good morning, Yamuna" and one sentence of framing, then move through the items grouped by theme rather than one by one, giving each enough detail to be useful, and finish with a single light sign-off sentence. Use only the facts below.

ITEMS:
${list}`;

  const text = await ask(SMART_MODEL, system, user, Math.min(8000, targetWords * 3 + 500));
  return { text, words: countWords(text) };
}

// ---------------------------------------------------------------- morning briefing (all sections)

export async function writeBriefing(
  config: SiteConfig,
  items: Array<Item & { categoryName: string }>,
  minutes: number,
  today: string,
): Promise<{ text: string; words: number }> {
  const targetWords = Math.round(minutes * 150);
  const system = `You write a short spoken morning briefing for one listener, read aloud by a text-to-speech voice. British English, warm, clear, unhurried — a Radio 4 presenter reading to a friend. No headings, bullet points, URLs, emojis or stage directions. Write numbers and dates as words where natural. Name the outlet when it helps.`;
  const list = items
    .map((it, i) => `${i + 1}. [${it.categoryName} · ${it.type}] ${it.title} — ${it.source}${it.eventDate ? ` — ${it.eventDate}${it.eventPlace ? ", " + it.eventPlace : ""}` : ""}\n   ${it.summary}`)
    .join("\n");
  const user = `${readerBlock(config)}

Today is ${today}. Write "The Daily Yam" morning briefing for Yamuna, about ${targetWords} words (${minutes} minutes aloud), covering the best of every section below. Open with "Good morning, Yamuna" and the day of the week, move through the stories grouped by section or theme with a light transition between them, give each enough detail to be useful, and end with one warm sign-off sentence. Use only the facts below.

STORIES:
${list}`;
  const text = await ask(SMART_MODEL, system, user, Math.min(8000, targetWords * 3 + 500));
  return { text, words: countWords(text) };
}

// ---------------------------------------------------------------- greeting

export async function writeGreeting(config: SiteConfig, mix: Item[], today: string): Promise<string> {
  const system = `You write one warm, short greeting line for the top of a personal morning paper. British English, no emojis, no exclamation marks, at most two sentences and 35 words. Reply with the sentence only.`;
  const user = `${readerBlock(config)}

Today is ${today}. The morning's mix has ${mix.length} stories. The first few:
${mix.slice(0, 6).map((m) => `- ${m.title} (${m.category})`).join("\n")}

Write the greeting. Start with "Good morning, Yamuna." and hint at one or two things worth her attention, without listing them all.`;
  // Generous max_tokens: the model's own thinking counts against it, and 200 left nothing for the answer.
  const text = await ask(FAST_MODEL, system, user, 1200);
  return text.replace(/^["“]|["”]$/g, "").trim();
}
