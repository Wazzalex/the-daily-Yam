// Readers for the five source types: rss, youtube, podcast, page, news.
// Each returns RawItem[] — not yet summarised or scored.

import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { ItemType, SourceConfig } from "../../lib/types";
import { fetchJson, fetchText } from "./http";
import { domainOf, humanDuration, normalizeUrl, stripHtml, truncate } from "./text";

export interface RawItem {
  title: string;
  url: string;
  publishedAt?: string;
  description?: string;
  type: ItemType;
  source: string;
  domain: string;
  lang: string;
  duration?: string;
  videoId?: string;
  image?: string;
  eventDate?: string;
  eventEnd?: string;
  eventPlace?: string;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  links: { text: string; href: string }[];
}

export interface ResolvedCache {
  youtube: Record<string, string>;
  podcasts: Record<string, string>;
}

type AnyItem = Record<string, unknown> & {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  enclosure?: { url?: string; type?: string };
  itunes?: { duration?: string; image?: string; summary?: string };
  guid?: string;
};

const parser = new Parser<Record<string, unknown>, AnyItem>({
  timeout: 20000,
  customFields: {
    item: [
      ["yt:videoId", "videoId"],
      ["media:group", "mediaGroup"],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:content", "mediaContent", { keepArray: true }],
      ["source", "newsSource", { keepArray: true }],
      ["description", "description"],
    ],
  },
});

function pick<T = unknown>(obj: unknown, path: string[]): T | undefined {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur as T;
}

function firstImage(item: AnyItem): string | undefined {
  const thumbs = item["mediaThumbnail"] as Array<Record<string, unknown>> | undefined;
  const t = thumbs?.[0];
  const tUrl = (pick<string>(t, ["$", "url"]) ?? (typeof t === "string" ? t : undefined)) as string | undefined;
  if (tUrl) return tUrl;
  const contents = item["mediaContent"] as Array<Record<string, unknown>> | undefined;
  for (const c of contents ?? []) {
    const medium = pick<string>(c, ["$", "medium"]);
    const type = pick<string>(c, ["$", "type"]);
    const url = pick<string>(c, ["$", "url"]);
    if (url && (medium === "image" || (type ?? "").startsWith("image/"))) return url;
  }
  if (item.enclosure?.url && (item.enclosure.type ?? "").startsWith("image/")) return item.enclosure.url;
  if (item.itunes?.image) return item.itunes.image;
  return undefined;
}

function isoOrUndefined(d?: string): string | undefined {
  if (!d) return undefined;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}

async function parseFeed(url: string) {
  const res = await fetchText(url);
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const body = res.text.trim();
  if (!body.startsWith("<")) throw new Error("Not an XML feed");
  return parser.parseString(body);
}

// ---------------------------------------------------------------- rss

export async function fetchRss(src: SourceConfig): Promise<RawItem[]> {
  if (!src.url) throw new Error("rss source needs a url");
  const feed = await parseFeed(src.url);
  return (feed.items ?? []).map((it) => {
    const link = (it.link ?? it.guid ?? "").toString();
    const desc = stripHtml(it.contentSnippet || it.summary || it.content || (it["description"] as string));
    return {
      title: stripHtml(it.title ?? "").trim(),
      url: link,
      publishedAt: isoOrUndefined(it.isoDate ?? it.pubDate),
      description: truncate(desc, 700),
      type: "article" as ItemType,
      source: src.name,
      domain: domainOf(link),
      lang: src.lang ?? "en",
      image: firstImage(it),
    };
  });
}

// ---------------------------------------------------------------- youtube

const CHANNEL_RE = /(UC[A-Za-z0-9_-]{22})/;

