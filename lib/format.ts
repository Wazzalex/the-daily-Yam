// Date helpers. Everything is shown in Europe/Paris, in British English.

export const TZ = "Europe/Paris";

/** YYYY-MM-DD for a date in Paris time. */
export function parisDateKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "Friday 23 October 2026" */
export function longDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "Sun 26 Oct" */
export function shortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "2h ago", "yesterday", "3 days ago", else short date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((now.getTime() - then) / 60000);
  if (!Number.isFinite(diffMin)) return "";
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const todayKey = parisDateKey(now);
  const thenKey = parisDateKey(new Date(iso));
  const yesterday = parisDateKey(new Date(now.getTime() - 86400000));
  if (thenKey === todayKey) return "today";
  if (thenKey === yesterday) return "yesterday";
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} days ago`;
  return shortDate(iso);
}

/** Group label for a category page: "Today", "Yesterday", "Earlier this week", "Older". */
export function dayGroup(iso: string, now: Date = new Date()): string {
  const key = parisDateKey(new Date(iso));
  const today = parisDateKey(now);
  const yesterday = parisDateKey(new Date(now.getTime() - 86400000));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const diffD = Math.round((now.getTime() - new Date(iso).getTime()) / 86400000);
  if (diffD < 7) return "Earlier this week";
  return "Older";
}

export const GROUP_ORDER = ["Coming up", "Today", "Yesterday", "Earlier this week", "Older"];

/** "08:14" for today, "yesterday", else "Mon 20 Oct". Events: "Sun 26 Oct", or "Sun 26 Oct – Sat 28 Feb". */
export function whenLabel(
  item: { publishedAt: string; eventDate?: string; eventEnd?: string; type: string },
  now: Date = new Date(),
): string {
  if (item.type === "event" && item.eventDate) {
    const start = shortDate(item.eventDate);
    if (item.eventEnd && item.eventEnd !== item.eventDate) return `${start} – ${shortDate(item.eventEnd)}`;
    return start;
  }
  const d = new Date(item.publishedAt);
  const key = parisDateKey(d);
  if (key === parisDateKey(now)) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  }
  if (key === parisDateKey(new Date(now.getTime() - 86400000))) return "yesterday";
  return shortDate(d);
}

export function typeLabel(t: string): string {
  switch (t) {
    case "video":
      return "Video";
    case "podcast":
      return "Podcast";
    case "event":
      return "Event";
    default:
      return "Article";
  }
}
