import type { Metadata } from "next";
import Link from "next/link";
import { loadBooks, visibleCategories } from "@/lib/config";
import { loadLatestWeekly, loadRefresher } from "@/lib/data";
import { NavPills } from "@/components/NavPills";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Bookshelf" };

export default function BookshelfPage() {
  const books = loadBooks();
  const weekly = loadLatestWeekly();
  const featured = weekly?.bookOfTheWeek?.slug;
  const vars = { ["--cat-ink" as string]: "#A0463A", ["--cat-tint" as string]: "#F9E7E2" };
  const sorted = [...books].sort((a, b) => (a.slug === featured ? -1 : b.slug === featured ? 1 : a.author.split(" ").pop()!.localeCompare(b.author.split(" ").pop()!)));

  return (
    <>
      <div className="band" style={vars}>
        <div className="wrap">
          <Link href="/" className="band__back" aria-label="Back to this week">
            <span className="brand__mark" aria-hidden="true" style={{ fontSize: 24 }}>DY</span>
          </Link>
          <h1 className="band__title">Bookshelf</h1>
          <p className="band__tagline">Books you read long ago, ready to come back to you in five minutes.</p>
        </div>
      </div>
      <div className="wrap">
        <NavPills categories={visibleCategories()} active="bookshelf" />
        {!books.length ? (
          <EmptyState title="The shelf is empty for now" text="Send Alex a photo of your shelves, or a list of titles: they'll appear here, each with a 'Remember this book' refresher you can read or listen to." />
        ) : (
          <>
            <p style={{ margin: "14px 0 10px", fontSize: 14, color: "var(--ink-2)" }}>
              {books.length} {books.length === 1 ? "book" : "books"} · tap one to remember it
            </p>
            <div className="shelf">
              {sorted.map((b, i) => {
                const ready = Boolean(loadRefresher(b.slug));
                return (
                  <Link key={b.slug} href={`/bookshelf/${b.slug}`} className="spine reveal" style={{ ...vars, ["--i" as string]: i % 12 }}>
                    {b.slug === featured ? <span className="spine__badge">Book of the week</span> : null}
                    <span className="spine__title">{b.title}</span>
                    <span className="spine__author">{b.author}</span>
                    {ready ? <span className="spine__badge" style={{ color: "var(--ink-2)" }}>Refresher ready</span> : null}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
