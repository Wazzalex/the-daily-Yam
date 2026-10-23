import Link from "next/link";
import { IconSearch } from "./Icons";

export function Masthead({ siteName }: { siteName: string }) {
  return (
    <header className="masthead">
      <div className="wrap masthead__inner">
        <Link href="/" className="brand" aria-label={`${siteName} — home`}>
          <span className="brand__mark" aria-hidden="true">DY</span>
          <span className="brand__rule" aria-hidden="true" />
          <span className="brand__name">{siteName}</span>
        </Link>
        <Link href="/search" className="icon-btn" aria-label="Search">
          <IconSearch />
        </Link>
      </div>
    </header>
  );
}
