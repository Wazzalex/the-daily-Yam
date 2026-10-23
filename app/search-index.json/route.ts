import { loadConfig } from "@/lib/config";
import { loadItems } from "@/lib/data";

// Built once per deployment: a compact index of everything on the site for client-side search.
export const dynamic = "force-static";

export function GET() {
  const names = new Map(loadConfig().categories.map((c) => [c.id, c.name]));
  const index = loadItems().map((i) => ({
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
