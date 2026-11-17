import type { Metadata } from "next";
import { Suspense } from "react";
import { loadConfig, visibleCategories } from "@/lib/config";
import { NavPills } from "@/components/NavPills";
import { SearchClient } from "@/components/SearchClient";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  const config = loadConfig();
  const colors = Object.fromEntries(config.categories.map((c) => [c.id, c.color]));
  return (
    <div className="wrap">
      <NavPills categories={visibleCategories()} active="search" />
      <Suspense fallback={null}>
        <SearchClient colors={colors} />
      </Suspense>
    </div>
  );
}
