// Reads Yamuna's vocabulary notebook — the Google Doc "Fiche vocabulaire - the daily Yam".
//
// Her format is a notebook, not a table: themed sections ("FOOD & beverages", "The weather",
// "Literary vocab' to use"…), one entry per line, usually a full sentence with the key word in
// BOLD, sometimes the pronunciation in IPA (/ˈdɒləp/), a French gloss in brackets or after "=",
// a CAPITAL label in front ("EASY The test was a walk in the park"), and "Words in a jumble"
// paragraphs where short items are separated by semicolons. Bold matters, so the robot reads
// the HTML export (shared "anyone with the link can view") rather than the plain text one.
//
// When the live export is not reachable (document not shared by link, Google down), the robot
// falls back to the last snapshot committed in data/words/source.json. That snapshot can also be
// produced from a Google Docs API JSON (documents.get) with scripts/words-snapshot.ts.

import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { fetchText } from "./http";

/** One paragraph of the document, with its bold fragments in order. */
export interface DocParagraph {
  text: string;
  bold: string[];
}

export interface DocSnapshot {
  docId: string;
  fetchedAt: string;
  title?: string;
  paragraphs: DocParagraph[];
}

/** One vocabulary entry as found in the notebook. */
export interface NotebookEntry {
  /** Stable key for the registry (spaced repetition). */
  key: string;
  /** The section the line sits in ("FOOD & beverages"). */
  theme?: string;
  /** Her capital label in front of the line, if any ("EASY", "AU BORD DE"). */
  label?: string;
  /** The highlighted word(s) — what she put in bold. */
  bold: string[];
  /** Her IPA, when she wrote one. */
  pronunciation?: string;
  /** The line as she wrote it, bullet and label removed. */
  line: string;
}

export function docExportUrl(docId: string, format: "html" | "txt" = "html"): string {
  return `https://docs.google.com/document/d/${docId}/export?format=${format}`;
}

// ---------------------------------------------------------------- HTML export → paragraphs

/** Google's HTML export marks bold with CSS classes (font-weight:700) rather than <b>. */
export function paragraphsFromHtml(html: string): DocParagraph[] {
  const $ = cheerio.load(html);
  const boldClasses = new Set<string>();
  $("style").each((_, s) => {
    const css = $(s).text();
    for (const m of css.matchAll(/\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g)) {
      if (/font-weight\s*:\s*(700|bold)/.test(m[2])) boldClasses.add(m[1]);
    }
  });
  const isBold = (el: Element): boolean => {
    const cls = ($(el).attr("class") ?? "").split(/\s+/);
    if (cls.some((c) => boldClasses.has(c))) return true;
    const style = $(el).attr("style") ?? "";
    if (/font-weight\s*:\s*(700|bold)/.test(style)) return true;
    const tag = el.tagName?.toLowerCase();
    return tag === "b" || tag === "strong";
  };
  const out: DocParagraph[] = [];
  $("p, li, h1, h2, h3, h4, h5, h6").each((_, p) => {
    const runs = new BoldRuns();
    const walk = (node: AnyNode, inBold: boolean) => {
      if (node.type === "text") {
        runs.push((node as { data?: string }).data ?? "", inBold);
        return;
      }
      if (node.type !== "tag") return;
      const el = node as Element;
      const b = inBold || isBold(el);
      for (const child of el.children) walk(child, b);
    };
    for (const child of (p as Element).children) walk(child, false);
    out.push(runs.paragraph());
  });
  return out;
}

/**
 * Collects the text of a paragraph run by run. Consecutive bold runs are one highlighted phrase
 * (Google splits a phrase when a comment or a link sits inside it); a non-bold run in between —
 * even a space — separates two phrases.
 */
