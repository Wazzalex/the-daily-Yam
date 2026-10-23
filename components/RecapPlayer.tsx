"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconHeadphones, IconPause, IconPlay } from "./Icons";

interface Props {
  short: string;
  long: string;
  wordsShort: number;
  wordsLong: number;
  stories: number;
  categoryName: string;
}

/** Splits a script into speakable chunks (browsers choke on very long utterances). */
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

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  const prefer = ["Daniel", "Kate", "Serena", "Oliver", "Google UK English Female", "Google UK English Male", "Martha", "Arthur"];
  for (const name of prefer) {
    const v = en.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return en.find((v) => /en[-_]GB/i.test(v.lang)) ?? en[0] ?? voices[0];
}

export function RecapPlayer({ short, long, wordsShort, wordsLong, stories, categoryName }: Props) {
  const [supported, setSupported] = useState(true);
  const [longMode, setLongMode] = useState(false);
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [progress, setProgress] = useState(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const chunksRef = useRef<string[]>([]);
  const doneRef = useRef(0);

  const text = longMode ? long : short;
  const minutes = Math.max(1, Math.round((longMode ? wordsLong : wordsShort) / 150));

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setStatus("idle");
    setProgress(0);
    doneRef.current = 0;
  }, []);

  const play = useCallback(() => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = chunk(text);
    chunksRef.current = chunks;
    doneRef.current = 0;
    setProgress(0);
    const voice = pickVoice(voicesRef.current.length ? voicesRef.current : synth.getVoices());
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-GB";
      u.rate = 1;
      u.pitch = 1;
      u.onend = () => {
        doneRef.current = i + 1;
        setProgress(doneRef.current / chunks.length);
        if (i === chunks.length - 1) setStatus("idle");
      };
      u.onerror = () => {
        if (i === chunks.length - 1) setStatus("idle");
      };
      synth.speak(u);
    });
    setStatus("playing");
  }, [text]);

  const toggle = () => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (status === "playing") {
      synth.pause();
      setStatus("paused");
    } else if (status === "paused") {
      synth.resume();
      setStatus("playing");
    } else play();
  };

  const switchLength = () => {
    stop();
    setLongMode((v) => !v);
  };

  const label = useMemo(() => {
    if (status === "playing") return `Playing the ${categoryName} recap…`;
    if (status === "paused") return "Paused — tap to resume";
    return "Listen to today's recap";
  }, [status, categoryName]);

  if (!text) return null;

  return (
    <div>
      <button type="button" className="recap" onClick={toggle} aria-pressed={status === "playing"} disabled={!supported}>
        <span className="recap__play" aria-hidden="true">
          {status === "playing" ? <IconPause /> : <IconPlay />}
        </span>
        <span className="recap__body">
          <span className="recap__title">{label}</span>
          <span className="recap__sub">
            {minutes} min · {stories} {stories === 1 ? "story" : "stories"} · read aloud by your phone
          </span>
          <span className="recap__bar" aria-hidden="true">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </span>
        <span aria-hidden="true" style={{ color: "var(--ink-2)" }}>
          <IconHeadphones />
        </span>
      </button>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" className="recap__toggle" aria-pressed={longMode} onClick={switchLength}>
          Long version · {Math.max(1, Math.round(wordsLong / 150))} min
        </button>
        {status !== "idle" ? (
          <button type="button" className="recap__toggle" onClick={stop}>
            Stop
          </button>
        ) : null}
      </div>
      {!supported ? <p className="recap__note">Your browser can't read aloud; the text is still in the stories below.</p> : null}
    </div>
  );
}
