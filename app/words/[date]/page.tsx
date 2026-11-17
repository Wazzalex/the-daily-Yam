import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadConfig, visibleCategories } from "@/lib/config";
import { loadWordsSessions } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { NavPills } from "@/components/NavPills";
import { WordsClient } from "@/components/WordsClient";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return loadWordsSessions(12).map((s) => ({ date: s.date }));
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  return { title: `Words — ${date}` };
}

export default async function WordsSessionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const session = loadWordsSessions(12).find((s) => s.date === date);
  if (!session) notFound();
  const config = loadConfig();
  const vars = { ["--cat-ink" as string]: "#8C5E00", ["--cat-tint" as string]: "#FBF0D2" };
  return (
    <>
      <div className="band" style={vars}>
        <div className="wrap">
          <Link href="/words" className="band__back">
            ← All sessions
          </Link>
          <h1 className="band__title">Words</h1>
          <p className="band__tagline">Session of {shortDate(session.date)} · {session.entries.length} entries</p>
        </div>
      </div>
      <div className="wrap">
        <NavPills categories={visibleCategories()} active="words" />
        <WordsClient date={session.date} entries={session.entries} provider={config.audio.provider} />
      </div>
    </>
  );
}
