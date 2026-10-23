import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory, loadConfig } from "@/lib/config";
import { loadItems, loadLatestEdition } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { IconBack, IconSearch } from "@/components/Icons";
import { NavPills } from "@/components/NavPills";
import { RecapPlayer } from "@/components/RecapPlayer";
import { SectionList } from "@/components/SectionList";
import { BotWidget } from "@/components/BotWidget";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return loadConfig().categories.map((c) => ({ category: c.id }));
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
  if (!cat) notFound();

  const edition = loadLatestEdition();
  const now = edition ? new Date(edition.generatedAt) : new Date();
  const items = loadItems().filter((i) => i.category === cat.id);
  const recap = edition?.recaps?.[cat.id];
  const vars = { ["--cat-ink" as string]: cat.color.ink, ["--cat-tint" as string]: cat.color.tint };

  return (
    <>
      <div className="band" style={vars}>
        <div className="wrap">
          <div className="band__top">
            <Link href="/" className="band__back" aria-label="Back to today's mix">
              <IconBack />
              <span className="brand__mark" aria-hidden="true" style={{ fontSize: 24 }}>DY</span>
            </Link>
            <span className="meta">{shortDate(now)}</span>
            <Link href="/search" className="icon-btn" aria-label="Search" style={{ borderColor: "transparent" }}>
              <IconSearch />
            </Link>
          </div>
          <h1 className="band__title">{cat.name}</h1>
          {cat.tagline ? <p className="band__tagline">{cat.tagline}</p> : null}
          {recap ? (
            <div style={{ marginTop: 14 }}>
              <RecapPlayer
                short={recap.short}
                long={recap.long}
                wordsShort={recap.wordsShort}
                wordsLong={recap.wordsLong}
                stories={recap.itemIds.length}
                categoryName={cat.name}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="wrap">
        <NavPills categories={config.categories} active={cat.id} />
        <SectionList items={items} color={cat.color} categoryName={cat.name} nowIso={now.toISOString()} />
        <BotWidget category={cat.id} categoryName={cat.name} itemIds={items.slice(0, 30).map((i) => i.id)} />
      </div>
    </>
  );
}
