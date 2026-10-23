import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { loadLatestEdition } from "@/lib/data";
import type { DayEdition } from "@/lib/types";
import { SAMPLE_TEXT, briefingAudioPath, ensureAudio, findAudio, sampleAudioPath, sectionAudioPath, settingsFor, ttsAvailable } from "@/lib/tts";

// Premium voice, on demand: /api/audio?kind=section&category=literature&version=short&date=2026-10-23&voice=marin
// Returns a 302 to the MP3 in Blob storage (generated on first request, then cached), so an <audio>
// element can use this URL as its src straight from a tap. ?json=1 returns {url} instead.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAILY_GENERATION_LIMIT = Number(process.env.YAM_AUDIO_DAILY_LIMIT ?? 60);
let generated = { day: "", count: 0 };

function loadEdition(date: string | null): DayEdition | null {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const f = path.join(process.cwd(), "data", "days", `${date}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")) as DayEdition;
    return null;
  }
  return loadLatestEdition();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "section";
  const wantJson = url.searchParams.get("json") === "1";
  const config = loadConfig();

  if (config.audio.provider !== "openai") return new Response("Premium voice is switched off.", { status: 404 });
  const avail = ttsAvailable();
  if (!avail.ok) return new Response(`Voice service not configured (${avail.reason}).`, { status: 503 });

  const voice = settingsFor(config.audio, url.searchParams.get("voice") ?? undefined);
  let text = "";
  let pathname = "";

  if (kind === "sample") {
    text = SAMPLE_TEXT;
    pathname = sampleAudioPath(text, voice);
  } else {
    const edition = loadEdition(url.searchParams.get("date"));
    if (!edition) return new Response("No edition for that date.", { status: 404 });
    if (kind === "briefing") {
      if (!edition.briefing?.text) return new Response("No briefing in this edition.", { status: 404 });
      text = edition.briefing.text;
      pathname = briefingAudioPath(edition.date, text, voice);
    } else {
      const category = url.searchParams.get("category") ?? "";
      const version = url.searchParams.get("version") === "long" ? "long" : "short";
      const recap = edition.recaps?.[category];
      if (!recap) return new Response("No recap for that section.", { status: 404 });
      text = version === "long" ? recap.long : recap.short;
      if (!text) return new Response("Empty recap.", { status: 404 });
      pathname = sectionAudioPath(edition.date, category, version, text, voice);
    }
  }

  // Generation budget (per instance, per day) — cached files are always served.
  const day = new Date().toISOString().slice(0, 10);
  if (generated.day !== day) generated = { day, count: 0 };

  try {
    let target = await findAudio(pathname);
    if (!target) {
      if (generated.count >= DAILY_GENERATION_LIMIT) return new Response("The voice has done enough talking for today.", { status: 429 });
      generated.count += 1;
      target = (await ensureAudio(pathname, text, voice)).url;
    }
    if (wantJson) return Response.json({ url: target, voice: voice.voice }, { headers: { "cache-control": "no-store" } });
    return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(`The voice stumbled: ${msg.slice(0, 200)}`, { status: 502 });
  }
}
