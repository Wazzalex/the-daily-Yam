import fs from "node:fs";
import path from "node:path";
import type { BookRefresher, DailyEdition, Item, WeeklyEdition, WordsSession } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function latestIn<T>(dir: string): T | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (!files.length) return null;
  return readJson<T>(path.join(dir, files[files.length - 1]));
}

function listIn<T>(dir: string, limit: number): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => readJson<T>(path.join(dir, f)))
    .filter((x): x is T => Boolean(x));
}

/** The pool: every candidate collected over the last keep_days, newest first. */
export function loadPool(): Item[] {
  const items = readJson<Item[]>(path.join(DATA_DIR, "pool.json")) ?? [];
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function poolById(items: Item[]): Map<string, Item> {
  return new Map(items.map((i) => [i.id, i]));
}

export function loadLatestDaily(): DailyEdition | null {
  return latestIn<DailyEdition>(path.join(DATA_DIR, "daily"));
}

export function loadDaily(date: string): DailyEdition | null {
  return readJson<DailyEdition>(path.join(DATA_DIR, "daily", `${date}.json`));
}

export function loadRecentDailies(limit = 7): DailyEdition[] {
  return listIn<DailyEdition>(path.join(DATA_DIR, "daily"), limit);
}

export function loadLatestWeekly(): WeeklyEdition | null {
  return latestIn<WeeklyEdition>(path.join(DATA_DIR, "weekly"));
}

export function loadWeeklies(limit = 8): WeeklyEdition[] {
  return listIn<WeeklyEdition>(path.join(DATA_DIR, "weekly"), limit);
}

export function loadLatestWords(): WordsSession | null {
  return latestIn<WordsSession>(path.join(DATA_DIR, "words"));
}

export function loadWordsSessions(limit = 6): WordsSession[] {
  return listIn<WordsSession>(path.join(DATA_DIR, "words"), limit);
}

export function loadRefresher(slug: string): BookRefresher | null {
  return readJson<BookRefresher>(path.join(DATA_DIR, "books", `${slug}.json`));
}

/** Items referenced by the weekly picks, resolved against the pool (and the weekly's own snapshot). */
export function loadWeeklyItems(weekly: WeeklyEdition | null): Map<string, Item> {
  const map = poolById(loadPool());
  if (!weekly) return map;
  const snapshot = readJson<Item[]>(path.join(DATA_DIR, "weekly", `${weekly.date}.items.json`)) ?? [];
  for (const i of snapshot) if (!map.has(i.id)) map.set(i.id, i);
  return map;
}
