#!/usr/bin/env tsx
// The morning robot. Runs at 6:00 Europe/Paris from GitHub Actions:
//   1. reads every source in config/sources.yaml
//   2. filters (blocklist, freshness, duplicates)
//   3. asks Claude to summarise and score each item for Yamuna
//   4. picks the day's items per section and the home-page mix
//   5. writes the spoken recaps and the greeting
//   6. saves everything under data/ (committed by the workflow)
//
// Flags: --dry-run (fetch only, no Claude, nothing written)
//        --category=<id> (one section only)   --no-recaps   --max-items=<n>

import { loadConfig } from "../lib/config";
import { parisDateKey } from "../lib/format";
import type { CategoryConfig, DayEdition, Item, Recap, SourceConfig, SourceReport } from "../lib/types";
import { enrichItems, extractItemsFromPage, usage, writeGreeting, writeRecap } from "./lib/claude";
import {
  fetchNews,
  fetchPage,
  fetchPodcast,
  fetchRss,
  fetchYoutube,
  type RawItem,
  type ResolvedCache,
} from "./lib/fetchers";
import { mapLimit } from "./lib/http";
import { pruneOld, readCache, readItems, writeCache, writeEdition, writeItems } from "./lib/store";
import { normalizeUrl, sha1 } from "./lib/text";

const args = new Set(process.argv.slice(2));
const flag = (name: string) => [...args].find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const DRY = args.has("--dry-run");
const ONLY = flag("category");
const NO_RECAPS = args.has("--no-recaps");
const MAX_ITEMS = Number(flag("max-items") ?? 0) || undefined;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- helpers

function expandSources(cat: CategoryConfig): SourceConfig[] {
  const list = [...cat.sources];
  // Works on the programme become news searches automatically.
  if (cat.works) {
    for (const [group, works] of Object.entries(cat.works)) {
      for (const w of works) {
        list.push({ name: `${w} (${group.replace(/_/g, " ")})`, type: "news", query: w, lang: "en", weight: 0.9 });
      }
    }
  }
  return list;
}

function isBlocked(domain: string, sourceName: string, blocked: string[]): boolean {
  const d = domain.toLowerCase();
  if (blocked.some((b) => d === b || d.endsWith("." + b))) return true;
  // Belt and braces: an outlet whose name matches a blocked domain's stem (e.g. "CNEWS" ↔ cnews.fr).
  const name = sourceName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return blocked.some((b) => {
    const stem = b.split(".")[0].replace(/[^a-z0-9]/g, "");
    return stem.length >= 4 && name === stem;
  });
}

function itemId(raw: RawItem): string {
  const base = normalizeUrl(raw.url);
  return raw.type === "event" ? sha1(base + "|" + raw.title.toLowerCase()) : sha1(base);
}

function isFresh(raw: RawItem, now: Date, windowHours: number, mediaWindowHours: number, todayKey: string): boolean {
  if (raw.type === "event" && raw.eventDate) {
    const end = raw.eventEnd ?? raw.eventDate;
    const soon = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    return end >= todayKey && raw.eventDate <= soon;
  }
  if (!raw.publishedAt) return false;
  const age = now.getTime() - new Date(raw.publishedAt).getTime();
  // Podcasts and videos come out weekly: give them a longer window (they are only ever added once).
  const hours = raw.type === "podcast" || raw.type === "video" ? mediaWindowHours : windowHours;
  return age >= -3600000 && age <= hours * 3600000;
}

/** Normalised title used to spot the same story coming from several sources. */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(le|la|les|de|des|du|the|a|an|of|and|et|en|au|aux|à|in|on|for)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isNearDuplicate(key: string, seen: string[]): boolean {
  if (key.length < 12) return seen.includes(key);
  return seen.some((s) => s === key || (s.length >= 12 && (s.includes(key) || key.includes(s))));
}

// ---------------------------------------------------------------- main