class BoldRuns {
  private text = "";
  private bold: string[] = [];
  private current = "";
  push(t: string, isBold: boolean) {
    this.text += t;
    if (isBold) this.current += t;
    else if (t.trim() || t.length) this.flush();
  }
  private flush() {
    const frag = this.current
      .replace(/\s+/g, " ")
      .replace(/^[\s,;:.!?…"“”'‘’()]+|[\s,;:.!?…"“”'‘’()]+$/g, "")
      .trim();
    if (frag.length > 1) this.bold.push(frag);
    this.current = "";
  }
  paragraph(): DocParagraph {
    this.flush();
    return { text: this.text.replace(/ /g, " ").replace(/\u000b/g, "\n").replace(/\n$/, "").trimEnd(), bold: this.bold };
  }
}

// ---------------------------------------------------------------- Docs API JSON → paragraphs

/** Converts the JSON of Google Docs API `documents.get` (any tab) into paragraphs. */
export function paragraphsFromDocsJson(doc: unknown): { title?: string; paragraphs: DocParagraph[] } {
  const root = (doc as { content?: unknown }).content && !(doc as { tabs?: unknown }).tabs ? (doc as { content: Record<string, unknown> }).content : (doc as Record<string, unknown>);
  const title = typeof root.title === "string" ? root.title : undefined;
  const bodies: Array<Record<string, unknown>> = [];
  const tabs = root.tabs as Array<{ documentTab?: { body?: Record<string, unknown> } }> | undefined;
  if (Array.isArray(tabs)) for (const t of tabs) if (t.documentTab?.body) bodies.push(t.documentTab.body);
  if (root.body) bodies.push(root.body as Record<string, unknown>);
  const paragraphs: DocParagraph[] = [];
  type Run = { textRun?: { content?: string; textStyle?: { bold?: boolean } } };
  type Para = { elements?: Run[] };
  const pushPara = (p: Para) => {
    const runs = new BoldRuns();
    for (const el of p.elements ?? []) {
      const r = el.textRun;
      if (!r?.content) continue;
      runs.push(r.content, Boolean(r.textStyle?.bold));
    }
    paragraphs.push(runs.paragraph());
  };
  const walk = (content: unknown[]) => {
    for (const el of content as Array<Record<string, unknown>>) {
      if (el.paragraph) pushPara(el.paragraph as Para);
      else if (el.table) {
        const rows = (el.table as { tableRows?: Array<{ tableCells?: Array<{ content?: unknown[] }> }> }).tableRows ?? [];
        for (const row of rows) for (const cell of row.tableCells ?? []) walk(cell.content ?? []);
      }
    }
  };
  for (const body of bodies) walk((body.content as unknown[]) ?? []);
  return { title, paragraphs };
}

// ---------------------------------------------------------------- paragraphs → entries

const BULLET = /^[\s·•§◦▪○●\-–—*]+/;
const JUMBLE = /^(words\s+in\s+a\s+jumble|in\s+a\s+jumble)\b[\s:–—-]*/i;
const IPA_CHARS = /[ˈˌːəɪɒæʊʃʒθðŋɛɑʌɜɔɡ]|:/;
const LABEL_STOP = new Set(["OK", "I", "A", "AN", "THE", "US", "OTT", "TBH", "TBD", "TBC"]);

/** Is this paragraph a section heading rather than an entry? */
function isHeading(text: string): boolean {
  const t = text.trim();
  if (!t || BULLET.test(t)) return false;
  if (t.length > 60) return false;
  if (/[.!?…]$/.test(t)) return false;
  if (/^[a-z]/.test(t) && !/^and\b/i.test(t)) return false;
  // Headings don't carry glosses or examples.
  if (/[=]/.test(t) || /\(.*\)/.test(t) && t.split(" ").length > 6) return false;
  return true;
}

/** "EASY The test was a walk in the park" → { label: "EASY", rest: "The test was…" }. */
export function splitLabel(line: string): { label?: string; rest: string } {
  const m = line.match(/^((?:[A-ZÀ-Ü][A-ZÀ-Ü'’]*[,/&+]?\s+)+)(?=[A-Za-zÀ-ÿ“"‘'…])/);
  if (!m) return { rest: line };
  let label = m[1].replace(/[,/&+\s]+$/, "").trim();
  let consumed = m[1].length;
  // "SLEEP I sleep like a log": the pronoun belongs to the sentence, not the label.
  const pronoun = label.match(/\s+I$/);
  if (pronoun) {
    label = label.slice(0, -pronoun[0].length);
    consumed = line.indexOf(label) + label.length;
  }
  const words = label.split(/[\s/&+,]+/).filter(Boolean);
  if (!words.some((w) => w.replace(/[^A-ZÀ-Ü]/g, "").length >= 2)) return { rest: line };
  if (words.length === 1 && LABEL_STOP.has(words[0])) return { rest: line };
  if (label.length >= line.trim().length - 2) return { rest: line };
  return { label, rest: line.slice(consumed).replace(/^[,\s]+/, "").trim() };
}

export function extractIpa(line: string): { pronunciation?: string; rest: string } {
  const found: string[] = [];
  const rest = line
    .replace(/\/([^/\s]{2,24})\//g, (whole, inner: string) => {
      if (IPA_CHARS.test(inner)) {
        found.push(`/${inner}/`);
        return " ";
      }
      return whole;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;.)])/g, "$1")
    .trim();
  return { pronunciation: found[0], rest };
}

