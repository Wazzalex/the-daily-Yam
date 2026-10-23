// Reading and writing the committed data files under data/.

import fs from "node:fs";
import path from "node:path";
import type { DayEdition, Item } from "../../lib/types";
import type { ResolvedCache } from "./fetchers";

export const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_FILE = path.join(DATA_DIR, "items.json");
const DAYS_DIR = path.join(DATA_DIR, "days");
const CACHE_FILE = path.join(DATA_DIR, "cache", "resolved.json");

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function readItems(): Item[] {
  if (!fs.existsSync(ITEMS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ITEMS_FILE, "utf8")) as Item[];
}

export function writeItems(items: Item[]) {
  ensureDir(DATA_DIR);
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(sorted, null, 1) + "\n");
}

export function writeEdition(ed: DayEdition) {
  ensureDir(DAYS_DIR);
  fs.writeFileSync(path.join(DAYS_DIR, `${ed.date}.json`), JSON.stringify(ed, null, 1) + "\n");
  fs.writeFileSync(path.join(DATA_DIR, "latest.json"), JSON.stringify({ date: ed.date, generatedAt: ed.generatedAt }, null, 1) + "\n");
}

export function readEdition(date: string): DayEdition | null {
  const f = path.join(DAYS_DIR, `${date}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8")) as DayEdition;
}

export function readCache(): ResolvedCache {
  if (!fs.existsSync(CACHE_FILE)) return { youtube: {}, podcasts: {} };
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as Partial<ResolvedCache>;
    return { youtube: c.youtube ?? {}, podcasts: c.podcasts ?? {} };
  } catch {
    return { youtube: {}, podcasts: {} };
  }
}

export function writeCache(cache: ResolvedCache) {
  ensureDir(path.dirname(CACHE_FILE));
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1) + "\n");
}

/** Removes editions and items older than keepDays (by the day they were added). */
export function pruneOld(items: Item[], keepDays: number, today: string): Item[] {
  const cutoff = new Date(today + "T00:00:00Z");
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const kept = items.filter((i) => (i.addedOn ?? today) >= cutoffKey);
  if (fs.existsSync(DAYS_DIR)) {
    for (const f of fs.readdirSync(DAYS_DIR)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
      if (m && m[1] < cutoffKey) {
        // Keep a light archive: move old editions under data/archive/
        const archive = path.join(DATA_DIR, "archive");
        ensureDir(archive);
        fs.renameSync(path.join(DAYS_DIR, f), path.join(archive, f));
      }
    }
  }
  return kept;
}
