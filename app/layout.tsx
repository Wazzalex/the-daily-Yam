import type { Metadata, Viewport } from "next";
import "./globals.css";
import { loadConfig } from "@/lib/config";
import { loadLatestEdition } from "@/lib/data";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700&family=UnifrakturMaguntia&display=swap";

export function generateMetadata(): Metadata {
  const { site } = loadConfig();
  return {
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.tagline,
    applicationName: site.name,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon.svg", type: "image/svg+xml" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#5b4a7a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { site } = loadConfig();
  const edition = loadLatestEdition();
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <Masthead siteName={site.name} />
        <main>{children}</main>
        <Footer siteName={site.name} motto={site.motto} generatedAt={edition?.generatedAt} />
      </body>
    </html>
  );
}
