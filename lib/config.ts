import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { Book, BookConfig, CategoryConfig, SiteConfig } from "./types";

let cached: SiteConfig | null = null;

/** Reserved top-level routes that a category id may not shadow. */
export const RESERVED_SLUGS = new Set(["search", "api", "about", "voices", "words", "bookshelf", "weekly", "_next"]);

/** Loads and lightly validates config/sources.yaml (server side only). */
export function loadConfig(): SiteConfig {
  if (cached) return cached;
  const file = path.join(process.cwd(), "config", "sources.yaml");
  const raw = yaml.load(fs.readFileSync(file, "utf8")) as SiteConfig;

  if (!raw?.categories?.length) throw new Error("config/sources.yaml: no categories found");
  const seen = new Set<string>();
  for (const c of raw.categories) {
    if (!/^[a-z][a-z0-9-]*$/.test(c.id)) throw new Error(`config/sources.yaml: category id "${c.id}" must be lowercase letters, digits or dashes`);
    if (RESERVED_SLUGS.has(c.id)) throw new Error(`config/sources.yaml: category id "${c.id}" is reserved`);
    if (seen.has(c.id)) throw new Error(`config/sources.yaml: duplicate category id "${c.id}"`);
    seen.add(c.id);
    if (!c.name || !c.color?.ink || !c.color?.tint) throw new Error(`config/sources.yaml: category "${c.id}" needs a name and two colours (ink, tint)`);
    c.sources = c.sources ?? [];
    c.tagline = c.tagline ?? "";
    c.brief = c.brief ?? "";
    c.show = c.show !== false;
  }

  const rulesDefaults: SiteConfig["rules"] = {
    window_hours: 48,
    window_hours_media: 168,
    keep_days: 14,
    keep_weeks: 8,
    max_candidates_per_day: 25,
    summary_language: "en",
    prefer_english_sources: true,
    blocked_domains: [],
  };
  raw.rules = { ...rulesDefaults, ...((raw.rules ?? {}) as Partial<SiteConfig["rules"]>) };

  const audioDefaults: SiteConfig["audio"] = {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    voice: "marin",
    voices: ["marin", "cedar", "fable", "sage", "nova", "shimmer"],
    instructions: "Warm, unhurried British English (Received Pronunciation), like a seasoned BBC Radio 4 presenter reading to a single listener.",
    instructions_fr: "Clear, natural Parisian French, unhurried.",
    speed: 1,
  };
  raw.audio = { ...audioDefaults, ...(((raw as Partial<SiteConfig>).audio ?? {}) as Partial<SiteConfig["audio"]>) };
  if (!raw.audio.voices.includes(raw.audio.voice)) raw.audio.voices.unshift(raw.audio.voice);

  const given = (raw as Partial<SiteConfig>).editions ?? ({} as Partial<SiteConfig["editions"]>);
  raw.editions = {
    daily: { minutes: 4, sections: raw.categories.filter((c) => c.show).map((c) => c.id), good_news_signoff: true, max_stories: 6, ...(given.daily ?? {}) },
    weekly: {
      weekday: "saturday",
      per_section: { listen: 2, read: 2, ...(given.weekly?.per_section ?? {}) },
      lookback_days: 8,
      book_of_the_week: true,
      words_per_week: 20,
      ...(given.weekly ?? {}),
    },
  };
  raw.editions.weekly.per_section = { listen: 2, read: 2, ...(given.weekly?.per_section ?? {}) };

  raw.words = { marker: "Add your words below this line", per_week: 20, review_after_weeks: 3, ...(((raw as Partial<SiteConfig>).words ?? {}) as Partial<SiteConfig["words"]>) };

  cached = raw;
  return raw;
}

export function getCategory(id: string): CategoryConfig | undefined {
  return loadConfig().categories.find((c) => c.id === id);
}

/** Categories that have a tab. */
export function visibleCategories(): CategoryConfig[] {
  return loadConfig().categories.filter((c) => c.show !== false);
}

export function slugifyTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

let booksCached: Book[] | null = null;

/** Loads config/books.yaml → books with stable slugs. */
export function loadBooks(): Book[] {
  if (booksCached) return booksCached;
  const file = path.join(process.cwd(), "config", "books.yaml");
  if (!fs.existsSync(file)) return (booksCached = []);
  const raw = (yaml.load(fs.readFileSync(file, "utf8")) as { books?: BookConfig[] }) ?? {};
  const seen = new Map<string, number>();
  const books: Book[] = (raw.books ?? [])
    .filter((b) => b && b.title)
    .map((b) => {
      let slug = slugifyTitle(`${b.title} ${(b.author ?? "").split(/\s+/).pop() ?? ""}`);
      const n = (seen.get(slug) ?? 0) + 1;
      seen.set(slug, n);
      if (n > 1) slug = `${slug}-${n}`;
      return { ...b, author: b.author ?? "", slug };
    });
  booksCached = books;
  return books;
}

export function getBook(slug: string): Book | undefined {
  return loadBooks().find((b) => b.slug === slug);
}
