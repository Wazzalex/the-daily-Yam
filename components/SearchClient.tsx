"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Fuse from "fuse.js";
import type { CategoryColor, Item } from "@/lib/types";
import { IconSearch } from "./Icons";
import { ItemRow } from "./ItemRow";
import { EmptyState } from "./EmptyState";

type Indexed = Item & { categoryName: string };

export function SearchClient({ colors }: { colors: Record<string, CategoryColor> }) {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [index, setIndex] = useState<Indexed[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch("/search-index.json")
      .then((r) => r.json())
      .then((data: Indexed[]) => setIndex(data))
      .catch(() => setIndex([]));
  }, []);

  // Keep the query in the URL so a search can be shared or reopened.
  useEffect(() => {
    const t = setTimeout(() => {
      const url = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
      router.replace(url, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, router]);

  const fuse = useMemo(
    () =>
      index
        ? new Fuse(index, {
            keys: [
              { name: "title", weight: 0.55 },
              { name: "summary", weight: 0.3 },
              { name: "source", weight: 0.1 },
              { name: "categoryName", weight: 0.05 },
            ],
            threshold: 0.38,
            ignoreLocation: true,
            minMatchCharLength: 2,
          })
        : null,
    [index],
  );

  const results = useMemo(() => {
    if (!fuse || !index) return [];
    const query = q.trim();
    if (query.length < 2) return [];
    return fuse.search(query, { limit: 60 }).map((r) => r.item);
  }, [fuse, index, q]);

  const fallback = { ink: "#5b4a7a", tint: "#ede8f4" };

  return (
    <>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
        }}
      >
        <IconSearch />
        <label htmlFor="q" className="sr-only">
          Search everything
        </label>
        <input id="q" ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything you love…" autoComplete="off" />
      </form>

      <div className="sec-head">
        <h2>{q.trim().length < 2 ? "Search" : results.length ? `${results.length} ${results.length === 1 ? "result" : "results"}` : "No results"}</h2>
        <span className="sec-head__meta">{index ? `${index.length} stories on file` : "Loading…"}</span>
      </div>

      {q.trim().length < 2 ? (
        <p style={{ color: "var(--ink-2)", fontSize: 15 }}>Type an author, a place, a title, a theme — anything that has appeared in the paper in the last two weeks.</p>
      ) : results.length === 0 && index ? (
        <EmptyState title="Nothing matches yet" text="Try a shorter word, a surname, or ask the Yam in the corner — it can look beyond the paper." />
      ) : (
        <div className="rows">
          {results.map((item, i) => (
            <ItemRow key={item.id} item={item} color={colors[item.category] ?? fallback} categoryName={item.categoryName} showCategory index={i % 12} embedVideo={false} />
          ))}
        </div>
      )}
    </>
  );
}
