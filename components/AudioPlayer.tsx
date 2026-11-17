"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconHeadphones, IconPause, IconPlay } from "./Icons";

interface Props {
  /** Shown while idle, e.g. "Listen to today's Yam". */
  title: string;
  /** Lock-screen title. */
  mediaTitle: string;
  /** Small line under the title while idle, e.g. "4 min · Tuesday 18 November". */
  subtitle: string;
  /** The spoken text — for the phone-voice fallback, the transcript and the length estimate. */
  text: string;
  /** Pre-generated MP3, when the robot made one. */
  preparedUrl?: string;
  /** URL that generates (or finds) the MP3 on demand; may include {voice}. */
  onDemandUrl: string;
  provider: "openai" | "browser";
  defaultVoice: string;
  preparedVoice?: string;
  /** Show a "Transcript" toggle. */
  transcript?: boolean;
  /** Accent colours, default Yam. */
  ink?: string;
  tint?: string;
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

/** One tap-to-play card: premium MP3 (pre-made or on demand), phone voice as a fallback, lock-screen controls. */
export function AudioPlayer(props: Props) {
  const { title, mediaTitle, subtitle, text, preparedUrl, onDemandUrl, provider, defaultVoice, preparedVoice, transcript, ink, tint } = props;
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "ended">("idle");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [usingBrowser, setUsingBrowser] = useState(provider === "browser");
  const [note, setNote] = useState<string | null>(null);
  const [voice, setVoice] = useState(defaultVoice);
  const [showText, setShowText] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const chosen = readChosenVoice();
    if (chosen) setVoice(chosen);
  }, []);

  const estMinutes = Math.max(1, Math.round(text.trim().split(/\s+/).length / 150));
  const sourceUrl = useMemo(() => {
    if (preparedUrl && voice === (preparedVoice ?? defaultVoice)) return preparedUrl;
    return onDemandUrl.includes("{voice}") ? onDemandUrl.replace("{voice}", encodeURIComponent(voice)) : `${onDemandUrl}${onDemandUrl.includes("?") ? "&" : "?"}voice=${encodeURIComponent(voice)}`;
  }, [preparedUrl, onDemandUrl, voice, defaultVoice, preparedVoice]);

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
        navigator.mediaSession.metadata = new MediaMetadata({ title: mediaTitle, artist: "The Daily Yam", artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }] });
        navigator.mediaSession.setActionHandler("play", () => a.play());
        navigator.mediaSession.setActionHandler("pause", () => a.pause());
        navigator.mediaSession.setActionHandler("seekbackward", () => {
          a.currentTime = Math.max(0, a.currentTime - 15);
        });
        navigator.mediaSession.setActionHandler("seekforward", () => {
          a.currentTime = Math.min(a.duration || a.currentTime + 30, a.currentTime + 30);
        });
      } catch {
        /* optional */
      }
    },
    [mediaTitle],
  );

  const speakWithBrowser = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      setNote("Your browser can't read aloud; the text is below.");
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = chunk(text);
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
    if (usingBrowser && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
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
    a.src = sourceUrl;
    setMediaSession(a);
    setStatus("loading");
    setCurrent(0);
    void a.play().catch(() => {
      setNote("Couldn't start playback — try tapping play again.");
      setStatus("idle");
    });
  };

  const seek = (e: React.MouseEvent<HTMLSpanElement>) => {
    const a = audioRef.current;
    if (!a || usingBrowser || !duration) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
  };

  useEffect(() => () => stop(), [stop]);

  const label = useMemo(() => {
    if (status === "loading") return preparedUrl ? "Starting…" : "Preparing… about twenty seconds the first time";
    if (status === "playing") return `Playing — ${mediaTitle}`;
    if (status === "paused") return "Paused — tap to resume";
    if (status === "ended") return "That's all — tap to listen again";
    return title;
  }, [status, preparedUrl, mediaTitle, title]);

  if (!text) return null;
  const shownDuration = duration || estMinutes * 60;
  const progress = shownDuration ? Math.min(1, current / shownDuration) : 0;
  const vars = { ["--cat-ink" as string]: ink ?? "#5b4a7a", ["--cat-tint" as string]: tint ?? "#ede8f4" };

  return (
    <div style={vars}>
      <button type="button" className="recap" onClick={toggle} aria-pressed={status === "playing"}>
        <span className="recap__play" aria-hidden="true">
          {status === "playing" || status === "loading" ? <IconPause /> : <IconPlay />}
        </span>
        <span className="recap__body">
          <span className="recap__title">{label}</span>
          <span className="recap__sub">{status === "idle" || status === "ended" ? `${subtitle}${usingBrowser ? " · your phone's voice" : ""}` : `${fmt(current)} / ${fmt(shownDuration)}`}</span>
          <span className="recap__bar" aria-hidden="true" onClick={seek} style={{ cursor: usingBrowser ? "default" : "pointer" }}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </span>
        <span aria-hidden="true" style={{ color: "var(--ink-2)" }}>
          <IconHeadphones />
        </span>
      </button>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        {status !== "idle" ? (
          <button type="button" className="recap__toggle" onClick={stop}>
            Stop
          </button>
        ) : null}
        {transcript ? (
          <button type="button" className="recap__toggle" aria-pressed={showText} onClick={() => setShowText((v) => !v)}>
            {showText ? "Hide transcript" : "Transcript"}
          </button>
        ) : null}
        {!usingBrowser ? (
          <a href="/voices" className="recap__toggle" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Voice: {voice}
          </a>
        ) : null}
      </div>
      {note ? <p className="recap__note">{note}</p> : null}
      {transcript && showText ? (
        <div className="transcript">
          {text.split(/\n{2,}|(?<=[.!?…])\s+(?=[A-Z“"])/).reduce<string[][]>(
            (acc, s) => {
              const last = acc[acc.length - 1];
              if (last.join(" ").length > 420) acc.push([s]);
              else last.push(s);
              return acc;
            },
            [[]],
          ).map((para, i) => (
            <p key={i}>{para.join(" ")}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
