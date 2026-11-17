import { loadConfig } from "@/lib/config";
import { loadPool, loadWeeklies, loadWeeklyItems } from "@/lib/data";
import type { Item } from "@/lib/types";

// Built once per deployment: everything searchable — the pool (last fortnight) and every weekly pick on file.
export const dynamic = "force-static";

export function GET() {
  const names = new Map(loadConfig().categories.map((c) => [c.id, c.name]));
  const all = new Map<string, Item>();
  for (const i of loadPool()) all.set(i.id, i);
  for (const w of loadWeeklies(8)) for (const [id, it] of loadWeeklyItems(w)) if (!all.has(id)) all.set(id, it);
  const index = [...all.values()].map((i) => ({
    id: i.id,
    category: i.category,
    categoryName: names.get(i.category) ?? i.category,
    type: i.type,
    title: i.title,
    url: i.url,
    source: i.source,
    lang: i.lang,
    publishedAt: i.publishedAt,
    eventDate: i.eventDate,
    eventEnd: i.eventEnd,
    eventPlace: i.eventPlace,
    summary: i.summary,
    relevance: i.relevance,
    duration: i.duration,
    videoId: i.videoId,
    addedOn: i.addedOn,
  }));
  return Response.json(index, { headers: { "cache-control": "public, max-age=0, s-maxage=3600" } });
}
