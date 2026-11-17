import type { CategoryColor, Item, WeeklyPick } from "@/lib/types";
import { shortDate, typeLabel } from "@/lib/format";
import { TypeIcon } from "./Icons";
import { VideoEmbed } from "./VideoEmbed";

interface Props {
  item: Item;
  pick: WeeklyPick;
  color: CategoryColor;
  categoryName?: string;
  showCategory?: boolean;
  index?: number;
}

/** One weekly pick: Listen or Read badge, title, source, Claude's "why", the summary, and the embed for videos. */
export function PickRow({ item, pick, color, categoryName, showCategory, index = 0 }: Props) {
  const vars = { ["--cat-ink" as string]: color.ink, ["--cat-tint" as string]: color.tint, ["--i" as string]: index };
  const when = item.eventDate ? shortDate(item.eventDate) : shortDate(item.publishedAt);
  return (
    <article className="row reveal" style={vars}>
      <a className="badge" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${pick.mode === "listen" ? "Listen" : "Read"}: open at ${item.source}`}>
        <TypeIcon type={item.type} />
      </a>
      <div className="row__body">
        <div className="row__meta">
          <span className={`mode mode--${pick.mode}`}>{pick.mode === "listen" ? (item.type === "video" ? "Watch" : "Listen") : "Read"}</span>
          {showCategory && categoryName ? (
            <>
              <span className="row__cat">{categoryName}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{typeLabel(item.type)}</span>
          <span aria-hidden="true">·</span>
          <span>{item.source}</span>
          <span aria-hidden="true">·</span>
          <span>{when}</span>
          {item.duration ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.duration}</span>
            </>
          ) : null}
          {item.lang === "fr" ? <span className="flag">FR</span> : null}
        </div>
        <h3 className="row__title">
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {item.title}
          </a>
        </h3>
        {pick.why ? <p className="row__why">{pick.why}</p> : null}
        {item.summary ? <p className="row__summary">{item.summary}</p> : null}
        {item.videoId ? <VideoEmbed videoId={item.videoId} title={item.title} image={item.image} /> : null}
      </div>
    </article>
  );
}
