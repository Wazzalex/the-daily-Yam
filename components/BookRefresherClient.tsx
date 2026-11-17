"use client";

import { useEffect, useState } from "react";
import type { BookRefresher } from "@/lib/types";
import { AudioPlayer } from "./AudioPlayer";

interface Props {
  slug: string;
  title: string;
  initial: BookRefresher | null;
  provider: "openai" | "browser";
  defaultVoice: string;
}

/** Shows the refresher; if none is on file yet, asks the server to write one (about 30 seconds) and caches it. */
export function BookRefresherClient({ slug, title, initial, provider, defaultVoice }: Props) {
  const [data, setData] = useState<BookRefresher | null>(initial);
  const [status, setStatus] = useState<"idle" | "loading" | "error">(initial ? "idle" : "loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/book?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        const json = (await res.json()) as BookRefresher;
        if (!cancelled) {
          setData(json);
          setStatus("idle");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, data]);

  if (status === "loading") {
    return (
      <div className="empty" style={{ marginTop: 16 }}>
        <strong>Remembering {title}…</strong>
        Writing your refresher — about half a minute the first time. It's kept afterwards.
      </div>
    );
  }
  if (status === "error" || !data) {
    return (
      <div className="empty" style={{ marginTop: 16 }}>
        <strong>Couldn't write the refresher</strong>
        {error ?? "Try again in a moment."}
      </div>
    );
  }

  const confidenceLabel = data.confidence === "high" ? "I know this one well" : data.confidence === "medium" ? "I know it, details may be fuzzy" : "I only half know this one — treat it as a sketch";

  return (
    <div>
      <div style={{ marginTop: 14 }}>
        <AudioPlayer
          title="Remember this book"
          mediaTitle={`Remember ${title}`}
          subtitle={`${Math.max(1, Math.round(data.script.split(/\s+/).length / 150))} min · ${confidenceLabel}`}
          text={data.script}
          preparedUrl={data.audio?.url}
          preparedVoice={data.audio?.voice}
          onDemandUrl={`/api/audio?kind=book&slug=${encodeURIComponent(slug)}`}
          provider={provider}
          defaultVoice={defaultVoice}
          ink="#A0463A"
          tint="#F9E7E2"
        />
      </div>

      <section className="book-part">
        <h2>In a nutshell</h2>
        <p>{data.inANutshell}</p>
      </section>
      <section className="book-part">
        <h2>The story</h2>
        <p>{data.story}</p>
      </section>
      <section className="book-part">
        <h2>The people</h2>
        <p>{data.people}</p>
      </section>
      <section className="book-part">
        <h2>Themes and style</h2>
        <p>{data.themes}</p>
      </section>
      <section className="book-part">
        <h2>Why it endures</h2>
        <p>{data.whyItMatters}</p>
      </section>
      {data.questions.length ? (
        <section className="book-part">
          <h2>To think about</h2>
          <ol>
            {data.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </section>
      ) : null}
      <p style={{ marginTop: 18 }}>
        <span className="confidence">{confidenceLabel}</span>
      </p>
    </div>
  );
}
