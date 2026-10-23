"use client";

import { useEffect, useRef, useState } from "react";
import { IconClose, IconSend } from "./Icons";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  /** Category id the reader is looking at (undefined on the home page / search). */
  category?: string;
  categoryName?: string;
  /** Ids of the items currently on screen, so the Yam knows what "this" means. */
  itemIds: string[];
}

const SUGGESTIONS: Record<string, string[]> = {
  default: ["What's the one thing to read this morning?", "Sum up today in three lines", "Anything new about Twelfth Night?"],
  literature: ["Which of these would you read first, and why?", "Any new poetry worth my time?", "What's the Booker news?"],
  art: ["What's on near Grenoble this weekend?", "Tell me more about the first exhibition", "Any show linking painting and literature?"],
  bfi: ["Anything useful for my seconde class?", "News about The Handmaid's Tale?", "Explain the latest BFI change simply"],
  around: ["What's happening near Les Adrets this weekend?", "Any markets or brocantes coming up?", "Concerts in Grenoble soon?"],
  good: ["Give me the best good news in one line", "Anything uplifting about schools or books?", "Why is this good news?"],
  france: ["What happened in France yesterday, simply?", "Anything about schools or teachers?", "Is there a strike or transport issue today?"],
  watch: ["Any good new thriller series?", "A dance documentary for tonight?", "What's new on Arte this week?"],
};

/** Turns bare URLs and **bold** into links/strong; everything else stays text. */
function renderInline(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)\]]+|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      let host = p;
      try {
        host = new URL(p).hostname.replace(/^www\./, "");
      } catch {
        /* keep raw */
      }
      return (
        <a key={i} href={p} target="_blank" rel="noopener noreferrer">
          {host}
        </a>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return <span key={i}>{p}</span>;
  });
}

export function BotWidget({ category, categoryName, itemIds }: Props) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = log.slice(-6);
    setLog((l) => [...l, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, category, itemIds: itemIds.slice(0, 30), history }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `The Yam is unavailable (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setLog((l) => {
          const copy = [...l];
          copy[copy.length - 1] = { role: "assistant", content: snapshot };
          return copy;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setLog((l) => {
        const copy = [...l];
        copy[copy.length - 1] = { role: "assistant", content: `Sorry — ${message}` };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  const suggestions = SUGGESTIONS[category ?? "default"] ?? SUGGESTIONS.default;

  return (
    <>
      {open ? (
        <section className="bot-panel" aria-label="Ask the Yam">
          <header className="bot-panel__head">
            <div className="bot-panel__title">
              <strong>Ask the Yam</strong>
              <span>{categoryName ? `About ${categoryName} and anything else` : "About today's stories and anything else"}</span>
            </div>
            <button type="button" className="icon-btn icon-btn--ghost" aria-label="Close" onClick={() => setOpen(false)}>
              <IconClose />
            </button>
          </header>
          <div className="bot-panel__log" ref={logRef}>
            {log.length === 0 ? (
              <>
                <p className="msg--hint">Good morning. Ask me about anything on this page, or something you'd like me to look up.</p>
                <div className="bot-suggest">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              log.map((m, i) => (
                <div key={i} className={`msg ${m.role === "user" ? "msg--user" : "msg--bot"}`}>
                  {m.content ? renderInline(m.content) : busy && i === log.length - 1 ? "…" : ""}
                </div>
              ))
            )}
          </div>
          <form
            className="bot-panel__form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this page…"
              aria-label="Your question"
              autoComplete="off"
              maxLength={600}
            />
            <button type="submit" className="bot-panel__send" aria-label="Send" disabled={busy || !input.trim()}>
              <IconSend />
            </button>
          </form>
        </section>
      ) : null}
      <button type="button" className="bot-fab" aria-label={open ? "Close Ask the Yam" : "Ask the Yam"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">{open ? "×" : "DY"}</span>
      </button>
    </>
  );
}
