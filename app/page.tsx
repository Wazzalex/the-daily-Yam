import Link from "next/link";
import { loadConfig } from "@/lib/config";
import { itemsById, loadItems, loadLatestEdition } from "@/lib/data";
import { longDate, parisDateKey } from "@/lib/format";
import type { Item } from "@/lib/types";
import { NavPills } from "@/components/NavPills";
import { FeatureTile } from "@/components/FeatureTile";
import { ItemRow } from "@/components/ItemRow";
import { EmptyState } from "@/components/EmptyState";
import { BotWidget } from "@/components/BotWidget";
import { RecapPlayer } from "@/components/RecapPlayer";

export const dynamic = "force-static";

export default function HomePage() {
  const config = loadConfig();
  const items = loadItems();
  const edition = loadLatestEdition();
  const byId = itemsById(items);
  const now = edition ? new Date(edition.generatedAt) : new Date();
  const today = parisDateKey(now);
  const catById = new Map(config.categories.map((c) => [c.id, c]));

  let mix: Item[] = (edition?.mix ?? []).map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
  if (!mix.length && items.length) {
    // No edition file yet (or an empty one): show the freshest, most relevant stories instead.
    mix = [...items].sort((a, b) => b.relevance - a.relevance || b.publishedAt.localeCompare(a.publishedAt)).slice(0, config.rules.home_mix_size);
  }
  const newToday = items.filter((i) => i.addedOn === today).length;
  const [lead, ...rest] = mix;

  return (
    <div className="wrap">
      <div className="dateline">
        <span>{longDate(now)}</span>
        <span>
          <strong>{newToday}</strong> new {newToday === 1 ? "story" : "stories"}
        </span>
      </div>

      <section className="hero reveal" aria-label="Welcome">
        <p className="hero__line">{config.site.tagline}</p>
        <p className="hero__greeting">
          {edition?.greeting ||
            (edition
              ? `Good morning, ${config.reader.name}. Your ${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Paris" }).format(now)} edition is ready.`
              : `Good morning, ${config.reader.name}. Your first edition prints tomorrow at six.`)}
        </p>
      </section>

      {edition?.briefing?.text ? (
        <div style={{ marginTop: 12, ["--cat-ink" as string]: "#5b4a7a", ["--cat-tint" as string]: "#ede8f4" }}>
          <RecapPlayer
            kind="briefing"
            categoryName="Morning briefing"
            date={edition.date}
            short={edition.briefing.text}
            wordsShort={edition.briefing.words}
            stories={edition.briefing.itemIds.length}
            preparedUrl={edition.briefing.audio?.url}
            provider={config.audio.provider}
            defaultVoice={edition.briefing.audio?.voice ?? config.audio.voice}
          />
        </div>
      ) : null}

      <NavPills categories={config.categories} active="home" />

      <div className="sec-head">
        <h2>Today's mix</h2>
        <span className="sec-head__meta">Picked for you at {String(config.site.refresh_hour).padStart(2, "0")}:00</span>
      </div>

      {!lead ? (
        <EmptyState
          title="The presses are warming up"
          text="Nothing has been printed yet. The robot reads every source at six each morning and the first edition will appear here right after."
        />
      ) : (
        <>
          <FeatureTile item={lead} color={catById.get(lead.category)?.color ?? { ink: "#5b4a7a", tint: "#ede8f4" }} categoryName={catById.get(lead.category)?.name ?? lead.category} now={now} />
          <div className="rows">
            {rest.map((item, i) => {
              const cat = catById.get(item.category);
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  color={cat?.color ?? { ink: "#5b4a7a", tint: "#ede8f4" }}
                  categoryName={cat?.name}
                  showCategory
                  index={i + 1}
                  now={now}
                />
              );
            })}
          </div>
        </>
      )}

      <div className="sec-head">
        <h2>Sections</h2>
        <span className="sec-head__meta">{items.length} stories on file</span>
      </div>
      <div className="sections">
        {config.categories.map((c, i) => {
          const inCat = items.filter((it) => it.category === c.id);
          const fresh = inCat.filter((it) => it.addedOn === today).length;
          return (
            <Link
              key={c.id}
              href={`/${c.id}`}
              className="section-card reveal"
              style={{ ["--cat-ink" as string]: c.color.ink, ["--cat-tint" as string]: c.color.tint, ["--i" as string]: i }}
            >
              <span className="section-card__name">{c.name}</span>
              <span className="section-card__count">
                {fresh ? `${fresh} new today · ` : ""}
                {inCat.length} {inCat.length === 1 ? "story" : "stories"}
              </span>
            </Link>
          );
        })}
      </div>

      <BotWidget itemIds={mix.map((i) => i.id)} />
    </div>
  );
}
