import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook, loadBooks, loadConfig, visibleCategories } from "@/lib/config";
import { loadLatestWeekly, loadRefresher } from "@/lib/data";
import { NavPills } from "@/components/NavPills";
import { BookRefresherClient } from "@/components/BookRefresherClient";
import { BotWidget } from "@/components/BotWidget";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return loadBooks().map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = getBook(slug);
  return { title: b ? `${b.title} — ${b.author}` : "Book" };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = getBook(slug);
  if (!book) notFound();
  const config = loadConfig();
  const refresher = loadRefresher(slug);
  const weekly = loadLatestWeekly();
  const why = weekly?.bookOfTheWeek?.slug === slug ? weekly.bookOfTheWeek.why : undefined;
  const vars = { ["--cat-ink" as string]: "#A0463A", ["--cat-tint" as string]: "#F9E7E2" };

  return (
    <>
      <div className="band" style={vars}>
        <div className="wrap">
          <Link href="/bookshelf" className="band__back">
            ← Bookshelf
          </Link>
          <h1 className="band__title" style={{ fontSize: 32 }}>
            {book.title}
          </h1>
          <p className="band__tagline">
            {book.author}
            {book.note ? ` · ${book.note}` : ""}
          </p>
          {why ? <p className="row__why" style={{ marginTop: 8 }}>{why}</p> : null}
        </div>
      </div>
      <div className="wrap">
        <NavPills categories={visibleCategories()} active="bookshelf" />
        <BookRefresherClient slug={slug} title={book.title} initial={refresher} provider={config.audio.provider} defaultVoice={config.audio.voice} />
        <BotWidget category={undefined} categoryName={book.title} itemIds={[]} bookSlug={slug} />
      </div>
    </>
  );
}
