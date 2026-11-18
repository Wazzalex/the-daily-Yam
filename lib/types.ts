// Shared types for the site and the robots (daily + weekly).

export type ItemType = "article" | "podcast" | "video" | "event";

/** A candidate collected by the daily robot and kept in the pool for the week. */
export interface Item {
  /** Stable id: sha1 of the canonical URL (plus title for page-extracted events). */
  id: string;
  /** Category id from config/sources.yaml. */
  category: string;
  type: ItemType;
  /** Original title, in its original language. */
  title: string;
  url: string;
  source: string;
  domain: string;
  lang: string;
  /** ISO date-time of publication. */
  publishedAt: string;
  eventDate?: string;
  eventEnd?: string;
  eventPlace?: string;
  /** One or two sentences in English (pool note); refined for the items picked in the Weekly. */
  summary: string;
  /** 0–10, how much this is for Yamuna. */
  relevance: number;
  goodNews?: boolean;
  duration?: string;
  videoId?: string;
  image?: string;
  /** YYYY-MM-DD of the run that added it (Europe/Paris). */
  addedOn: string;
}

export interface AudioRef {
  url: string;
  voice: string;
  seconds: number;
}

export interface SourceReport {
  category: string;
  name: string;
  type: string;
  ok: boolean;
  fetched: number;
  kept: number;
  error?: string;
  note?: string;
  ms: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

/** The Daily Yam: one short spoken piece a day. */
export interface DailyEdition {
  date: string;
  generatedAt: string;
  /** Spoken script, ~600 words. */
  script: string;
  words: number;
  /** One-line teaser shown under the player. */
  teaser: string;
  /** Items the script drew on, in order of appearance. */
  itemIds: string[];
  audio?: AudioRef;
  newCandidates: number;
  sources: SourceReport[];
  usage?: Usage;
}

export interface WeeklyPick {
  itemId: string;
  /** "listen" for podcasts and videos, "read" for articles. */
  mode: "listen" | "read";
  /** Why this one, in one warm sentence. */
  why: string;
}

export interface WeeklyEdition {
  /** Saturday's date, YYYY-MM-DD. */
  date: string;
  /** Monday of that week, for display. */
  weekOf: string;
  generatedAt: string;
  greeting: string;
  picks: Record<string, WeeklyPick[]>;
  bookOfTheWeek?: { slug: string; why: string };
  wordsSession?: string; // date key of data/words/<date>.json
  usage?: Usage;
}

// ---------------------------------------------------------------- Words

export interface WordEntry {
  /** Stable key in the notebook (for the registry). */
  key?: string;
  /** The headword or expression, as one would look it up ("to dollop", "a mishap"). */
  term: string;
  lang: "en" | "fr";
  /** The section of her notebook the entry comes from ("FOOD & beverages"). */
  theme?: string;
  /** The line as she wrote it in her notebook. */
  note?: string;
  /** Short definition in English (with the French nuance for French terms). */
  definition: string;
  /** Example sentence: hers, polished, or written by Claude. */
  example: string;
  /** IPA (British), hers when she wrote one. */
  pronunciation?: string;
  /** Register or usage note ("informal, British"). */
  usage?: string;
  /** Whether this is a new word or a review. */
  review: boolean;
  audio?: { term?: string; example?: string };
}

export interface WordsSession {
  date: string;
  generatedAt: string;
  entries: WordEntry[];
  /** One MP3 of the whole drill (term, pause, example…). */
  drill?: AudioRef;
  docEntries: number;
  newEntries: number;
  /** Where the notebook came from this time: the live document or the committed snapshot. */
  source?: "live" | "snapshot";
}

export interface WordsRegistry {
  /** notebook key → first seen, last reviewed. */
  [key: string]: { term: string; firstSeen: string; lastReviewed?: string; times: number };
}

// ---------------------------------------------------------------- Bookshelf

export interface BookConfig {
  title: string;
  author: string;
  note?: string;
  year?: number | string;
}

export interface Book extends BookConfig {
  slug: string;
}

export interface BookRefresher {
  slug: string;
  generatedAt: string;
  /** Written refresher, in sections. */
  inANutshell: string;
  story: string;
  people: string;
  themes: string;
  whyItMatters: string;
  questions: string[];
  /** Spoken version, ~650 words. */
  script: string;
  confidence: "high" | "medium" | "low";
  audio?: AudioRef;
}

// ---------------------------------------------------------------- Config

export interface CategoryColor {
  ink: string;
  tint: string;
}

export interface SourceConfig {
  name: string;
  type: "rss" | "youtube" | "podcast" | "page" | "news";
  url?: string;
  handle?: string;
  channel_id?: string;
  feed_url?: string;
  apple_id?: number | string;
  search?: string;
  query?: string;
  lang?: string;
  weight?: number;
  always_include?: boolean;
}

export interface CategoryConfig {
  id: string;
  name: string;
  tagline: string;
  color: CategoryColor;
  brief: string;
  sources: SourceConfig[];
  /** false = collected but no tab (feeds the Daily only). */
  show?: boolean;
  geo?: { center: string; radius_km: number; places: string[] };
  platforms?: string[];
  cross_post_from_all?: boolean;
}

export interface AudioConfig {
  provider: "openai" | "browser";
  model: string;
  voice: string;
  voices: string[];
  instructions: string;
  instructions_fr: string;
  speed: number;
}

export interface EditionsConfig {
  daily: { minutes: number; sections: string[]; good_news_signoff: boolean; max_stories: number };
  weekly: {
    weekday: string;
    per_section: { listen: number; read: number };
    lookback_days: number;
    book_of_the_week: boolean;
    words_per_week: number;
  };
}

export interface WordsConfig {
  google_doc_id?: string;
  /** Kept for the old table-style document; the notebook format ignores it. */
  marker?: string;
  per_week: number;
  review_after_weeks: number;
  /** Share of each session kept for words coming back (0.25 → 5 of 20). */
  review_share: number;
  /** At most this many entries from one section of the notebook per session. */
  max_per_theme: number;
}

export interface SiteConfig {
  site: { name: string; tagline: string; motto: string; timezone: string; refresh_hour: number; language: string };
  reader: { name: string; profile: string; loves: string[]; avoids: string[] };
  editions: EditionsConfig;
  rules: {
    window_hours: number;
    window_hours_media: number;
    keep_days: number;
    keep_weeks: number;
    max_candidates_per_day: number;
    summary_language: string;
    prefer_english_sources: boolean;
    blocked_domains: string[];
  };
  audio: AudioConfig;
  words: WordsConfig;
  categories: CategoryConfig[];
}
