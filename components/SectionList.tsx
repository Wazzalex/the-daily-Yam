"use client";

import { useMemo, useState } from "react";
import type { CategoryColor, Item } from "@/lib/types";
import { GROUP_ORDER, dayGroup, parisDateKey } from "@/lib/format";
import { ItemRow } from "./ItemRow";
import { EmptyState } from "./EmptyState";

interface Props {
  items: Item[];
  color: CategoryColor;
  categoryName: string;
  /** ISO time of the build, so server and client agree on "today". */
  nowIso: string;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "article", label: "Articles" },
  { id: "podcast", label: "Podcasts" },
  { id: "video", label: "Videos" },
  { id: "event", label: "Events" },
];

export function SectionList({ items, color, categoryName, nowIso }: Props) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [filter, setFilter] = useState("all");
  const present = useMemo(() => new Set(items.map((i) => i.type)), [items]);
  const visibleFilters = FILTERS.filter((f) => f.id === "all" || present.has(f.id as Item["type"]));

  const groups = useMemo(() => {
    const today = parisDateKey(now);
    const list = items.filter((i) => filter === "all" || i.type === filter);
    const map = new Map<string, Item[]>();
    for (const i of list) {
      const g = i.type === "event" && i.eventDate && (i.eventEnd ?? i.eventDate) >= today ? "Coming up" : dayGroup(i.publishedAt, now);
      map.set(g, [...(map.get(g) ?? []), i]);
    }
    const coming = map.get("Coming up");
    if (coming) coming.sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  }, [items, filter, now]);

  let index = 0;
  return (
    <>
      {visibleFilters.length > 2 ? (
        <div className="filters" role="tablist" aria-label="Filter by type">
          {visibleFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`pill pill--small ${filter === f.id ? "pill--ink" : "pill--plain"}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState title="Nothing here yet" text={`Nothing new in ${categoryName} for the moment. The robot looks again every morning at six.`} />
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <span className="group-label">{g.label}</span>
            <div className="rows">
              {g.items.map((item) => (
                <ItemRow key={item.id} item={item} color={color} index={index++ % 12} now={now} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
