// Shared types for the site and the morning robot.

export type ItemType = "article" | "podcast" | "video" | "event";

export interface Item {
  /** Stable id: sha1 of the canonical URL (plus title for page-extracted events). */
  id: string;
  /** Category id from config/sources.yaml. */
  category: string;
  type: ItemType;
  /** Original title, in its original language. */
  title: string;
  url: string;
  /** Display name of the source (as in the config, or the outlet for news searches). */
  source: string;
  domain: string;
  lang: string;
  /** ISO date-time of publication. */
  publishedAt: string;
  /** For events: ISO date (YYYY-MM-DD) of the event, and optional end date. */
  eventDate?: string;
  eventEnd?: string;
  eventPlace?: string;
  /** English summary written by Claude (2–3 sentences). */
  summary: string;
  /** 0–10, how much this is for Yamuna. */
  relevance: number;
  goodNews?: boolean;
  /** Human duration for audio/video, e.g. "18 min". */
  duration?: string;
  videoId?: string;
  image?: string;
  /** YYYY-MM-DD of the run that added it (Europe/Paris). */
  addedOn: string;
}

export interface Recap {
  short: string;
  long: string;
  itemIds: string[];
  wordsShort: number;
  wordsLong: number;
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

export interface DayEdition {
  /** YYYY-MM-DD (Europe/Paris). */
  date: string;
  generatedAt: string;
  /** One or two warm sentences for the hero. */
  greeting: string;
  /** Item ids for the home page mix, in order. */
  mix: string[];
  /** New items added today, per category. */
  newByCategory: Record<string, number>;
  recaps: Record<string, Recap>;
  sources: SourceReport[];
  usage?: { inputTokens: number; outputTokens: number; calls: number };
}

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
  works?: Record<string, string[]>;
  geo?: { center: string; radius_km: number; places: string[] };
  platforms?: string[];
  cross_post_from_all?: boolean;
}

export interface SiteConfig {
  site: {
    name: string;
    tagline: string;
    motto: string;
    timezone: string;
    refresh_hour: number;
    language: string;
  };
  reader: {
    name: string;
    profile: string;
    loves: string[];
    avoids: string[];
  };
  rules: {
    window_hours: number;
    /** Longer window for podcasts and videos, which are published weekly. */
    window_hours_media: number;
    keep_days: number;
    max_per_category_per_day: number;
    home_mix_size: number;
    summary_language: string;
    prefer_english_sources: boolean;
    audio_recap_minutes: number;
    audio_recap_long_minutes: number;
    blocked_domains: string[];
  };
  categories: CategoryConfig[];
}
