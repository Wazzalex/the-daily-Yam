import Link from "next/link";
import { loadBooks, loadConfig, visibleCategories } from "@/lib/config";
import { loadLatestDaily, loadLatestWeekly, loadLatestWords, loadWeeklyItems } from "@/lib/data";
import { longDate, shortDate } from "@/lib/format";
import { AudioPlayer } from "@/components/AudioPlayer";
import { NavPills } from "@/components/NavPills";
import { PickRow } from "@/components/PickRow";
import { EmptyState } from "@/components/EmptyState";
import { BotWidget } from "@/components/BotWidget";
import { StaleNotice } from "@/components/StaleNotice";

export const dynamic = "force-static";

export default function HomePage() {
  const config = loadConfig();
  const daily = loadLatestDaily();
  const weekly = loadLatestWeekly();
  const words = loadLatestWords();
  const items = loadWeeklyItems(weekly);
  const cats = visibleCategories();
  const catById = new Map(config.categories.map((c) => [c.id, c]));
  const books = loadBooks();
  const book = weekly?.bookOfTheWeek ? books.find((b) => b.slug === weekly.bookOfTheWeek!.slug) : undefined;
  const dailyDate = daily ? new Date(daily.date + "T06:00:00") : new Date();
  const onScreen: string[] = [];
  for (const picks of Object.values(weekly?.picks ?? {})) for (const p of picks) onScreen.push(p.itemId);

  return (
    <div className="wrap">
      <div className="dateline">
        <span>{longDate(daily?.generatedAt ?? new Date())}</span>
        <span>{weekly ? `Week of ${shortDate(weekly.weekOf)}` : ""}</span>
      </div>

      {daily ? <StaleNotice editionDate={daily.date} /> : null}

      <section className="hero reveal" aria-label="Welcome">
        <p className="hero__line">{config.site.tagline}</p>
        <p className="hero__greeting">{daily?.teaser ? `Today in four minutes: ${daily.teaser}` : `Good morning, ${config.reader.name}. Your first Daily prints tomorrow at six.`}</p>
      </section>

      {daily ? (
        <div style={{ marginTop: 12 }}>
          <AudioPlayer
            title="Listen to today's Yam"
            mediaTitle={`The Daily Yam — ${longDate(dailyDate)}`}
            subtitle={`${Math.max(1, Math.round(daily.words / 150))} min · ${daily.itemIds.length} ${daily.itemIds.length === 1 ? "story" : "stories"}`}
            text={daily.script}
            preparedUrl={daily.audio?.url}
            preparedVoice={daily.audio?.voice}
            onDemandUrl={`/api/audio?kind=daily&date=${daily.date}`}
            provider={config.audio.provider}
            defaultVoice={config.audio.voice}
            transcript
          />
        </div>
      ) : null}

      <NavPills categories={cats} active="home" />

      <div className="week-head">
        <h1>This week's Yam</h1>
        <p>{weekly?.greeting ?? "The first weekly selection arrives on Saturday morning: a few things to listen to, a few to read, per section."}</p>
      </div>

      {!weekly ? (
        <EmptyState title="Nothing printed yet" text="The weekly robot runs every Saturday at six." />
      ) : (
        cats.map((cat) => {
          const picks = (weekly.picks[cat.id] ?? []).filter((p) => items.has(p.itemId));
          if (!picks.length) return null;
          const listen = picks.filter((p) => p.mode === "listen");
          const read = picks.filter((p) => p.mode === "read");
          return (
            <section key={cat.id} className="section-block" style={{ ["--cat-ink" as string]: cat.color.ink, ["--cat-tint" as string]: cat.color.tint }}>
              <div className="section-block__head">
                <h2>{cat.name}</h2>
                <Link href={`/${cat.id}`}>Previous weeks →</Link>
              </div>
              <div className="rows">
                {[...listen, ...read].map((p, i) => (
                  <PickRow key={p.itemId} item={items.get(p.itemId)!} pick={p} color={cat.color} index={i} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {(words && words.entries.length) || book ? (
        <div className="sec-head">
          <h2>Also this week</h2>
        </div>
      ) : null}
      <div className="sections">
        {words && words.entries.length ? (
          <Link href="/words" className="section-card reveal" style={{ ["--cat-ink" as string]: "#8C5E00", ["--cat-tint" as string]: "#FBF0D2" }}>
            <span className="section-card__name">Words</span>
            <span className="section-card__count">
              {words.entries.length} to practise · {words.newEntries} new
            </span>
          </Link>
        ) : null}
        {book ? (
          <Link href={`/bookshelf/${book.slug}`} className="section-card reveal" style={{ ["--cat-ink" as string]: "#A0463A", ["--cat-tint" as string]: "#F9E7E2" }}>
            <span className="section-card__name">Book of the week</span>
            <span className="section-card__count">
              {book.title} — {book.author}
            </span>
          </Link>
        ) : null}
      </div>

      <BotWidget itemIds={onScreen.slice(0, 30)} />
    </div>
  );
}
