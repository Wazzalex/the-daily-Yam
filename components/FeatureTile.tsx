import type { CategoryColor, Item } from "@/lib/types";
import { typeLabel, whenLabel } from "@/lib/format";
import { TypeIcon } from "./Icons";
import { VideoEmbed } from "./VideoEmbed";

export function FeatureTile({ item, color, categoryName, now }: { item: Item; color: CategoryColor; categoryName: string; now?: Date }) {
  const vars = { ["--cat-ink" as string]: color.ink, ["--cat-tint" as string]: color.tint };
  return (
    <article className="feature reveal" style={vars}>
      <div className="feature__meta">
        <span className="chip">{categoryName}</span>
        <span className="meta">
          <TypeIcon type={item.type} size={11} />
          {typeLabel(item.type)} · {item.source} · {whenLabel(item, now)}
          {item.eventPlace ? ` · ${item.eventPlace}` : ""}
          {item.duration ? ` · ${item.duration}` : ""}
        </span>
        {item.lang === "fr" ? <span className="flag">FR</span> : null}
      </div>
      <h3 className="feature__title">
        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
          {item.title}
        </a>
      </h3>
      {item.summary ? <p className="feature__summary">{item.summary}</p> : null}
      {item.videoId ? <VideoEmbed videoId={item.videoId} title={item.title} image={item.image} /> : null}
    </article>
  );
}
