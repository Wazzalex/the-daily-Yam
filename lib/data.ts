import fs from "node:fs";
import path from "node:path";
import type { DayEdition, Item } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

/** All items kept on the site (last keep_days), newest first. */
export function loadItems(): Item[] {
  const file = path.join(DATA_DIR, "items.json");
  if (!fs.existsSync(file)) return [];
  const items = JSON.parse(fs.readFileSync(file, "utf8")) as Item[];
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** The most recent edition (data/days/YYYY-MM-DD.json), if any. */
export function loadLatestEdition(): DayEdition | null {
  const dir = path.join(DATA_DIR, "days");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8")) as DayEdition;
}

export function itemsById(items: Item[]): Map<string, Item> {
  return new Map(items.map((i) => [i.id, i]));
}