export function normaliseTerm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(to|a|an|the|le|la|les|un|une|des)\s+/, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keyFor(bold: string[], line: string): string {
  const base = bold[0] && bold[0].length >= 3 ? bold[0] : line;
  return normaliseTerm(base).slice(0, 80);
}

/** Splits a "words in a jumble" paragraph into its items (semicolons, or commas outside brackets). */
function splitJumble(text: string): string[] {
  const sep = text.includes(";") ? ";" : ",";
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length >= 3);
}

/**
 * Splits a line carrying several highlighted expressions into pieces, first on semicolons, then
 * on " / ", as long as at least two pieces keep a highlight. Pieces without a highlight stay with
 * the line (they are glosses or examples of a neighbour).
 */
function explode(line: string, bold: string[]): Array<{ piece: string; bold: string[] }> {
  const attempt = (pieces: string[]) => {
    const withBold = pieces.map((piece) => ({ piece, bold: bold.filter((b) => piece.includes(b)) }));
    return withBold.filter((w) => w.bold.length).length >= 2 ? withBold : null;
  };
  let split: Array<{ piece: string; bold: string[] }> | null = null;
  if (line.includes(";")) split = attempt(splitJumble(line));
  if (!split && /\s\/\s/.test(line)) split = attempt(line.split(/\s+\/\s+/).map((s) => s.trim()).filter((s) => s.length >= 3));
  if (!split) return [{ piece: line, bold }];
  return split.flatMap((w) => (w.bold.length >= 2 && /;|\s\/\s/.test(w.piece) ? explode(w.piece, w.bold) : [w]));
}

