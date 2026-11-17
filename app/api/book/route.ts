import fs from "node:fs";
import path from "node:path";
import { put, list } from "@vercel/blob";
import { getBook, loadConfig } from "@/lib/config";
import { loadRefresher } from "@/lib/data";
import type { BookRefresher } from "@/lib/types";
import { blobToken } from "@/lib/tts";
import { writeRefresher } from "@/scripts/lib/claude";

// "Remember this book": returns the refresher on file; otherwise asks Claude to write it,
// keeps a copy in Blob storage (the robot folds it into the repo on its next run) and returns it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DAILY_LIMIT = Number(process.env.YAM_BOOK_DAILY_LIMIT ?? 20);
let made = { day: "", count: 0 };

async function fromBlob(slug: string): Promise<BookRefresher | null> {
  const token = blobToken();
  if (!token) return null;
  const r = await list({ prefix: `books/${slug}.json`, limit: 1, token });
  const hit = r.blobs.find((b) => b.pathname === `books/${slug}.json`);
  if (!hit) return null;
  const res = await fetch(hit.url, { cache: "no-store" });
  return res.ok ? ((await res.json()) as BookRefresher) : null;
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const book = getBook(slug);
  if (!book) return new Response("Unknown book.", { status: 404 });

  const onFile = loadRefresher(slug);
  if (onFile) return Response.json(onFile, { headers: { "cache-control": "no-store" } });
  try {
    const cached = await fromBlob(slug);
    if (cached) return Response.json(cached, { headers: { "cache-control": "no-store" } });
  } catch {
    /* fall through and write it */
  }

  if (!process.env.ANTHROPIC_API_KEY) return new Response("The Yam isn't connected yet (missing ANTHROPIC_API_KEY).", { status: 503 });
  const day = new Date().toISOString().slice(0, 10);
  if (made.day !== day) made = { day, count: 0 };
  if (made.count >= DAILY_LIMIT) return new Response("Enough new refreshers for today — try again tomorrow.", { status: 429 });
  made.count += 1;

  try {
    const config = loadConfig();
    const r = await writeRefresher(config, book);
    const refresher: BookRefresher = { slug, generatedAt: new Date().toISOString(), ...r };
    const token = blobToken();
    if (token) {
      await put(`books/${slug}.json`, JSON.stringify(refresher), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token });
    } else {
      // Local development without Blob: keep it on disk.
      const dir = path.join(process.cwd(), "data", "books");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(refresher, null, 1));
    }
    return Response.json(refresher, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(`Couldn't write the refresher: ${msg.slice(0, 200)}`, { status: 502 });
  }
}
