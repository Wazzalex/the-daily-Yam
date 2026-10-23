// Premium voice: text → MP3 with OpenAI's speech API, stored once in Vercel Blob.
// Used by the morning robot (pre-generated briefing) and by /api/audio (on demand).
// Server-side only.

import { createHash } from "node:crypto";
import { list, put } from "@vercel/blob";
import type { AudioConfig } from "./types";

export interface VoiceSettings {
  model: string;
  voice: string;
  instructions: string;
  speed: number;
}

const OPENAI_URL = "https://api.openai.com/v1/audio/speech";
const MAX_CHARS = 3500; // the speech endpoint takes about 4,000 characters per request

export function ttsAvailable(): { ok: boolean; reason?: string } {
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "OPENAI_API_KEY is not set" };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, reason: "BLOB_READ_WRITE_TOKEN is not set" };
  return { ok: true };
}

export function settingsFor(config: AudioConfig, voice?: string): VoiceSettings {
  const v = voice && config.voices.includes(voice) ? voice : config.voice;
  return { model: config.model, voice: v, instructions: config.instructions, speed: config.speed };
}

/** Short fingerprint of the script and the voice settings: same text + same voice = same file. */
export function audioHash(text: string, s: VoiceSettings): string {
  return createHash("sha1").update([s.model, s.voice, s.speed, s.instructions, text].join("\u0000")).digest("hex").slice(0, 10);
}

export function sectionAudioPath(date: string, category: string, version: "short" | "long", text: string, s: VoiceSettings): string {
  return `audio/${date}/${category}-${version}-${s.voice}-${audioHash(text, s)}.mp3`;
}

export function briefingAudioPath(date: string, text: string, s: VoiceSettings): string {
  return `audio/${date}/briefing-${s.voice}-${audioHash(text, s)}.mp3`;
}

export function sampleAudioPath(text: string, s: VoiceSettings): string {
  return `audio/samples/${s.voice}-${audioHash(text, s)}.mp3`;
}

/** Seconds of speech for a script, assuming ~150 words a minute. */
export function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60);
}

/** Splits a script into sentence-aligned chunks the speech API accepts. */
export function chunkScript(text: string, max = MAX_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return [clean];
  const sentences = clean.split(/(?<=[.!?…])\s+(?=[A-Z0-9“"'(])/);
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (s.length > max) {
      // A monster sentence: cut on commas as a last resort.
      for (const part of s.split(/(?<=,)\s+/)) {
        if ((cur + " " + part).trim().length > max && cur) {
          chunks.push(cur.trim());
          cur = part;
        } else cur = (cur + " " + part).trim();
      }
      continue;
    }
    if ((cur + " " + s).trim().length > max && cur) {
      chunks.push(cur.trim());
      cur = s;
    } else cur = (cur + " " + s).trim();
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

async function speakChunk(text: string, s: VoiceSettings): Promise<Buffer> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: s.model,
      voice: s.voice,
      input: text,
      instructions: s.instructions,
      speed: s.speed,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI speech ${res.status}: ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Synthesises a whole script (several chunks in parallel) into one MP3 buffer. */
export async function synthesize(text: string, s: VoiceSettings): Promise<Buffer> {
  const chunks = chunkScript(text);
  const buffers: Buffer[] = new Array(chunks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const i = next++;
        buffers[i] = await speakChunk(chunks[i], s);
      }
    }),
  );
  return Buffer.concat(buffers);
}

/** Returns the public URL of an existing blob at this pathname, if any. */
export async function findAudio(pathname: string): Promise<string | null> {
  const r = await list({ prefix: pathname, limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN });
  const hit = r.blobs.find((b) => b.pathname === pathname);
  return hit ? hit.url : null;
}

/**
 * Makes sure the audio for this script exists in Blob storage and returns its URL.
 * Generates it only when missing: the pathname carries a hash of text + voice.
 */
export async function ensureAudio(pathname: string, text: string, s: VoiceSettings): Promise<{ url: string; generated: boolean }> {
  const existing = await findAudio(pathname);
  if (existing) return { url: existing, generated: false };
  const mp3 = await synthesize(text, s);
  const blob = await put(pathname, mp3, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "audio/mpeg",
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return { url: blob.url, generated: true };
}

/** The paragraph read by every voice on the sample page. */
export const SAMPLE_TEXT =
  "Good morning, Yamuna. It's a bright Friday in the Grésivaudan, and here is your morning briefing. " +
  "The Guardian is rather taken with a new novel set in a lighthouse off the Cornish coast — six hundred pages, apparently worth every one. " +
  "Closer to home, the Musée de Grenoble opens its winter hang on the fifth of November, with free entry on the first Sunday. " +
  "And for your première class: a new production of Twelfth Night opens in Stratford in the spring. That's all for now — enjoy the coffee.";
