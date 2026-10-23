import { createHash } from "node:crypto";

/** Strips HTML tags and entities, collapses whitespace. */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref$|source$|CMP$|ns_|at_)/i;

/** Canonical form of a URL for de-duplication. */
export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    u.hash = "";
    for (const key of Array.from(u.searchParams.keys())) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return input.trim();
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "PT18M", "1:02:33", "1833" → "18 min", "1 h 02", "31 min" */
export function humanDuration(raw: string | number | undefined): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  let seconds = 0;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) seconds = Number(s);
  else if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(":").map(Number);
    seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  } else if (/^PT/.test(s)) {
    const h = /(\d+)H/.exec(s)?.[1];
    const m = /(\d+)M/.exec(s)?.[1];
    const sec = /(\d+)S/.exec(s)?.[1];
    seconds = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(sec ?? 0);
  } else return undefined;
  if (seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  return `${Math.max(1, m)} min`;
}

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Extracts the first JSON array or object from a model reply. */
export function extractJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = Math.min(
    ...["[", "{"].map((c) => body.indexOf(c)).filter((i) => i >= 0),
  );
  if (!Number.isFinite(start)) throw new Error("No JSON found in model reply");
  const open = body[start];
  const close = open === "[" ? "]" : "}";
  const end = body.lastIndexOf(close);
  if (end <= start) throw new Error("Unterminated JSON in model reply");
  return JSON.parse(body.slice(start, end + 1)) as T;
}
