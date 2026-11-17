import { loadLatestDaily, loadLatestWeekly } from "@/lib/data";

// Which edition is this deployment serving? Used by the robot to know when Vercel has caught up.
export const dynamic = "force-static";

export function GET() {
  const d = loadLatestDaily();
  const w = loadLatestWeekly();
  return Response.json({ daily: d?.date ?? null, dailyAudio: Boolean(d?.audio), weekly: w?.date ?? null, words: w?.wordsSession ?? null }, { headers: { "cache-control": "no-store" } });
}
