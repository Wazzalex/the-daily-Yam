// Renders the app icons (PNG) from the two SVG masters in public/icons.
// Runs before every build (npm run prebuild) so the PNGs never need committing.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "icons");
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["icon.svg", "apple-touch-icon.png", 180],
  ["icon.svg", "favicon-32.png", 32],
  ["icon-maskable.svg", "icon-maskable-512.png", 512],
];

async function main() {
  const missing = jobs.filter(([, out]) => !fs.existsSync(path.join(dir, out)));
  if (!missing.length) return;
  let Resvg;
  try {
    ({ Resvg } = await import("@resvg/resvg-js"));
  } catch (err) {
    console.warn("build-icons: @resvg/resvg-js unavailable, keeping SVG icons only.", err?.message ?? "");
    return;
  }
  for (const [src, out, size] of missing) {
    const svg = fs.readFileSync(path.join(dir, src), "utf8");
    const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
    fs.writeFileSync(path.join(dir, out), png);
    console.log(`build-icons: wrote ${out}`);
  }
}

main().catch((err) => {
  console.warn("build-icons failed (non-blocking):", err?.message ?? err);
});
