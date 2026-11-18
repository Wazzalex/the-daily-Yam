#!/usr/bin/env tsx
// The robots.
//
// DAILY (every morning): read every source → filter, de-duplicate → Claude judges the
// candidates and writes a one-line note → they join the week's POOL → Claude writes the
// Daily Yam, a 4-minute spoken piece → audio is pre-generated when the voice is set up.
//
// WEEKLY (Saturdays, or --weekly): from the pool of the week, per section, Claude picks
// 2 things to listen to and 2 to read → the Words session from Yamuna's Google Doc →
// a book of the week from the shelf.
//
// Flags: --dry-run    fetch only, no Claude, nothing written
//        --weekly     run the weekly part today (even if not Saturday)
//        --no-daily   skip the daily part (use with --weekly)
//        --category=<id>   one section only (daily collection)
//        --force      redo today's daily / this week's weekly even if present

import { loadBooks, loadConfig } from "../lib/config";
import { parisDateKey } from "../lib/format";
import type { CategoryConfig, DailyEdition, Item, SourceConfig, SourceReport, WeeklyEdition, WeeklyPick, WordEntry, WordsSession } from "../lib/types";
import { bookAudioPath, dailyAudioPath, drillScript, ensureAudio, estimateSeconds, settingsFor, ttsAvailable, wordAudioPath } from "../lib/tts";
import { cleanupOldAudio } from "./lib/audio-cleanup";
import { buildWordEntries, judgeItems, extractItemsFromPage, pickBookOfTheWeek, pickWeekly, usage, writeDaily, writeRefresher, writeWeeklyGreeting } from "./lib/claude";
import { fetchNews, fetchPage, fetchPodcast, fetchRss, fetchYoutube, type RawItem, type ResolvedCache } from "./lib/fetchers";
import { mapLimit } from "./lib/http";
import {
  latestWeeklyDate,
  latestWordsDate,
  prune,
  readCache,
  readDaily,
  readPool,
  readRefresher,
  readWeekly,
  readWeeklyTitles,
  readWordsRegistry,
  readWordsSnapshot,
  recentBookSlugs,
  writeCache,
  writeDaily as saveDaily,
  writePool,
  writeRefresher as saveRefresher,
  writeWeekly as saveWeekly,
  writeWeeklyEdition as saveWeeklyEdition,
  writeWordsRegistry,
  writeWordsSession,
  writeWordsSnapshot,
} from "./lib/store";
import { normalizeUrl, sha1 } from "./lib/text";
import { loadNotebook, parseNotebook, pickNewEntries } from "./lib/words-doc";

const args = new Set(process.argv.slice(2));
const flag = (name: string) => [...args].find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const DRY = args.has("--dry-run");
const FORCE = args.has("--force");
const ONLY = flag("category");
const WANT_WEEKLY = args.has("--weekly");
const WANT_WORDS = args.has("--words"); // only the Words session, from the notebook (any day)
const NO_DAILY = args.has("--no-daily") || WANT_WORDS;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

function parisWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Paris" }).format(d).toLowerCase();
}
function mondayOf(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function daysAgo(dateKey: string, n: number): string {
  const d = new Date(dateKey + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- collection helpers

function isBlocked(domain: string, sourceName: string, blocked: string[]): boolean {
  const d = domain.toLowerCase();
  if (blocked.some((b) => d === b || d.endsWith("." + b))) return true;
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
  const hours = raw.type === "podcast" || raw.type === "video" ? mediaWindowHours : windowHours;
  return age >= -3600000 && age <= hours * 3600000;
}

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

// ---------------------------------------------------------------- DAILY

async function runDaily(now: Date, today: string): Promise<{ newItems: Item[]; reports: SourceReport[] }> {
  const config = loadConfig();
  const cache: ResolvedCache = readCache();
  const pool = readPool();
  const known = new Set(pool.map((i) => i.id));
  const knownUrls = new Set(pool.map((i) => normalizeUrl(i.url)));
  const byCatExisting = new Map<string, Item[]>();
  for (const i of pool) byCatExisting.set(i.category, [...(byCatExisting.get(i.category) ?? []), i]);
  const reports: SourceReport[] = [];
  const newItems: Item[] = [];
  const categories = config.categories.filter((c) => !ONLY || c.id === ONLY);

  for (const cat of categories) {
    const sources: SourceConfig[] = cat.sources;
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

    catRaw.sort((a, b) => b.weight - a.weight || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
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
    const toJudge = fresh.slice(0, config.rules.max_candidates_per_day);
    log(`  ${catRaw.length} fresh, ${fresh.length} new, judging ${toJudge.length}`);
    if (DRY || !toJudge.length) continue;

    const batches: (typeof toJudge)[] = [];
    for (let i = 0; i < toJudge.length; i += 13) batches.push(toJudge.slice(i, i + 13));
    const judged = (await mapLimit(batches, 3, (b) => judgeItems(config, cat, b, today))).flat();

    let kept = 0;
    toJudge.forEach((r, i) => {
      const j = judged[i];
      if (!(r.alwaysInclude || (j.keep && j.relevance >= 5))) return;
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
        summary: j.summary || r.description || "",
        relevance: Math.round(j.relevance * r.weight * 10) / 10,
        goodNews: j.goodNews || undefined,
        duration: r.duration,
        videoId: r.videoId,
        image: r.image,
        addedOn: today,
      };
      newItems.push(item);
      known.add(item.id);
      knownUrls.add(normalizeUrl(item.url));
      kept += 1;
    });
    log(`  pooled ${kept} for ${cat.name}`);
  }

  const failed = reports.filter((r) => !r.ok);
  log(`Sources: ${reports.length - failed.length} ok, ${failed.length} failed`);
  for (const r of failed) log(`  ✗ ${r.category}/${r.name} [${r.type}]: ${r.error}`);
  if (DRY) {
    for (const r of reports.filter((x) => x.ok).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) {
      log(`  ✓ ${r.category}/${r.name} [${r.type}] fetched ${r.fetched}, fresh ${r.kept}${r.note ? " · " + r.note : ""}`);
    }
    return { newItems: [], reports };
  }

  writeCache(cache);
  return { newItems, reports };
}

async function writeDailyEdition(now: Date, today: string, pool: Item[], newItems: Item[], reports: SourceReport[]): Promise<DailyEdition> {
  const config = loadConfig();
  const names = new Map(config.categories.map((c) => [c.id, c.name]));
  const sections = new Set(config.editions.daily.sections);
  const since = daysAgo(today, 2);
  // Candidates: new today first, then the freshest of the last two days, best relevance first.
  const recent = pool
    .filter((i) => sections.has(i.category) && (i.addedOn >= since || newItems.some((n) => n.id === i.id)))
    .sort((a, b) => (b.addedOn === today ? 1 : 0) - (a.addedOn === today ? 1 : 0) || b.relevance - a.relevance);
  // A spread across sections so the Daily is not all books.
  const perSection = new Map<string, Item[]>();
  for (const i of recent) perSection.set(i.category, [...(perSection.get(i.category) ?? []), i]);
  const candidates: Item[] = [];
  for (let round = 0; round < 4; round++) for (const [, list] of perSection) if (list[round]) candidates.push(list[round]);
  const good = config.editions.daily.good_news_signoff
    ? pool.filter((i) => i.goodNews && i.addedOn >= since).sort((a, b) => b.relevance - a.relevance)[0]
    : undefined;

  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Paris" }).format(now);
  let script = "";
  let teaser = "";
  let words = 0;
  let usedIds: string[] = [];
  if (candidates.length) {
    const r = await writeDaily(
      config,
      candidates.slice(0, 14).map((i) => ({ ...i, categoryName: names.get(i.category) ?? i.category })),
      good,
      config.editions.daily.minutes,
      config.editions.daily.max_stories,
      today,
      weekday,
    );
    script = r.script;
    teaser = r.teaser;
    words = r.words;
    usedIds = r.usedIds;
    log(`  daily script: ${words} words, ${usedIds.length} stories`);
  } else {
    script = `Good morning, Yamuna. A quiet ${weekday}: nothing new worth your four minutes came in overnight, so take them for yourself. Back tomorrow.`;
    teaser = "A quiet morning.";
    words = script.split(/\s+/).length;
  }

  const edition: DailyEdition = {
    date: today,
    generatedAt: now.toISOString(),
    script,
    words,
    teaser,
    itemIds: usedIds,
    newCandidates: newItems.length,
    sources: reports.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  };

  const tts = ttsAvailable();
  if (config.audio.provider === "openai" && tts.ok) {
    const voice = settingsFor(config.audio);
    try {
      const r = await ensureAudio(dailyAudioPath(today, script, voice), script, voice);
      edition.audio = { url: r.url, voice: voice.voice, seconds: estimateSeconds(script) };
      log(`  audio: daily ${r.generated ? "generated" : "already there"}`);
    } catch (err) {
      log(`  audio: daily failed (${(err as Error).message.slice(0, 120)}) — the site will make it on first play`);
    }
  } else if (config.audio.provider === "openai") log(`  audio: skipped (${tts.reason}) — the site will make it on first play`);
  return edition;
}

// ---------------------------------------------------------------- WEEKLY

async function runWeekly(now: Date, today: string, pool: Item[]): Promise<void> {
  const config = loadConfig();
  const names = new Map(config.categories.map((c) => [c.id, c.name]));
  const since = daysAgo(today, config.editions.weekly.lookback_days);
  const weekOf = mondayOf(today);
  const picks: Record<string, WeeklyPick[]> = {};
  const pickedItems: Item[] = [];

  for (const cat of config.categories.filter((c) => c.show !== false)) {
    const week = pool.filter((i) => i.category === cat.id && i.addedOn >= since).sort((a, b) => b.relevance - a.relevance);
    const listenable = week.filter((i) => i.type === "podcast" || i.type === "video").slice(0, 18);
    const readable = week.filter((i) => i.type === "article" || i.type === "event").slice(0, 18);
    if (!listenable.length && !readable.length) {
      picks[cat.id] = [];
      log(`  ${cat.name}: nothing this week`);
      continue;
    }
    try {
      const r = await pickWeekly(config, cat, listenable, readable, config.editions.weekly.per_section.listen, config.editions.weekly.per_section.read, today);
      picks[cat.id] = r.picks;
      for (const p of r.picks) {
        const it = pool.find((i) => i.id === p.itemId);
        if (!it) continue;
        if (r.summaries[it.id]) it.summary = r.summaries[it.id];
        pickedItems.push(it);
      }
      log(`  ${cat.name}: ${r.picks.filter((p) => p.mode === "listen").length} to listen, ${r.picks.filter((p) => p.mode === "read").length} to read`);
    } catch (err) {
      log(`  ${cat.name}: weekly pick failed: ${(err as Error).message}`);
      picks[cat.id] = [];
    }
  }

  const weekTitles = pickedItems.map((i) => i.title);
  let greeting = `Good morning, Yamuna. Your week's Yam is ready: a few things to listen to, a few to read, nothing more.`;
  if (pickedItems.length) {
    try {
      greeting = await writeWeeklyGreeting(config, pickedItems.map((i) => ({ ...i, categoryName: names.get(i.category) ?? i.category })), weekOf);
    } catch (err) {
      log(`  greeting failed: ${(err as Error).message}`);
    }
  }

  // Words
  let wordsSession: string | undefined;
  try {
    const session = await buildWordsSession(today, weekTitles);
    if (session) wordsSession = session.date;
  } catch (err) {
    log(`  words: ${(err as Error).message}`);
  }

  // Book of the week
  let bookOfTheWeek: WeeklyEdition["bookOfTheWeek"];
  const books = loadBooks();
  if (config.editions.weekly.book_of_the_week && books.length) {
    try {
      bookOfTheWeek = await pickBookOfTheWeek(config, books, recentBookSlugs(), weekTitles);
      if (bookOfTheWeek) {
        log(`  book of the week: ${bookOfTheWeek.slug}`);
        const book = books.find((b) => b.slug === bookOfTheWeek!.slug)!;
        if (!readRefresher(book.slug)) {
          const r = await writeRefresher(config, book);
          saveRefresher({ slug: book.slug, generatedAt: now.toISOString(), ...r });
          log(`  refresher written for ${book.title} (${r.confidence})`);
        }
      }
    } catch (err) {
      log(`  book of the week failed: ${(err as Error).message}`);
    }
  }

  const edition: WeeklyEdition = { date: today, weekOf, generatedAt: now.toISOString(), greeting, picks, bookOfTheWeek, wordsSession, usage: { ...usage } };
  saveWeekly(edition, pickedItems);

  // Audio for the book of the week, when the voice is set up.
  const tts = ttsAvailable();
  if (bookOfTheWeek && config.audio.provider === "openai" && tts.ok) {
    const ref = readRefresher(bookOfTheWeek.slug);
    if (ref && !ref.audio && ref.script) {
      try {
        const voice = settingsFor(config.audio);
        const r = await ensureAudio(bookAudioPath(ref.slug, ref.script, voice), ref.script, voice);
        saveRefresher({ ...ref, audio: { url: r.url, voice: voice.voice, seconds: estimateSeconds(ref.script) } });
        log(`  audio: book refresher ready`);
      } catch (err) {
        log(`  audio: book failed: ${(err as Error).message.slice(0, 120)}`);
      }
    }
  }
  log(`Weekly ${today}: ${pickedItems.length} picks across ${Object.keys(picks).length} sections`);
}

async function buildWordsSession(today: string, weekTitles: string[]): Promise<WordsSession | null> {
  const config = loadConfig();
  if (!config.words.google_doc_id) {
    log("  words: no google_doc_id in config");
    return null;
  }
  const { paragraphs, source, warning } = await loadNotebook(config.words.google_doc_id, readWordsSnapshot());
  if (warning) log(`  words: ${warning}`);
  if (source === "live") writeWordsSnapshot({ docId: config.words.google_doc_id, fetchedAt: new Date().toISOString(), paragraphs });
  const all = parseNotebook(paragraphs);
  if (!all.length) {
    log("  words: the notebook has no entries yet");
    return null;
  }
  const registry = readWordsRegistry();
  const reviewCut = daysAgo(today, config.words.review_after_weeks * 7);
  const fresh = all.filter((w) => !registry[w.key]);
  const due = all.filter((w) => {
    const r = registry[w.key];
    return r && (!r.lastReviewed || r.lastReviewed <= reviewCut);
  });
  due.sort((a, b) => (registry[a.key].lastReviewed ?? "").localeCompare(registry[b.key].lastReviewed ?? ""));

  const perWeek = config.editions.weekly.words_per_week || config.words.per_week;
  const reviewSlots = Math.min(due.length, Math.round(perWeek * config.words.review_share));
  const chosenNew = pickNewEntries(fresh, perWeek - reviewSlots, config.words.max_per_theme, today);
  const chosenDue = due.slice(0, Math.max(reviewSlots, perWeek - chosenNew.length)).slice(0, perWeek - chosenNew.length);
  const chosen = [...chosenNew.map((w) => ({ ...w, review: false })), ...chosenDue.map((w) => ({ ...w, review: true }))];
  if (!chosen.length) {
    log("  words: nothing new and nothing due for review");
    return null;
  }
  const entries: WordEntry[] = await buildWordEntries(config, chosen, weekTitles);
  const session: WordsSession = { date: today, generatedAt: new Date().toISOString(), entries, docEntries: all.length, newEntries: chosenNew.length, source };

  for (const w of chosen) {
    const prev = registry[w.key];
    const built = entries.find((e) => e.key === w.key);
    registry[w.key] = { term: built?.term ?? w.bold[0] ?? w.line.slice(0, 60), firstSeen: prev?.firstSeen ?? today, lastReviewed: today, times: (prev?.times ?? 0) + 1 };
  }
  writeWordsRegistry(registry);

  // Audio: one clip per term and per example (tiny), plus the full drill — when the voice is set up.
  const tts = ttsAvailable();
  if (config.audio.provider === "openai" && tts.ok) {
    await mapLimit(entries.map((e, i) => ({ e, i })), 4, async ({ e, i }) => {
      try {
        const vTerm = settingsFor(config.audio, undefined, e.lang);
        const t = await ensureAudio(wordAudioPath(today, "term", i, e.term, vTerm), e.term, vTerm);
        const x = e.example ? await ensureAudio(wordAudioPath(today, "example", i, e.example, vTerm), e.example, vTerm) : null;
        e.audio = { term: t.url, example: x?.url };
      } catch (err) {
        log(`  words audio #${i} failed: ${(err as Error).message.slice(0, 100)}`);
      }
    });
    try {
      const voice = settingsFor(config.audio);
      const drill = drillScript(entries);
      const d = await ensureAudio(wordAudioPath(today, "drill", 0, drill, voice), drill, voice);
      session.drill = { url: d.url, voice: voice.voice, seconds: estimateSeconds(drill) + entries.length * 4 };
    } catch (err) {
      log(`  words drill audio failed: ${(err as Error).message.slice(0, 100)}`);
    }
  }
  writeWordsSession(session);
  log(`  words: ${entries.length} entries (${chosenNew.length} new, ${entries.length - chosenNew.length} review) from ${all.length} in the notebook (${source})`);
  return session;
}

// ---------------------------------------------------------------- main

async function main() {
  const config = loadConfig();
  const now = new Date();
  const today = parisDateKey(now);
  const weekday = parisWeekday(now);
  log(`The Daily Yam — ${weekday} ${today}${DRY ? " (dry run)" : ""}`);

  let pool = readPool();
  let didSomething = false;

  if (!NO_DAILY) {
    if (readDaily(today) && !FORCE && !DRY) {
      log(`Daily ${today} already exists (use --force to redo).`);
    } else {
      const { newItems, reports } = await runDaily(now, today);
      if (!DRY) {
        pool = prune([...pool, ...newItems], config.rules.keep_days, config.rules.keep_weeks, today);
        const edition = await writeDailyEdition(now, today, pool, newItems, reports);
        edition.usage = { ...usage };
        writePool(pool);
        saveDaily(edition);
        didSomething = true;
        log(`Daily ${today}: ${newItems.length} new candidates, pool ${pool.length}`);
      }
    }
  }

  // Words only: rebuild this week's session from the notebook, whatever the day.
  if (WANT_WORDS && !DRY) {
    const weekKey = mondayOf(today);
    const existing = latestWordsDate();
    if (existing && mondayOf(existing) === weekKey && !FORCE) {
      log(`Words session of ${existing} already covers this week (use --force to redo).`);
    } else {
      const weekly = latestWeeklyDate();
      const titles = weekly ? (readWeeklyTitles(weekly) ?? []) : [];
      const session = await buildWordsSession(today, titles);
      if (session) {
        didSomething = true;
        // Point this week's Weekly at the new session so the home page shows it.
        if (weekly && mondayOf(weekly) === weekKey) {
          const ed = readWeekly(weekly);
          if (ed && ed.wordsSession !== session.date) saveWeeklyEdition({ ...ed, wordsSession: session.date });
        }
      }
    }
  }

  const isWeeklyDay = weekday === (config.editions.weekly.weekday || "saturday").toLowerCase();
  if (!DRY && !WANT_WORDS && (WANT_WEEKLY || isWeeklyDay)) {
    const weekKey = mondayOf(today);
    const latest = latestWeeklyDate();
    const alreadyThisWeek = Boolean(readWeekly(today)) || (latest !== null && mondayOf(latest) === weekKey);
    if (alreadyThisWeek && !FORCE) log(`Weekly for the week of ${weekKey} already exists (use --force to redo).`);
    else {
      await runWeekly(now, today, pool);
      writePool(pool); // summaries refined for the picks
      didSomething = true;
    }
  }

  if (!DRY && config.audio.provider === "openai" && ttsAvailable().ok) {
    try {
      const removed = await cleanupOldAudio(config.rules.keep_days, today);
      if (removed) log(`audio: removed ${removed} old file(s)`);
    } catch (err) {
      log(`audio cleanup failed: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  log(`Done${didSomething ? "" : " (nothing to do)"}. Claude: ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out tokens.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
