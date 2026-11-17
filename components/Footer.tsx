import { longDate } from "@/lib/format";

export function Footer({ siteName, motto, generatedAt }: { siteName: string; motto: string; generatedAt?: string }) {
  return (
    <footer className="footer wrap">
      <span className="footer__brand">{siteName}</span>
      <span className="footer__motto">{motto}</span>
      <span className="footer__note">
        {generatedAt
          ? `Today's Yam was printed on ${longDate(generatedAt)}. The next one tomorrow at six; the weekly on Saturday.`
          : "A four-minute Daily, a Weekly on Saturdays, for a readership of one."}
      </span>
    </footer>
  );
}
