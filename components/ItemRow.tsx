import type { CategoryColor, Item } from "@/lib/types";
import { typeLabel, whenLabel } from "@/lib/format";
import { TypeIcon } from "./Icons";
import { VideoEmbed } from "./VideoEmbed";

interface Props {
  item: Item;
  color: CategoryColor;
  categoryName?: string;
  /** Show the category name in the meta line (home, search). */
  showCategory?: boolean;
  /** Hide the summary (dense lists). */
  compact?: boolean;
  /** Embed YouTube videos inline. */
  embedVideo?: boolean;
  index?: number;
  now?: Date;
}

export function ItemRow({ item, color, categoryName, showCategory, compact, embedVideo = true, index = 0, now }: Props) {
  const vars = { ["--cat-ink" as string]: color.ink, ["--cat-tint" as string]: color.tint, ["--i" as string]: index };
  const when = whenLabel(item, now);
  return (
    <article className={`row reveal${compact ? " row--compact" : ""}`} style={vars}>
      <a className="badge" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${typeLabel(item.type)}: open at ${item.source}`}>
        <TypeIcon type={item.type} />
      </a>
      <div className="row__body">
        <h3 className="row__title">
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {item.title}
          </a>
        </h3>
        <div className="row__meta">
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
          {item.eventPlace ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.eventPlace}</span>
            </>
          ) : null}
          {item.duration ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.duration}</span>
            </>
          ) : null}
          {item.lang === "fr" ? <span className="flag">FR</span> : null}
        </div>
        {!compact && item.summary ? <p className="row__summary">{item.summary}</p> : null}
        {embedVideo && item.videoId ? <VideoEmbed videoId={item.videoId} title={item.title} image={item.image} /> : null}
      </div>
    </article>
  );
}
