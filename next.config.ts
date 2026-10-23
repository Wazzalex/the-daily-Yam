import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Thumbnails come from many sources; we render them with a plain <img>.
    unoptimized: true,
  },
  // The bot reads the config and the day's data at request time: ship them with the function.
  outputFileTracingIncludes: {
    "/api/ask": ["./config/**/*", "./data/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The paper is private: never indexed, never embedded elsewhere.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
