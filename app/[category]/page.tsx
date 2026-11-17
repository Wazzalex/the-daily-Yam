import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory, loadConfig, visibleCategories } from "@/lib/config";
import { loadPool, loadWeeklies, loadWeeklyItems } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { IconBack, IconSearch } from "@/components/Icons";
import { NavPills } from "@/components/NavPills";
import { PickRow } from "@/components/PickRow";
import { ItemRow } from "@/components/ItemRow";
import { EmptyState } from "@/components/EmptyState";
import { BotWidget } from "@/components/BotWidget";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return visibleCategories().map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const cat = getCategory(category);
  return { title: cat?.name ?? "Section", description: cat?.tagline };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const config = loadConfig();
  const cat = getCategory(category);
  if (!cat || cat.show === false) notFound();

  const weeklies = loadWeeklies(config.rules.keep_weeks);
  const [current, ...previous] = weeklies;
  const items = loadWeeklyItems(current ?? null);
  for (const w of previous) for (const [id, it] of loadWeeklyItems(w)) if (!items.has(id)) items.set(id, it);
  const pool = loadPool().filter((i) => i.category === cat.id);
  const vars = { ["--cat-ink" as string]: cat.color.ink, ["--cat-tint" as string]: cat.color.tint };
  const currentPicks = (current?.picks[cat.id] ?? []).filter((p) => items.has(p.itemId));
  const pickedIds = new Set<string>();
  for (const w of weeklies) for (const p of w.picks[cat.id] ?? []) pickedIds.add(p.itemId);
  const more = pool.filter((i) => !pickedIds.has(i.id)).sort((a, b) => b.relevance - a.relevance).slice(0, 8);

  return (
    <>
      <div className="band" style={vars}>
        <div className="wrap">
          <div className="band__top">
            <Link href="/" className="band__back" aria-label="Back to this week">
              <IconBack />
              <span className="brand__mark" aria-hidden="true" style={{ fontSize: 24 }}>DY</span>
            </Link>
            <span className="meta">{current ? `Week of ${shortDate(current.weekOf)}` : ""}</span>
            <Link href="/search" className="icon-btn" aria-label="Search" style={{ borderColor: "transparent" }}>
              <IconSearch />
            </Link>
          </div>
          <h1 className="band__title">{cat.name}</h1>
          {cat.tagline ? <p className="band__tagline">{cat.tagline}</p> : null}
        </div>
      </div>

      <div className="wrap">
        <NavPills categories={visibleCategories()} active={cat.id} />

        <span className="group-label">This week</span>
        {currentPicks.length ? (
          <div className="rows">
            {currentPicks.map((p, i) => (
              <PickRow key={p.itemId} item={items.get(p.itemId)!} pick={p} color={cat.color} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing picked yet" text={`The weekly selection for ${cat.name} arrives on Saturday morning.`} />
        )}

        {previous.map((w) => {
          const picks = (w.picks[cat.id] ?? []).filter((p) => items.has(p.itemId));
          if (!picks.length) return null;
          return (
            <section key={w.date} aria-label={`Week of ${shortDate(w.weekOf)}`}>
              <span className="group-label">Week of {shortDate(w.weekOf)}</span>
              <div className="rows">
                {picks.map((p, i) => (
                  <PickRow key={p.itemId} item={items.get(p.itemId)!} pick={p} color={cat.color} index={i} />
                ))}
              </div>
            </section>
          );
        })}

        {more.length ? (
          <section aria-label="More from the week">
            <span className="group-label">Also noticed this fortnight</span>
            <div className="rows">
              {more.map((i, idx) => (
                <ItemRow key={i.id} item={i} color={cat.color} index={idx} />
              ))}
            </div>
          </section>
        ) : null}

        <BotWidget category={cat.id} categoryName={cat.name} itemIds={[...currentPicks.map((p) => p.itemId), ...more.map((i) => i.id)].slice(0, 30)} />
      </div>
    </>
  );
}