async function main() {
  const config = loadConfig();
  const now = new Date();
  const today = parisDateKey(now);
  const cache: ResolvedCache = readCache();
  const existing = readItems();
  const known = new Set(existing.map((i) => i.id));
  const knownUrls = new Set(existing.map((i) => normalizeUrl(i.url)));
  const byCatExisting = new Map<string, Item[]>();
  for (const i of existing) byCatExisting.set(i.category, [...(byCatExisting.get(i.category) ?? []), i]);
  const reports: SourceReport[] = [];
  const newItems: Item[] = [];
  const newByCategory: Record<string, number> = {};
  const categories = config.categories.filter((c) => !ONLY || c.id === ONLY);

  log(`The Daily Yam — edition ${today}${DRY ? " (dry run)" : ""}; ${existing.length} items already on file`);

  for (const cat of categories) {
    const sources = expandSources(cat);
    log(`▸ ${cat.name}: ${sources.length} sources`);
    const catRaw: Array<RawItem & { weight: number; alwaysInclude: boolean }> = [];

    await mapLimit(sources, 6, async (src) => {
      const t0 = Date.now();
      const report: SourceReport = { category: cat.id, name: src.name, type: src.type, ok: true, fetched: 0, kept: 0, ms: 0 };
      try {
        let raws: RawItem[] = [];
        if (src.type === "rss") raws = await fetchRss(src);
        else if (src.type === "youtube") raws = await fetchYoutube(src, cache);
        else if (src.type === "podcast") raws = await fetchPodcast(src, cache);
        else if (src.type === "news") raws = await fetchNews(src);
        else if (src.type === "page") {
          const page = await fetchPage(src);
          report.note = `page: ${page.text.length} chars, ${page.links.length} links`;
          raws = DRY ? [] : await extractItemsFromPage(config, cat, page, src.name, src.lang ?? "fr", today);
          if (DRY) report.fetched = page.text.length > 200 ? 1 : 0;
        }
        report.fetched = report.fetched || raws.length;
        for (const r of raws) {
          if (!r.title || !r.url) continue;
          if (isBlocked(r.domain, r.source, config.rules.blocked_domains)) continue;
          if (!isFresh(r, now, config.rules.window_hours, config.rules.window_hours_media, today)) continue;
          catRaw.push({ ...r, weight: src.weight ?? 1, alwaysInclude: Boolean(src.always_include) });
          report.kept += 1;
        }
      } catch (err) {
        report.ok = false;
        report.error = (err as Error).message.slice(0, 200);
      }
      report.ms = Date.now() - t0;
      reports.push(report);
    });

    // De-duplicate inside the section: same URL, same story already on file, or a near-identical title
    // (the same festival announced by three agendas). Favourites are checked first so they win ties.
    catRaw.sort((a, b) => (b.weight - a.weight) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const seenIds = new Set<string>();
    const seenTitles: string[] = (byCatExisting.get(cat.id) ?? []).map((i) => titleKey(i.title));
    const fresh = catRaw.filter((r) => {
      const id = itemId(r);
      const tkey = titleKey(r.title);
      if (known.has(id) || knownUrls.has(normalizeUrl(r.url))) return false;
      if (seenIds.has(id) || isNearDuplicate(tkey, seenTitles)) return false;
      seenIds.add(id);
      seenTitles.push(tkey);
      return true;
    });
    const toJudge = fresh.slice(0, MAX_ITEMS ?? 60);
    log(`  ${catRaw.length} fresh, ${fresh.length} new, judging ${toJudge.length}`);
    if (DRY || !toJudge.length) {
      newByCategory[cat.id] = 0;
      continue;
    }

    const batches: typeof toJudge[] = [];
    for (let i = 0; i < toJudge.length; i += 12) batches.push(toJudge.slice(i, i + 12));
    const enriched = (await mapLimit(batches, 3, (b) => enrichItems(config, cat, b, today))).flat();

    const candidates = toJudge.map((r, i) => {
      const e = enriched[i];
      const item: Item = {
        id: itemId(r),
        category: cat.id,
        type: r.type,
        title: r.title,
        url: r.url,
        source: r.source,
        domain: r.domain,
        lang: r.lang,
        publishedAt: r.publishedAt ?? now.toISOString(),
        eventDate: r.eventDate,
        eventEnd: r.eventEnd,
        eventPlace: r.eventPlace,
        summary: e.summary || r.description || "",
        relevance: e.relevance,
        goodNews: e.goodNews || undefined,
        duration: r.duration,
        videoId: r.videoId,
        image: r.image,
        addedOn: today,
      };
      return { item, score: e.relevance * r.weight, alwaysInclude: r.alwaysInclude, keep: e.keep };
    });

    const selected = candidates
      .filter((c) => c.alwaysInclude || (c.keep && c.item.relevance >= 4))
      .sort((a, b) => b.score - a.score || b.item.publishedAt.localeCompare(a.item.publishedAt))
      .slice(0, config.rules.max_per_category_per_day)
      .map((c) => c.item);

    for (const item of selected) {
      newItems.push(item);
      known.add(item.id);
      knownUrls.add(normalizeUrl(item.url));
    }
    newByCategory[cat.id] = selected.length;
    log(`  kept ${selected.length} for ${cat.name}`);
  }

  // Good news from anywhere (cross-posting).
  const goodCat = config.categories.find((c) => c.cross_post_from_all);
  const crossPosted = new Set<string>();
  if (goodCat && !DRY) {
    const extras = newItems
      .filter((i) => i.goodNews && i.category !== goodCat.id && i.relevance >= 6)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 4)
      .map((i) => ({ ...i, id: sha1(i.id + "|" + goodCat.id), category: goodCat.id }));
    for (const e of extras) crossPosted.add(e.id);
    newItems.push(...extras);
    if (extras.length) {
      newByCategory[goodCat.id] = (newByCategory[goodCat.id] ?? 0) + extras.length;
      log(`  cross-posted ${extras.length} uplifting items into ${goodCat.name}`);
    }
  }

  // Report
  const failed = reports.filter((r) => !r.ok);
  log(`Sources: ${reports.length - failed.length} ok, ${failed.length} failed`);
  for (const r of failed) log(`  ✗ ${r.category}/${r.name} [${r.type}]: ${r.error}`);
  if (DRY) {
    const ok = reports.filter((r) => r.ok).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    for (const r of ok) log(`  ✓ ${r.category}/${r.name} [${r.type}] fetched ${r.fetched}, fresh ${r.kept}`);
    return;
  }

  // Merge, prune, mix, recaps.
  let all = pruneOld([...existing, ...newItems], config.rules.keep_days, today);
  const byCat = new Map<string, Item[]>();
  for (const i of all) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i]);

  const todays = newItems.filter((i) => !crossPosted.has(i.id));
  const mix: Item[] = [];
  const used = new Set<string>();
  for (const cat of config.categories) {
    const best = todays.filter((i) => i.category === cat.id).sort((a, b) => b.relevance - a.relevance)[0];
    if (best && !used.has(best.id)) {
      mix.push(best);
      used.add(best.id);
    }
  }
  for (const i of [...todays].sort((a, b) => b.relevance - a.relevance)) {
    if (mix.length >= config.rules.home_mix_size) break;
    if (!used.has(i.id)) {
      mix.push(i);
      used.add(i.id);
    }
  }
  mix.sort((a, b) => b.relevance - a.relevance);

  const recaps: Record<string, Recap> = {};
  if (!NO_RECAPS) {
    const windowStart = new Date(now.getTime() - config.rules.window_hours * 3600000).toISOString();
    await mapLimit(categories, 2, async (cat) => {
      const recent = (byCat.get(cat.id) ?? [])
        .filter((i) => i.publishedAt >= windowStart || i.addedOn === today)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 15);
      if (!recent.length) {
        const empty = `Good morning, Yamuna. Nothing new has come in for ${cat.name} over the last two days — a quiet patch. Everything already on the page is still there whenever you want it.`;
        recaps[cat.id] = { short: empty, long: empty, itemIds: [], wordsShort: 0, wordsLong: 0 };
        return;
      }
      try {
        const short = await writeRecap(config, cat, recent, config.rules.audio_recap_minutes, today);
        const long =
          recent.length >= 5
            ? await writeRecap(config, cat, recent, config.rules.audio_recap_long_minutes, today)
            : short;
        recaps[cat.id] = { short: short.text, long: long.text, itemIds: recent.map((i) => i.id), wordsShort: short.words, wordsLong: long.words };
        log(`  recap ${cat.name}: ${short.words} / ${long.words} words`);
      } catch (err) {
        log(`  recap ${cat.name} failed: ${(err as Error).message}`);
      }
    });
  }

  let greeting = `Good morning, Yamuna. Your ${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Paris" }).format(now)} edition is ready.`;
  if (mix.length) {
    try {
      const g = await writeGreeting(config, mix, today);
      if (g) greeting = g;
      else log("greeting came back empty; keeping the default line");
    } catch (err) {
      log(`greeting failed: ${(err as Error).message}`);
    }
  }

  const edition: DayEdition = {
    date: today,
    generatedAt: now.toISOString(),
    greeting,
    mix: mix.map((i) => i.id),
    newByCategory,
    recaps,
    sources: reports.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    usage: { ...usage },
  };

  // If the robot already ran today (manual re-run), merge instead of duplicating.
  all = Array.from(new Map(all.map((i) => [i.id, i])).values());
  writeItems(all);
  writeEdition(edition);
  writeCache(cache);

  log(`Done: ${newItems.length} new items, ${all.length} on site, mix of ${mix.length}. Claude: ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out tokens.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
