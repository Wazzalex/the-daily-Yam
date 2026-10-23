import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { CategoryConfig, SiteConfig } from "./types";

let cached: SiteConfig | null = null;

/** Loads and lightly validates config/sources.yaml (server side only). */
export function loadConfig(): SiteConfig {
  if (cached) return cached;
  const file = path.join(process.cwd(), "config", "sources.yaml");
  const raw = yaml.load(fs.readFileSync(file, "utf8")) as SiteConfig;

  if (!raw?.categories?.length) {
    throw new Error("config/sources.yaml: no categories found");
  }
  const seen = new Set<string>();
  for (const c of raw.categories) {
    if (!/^[a-z][a-z0-9-]*$/.test(c.id)) {
      throw new Error(`config/sources.yaml: category id "${c.id}" must be lowercase letters, digits or dashes`);
    }
    if (seen.has(c.id)) throw new Error(`config/sources.yaml: duplicate category id "${c.id}"`);
    seen.add(c.id);
    if (!c.name || !c.color?.ink || !c.color?.tint) {
      throw new Error(`config/sources.yaml: category "${c.id}" needs a name and two colours (ink, tint)`);
    }
    c.sources = c.sources ?? [];
    c.tagline = c.tagline ?? "";
    c.brief = c.brief ?? "";
  }
  const defaults: SiteConfig["rules"] = {
    window_hours: 48,
    window_hours_media: 168,
    keep_days: 14,
    max_per_category_per_day: 10,
    home_mix_size: 12,
    summary_language: "en",
    prefer_english_sources: true,
    audio_recap_minutes: 6,
    audio_recap_long_minutes: 12,
    blocked_domains: [],
  };
  const given = (raw.rules ?? {}) as Partial<SiteConfig["rules"]>;
  raw.rules = { ...defaults, ...given };

  const audioDefaults: SiteConfig["audio"] = {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    voice: "marin",
    voices: ["marin", "cedar", "fable", "sage", "nova", "shimmer"],
    instructions:
      "Warm, unhurried British English (Received Pronunciation), like a seasoned BBC Radio 4 presenter reading the morning briefing to a single listener. Clear diction, gentle warmth, natural pauses between stories, never salesy.",
    speed: 1,
    briefing_minutes: 6,
    pregenerate_briefing: true,
    pregenerate_sections: false,
  };
  const audioGiven = ((raw as Partial<SiteConfig>).audio ?? {}) as Partial<SiteConfig["audio"]>;
  raw.audio = { ...audioDefaults, ...audioGiven };
  if (!raw.audio.voices.includes(raw.audio.voice)) raw.audio.voices.unshift(raw.audio.voice);
  cached = raw;
  return raw;
}

export function getCategory(id: string): CategoryConfig | undefined {
  return loadConfig().categories.find((c) => c.id === id);
}

/** Reserved top-level routes that a category id may not shadow. */
export const RESERVED_SLUGS = new Set(["search", "api", "about", "voices", "_next"]);
