"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordEntry } from "@/lib/types";
import { IconPause, IconPlay } from "./Icons";

interface Props {
  date: string;
  entries: WordEntry[];
  provider: "openai" | "browser";
}

type Mode = "learn" | "repeat" | "quiz";

/** Plays a short clip: the pre-made MP3 when present, else /api/audio?kind=word, else the phone's voice. */
function useClipPlayer(date: string, provider: Props["provider"]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlayingKey(null);
  }, []);

  const play = useCallback(
    (key: string, text: string, lang: "en" | "fr", url: string | undefined, index: number, kind: "term" | "example"): Promise<void> =>
      new Promise((resolve) => {
        stop();
        setPlayingKey(key);
        const done = () => {
          setPlayingKey((k) => (k === key ? null : k));
          resolve();
        };
        if (provider === "browser" || typeof Audio === "undefined") {
          if (!("speechSynthesis" in window)) return done();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = lang === "fr" ? "fr-FR" : "en-GB";
          u.rate = 0.9;
          u.onend = done;
          u.onerror = done;
          window.speechSynthesis.speak(u);
          return;
        }
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        a.onended = done;
        a.onerror = () => {
          // Fall back to the phone's voice for this clip.
          if ("speechSynthesis" in window) {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = lang === "fr" ? "fr-FR" : "en-GB";
            u.onend = done;
            u.onerror = done;
            window.speechSynthesis.speak(u);
          } else done();
        };
        a.src = url ?? `/api/audio?kind=word&date=${date}&i=${index}&part=${kind}`;
        void a.play().catch(() => done());
      }),
    [date, provider, stop],
  );

  useEffect(() => () => stop(), [stop]);
  return { play, stop, playingKey };
}

