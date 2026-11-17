// Reads Yamuna's vocabulary from her Google Doc (shared "anyone with the link can view")
// through the plain-text export, and parses the lines below the marker.

import type { RawWord } from "./claude";
import { fetchText } from "./http";

export function docExportUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/export?format=txt`;
}

/** Splits "term — meaning — example" on em/en dashes, " - ", or tabs; only the term is required. */
export function parseWordLine(line: string): RawWord | null {
  const clean = line.replace(/^[\s•\-–—*\d.)]+/, "").trim();
  if (!clean || clean.length < 2) return null;
  const parts = clean
    .split(/\s+[—–]\s+|\s+-\s+|\t|\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const term = parts[0];
  if (!term || term.length > 80) return null;
  return { term, note: parts[1] || undefined, example: parts[2] || undefined };
}

export function parseWordsDocument(text: string, marker: string): RawWord[] {
  const idx = text.toLowerCase().indexOf(marker.toLowerCase());
  const body = idx >= 0 ? text.slice(idx + marker.length) : text;
  const seen = new Set<string>();
  const out: RawWord[] = [];
  for (const raw of body.split(/\r?\n/)) {
    if (/^[\s—–\-_=]*$/.test(raw)) continue;
    const w = parseWordLine(raw);
    if (!w) continue;
    const key = normaliseTerm(w.term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
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

export async function fetchWordsDocument(docId: string): Promise<string> {
  const r = await fetchText(docExportUrl(docId), { accept: "text/plain", timeoutMs: 20000 });
  if (r.status >= 400) throw new Error(`Google Doc export answered HTTP ${r.status} — is the document shared as "anyone with the link can view"?`);
  if (/<html/i.test(r.text.slice(0, 200))) throw new Error("Google Doc export returned a sign-in page — share it as \"anyone with the link can view\".");
  return r.text.replace(/^﻿/, "");
}
