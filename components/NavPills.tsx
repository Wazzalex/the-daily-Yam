import Link from "next/link";
import type { CategoryConfig } from "@/lib/types";

/** Section pills + the two personal tabs. `active` is a category id, "home", "words", "bookshelf" or "search". */
export function NavPills({ categories, active }: { categories: CategoryConfig[]; active: string }) {
  return (
    <nav className="pills" aria-label="Sections">
      <Link href="/" className={`pill ${active === "home" ? "pill--active" : "pill--plain"}`}>
        This week
      </Link>
      {categories
        .filter((c) => c.show !== false)
        .map((c) => (
          <Link
            key={c.id}
            href={`/${c.id}`}
            className={`pill ${active === c.id ? "pill--active" : ""}`}
            style={{ ["--cat-ink" as string]: c.color.ink, ["--cat-tint" as string]: c.color.tint }}
            aria-current={active === c.id ? "page" : undefined}
          >
            {c.name}
          </Link>
        ))}
      <Link href="/words" className={`pill ${active === "words" ? "pill--active" : ""}`} style={{ ["--cat-ink" as string]: "#8C5E00", ["--cat-tint" as string]: "#FBF0D2" }} aria-current={active === "words" ? "page" : undefined}>
        Words
      </Link>
      <Link href="/bookshelf" className={`pill ${active === "bookshelf" ? "pill--active" : ""}`} style={{ ["--cat-ink" as string]: "#A0463A", ["--cat-tint" as string]: "#F9E7E2" }} aria-current={active === "bookshelf" ? "page" : undefined}>
        Bookshelf
      </Link>
    </nav>
  );
}
