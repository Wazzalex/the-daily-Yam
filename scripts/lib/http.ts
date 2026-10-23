// Small HTTP helper used by the robot: timeout, polite user-agent, text body.

// A browser-like user agent: several sites (Place Gre'net, Gramophone, YouTube handle pages)
// answer 403/404 to anything that looks like a bot.
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export interface FetchedText {
  status: number;
  text: string;
  finalUrl: string;
  contentType: string;
}

export async function fetchText(
  url: string,
  opts: { timeoutMs?: number; accept?: string; headers?: Record<string, string> } = {},
): Promise<FetchedText> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: opts.accept ?? "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
        "accept-language": "en-GB,en;q=0.9,fr-FR;q=0.8,fr;q=0.7",
        ...(opts.headers ?? {}),
      },
    });
    const text = await res.text();
    return {
      status: res.status,
      text,
      finalUrl: res.url || url,
      contentType: res.headers.get("content-type") ?? "",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const r = await fetchText(url, { timeoutMs, accept: "application/json" });
  if (r.status >= 400) throw new Error(`HTTP ${r.status} for ${url}`);
  return JSON.parse(r.text) as T;
}

/** Runs async tasks with a concurrency cap (no dependency needed). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
