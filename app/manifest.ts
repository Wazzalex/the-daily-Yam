import type { MetadataRoute } from "next";
import { loadConfig } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  const { site } = loadConfig();
  return {
    name: site.name,
    short_name: "Daily Yam",
    description: site.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#5b4a7a",
    lang: "en-GB",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
