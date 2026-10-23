// Removes recap audio older than keep_days from Blob storage (samples are kept).

import { del, list } from "@vercel/blob";

export async function cleanupOldAudio(keepDays: number, today: string): Promise<number> {
  const cutoff = new Date(today + "T00:00:00Z");
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "audio/", limit: 1000, cursor, token });
    for (const b of page.blobs) {
      const m = /^audio\/(\d{4}-\d{2}-\d{2})\//.exec(b.pathname);
      if (m && m[1] < cutoffKey) old.push(b.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (old.length) await del(old, { token });
  return old.length;
}
