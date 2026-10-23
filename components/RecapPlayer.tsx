"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconHeadphones, IconPause, IconPlay } from "./Icons";

interface Props {
  /** "briefing" for the morning briefing, otherwise the category id. */
  kind: "briefing" | "section";
  category?: string;
  categoryName: string;
  /** Edition date, YYYY-MM-DD. */
  date: string;
  /** Scripts, used for the browser fallback and the length estimate. */
  short: string;
  long?: string;
  wordsShort: number;
  wordsLong?: number;
  stories: number;
  /** Pre-generated MP3 for the short version, when the robot made one. */
  preparedUrl?: string;
  /** "openai" = premium voice via /api/audio, "browser" = the phone's own voice. */
  provider: "openai" | "browser";
  defaultVoice: string;
}

const VOICE_KEY = "yam.voice";

export function readChosenVoice(): string | null {
  try {
    return window.localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---------- browser voice fallback (the phone's own synthesiser) ---------- */

function chunk(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+(?=[A-Z0-9“"'(])/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > max && cur) {
      out.push(cur.trim());
      cur = s;
    } else cur = (cur + " " + s).trim();
  }
  if (cur) out.push(cur);
  return out.filter(Boolean);
}

function pickBrowserVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  for (const name of ["Daniel", "Kate", "Serena", "Oliver", "Google UK English Female", "Google UK English Male"]) {
    const v = en.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return en.find((v) => /en[-_]GB/i.test(v.lang)) ?? en[0] ?? voices[0];
}

export function RecapPlayer(props: Props) {
  const { kind, category, categoryName, date, short, long, wordsShort, wordsLong, stories, preparedUrl, provider, defaultVoice } = props;
  const [longMode, setLongMode] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "ended">("idle");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [usingBrowser, setUsingBrowser] = useState(provider === "browser");
  const [note, setNote] = useState<string | null>(null);
  const [voice, setVoice] = useState(defaultVoice);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechChunks = useRef<string[]>([]);

  useEffect(() => {
    const chosen = readChosenVoice();
    if (chosen) setVoice(chosen);
  }, []);

  const text = longMode && long ? long : short;
  const words = longMode && wordsLong ? wordsLong : wordsShort;
  const estMinutes = Math.max(1, Math.round(words / 150));
  const hasLong = Boolean(long && wordsLong && long !== short);

  const sourceUrl = useMemo(() => {
    if (!longMode && preparedUrl && voice === defaultVoice) return preparedUrl;
    const p = new URLSearchParams({ kind, date, voice });
    if (kind === "section" && category) {
      p.set("category", category);
      p.set("version", longMode ? "long" : "short");
    }
    return `/api/audio?${p.toString()}`;
  }, [kind, category, date, longMode, preparedUrl, voice, defaultVoice]);

  // ----- premium voice via <audio>
  const ensureAudioElement = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio();
    a.preload = "none";
    a.addEventListener("loadedmetadata", () => setDuration(a.duration));
    a.addEventListener("durationchange", () => setDuration(a.duration));
    a.addEventListener("timeupdate", () => setCurrent(a.currentTime));
    a.addEventListener("playing", () => setStatus("playing"));
    a.addEventListener("waiting", () => setStatus("loading"));
    a.addEventListener("pause", () => setStatus((s) => (s === "ended" ? s : "paused")));
    a.addEventListener("ended", () => setStatus("ended"));
    a.addEventListener("error", () => {
      setNote("The premium voice isn't available right now — reading with your phone's voice instead.");
      setUsingBrowser(true);
      setStatus("idle");
    });
    audioRef.current = a;
    return a;
  }, []);

  const setMediaSession = useCallback(
    (a: HTMLAudioElement) => {
      if (!("mediaSession" in navigator)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: kind === "briefing" ? "Morning briefing" : `${categoryName} — today's recap`,
          artist: "The Daily Yam",
          album: date,
          artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
        });
        navigator.mediaSession.setActionHandler("play", () => a.play());
        navigator.mediaSession.setActionHandler("pause", () => a.pause());
        navigator.mediaSession.setActionHandler("seekbackward", () => {
          a.currentTime = Math.max(0, a.currentTime - 15);
        });
        navigator.mediaSession.setActionHandler("seekforward", () => {
          a.currentTime = Math.min(a.duration || a.currentTime + 30, a.currentTime + 30);
        });
      } catch {
        /* optional nicety */
      }
    },
    [kind, categoryName, date],
  );

  // ----- browser voice fallback
  const speakWithBrowser = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      setNote("Your browser can't read aloud; the stories are below.");
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = chunk(text);
    speechChunks.current = chunks;
    const v = pickBrowserVoice(synth.getVoices());
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (v) u.voice = v;
      u.lang = v?.lang ?? "en-GB";
      u.onend = () => {
        setCurrent(((i + 1) / chunks.length) * estMinutes * 60);
        if (i === chunks.length - 1) setStatus("ended");
      };
      synth.speak(u);
    });
    setDuration(estMinutes * 60);
    setStatus("playing");
  }, [text, estMinutes]);

  const stop = useCallback(() => {
    if (usingBrowser && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setStatus("idle");
    setCurrent(0);
  }, [usingBrowser]);

  const toggle = () => {
    setNote(null);
    if (usingBrowser) {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      if (status === "playing") {
        synth.pause();
        setStatus("paused");
      } else if (status === "paused") {
        synth.resume();
        setStatus("playing");
      } else speakWithBrowser();
      return;
    }
    const a = ensureAudioElement();
    if (status === "playing") {
      a.pause();
      return;
    }
    if (status === "paused" && a.src) {
      void a.play();
      return;
    }
    // Fresh start: set the source and play synchronously inside the tap (iOS insists).
    a.src = sourceUrl;
    setMediaSession(a);
    setStatus("loading");
    setCurrent(0);
    void a.play().catch(() => {
      setNote("Couldn't start playback — try tapping play again.");
      setStatus("idle");
    });
  };

  const switchLength = () => {
    stop();
    setLongMode((v) => !v);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || usingBrowser || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
  };

  useEffect(() => () => stop(), [stop]);

  const label = useMemo(() => {
    if (status === "loading") return usingBrowser ? "Starting…" : longMode ? "Preparing the long version… up to a minute the first time" : "Preparing your recap… about half a minute the first time";
    if (status === "playing") return kind === "briefing" ? "Playing the morning briefing" : `Playing the ${categoryName} recap`;
    if (status === "paused") return "Paused — tap to resume";
    if (status === "ended") return "That's all — tap to listen again";
    return kind === "briefing" ? "Listen to the morning briefing" : "Listen to today's recap";
  }, [status, usingBrowser, kind, categoryName]);

  if (!text) return null;
  const shownDuration = duration || estMinutes * 60;
  const progress = shownDuration ? Math.min(1, current / shownDuration) : 0;

  return (
    <div>
      <button type="button" className="recap" onClick={toggle} aria-pressed={status === "playing"}>
        <span className="recap__play" aria-hidden="true">
          {status === "playing" || status === "loading" ? <IconPause /> : <IconPlay />}
        </span>
        <span className="recap__body">
          <span className="recap__title">{label}</span>
          <span className="recap__sub">
            {status === "idle" || status === "ended"
              ? `${estMinutes} min · ${stories} ${stories === 1 ? "story" : "stories"}${usingBrowser ? " · your phone's voice" : ""}`
              : `${fmt(current)} / ${fmt(shownDuration)}`}
          </span>
          <span className="recap__bar" aria-hidden="true" onClick={seek} style={{ cursor: usingBrowser ? "default" : "pointer" }}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </span>
        <span aria-hidden="true" style={{ color: "var(--ink-2)" }}>
          <IconHeadphones />
        </span>
      </button>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        {hasLong ? (
          <button type="button" className="recap__toggle" aria-pressed={longMode} onClick={switchLength}>
            Long version · {Math.max(1, Math.round((wordsLong ?? 0) / 150))} min
          </button>
        ) : null}
        {status !== "idle" ? (
          <button type="button" className="recap__toggle" onClick={stop}>
            Stop
          </button>
        ) : null}
        {!usingBrowser ? (
          <a href="/voices" className="recap__toggle" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Voice: {voice}
          </a>
        ) : null}
      </div>
      {note ? <p className="recap__note">{note}</p> : null}
    </div>
  );
}
