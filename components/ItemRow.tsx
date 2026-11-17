import type { CategoryColor, Item } from "@/lib/types";
import { shortDate, typeLabel } from "@/lib/format";
import { TypeIcon } from "./Icons";

interface Props {
  item: Item;
  color: CategoryColor;
  categoryName?: string;
  showCategory?: boolean;
  index?: number;
}

/** A compact row used by search results and "more from the pool". */
export function ItemRow({ item, color, categoryName, showCategory, index = 0 }: Props) {
  const vars = { ["--cat-ink" as string]: color.ink, ["--cat-tint" as string]: color.tint, ["--i" as string]: index };
  const when = item.eventDate ? shortDate(item.eventDate) : shortDate(item.publishedAt);
  return (
    <article className="row row--compact reveal" style={vars}>
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
          {item.duration ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.duration}</span>
            </>
          ) : null}
          {item.lang === "fr" ? <span className="flag">FR</span> : null}
        </div>
        {item.summary ? <p className="row__summary">{item.summary}</p> : null}
      </div>
    </article>
  );
}