export function parseNotebook(paragraphs: DocParagraph[]): NotebookEntry[] {
  const out: NotebookEntry[] = [];
  const seen = new Set<string>();
  let theme: string | undefined;
  let pendingThemeFragment: string | undefined; // "Leisure" + " and hobbies" on two lines

  const add = (entry: Omit<NotebookEntry, "key">) => {
    const line = entry.line.replace(/\s+/g, " ").trim();
    if (line.length < 3) return;
    if (/^[\s—–\-_=·•§.…]*$/.test(line)) return;
    const key = keyFor(entry.bold, line);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, ...entry, line });
  };

  for (const p of paragraphs) {
    const raw = p.text.replace(/\t/g, " ").trim();
    if (!raw) continue;

    // Dialogue lines ("- Hold your horses, I need a cuppa"): only the bold idioms are entries.
    if (/^[-–]\s/.test(raw) && theme && /dialogue|idiom/i.test(theme)) {
      const text = raw.replace(/^[-–]\s+/, "").replace(/[“”"]/g, "").trim();
      for (const b of p.bold) if (b.length >= 3) add({ theme, bold: [b], line: text });
      continue;
    }

    if (JUMBLE.test(raw)) {
      const body = raw.replace(JUMBLE, "").trim();
      if (!body) {
        // A heading on its own ("In a jumble", "WORDS IN A JUMBLE"): a section of loose words.
        theme = "Words in a jumble";
        pendingThemeFragment = undefined;
        continue;
      }
      // An inline list inside a section ("Words in a jumble: 1lb = half a kilo; self-raising flour…")
      // keeps the section it sits in: they are still food words.
      const t = theme ?? "Words in a jumble";
      for (const item of splitJumble(body)) {
        const { pronunciation, rest } = extractIpa(item);
        add({ theme: t, bold: p.bold.filter((b) => item.includes(b)), pronunciation, line: rest });
      }
      continue;
    }

    if (isHeading(raw)) {
      if (pendingThemeFragment && /^and\b/i.test(raw)) {
        theme = `${pendingThemeFragment} ${raw}`.replace(/\s+/g, " ");
        pendingThemeFragment = undefined;
        continue;
      }
      if (/^Enriching my vocab/i.test(raw)) continue;
      theme = raw.replace(/\s+/g, " ").replace(/^[+\s]+/, "").trim();
      pendingThemeFragment = theme;
      continue;
    }
    pendingThemeFragment = undefined;

    const unbulleted = raw.replace(BULLET, "").trim();
    if (!unbulleted) continue;
    const { label, rest } = splitLabel(unbulleted);
    const { pronunciation, rest: line } = extractIpa(rest);

    // Several highlighted expressions separated by semicolons or " / " → one entry each.
    if (p.bold.length >= 2 && /;|\s\/\s/.test(line)) {
      const pieces = explode(line, p.bold);
      if (pieces.length >= 2) {
        for (const w of pieces) add({ theme, label, bold: w.bold, pronunciation: undefined, line: w.piece });
        continue;
      }
    }
    // A list of short expressions without highlights ("All is well; Everything is tickety-boo; …").
    if (!p.bold.length && line.includes(";")) {
      const pieces = splitJumble(line);
      if (pieces.length >= 2) {
        for (const piece of pieces) add({ theme, label, bold: [], pronunciation: undefined, line: piece });
        continue;
      }
    }
    add({ theme, label, bold: p.bold, pronunciation, line });
  }
  return out;
}

// ---------------------------------------------------------------- picking

/** Deterministic shuffle (the same week always gives the same picks, so a rerun is harmless). */
export function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Picks this week's new entries: shuffled (seeded by the date) so every session mixes the sections
 * of the notebook, with a cap per section so a 350-line "jumble" doesn't crowd out the others.
 */
export function pickNewEntries(fresh: NotebookEntry[], n: number, maxPerTheme: number, seed: string): NotebookEntry[] {
  const chosen: NotebookEntry[] = [];
  const perTheme = new Map<string, number>();
  const shuffled = seededOrder(fresh, seed);
  for (const e of shuffled) {
    if (chosen.length >= n) break;
    const t = e.theme ?? "";
    if ((perTheme.get(t) ?? 0) >= maxPerTheme) continue;
    perTheme.set(t, (perTheme.get(t) ?? 0) + 1);
    chosen.push(e);
  }
  if (chosen.length < n) for (const e of shuffled) if (chosen.length < n && !chosen.includes(e)) chosen.push(e);
  // Back in notebook order, which reads better.
  const index = new Map(fresh.map((e, i) => [e.key, i]));
  return chosen.sort((a, b) => (index.get(a.key) ?? 0) - (index.get(b.key) ?? 0));
}

// ---------------------------------------------------------------- fetching

export async function fetchNotebookHtml(docId: string): Promise<DocParagraph[]> {
  const r = await fetchText(docExportUrl(docId, "html"), { accept: "text/html", timeoutMs: 25000 });
  if (r.status >= 400) throw new Error(`Google Doc export answered HTTP ${r.status} — is the document shared as "anyone with the link can view"?`);
  if (/accounts\.google\.com|ServiceLogin/i.test(r.text.slice(0, 3000)) || !/<body/i.test(r.text)) {
    throw new Error('Google Doc export returned a sign-in page — share it as "anyone with the link can view".');
  }
  return paragraphsFromHtml(r.text);
}

/** Live export first; otherwise the committed snapshot. Says which one it used. */
export async function loadNotebook(
  docId: string,
  snapshot: DocSnapshot | null,
): Promise<{ paragraphs: DocParagraph[]; source: "live" | "snapshot"; warning?: string }> {
  try {
    const paragraphs = await fetchNotebookHtml(docId);
    if (paragraphs.length >= 5) return { paragraphs, source: "live" };
    throw new Error(`export looked empty (${paragraphs.length} paragraphs)`);
  } catch (err) {
    if (snapshot && snapshot.paragraphs.length) {
      return { paragraphs: snapshot.paragraphs, source: "snapshot", warning: `${(err as Error).message} — using the snapshot of ${snapshot.fetchedAt.slice(0, 10)}` };
    }
    throw err;
  }
}
