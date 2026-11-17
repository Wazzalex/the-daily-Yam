// Reading and writing the committed data files under data/.

import fs from "node:fs";
import path from "node:path";
import type { BookRefresher, DailyEdition, Item, WeeklyEdition, WordsRegistry, WordsSession } from "../../lib/types";
import type { ResolvedCache } from "./fetchers";

export const DATA_DIR = path.join(process.cwd(), "data");
const POOL_FILE = path.join(DATA_DIR, "pool.json");
const DAILY_DIR = path.join(DATA_DIR, "daily");
const WEEKLY_DIR = path.join(DATA_DIR, "weekly");
const WORDS_DIR = path.join(DATA_DIR, "words");
const BOOKS_DIR = path.join(DATA_DIR, "books");
const CACHE_FILE = path.join(DATA_DIR, "cache", "resolved.json");
const ARCHIVE_DIR = path.join(DATA_DIR, "archive");

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}
function writeJson(file: string, value: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 1) + "\n");
}
function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

// ---- pool
export function readPool(): Item[] {
  return readJson<Item[]>(POOL_FILE) ?? [];
}
export function writePool(items: Item[]) {
  const unique = Array.from(new Map(items.map((i) => [i.id, i])).values());
  unique.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  writeJson(POOL_FILE, unique);
}

// ---- daily
export function readDaily(date: string): DailyEdition | null {
  return readJson<DailyEdition>(path.join(DAILY_DIR, `${date}.json`));
}
export function writeDaily(ed: DailyEdition) {
  writeJson(path.join(DAILY_DIR, `${ed.date}.json`), ed);
  writeJson(path.join(DATA_DIR, "latest.json"), { daily: ed.date, generatedAt: ed.generatedAt, weekly: latestWeeklyDate() });
}

// ---- weekly
export function latestWeeklyDate(): string | null {
  if (!fs.existsSync(WEEKLY_DIR)) return null;
  const files = fs.readdirSync(WEEKLY_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].slice(0, 10) : null;
}
export function readWeekly(date: string): WeeklyEdition | null {
  return readJson<WeeklyEdition>(path.join(WEEKLY_DIR, `${date}.json`));
}
export function writeWeekly(ed: WeeklyEdition, items: Item[]) {
  writeJson(path.join(WEEKLY_DIR, `${ed.date}.json`), ed);
  // Snapshot of the picked items so the page survives the pool pruning.
  writeJson(path.join(WEEKLY_DIR, `${ed.date}.items.json`), items);
  const latest = readJson<Record<string, unknown>>(path.join(DATA_DIR, "latest.json")) ?? {};
  writeJson(path.join(DATA_DIR, "latest.json"), { ...latest, weekly: ed.date });
}
export function recentBookSlugs(weeks = 6): string[] {
  if (!fs.existsSync(WEEKLY_DIR)) return [];
  return fs
    .readdirSync(WEEKLY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, weeks)
    .map((f) => readJson<WeeklyEdition>(path.join(WEEKLY_DIR, f))?.bookOfTheWeek?.slug)
    .filter((s): s is string => Boolean(s));
}

// ---- words
export function readWordsRegistry(): WordsRegistry {
  return readJson<WordsRegistry>(path.join(WORDS_DIR, "registry.json")) ?? {};
}
export function writeWordsRegistry(r: WordsRegistry) {
  writeJson(path.join(WORDS_DIR, "registry.json"), r);
}
export function writeWordsSession(s: WordsSession) {
  writeJson(path.join(WORDS_DIR, `${s.date}.json`), s);
}

// ---- books
export function readRefresher(slug: string): BookRefresher | null {
  return readJson<BookRefresher>(path.join(BOOKS_DIR, `${slug}.json`));
}
export function writeRefresher(r: BookRefresher) {
  writeJson(path.join(BOOKS_DIR, `${r.slug}.json`), r);
}

// ---- cache
export function readCache(): ResolvedCache {
  try {
    const c = readJson<Partial<ResolvedCache>>(CACHE_FILE) ?? {};
    return { youtube: c.youtube ?? {}, podcasts: c.podcasts ?? {} };
  } catch {
    return { youtube: {}, podcasts: {} };
  }
}
export function writeCache(cache: ResolvedCache) {
  writeJson(CACHE_FILE, cache);
}

// ---- pruning
function archiveOld(dir: string, cutoffKey: string, keepPattern = /^(\d{4}-\d{2}-\d{2})(\.items)?\.json$/) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const m = keepPattern.exec(f);
    if (m && m[1] < cutoffKey) {
      const dest = path.join(ARCHIVE_DIR, path.basename(dir));
      ensureDir(dest);
      fs.renameSync(path.join(dir, f), path.join(dest, f));
    }
  }
}

/** Drops pool items older than keepDays and archives old daily/weekly files. */
export function prune(items: Item[], keepDays: number, keepWeeks: number, today: string): Item[] {
  const dayCut = new Date(today + "T00:00:00Z");
  dayCut.setUTCDate(dayCut.getUTCDate() - keepDays);
  const dayKey = dayCut.toISOString().slice(0, 10);
  const weekCut = new Date(today + "T00:00:00Z");
  weekCut.setUTCDate(weekCut.getUTCDate() - keepWeeks * 7);
  const weekKey = weekCut.toISOString().slice(0, 10);
  archiveOld(DAILY_DIR, dayKey);
  archiveOld(WEEKLY_DIR, weekKey);
  archiveOld(WORDS_DIR, weekKey, /^(\d{4}-\d{2}-\d{2})\.json$/);
  return items.filter((i) => (i.addedOn ?? today) >= dayKey);
}