export function WordsClient({ date, entries, provider }: Props) {
  const [mode, setMode] = useState<Mode>("learn");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizShown, setQuizShown] = useState(false);
  const [quizOrder, setQuizOrder] = useState<number[]>(() => entries.map((_, i) => i));
  const [repeatRunning, setRepeatRunning] = useState(false);
  const [repeatAt, setRepeatAt] = useState<number | null>(null);
  const cancelRef = useRef(false);
  const { play, stop, playingKey } = useClipPlayer(date, provider);

  const shuffle = () => {
    const arr = entries.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setQuizOrder(arr);
    setQuizIndex(0);
    setQuizShown(false);
  };

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Listen & repeat: term, pause (you say it), term again, example, pause. */
  const runRepeat = async (from = 0) => {
    cancelRef.current = false;
    setRepeatRunning(true);
    for (let i = from; i < entries.length; i++) {
      if (cancelRef.current) break;
      const e = entries[i];
      setRepeatAt(i);
      await play(`t${i}`, e.term, e.lang, e.audio?.term, i, "term");
      if (cancelRef.current) break;
      await wait(2200);
      if (cancelRef.current) break;
      await play(`t${i}b`, e.term, e.lang, e.audio?.term, i, "term");
      if (cancelRef.current) break;
      await wait(600);
      if (e.example) {
        await play(`x${i}`, e.example, e.lang, e.audio?.example, i, "example");
        if (cancelRef.current) break;
        await wait(2600);
      }
    }
    setRepeatRunning(false);
    setRepeatAt(null);
  };
  const stopRepeat = () => {
    cancelRef.current = true;
    stop();
    setRepeatRunning(false);
    setRepeatAt(null);
  };

  const current = entries[quizOrder[quizIndex] ?? 0];
  const vars = { ["--cat-ink" as string]: "#8C5E00", ["--cat-tint" as string]: "#FBF0D2" } as React.CSSProperties;

  const modes = useMemo(
    () =>
      [
        { id: "learn" as Mode, label: "Learn" },
        { id: "repeat" as Mode, label: "Listen & repeat" },
        { id: "quiz" as Mode, label: "Quiz" },
      ] as const,
    [],
  );

  return (
    <div style={vars}>
      <div className="filters" role="tablist" aria-label="Mode">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`pill pill--small ${mode === m.id ? "pill--ink" : "pill--plain"}`}
            onClick={() => {
              stopRepeat();
              setMode(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "learn" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="recap__toggle"
              onClick={() => setRevealed(revealed.size === entries.length ? new Set() : new Set(entries.map((_, i) => i)))}
            >
              {revealed.size === entries.length ? "Hide all meanings" : "Show all meanings"}
            </button>
          </div>
          {entries.map((e, i) => {
            const hidden = !revealed.has(i);
            return (
              <article key={i} className={`word reveal${hidden ? " word--hidden" : ""}`} style={{ ["--i" as string]: i % 12 } as React.CSSProperties}>
                <div className="word__top">
                  <button
                    type="button"
                    className="word__btn"
                    aria-label={`Hear ${e.term}`}
                    aria-pressed={playingKey === `t${i}`}
                    onClick={() => (playingKey === `t${i}` ? stop() : void play(`t${i}`, e.term, e.lang, e.audio?.term, i, "term"))}
                  >
                    {playingKey === `t${i}` ? <IconPause /> : <IconPlay />}
                  </button>
                  <span className="word__term" lang={e.lang === "fr" ? "fr" : "en"}>
                    {e.term}
                  </span>
                  {e.review ? <span className="chip" style={{ background: "var(--paper)" }}>Review</span> : null}
                  {e.lang === "fr" ? <span className="flag">FR</span> : null}
                  {e.theme ? <span className="word__theme">{e.theme}</span> : null}
                </div>
                {e.pronunciation || e.usage ? (
                  <span className="word__pron">
                    {e.pronunciation}
                    {e.pronunciation && e.usage ? " · " : ""}
                    {e.usage}
                  </span>
                ) : null}
                <p className="word__def">{e.definition}</p>
                {e.example ? (
                  <p className="word__ex">
                    <button
                      type="button"
                      className="word__btn"
                      style={{ width: 28, height: 28, borderRadius: 8, verticalAlign: "middle", marginRight: 8 }}
                      aria-label="Hear the example"
                      aria-pressed={playingKey === `x${i}`}
                      onClick={() => (playingKey === `x${i}` ? stop() : void play(`x${i}`, e.example, e.lang, e.audio?.example, i, "example"))}
                    >
                      {playingKey === `x${i}` ? <IconPause size={12} /> : <IconPlay size={12} />}
                    </button>
                    {e.example}
                  </p>
                ) : null}
                {e.note && e.note.replace(/\W+/g, " ").trim().toLowerCase() !== e.example.replace(/\W+/g, " ").trim().toLowerCase() ? (
                  <p className="word__note">In your notebook: {e.note}</p>
                ) : null}
                {hidden ? (
                  <button type="button" className="word__reveal" onClick={() => setRevealed(new Set([...revealed, i]))}>
                    Reveal
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {mode === "repeat" ? (
        <div className="quiz" style={{ marginTop: 14 }}>
          <span className="quiz__count">Listen & repeat · {entries.length} entries</span>
          <p className="quiz__prompt" style={{ margin: 0 }}>
            {repeatAt !== null ? (
              <span>
                <span className="quiz__answer" lang={entries[repeatAt].lang}>
                  {entries[repeatAt].term}
                </span>
                <br />
                <span style={{ fontSize: 14, color: "var(--ink-2)" }}>Say it after the voice; the example follows.</span>
              </span>
            ) : (
              "Each word is read twice with a pause for you to repeat, then its example sentence. About a minute per five words."
            )}
          </p>
          <div className="quiz__row">
            {repeatRunning ? (
              <button type="button" className="pill pill--ink" onClick={stopRepeat}>
                Stop
              </button>
            ) : (
              <>
                <button type="button" className="pill pill--ink" onClick={() => void runRepeat(0)}>
                  Start from the top
                </button>
                {repeatAt !== null ? null : (
                  <button type="button" className="pill pill--plain" onClick={() => void runRepeat(Math.floor(entries.length / 2))}>
                    Second half
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {mode === "quiz" && current ? (
        <div className="quiz" style={{ marginTop: 14 }}>
          <span className="quiz__count">
            {quizIndex + 1} / {entries.length}
          </span>
          <p className="quiz__prompt" style={{ margin: 0 }}>
            {quizShown ? (
              <span className="quiz__answer" lang={current.lang}>
                {current.term}
              </span>
            ) : (
              <span>{current.definition || "(no definition)"}</span>
            )}
          </p>
          {quizShown && current.example ? <p style={{ margin: 0, fontStyle: "italic", color: "var(--ink-3)" }}>{current.example}</p> : null}
          <div className="quiz__row">
            {!quizShown ? (
              <>
                <button
                  type="button"
                  className="pill pill--plain"
                  onClick={() => void play(`q${quizIndex}`, current.term, current.lang, current.audio?.term, quizOrder[quizIndex], "term")}
                >
                  Hear it
                </button>
                <button type="button" className="pill pill--ink" onClick={() => setQuizShown(true)}>
                  Reveal
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="pill pill--plain"
                  onClick={() => void play(`q${quizIndex}`, current.term, current.lang, current.audio?.term, quizOrder[quizIndex], "term")}
                >
                  Hear it again
                </button>
                <button
                  type="button"
                  className="pill pill--ink"
                  onClick={() => {
                    stop();
                    setQuizShown(false);
                    setQuizIndex((i) => (i + 1) % entries.length);
                  }}
                >
                  Next
                </button>
              </>
            )}
            <button type="button" className="pill pill--plain" onClick={shuffle}>
              Shuffle
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
