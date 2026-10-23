"use client";

import { useEffect, useRef, useState } from "react";
import { IconPause, IconPlay } from "./Icons";

const VOICE_KEY = "yam.voice";

const BLURBS: Record<string, string> = {
  marin: "Clear and composed — the newsreader.",
  cedar: "Lower, warmer, a little slower.",
  fable: "Bright and expressive, the storyteller.",
  sage: "Soft and even, easy on early mornings.",
  nova: "Light and friendly.",
  shimmer: "Gentle, slightly breathy.",
  coral: "Warm and upbeat.",
  ash: "Calm and grounded.",
};

export function VoicePicker({ voices, defaultVoice }: { voices: string[]; defaultVoice: string }) {
  const [chosen, setChosen] = useState(defaultVoice);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VOICE_KEY);
      if (v && voices.includes(v)) setChosen(v);
    } catch {
      /* fine */
    }
    return () => audioRef.current?.pause();
  }, [voices]);

  const play = (voice: string) => {
    setError(null);
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "none";
      a.addEventListener("playing", () => setLoading(null));
      a.addEventListener("ended", () => setPlaying(null));
      a.addEventListener("error", () => {
        setError("Couldn't fetch this sample — check that the OpenAI key is set on Vercel.");
        setPlaying(null);
        setLoading(null);
      });
      audioRef.current = a;
    }
    const a = audioRef.current;
    if (playing === voice) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.pause();
    a.src = `/api/audio?kind=sample&voice=${encodeURIComponent(voice)}`;
    setLoading(voice);
    setPlaying(voice);
    void a.play().catch(() => {
      setPlaying(null);
      setLoading(null);
    });
  };

  const choose = (voice: string) => {
    setChosen(voice);
    try {
      window.localStorage.setItem(VOICE_KEY, voice);
    } catch {
      /* fine */
    }
  };

  return (
    <div className="rows">
      {voices.map((v, i) => (
        <div key={v} className="row reveal" style={{ ["--i" as string]: i, ["--cat-ink" as string]: "#5b4a7a", ["--cat-tint" as string]: "#ede8f4", alignItems: "center" }}>
          <button type="button" className="badge" onClick={() => play(v)} aria-label={playing === v ? `Pause ${v}` : `Play a sample of ${v}`} style={{ border: 0, cursor: "pointer" }}>
            {playing === v ? <IconPause /> : <IconPlay />}
          </button>
          <div className="row__body">
            <h3 className="row__title" style={{ textTransform: "capitalize" }}>
              {v}
              {v === chosen ? <span className="chip" style={{ marginLeft: 10, verticalAlign: "middle", background: "var(--yam-tint)" }}>Your voice</span> : null}
            </h3>
            <div className="row__meta">
              <span>{BLURBS[v] ?? "A British-accented voice."}</span>
              {loading === v ? <span>· preparing the sample…</span> : null}
            </div>
          </div>
          {v !== chosen ? (
            <button type="button" className="pill pill--small pill--plain" onClick={() => choose(v)} style={{ cursor: "pointer" }}>
              Use this voice
            </button>
          ) : null}
        </div>
      ))}
      {error ? <p className="recap__note">{error}</p> : null}
    </div>
  );
}
