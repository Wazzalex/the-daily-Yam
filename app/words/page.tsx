import type { Metadata } from "next";
import Link from "next/link";
import { loadConfig, visibleCategories } from "@/lib/config";
import { loadWordsSessions } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { AudioPlayer } from "@/components/AudioPlayer";
import { NavPills } from "@/components/NavPills";
import { WordsClient } from "@/components/WordsClient";
import { EmptyState } from "@/components/EmptyState";
import { drillScript } from "@/lib/tts";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Words" };

export default function WordsPage() {
  const config = loadConfig();
  const sessions = loadWordsSessions(6);
  const [session, ...older] = sessions;
  const docUrl = config.words.google_doc_id ? `https://docs.google.com/document/d/${config.words.google_doc_id}/edit` : undefined;
  const vars = { ["--cat-ink" as string]: "#8C5E00", ["--cat-tint" as string]: "#FBF0D2" };

  return (
    <>
      <div className="band" style={vars}>
        <div className="wrap">
          <div className="band__top">
            <Link href="/" className="band__back" aria-label="Back to this week">
              <span className="brand__mark" aria-hidden="true" style={{ fontSize: 24 }}>DY</span>
            </Link>
            <span className="meta">{session ? `Session of ${shortDate(session.date)}` : ""}</span>
            {docUrl ? (
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="pill pill--small pill--plain" style={{ minHeight: 36 }}>
                Open my notebook
              </a>
            ) : null}
          </div>
          <h1 className="band__title">Words</h1>
          <p className="band__tagline">Twenty from your notebook each week, mixed across its sections, to hear, repeat and test yourself on.</p>
          {session?.drill ? (
            <div style={{ marginTop: 14 }}>
              <AudioPlayer
                title="Play the whole drill"
                mediaTitle={`Words — ${shortDate(session.date)}`}
                subtitle={`${Math.max(1, Math.round(session.drill.seconds / 60))} min · ${session.entries.length} entries · for the car`}
                text={drillScript(session.entries)}
                preparedUrl={session.drill.url}
                preparedVoice={session.drill.voice}
                onDemandUrl={`/api/audio?kind=drill&date=${session.date}`}
                provider={config.audio.provider}
                defaultVoice={config.audio.voice}
                ink="#8C5E00"
                tint="#FBF0D2"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="wrap">
        <NavPills categories={visibleCategories()} active="words" />
        {!session ? (
          <EmptyState
            title="No session yet"
            text={docUrl ? "The first session is built from your notebook on Saturday morning." : "The vocabulary notebook isn't connected yet."}
          />
        ) : (
          <>
            <p style={{ margin: "14px 0 0", fontSize: 14, color: "var(--ink-2)" }}>
              {session.newEntries} new, {session.entries.length - session.newEntries} back for review · {session.docEntries} in your notebook
            </p>
            <WordsClient date={session.date} entries={session.entries} provider={config.audio.provider} />
          </>
        )}

        {older.length ? (
          <section aria-label="Previous sessions">
            <span className="group-label">Previous sessions</span>
            <div className="sections">
              {older.map((s) => (
                <Link key={s.date} href={`/words/${s.date}`} className="section-card reveal" style={vars}>
                  <span className="section-card__name">{shortDate(s.date)}</span>
                  <span className="section-card__count">{s.entries.length} entries</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
