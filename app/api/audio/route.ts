import { loadConfig } from "@/lib/config";
import { loadDaily, loadLatestDaily, loadRefresher, loadWordsSessions } from "@/lib/data";
import { SAMPLE_TEXT, bookAudioPath, dailyAudioPath, drillScript, ensureAudio, findAudio, sampleAudioPath, settingsFor, ttsAvailable, wordAudioPath } from "@/lib/tts";

// Premium voice, on demand. Returns a 302 to the MP3 in Blob storage (generated on first request).
//   ?kind=daily&date=YYYY-MM-DD          the Daily Yam
//   ?kind=word&date=…&i=3&part=term      one vocabulary clip (term | example)
//   ?kind=drill&date=…                   the whole Words drill
//   ?kind=book&slug=…                    a book refresher
//   ?kind=sample&voice=…                 the voice sample
// &voice=… overrides the voice; &json=1 returns {url} instead of redirecting.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAILY_GENERATION_LIMIT = Number(process.env.YAM_AUDIO_DAILY_LIMIT ?? 120);
let generated = { day: "", count: 0 };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "daily";
  const wantJson = url.searchParams.get("json") === "1";
  const config = loadConfig();

  if (config.audio.provider !== "openai") return new Response("Premium voice is switched off.", { status: 404 });
  const avail = ttsAvailable();
  if (!avail.ok) return new Response(`Voice service not configured (${avail.reason}).`, { status: 503 });

  const voiceParam = url.searchParams.get("voice") ?? undefined;
  let lang: "en" | "fr" = "en";
  let text = "";
  let pathname = "";

  if (kind === "sample") {
    text = SAMPLE_TEXT;
    pathname = sampleAudioPath(text, settingsFor(config.audio, voiceParam));
  } else if (kind === "daily") {
    const date = url.searchParams.get("date");
    const ed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? loadDaily(date) : loadLatestDaily();
    if (!ed?.script) return new Response("No Daily for that date.", { status: 404 });
    text = ed.script;
    pathname = dailyAudioPath(ed.date, text, settingsFor(config.audio, voiceParam));
  } else if (kind === "word" || kind === "drill") {
    const date = url.searchParams.get("date") ?? "";
    const session = loadWordsSessions(12).find((s) => s.date === date);
    if (!session) return new Response("No Words session for that date.", { status: 404 });
    if (kind === "drill") {
      text = drillScript(session.entries);
      pathname = wordAudioPath(date, "drill", 0, text, settingsFor(config.audio, voiceParam));
    } else {
      const i = Number(url.searchParams.get("i") ?? -1);
      const part = url.searchParams.get("part") === "example" ? "example" : "term";
      const e = session.entries[i];
      if (!e) return new Response("No such entry.", { status: 404 });
      lang = e.lang;
      text = part === "example" ? e.example : e.term;
      if (!text) return new Response("Empty entry.", { status: 404 });
      pathname = wordAudioPath(date, part, i, text, settingsFor(config.audio, voiceParam, lang));
    }
  } else if (kind === "book") {
    const slug = url.searchParams.get("slug") ?? "";
    const ref = loadRefresher(slug);
    if (!ref?.script) return new Response("No refresher on file for that book yet — open its page first.", { status: 404 });
    text = ref.script;
    pathname = bookAudioPath(slug, text, settingsFor(config.audio, voiceParam));
  } else return new Response("Unknown kind.", { status: 400 });

  const voice = settingsFor(config.audio, voiceParam, lang);
  const day = new Date().toISOString().slice(0, 10);
  if (generated.day !== day) generated = { day, count: 0 };

  try {
    let target = await findAudio(pathname);
    if (!target) {
      if (generated.count >= DAILY_GENERATION_LIMIT) return new Response("The voice has done enough talking for today.", { status: 429 });
      generated.count += 1;
      target = (await ensureAudio(pathname, text, voice)).url;
    }
    if (wantJson) return Response.json({ url: target, voice: voice.voice }, { headers: { "cache-control": "no-store", "x-yam-audio": "3" } });
    return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(`The voice stumbled: ${msg.slice(0, 200)}`, { status: 502 });
  }
}
