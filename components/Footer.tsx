import { longDate } from "@/lib/format";

export function Footer({ siteName, motto, generatedAt }: { siteName: string; motto: string; generatedAt?: string }) {
  return (
    <footer className="footer wrap">
      <span className="footer__brand">{siteName}</span>
      <span className="footer__motto">{motto}</span>
      <span className="footer__note">
        {generatedAt
          ? `This edition was printed on ${longDate(generatedAt)}. Next one tomorrow at six.`
          : "Printed daily at six, for a readership of one."}
      </span>
    </footer>
  );
}