export async function resolveYoutubeChannel(src: SourceConfig, cache: ResolvedCache): Promise<string> {
  if (src.channel_id && CHANNEL_RE.test(src.channel_id)) return src.channel_id;
  const key = (src.handle ?? src.url ?? "").trim();
  if (!key) throw new Error("youtube source needs a channel_id, a handle or a url");
  if (cache.youtube[key]) return cache.youtube[key];
  const fromUrl = src.url ? /\/channel\/(UC[A-Za-z0-9_-]{22})/.exec(src.url)?.[1] : undefined;
  if (fromUrl) return (cache.youtube[key] = fromUrl);
  const pageUrl = src.url ?? `https://www.youtube.com/${key.startsWith("@") ? key : "@" + key}`;
  const res = await fetchText(pageUrl, {
    accept: "text/html",
    headers: { cookie: "CONSENT=YES+1; SOCS=CAI" },
  });
  if (res.status >= 400) throw new Error(`HTTP ${res.status} resolving ${pageUrl}`);
  const m =
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(res.text) ??
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(res.text) ??
    /channel_id=(UC[A-Za-z0-9_-]{22})/.exec(res.text) ??
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(res.text);
  if (!m) throw new Error(`Could not find a channel id on ${pageUrl}`);
  cache.youtube[key] = m[1];
  return m[1];
}

export async function fetchYoutube(src: SourceConfig, cache: ResolvedCache): Promise<RawItem[]> {
  const channelId = await resolveYoutubeChannel(src, cache);
  const feed = await parseFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  return (feed.items ?? []).map((it) => {
    const videoId = (it["videoId"] as string | undefined) ?? /[?&]v=([\w-]{11})/.exec(it.link ?? "")?.[1];
    const group = it["mediaGroup"] as Record<string, unknown> | undefined;
    const desc = stripHtml(pick<string[]>(group, ["media:description"])?.[0] ?? "");
    const thumb = pick<Array<Record<string, unknown>>>(group, ["media:thumbnail"])?.[0];
    const image = pick<string>(thumb, ["$", "url"]) ?? (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined);
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : (it.link ?? "");
    return {
      title: (it.title ?? "").trim(),
      url,
      publishedAt: isoOrUndefined(it.isoDate ?? it.pubDate),
      description: truncate(desc, 600),
      type: "video" as ItemType,
      source: src.name,
      domain: "youtube.com",
      lang: src.lang ?? "en",
      videoId,
      image,
    };
  });
}

// ---------------------------------------------------------------- podcast

interface ItunesResult {
  results?: Array<{ collectionName?: string; feedUrl?: string; artistName?: string }>;
}

