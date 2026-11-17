// Everything the robots ask Claude: reading agenda pages, judging candidates,
// writing the Daily script, choosing the Weekly picks, building the Words session,
// and the Bookshelf refreshers.

import Anthropic from "@anthropic-ai/sdk";
import type { Book, BookRefresher, CategoryConfig, Item, SiteConfig, WeeklyPick, WordEntry } from "../../lib/types";
import type { PageContent, RawItem } from "./fetchers";
import { countWords, extractJson, truncate } from "./text";

export const FAST_MODEL = process.env.YAM_FAST_MODEL ?? "claude-haiku-5-5";
export const SMART_MODEL = process.env.YAM_SMART_MODEL ?? "claude-sonnet-5-5";

export const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (GitHub secret / .env.local)");
  if (!client) client = new Anthropic({ maxRetries: 4, timeout: 120000 });
  return client;
}

export async function ask(model: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await getClient().messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  usage.calls += 1;
  usage.inputTokens += res.usage?.input_tokens ?? 0;
  usage.outputTokens += res.usage?.output_tokens ?? 0;
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function readerBlock(config: SiteConfig): string {
  const r = config.reader;
  return [`READER: ${r.name}.`, r.profile.trim(), `She loves: ${r.loves.join("; ")}.`, `She avoids: ${r.avoids.join("; ")}.`].join("\n");
}

function categoryBlock(cat: CategoryConfig): string {
  const extra: string[] = [];
  if (cat.platforms) extra.push(`Her platforms: ${cat.platforms.join(", ")}.`);
  return [`SECTION "${cat.name}": ${cat.brief.trim()}`, ...extra].join("\n");
}

function describeItem(it: Item, i: number, categoryName?: string): string {
  const when = it.eventDate ? `event ${it.eventDate}${it.eventPlace ? " at " + it.eventPlace : ""}` : it.publishedAt.slice(0, 10);
  return `${i}. [${categoryName ? categoryName + " · " : ""}${it.type}${it.duration ? " " + it.duration : ""}] ${it.title} — ${it.source} — ${when}\n   ${it.summary}`;
}

// ---------------------------------------------------------------- page → items

interface ExtractedEvent {
  title: string;
  url?: string;
  date?: string | null;
  date_end?: string | null;
  place?: string | null;
  blurb?: string;
  kind?: "event" | "article";
}

export async function extractItemsFromPage(config: SiteConfig, cat: CategoryConfig, page: PageContent, sourceName: string, lang: string, today: string): Promise<RawItem[]> {
  const system = `You read a web page for a personal cultural digest and extract the dated items it announces (exhibitions, events, talks, new pieces). Reply with JSON only.`;
  const links = page.links.map((l) => `- ${l.text} → ${l.href}`).join("\n");
  const user = `${categoryBlock(cat)}

Today is ${today}. Page: ${page.title} (${page.url})

PAGE TEXT (truncated):
"""
${page.text}
"""

LINKS ON THE PAGE:
${links}

Extract up to 12 distinct items worth knowing about: things happening between today and 60 days from now, or pieces published in the last 7 days. Ignore navigation, newsletters, generic pages, anything without a real title.
For each: "title" (original language), "url" (most specific absolute link, else the page url), "date" (YYYY-MM-DD or null), "date_end" (YYYY-MM-DD or null), "place" (venue or town or null), "blurb" (one or two factual sentences in English), "kind" ("event" or "article").
Return a JSON array; [] if nothing relevant.`;
  const text = await ask(FAST_MODEL, system, user, 3000);
  let parsed: ExtractedEvent[] = [];
  try {
    parsed = extractJson<ExtractedEvent[]>(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: RawItem[] = [];
  for (const e of parsed) {
    if (!e?.title || typeof e.title !== "string") continue;
    const url = (e.url && /^https?:\/\//.test(e.url) ? e.url : page.url).trim();
    const date = e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : undefined;
    const dateEnd = e.date_end && /^\d{4}-\d{2}-\d{2}$/.test(e.date_end) ? e.date_end : undefined;
    out.push({
      title: e.title.trim(),
      url,
      publishedAt: new Date().toISOString(),
      description: truncate((e.blurb ?? "").trim(), 500),
      type: e.kind === "article" ? "article" : "event",
      source: sourceName,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      lang,
      eventDate: date,
      eventEnd: dateEnd,
      eventPlace: e.place ?? undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------- judge candidates (pool notes)

export interface Judged {
  keep: boolean;
  relevance: number;
  summary: string;
  goodNews: boolean;
}

export async function judgeItems(config: SiteConfig, cat: CategoryConfig, items: RawItem[], today: string): Promise<Judged[]> {
  const system = `You are the editor of "The Daily Yam", a private cultural digest written for one reader. You judge whether each candidate belongs in a section and write a one-sentence note. British English, precise, no hype, no emojis. Reply with JSON only.`;
  const list = items
    .map((it, i) =>
      [
        `#${i} [${it.type}${it.duration ? " " + it.duration : ""}] ${it.title}`,
        `source: ${it.source} (${it.domain}) · lang: ${it.lang}${it.publishedAt ? ` · published: ${it.publishedAt.slice(0, 16)}` : ""}${it.eventDate ? ` · event: ${it.eventDate}${it.eventPlace ? " at " + it.eventPlace : ""}` : ""}`,
        it.description ? `text: ${truncate(it.description, 500)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const user = `${readerBlock(config)}

${categoryBlock(cat)}

Today is ${today}. Judge each candidate for this section and this reader.
- "keep": false for anything off-topic, duplicated, promotional, breaking news, sport, crime, party politics, markets, or clickbait.
- "relevance": 0–10 for how much Yamuna would want this one (10 = drop everything). Programmes to listen to and beautifully written pieces score higher; industry news lower.
- "summary": ONE sentence in English (max 30 words) saying what it is. Keep proper nouns; never invent facts.
- "goodNews": true only if genuinely uplifting.

CANDIDATES:
${list}

Return a JSON array with exactly ${items.length} objects in order: {"i": index, "keep": boolean, "relevance": number, "summary": string, "goodNews": boolean}.`;
  const text = await ask(FAST_MODEL, system, user, 3500);
  let parsed: Array<{ i?: number; keep?: boolean; relevance?: number; summary?: string; goodNews?: boolean }> = [];
  try {
    parsed = extractJson(text);
  } catch (err) {
    throw new Error(`Could not parse Claude's JSON for ${cat.id}: ${(err as Error).message}`);
  }
  const byIndex = new Map<number, (typeof parsed)[number]>();
  parsed.forEach((p, idx) => byIndex.set(typeof p.i === "number" ? p.i : idx, p));
  return items.map((_, i) => {
    const p = byIndex.get(i);
    return {
      keep: Boolean(p?.keep),
      relevance: Math.max(0, Math.min(10, Number(p?.relevance ?? 0))),
      summary: (p?.summary ?? "").trim(),
      goodNews: Boolean(p?.goodNews),
    };
  });
}

// ---------------------------------------------------------------- the Daily script

export async function writeDaily(
  config: SiteConfig,
  candidates: Array<Item & { categoryName: string }>,
  goodNews: Item | undefined,
  minutes: number,
  maxStories: number,
  today: string,
  weekdayName: string,
): Promise<{ script: string; teaser: string; words: number; usedIds: string[] }> {
  const targetWords = Math.round(minutes * 150);
  const system = `You write "The Daily Yam": a short spoken morning piece for one listener, read aloud by a text-to-speech voice. British English, warm, clear, unhurried — a Radio 4 presenter talking to a friend over coffee, not a bulletin. No headings, no bullet points, no URLs, no emojis, no stage directions. Numbers and dates as words where natural. Name the programme or outlet when it helps ("on Open Book this week…"). Reply with JSON only.`;
  const list = candidates.map((it, i) => describeItem(it, i, it.categoryName)).join("\n");
  const user = `${readerBlock(config)}

Today is ${weekdayName} ${today}. From the candidates below, choose at most ${maxStories} that make the best ${minutes}-minute morning piece for Yamuna — variety across books, art, screens and the wider world; favour things she can go and listen to or watch, and anything beautifully written. Weave them into one flowing piece of about ${targetWords} words: open with "Good morning, Yamuna" and the day, move between items with light transitions, give each enough detail to be worth her time, and${goodNews ? ` end with "And one good thing before you go" — ${goodNews.title} (${goodNews.source}): ${goodNews.summary} — then` : ""} a single warm sign-off sentence. Use only the facts given; never invent.

CANDIDATES:
${list}

Return JSON: {"used": [indices in order of appearance], "teaser": "one line under 90 characters that makes her want to press play", "script": "the full piece"}.`;
  const text = await ask(SMART_MODEL, system, user, 4000);
  const parsed = extractJson<{ used?: number[]; teaser?: string; script?: string }>(text);
  const script = (parsed.script ?? "").trim();
  if (!script) throw new Error("Empty daily script");
  const usedIds = (parsed.used ?? []).map((i) => candidates[i]?.id).filter((x): x is string => Boolean(x));
  if (goodNews) usedIds.push(goodNews.id);
  return { script, teaser: (parsed.teaser ?? "").trim(), words: countWords(script), usedIds };
}

// ---------------------------------------------------------------- the Weekly picks

export async function pickWeekly(
  config: SiteConfig,
  cat: CategoryConfig,
  listenable: Item[],
  readable: Item[],
  wantListen: number,
  wantRead: number,
  today: string,
): Promise<{ picks: WeeklyPick[]; summaries: Record<string, string> }> {
  const system = `You are the editor of "The Weekly Yam", a private weekly selection for one reader who would rather listen than read and has little time. British English, warm, precise, no emojis. Reply with JSON only.`;
  const L = listenable.map((it, i) => describeItem(it, i)).join("\n") || "(none)";
  const R = readable.map((it, i) => describeItem(it, i)).join("\n") || "(none)";
  const user = `${readerBlock(config)}

${categoryBlock(cat)}

Today is ${today}. From this week's candidates, choose at most ${wantListen} things to LISTEN to (or watch) and at most ${wantRead} things to READ for the "${cat.name}" section. Prefer variety (not two episodes of the same programme), substance over novelty, and anything that fits her tastes exactly. Fewer is fine if the week is thin; never pad.

For each pick write "why": one warm sentence (max 25 words) telling Yamuna why this one, and "summary": two or three sentences (max 60 words) in English saying what it is, using only the facts given.

LISTEN candidates:
${L}

READ candidates:
${R}

Return JSON: {"listen": [{"i": index, "why": "...", "summary": "..."}], "read": [{"i": index, "why": "...", "summary": "..."}]}.`;
  const text = await ask(SMART_MODEL, system, user, 2500);
  const parsed = extractJson<{ listen?: Array<{ i: number; why: string; summary: string }>; read?: Array<{ i: number; why: string; summary: string }> }>(text);
  const picks: WeeklyPick[] = [];
  const summaries: Record<string, string> = {};
  for (const p of (parsed.listen ?? []).slice(0, wantListen)) {
    const it = listenable[p.i];
    if (!it) continue;
    picks.push({ itemId: it.id, mode: "listen", why: (p.why ?? "").trim() });
    if (p.summary) summaries[it.id] = p.summary.trim();
  }
  for (const p of (parsed.read ?? []).slice(0, wantRead)) {
    const it = readable[p.i];
    if (!it) continue;
    picks.push({ itemId: it.id, mode: "read", why: (p.why ?? "").trim() });
    if (p.summary) summaries[it.id] = p.summary.trim();
  }
  return { picks, summaries };
}

export async function writeWeeklyGreeting(config: SiteConfig, picks: Array<Item & { categoryName: string }>, weekOf: string): Promise<string> {
  const system = `You write one warm, short opening line for a weekly cultural selection. British English, no emojis, no exclamation marks, no markdown or asterisks, at most two sentences and 40 words. Reply with the sentence only.`;
  const user = `${readerBlock(config)}

Week of ${weekOf}. This week's picks:
${picks.map((p) => `- [${p.categoryName}] ${p.title} (${p.type})`).join("\n")}

Write the opening line. Start with "Good morning, Yamuna." and hint at one or two things worth her weekend, without listing them all.`;
  return (await ask(FAST_MODEL, system, user, 800)).replace(/\*+/g, "").replace(/^["“]|["”]$/g, "").trim();
}

// ---------------------------------------------------------------- Words

export interface RawWord {
  term: string;
  note?: string;
  example?: string;
}

export async function buildWordEntries(
  config: SiteConfig,
  words: Array<RawWord & { review: boolean }>,
  weekContext: string[],
): Promise<WordEntry[]> {
  const system = `You prepare a weekly vocabulary session for one learner, Yamuna, an English teacher living in France. Each entry is a word or expression she noted herself, in English or French. You write short, accurate definitions and natural example sentences. Reply with JSON only.`;
  const list = words.map((w, i) => `#${i} ${w.term}${w.note ? ` — her note: ${w.note}` : ""}${w.example ? ` — her example: ${w.example}` : ""}`).join("\n");
  const user = `This week's stories, for flavour (use them in examples when it fits naturally):
${weekContext.slice(0, 12).map((t) => `- ${t}`).join("\n") || "(none)"}

ENTRIES:
${list}

For each entry return: "i", "lang" ("en" or "fr" — the language of the term itself), "term" (the term, spelling tidied, articles kept as she wrote them), "definition" (one clear sentence; in English for English terms, in English for French terms too, giving the French nuance), "example" (one natural sentence in the term's language using it, 10–20 words; if she gave an example, polish hers), "pronunciation" (short plain hint, e.g. "ser-en-DIP-i-ty"; for French give a plain hint too).
Return a JSON array with exactly ${words.length} objects.`;
  const text = await ask(SMART_MODEL, system, user, 5000);
  const parsed = extractJson<Array<{ i?: number; lang?: string; term?: string; definition?: string; example?: string; pronunciation?: string }>>(text);
  const byIndex = new Map<number, (typeof parsed)[number]>();
  parsed.forEach((p, idx) => byIndex.set(typeof p.i === "number" ? p.i : idx, p));
  return words.map((w, i) => {
    const p = byIndex.get(i);
    return {
      term: (p?.term ?? w.term).trim(),
      lang: p?.lang === "fr" ? "fr" : "en",
      note: w.note,
      definition: (p?.definition ?? "").trim(),
      example: (p?.example ?? w.example ?? "").trim(),
      pronunciation: (p?.pronunciation ?? "").trim() || undefined,
      review: w.review,
    };
  });
}

// ---------------------------------------------------------------- Bookshelf

export async function writeRefresher(config: SiteConfig, book: Book, minutes = 4.5): Promise<Omit<BookRefresher, "slug" | "generatedAt" | "audio">> {
  const targetWords = Math.round(minutes * 150);
  const system = `You help one reader remember books she read long ago. You are accurate and candid: when you are not sure of a detail, say so rather than invent. British English, warm, literate, no emojis. Short quotations only (a phrase, never a passage). Reply with JSON only.`;
  const user = `${readerBlock(config)}

BOOK: "${book.title}" by ${book.author}${book.note ? ` (her note: ${book.note})` : ""}.

Write a refresher for someone who read it years ago and wants it back in her head before a conversation or a class:
- "inANutshell": two sentences.
- "story": the plot in 120–180 words, spoilers included (she has read it).
- "people": the main characters and what drives each, 80–120 words.
- "themes": the ideas and the style — narrator, voice, structure, memorable images — 100–150 words; mention links to painting or other books if real.
- "whyItMatters": 60–90 words on why it endures and what to notice on a reread.
- "questions": three questions to think or talk about.
- "script": a spoken version of all this for a text-to-speech voice, about ${targetWords} words, flowing prose, opening "Let's remember ${book.title}" and ending with one of the questions. No headings, no lists.
- "confidence": "high" if this is a well-known book you know thoroughly, "medium" if you know it but details may be fuzzy, "low" if you barely know it — then keep everything brief and say so in the script.
Return JSON with exactly those keys.`;
  const text = await ask(SMART_MODEL, system, user, 6000);
  const p = extractJson<Partial<BookRefresher>>(text);
  return {
    inANutshell: (p.inANutshell ?? "").trim(),
    story: (p.story ?? "").trim(),
    people: (p.people ?? "").trim(),
    themes: (p.themes ?? "").trim(),
    whyItMatters: (p.whyItMatters ?? "").trim(),
    questions: Array.isArray(p.questions) ? p.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 3) : [],
    script: (p.script ?? "").trim(),
    confidence: p.confidence === "low" || p.confidence === "medium" ? p.confidence : "high",
  };
}

export async function pickBookOfTheWeek(config: SiteConfig, books: Book[], recent: string[], weekTitles: string[]): Promise<{ slug: string; why: string } | undefined> {
  if (!books.length) return undefined;
  const pool = books.filter((b) => !recent.includes(b.slug));
  const candidates = (pool.length ? pool : books).slice(0, 60);
  const system = `You choose one book from a reader's shelf to revisit this week. Reply with JSON only.`;
  const user = `${readerBlock(config)}

Her shelf (slug — title, author):
${candidates.map((b) => `- ${b.slug} — ${b.title}, ${b.author}`).join("\n")}

This week's cultural stories, in case one chimes with a book:
${weekTitles.slice(0, 15).map((t) => `- ${t}`).join("\n") || "(none)"}

Choose one book worth remembering this week — ideally one that echoes the week's stories, the season, or simply deserves a return. Return JSON: {"slug": "...", "why": "one warm sentence, max 25 words"}.`;
  const text = await ask(FAST_MODEL, system, user, 600);
  const p = extractJson<{ slug?: string; why?: string }>(text);
  const chosen = candidates.find((b) => b.slug === p.slug) ?? candidates[0];
  return { slug: chosen.slug, why: (p.why ?? "").trim() };
}
