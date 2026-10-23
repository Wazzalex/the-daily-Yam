import Link from "next/link";
import type { CategoryConfig } from "@/lib/types";

export function NavPills({ categories, active }: { categories: CategoryConfig[]; active: string }) {
  return (
    <nav className="pills" aria-label="Sections">
      <Link href="/" className={`pill ${active === "home" ? "pill--active" : "pill--plain"}`}>
        Today
      </Link>
      {categories.map((c) => (
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
    </nav>
  );
}