function similarity(a: string, b: string): number {
  const na = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.8;
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

export async function resolvePodcastFeed(src: SourceConfig, cache: ResolvedCache): Promise<string> {
  if (src.feed_url) return src.feed_url;
  const key = src.apple_id ? `apple:${src.apple_id}` : `search:${src.search ?? src.name}`;
  if (cache.podcasts[key]) return cache.podcasts[key];
  let feedUrl: string | undefined;
  if (src.apple_id) {
    const r = await fetchJson<ItunesResult>(`https://itunes.apple.com/lookup?id=${encodeURIComponent(String(src.apple_id))}&entity=podcast`);
    feedUrl = r.results?.find((x) => x.feedUrl)?.feedUrl;
  } else {
    const term = src.search ?? src.name;
    const r = await fetchJson<ItunesResult>(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&entity=podcast&limit=8&country=gb`,
    );
    const ranked = (r.results ?? [])
      .filter((x) => x.feedUrl)
      .map((x) => ({ x, s: similarity(term, x.collectionName ?? "") }))
      .sort((a, b) => b.s - a.s);
    feedUrl = ranked[0]?.x.feedUrl;
  }
  if (!feedUrl) throw new Error(`Podcast not found on Apple Podcasts: ${src.search ?? src.apple_id ?? src.name}`);
  cache.podcasts[key] = feedUrl;
  return feedUrl;
}

export async function fetchPodcast(src: SourceConfig, cache: ResolvedCache): Promise<RawItem[]> {
  const feedUrl = await resolvePodcastFeed(src, cache);
  const feed = await parseFeed(feedUrl);
  const feedImage = (feed as { image?: { url?: string }; itunes?: { image?: string } }).itunes?.image ??
    (feed as { image?: { url?: string } }).image?.url;
  return (feed.items ?? []).map((it) => {
    const link = (it.link || it.enclosure?.url || it.guid || "").toString();
    const desc = stripHtml(it.contentSnippet || it.itunes?.summary || it.summary || it.content || (it["description"] as string));
    return {
      title: stripHtml(it.title ?? "").trim(),
      url: link,
      publishedAt: isoOrUndefined(it.isoDate ?? it.pubDate),
      description: truncate(desc, 700),
      type: "podcast" as ItemType,
      source: src.name,
      domain: domainOf(link),
      lang: src.lang ?? "en",
      duration: humanDuration(it.itunes?.duration),
      image: it.itunes?.image ?? feedImage,
    };
  });
}

// ---------------------------------------------------------------- news (Google News RSS)

export function googleNewsUrl(query: string, lang: string): string {
  const q = encodeURIComponent(`${query} when:3d`);
  return lang === "fr"
    ? `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`
    : `https://news.google.com/rss/search?q=${q}&hl=en-GB&gl=GB&ceid=GB:en`;
}

export async function fetchNews(src: SourceConfig): Promise<RawItem[]> {
  if (!src.query) throw new Error("news source needs a query");
  const lang = src.lang ?? "en";
  const feed = await parseFeed(googleNewsUrl(src.query, lang));
  return (feed.items ?? []).map((it) => {
    const rawNs = it["newsSource"] as Array<{ _?: string; $?: { url?: string } } | string> | undefined;
    const ns = Array.isArray(rawNs) ? rawNs[0] : rawNs;
    const outlet = typeof ns === "string" ? ns : ns?._;
    const outletUrl = ns && typeof ns === "object" ? ns.$?.url : undefined;
    let title = stripHtml(it.title ?? "").trim();
    if (outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3)).trim();
    const link = (it.link ?? "").toString();
    return {
      title,
      url: link,
      publishedAt: isoOrUndefined(it.isoDate ?? it.pubDate),
      description: truncate(stripHtml((it["description"] as string) ?? it.contentSnippet ?? ""), 500),
      type: "article" as ItemType,
      source: outlet ?? src.name,
      domain: outletUrl ? domainOf(outletUrl) : domainOf(link),
      lang,
    };
  });
}

// ---------------------------------------------------------------- page (read by Claude afterwards)

export async function fetchPage(src: SourceConfig): Promise<PageContent> {
  if (!src.url) throw new Error("page source needs a url");
  const res = await fetchText(src.url, { accept: "text/html,application/xhtml+xml" });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const $ = cheerio.load(res.text);
  $("script, style, noscript, svg, iframe, form, template").remove();
  $("nav, footer, header, aside, [role=navigation], [role=banner], [role=contentinfo], .cookie, #cookie, .cookies").remove();
  const title = ($("title").first().text() || src.name).trim();
  const root = $("main").length ? $("main") : $("body");
  // Keep block boundaries as line breaks so dates and titles don't run together.
  root.find("p, h1, h2, h3, h4, h5, h6, li, div, section, article, tr, td, th, dt, dd, time, br").each((_, el) => {
    $(el).append("\n");
  });
  const text = root
    .text()
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const base = res.finalUrl || src.url;
  const links: { text: string; href: string }[] = [];
  const seen = new Set<string>();
  root.find("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) return;
    if (t.length < 4) return;
    try {
      const abs = new URL(href, base).toString();
      const key = normalizeUrl(abs);
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ text: truncate(t, 120), href: abs });
    } catch {
      /* ignore bad hrefs */
    }
  });
  return { url: base, title, text: text.slice(0, 16000), links: links.slice(0, 160) };
}
