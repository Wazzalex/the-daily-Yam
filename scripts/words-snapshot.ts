// Builds data/words/source.json — the snapshot of Yamuna's vocabulary notebook — from a Google
// Docs API JSON (the output of documents.get, as saved by the Google Docs connector), or from the
// live HTML export when the document is shared by link.
//
//   npx tsx scripts/words-snapshot.ts path/to/doc.json      # from a Docs API JSON
//   npx tsx scripts/words-snapshot.ts --live                 # from the shared document
//   npx tsx scripts/words-snapshot.ts --check                # parse the current snapshot and report
//
// The robot (scripts/aggregate.ts) uses the live export first and this snapshot as a fallback,
// so a fresh snapshot is what keeps the Words tab working while the document is private.

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../lib/config";
import { fetchNotebookHtml, paragraphsFromDocsJson, parseNotebook, type DocSnapshot } from "./lib/words-doc";

const SNAPSHOT = path.join(process.cwd(), "data", "words", "source.json");

async function main() {
  const config = loadConfig();
  const docId = config.words.google_doc_id ?? "";
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: words-snapshot.ts <docs-api.json> | --live | --check");
    process.exit(2);
  }

  let snapshot: DocSnapshot;
  if (arg === "--check") {
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as DocSnapshot;
  } else if (arg === "--live") {
    if (!docId) throw new Error("words.google_doc_id is not set in config/sources.yaml");
    snapshot = { docId, fetchedAt: new Date().toISOString(), paragraphs: await fetchNotebookHtml(docId) };
  } else {
    const raw = fs.readFileSync(arg, "utf8");
    const json = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, unknown>;
    const { title, paragraphs } = paragraphsFromDocsJson(json);
    const content = (json.content as Record<string, unknown> | undefined) ?? json;
    const idInJson = typeof content.documentId === "string" ? content.documentId : docId;
    if (docId && idInJson !== docId) console.warn(`warning: the JSON is document ${idInJson}, config says ${docId}`);
    snapshot = { docId: idInJson, fetchedAt: new Date().toISOString(), title, paragraphs };
  }

  const entries = parseNotebook(snapshot.paragraphs);
  const themes = new Map<string, number>();
  for (const e of entries) themes.set(e.theme ?? "(no theme)", (themes.get(e.theme ?? "(no theme)") ?? 0) + 1);
  console.log(`${snapshot.title ?? snapshot.docId}: ${snapshot.paragraphs.length} paragraphs → ${entries.length} entries, ${entries.filter((e) => e.bold.length).length} with a highlighted word, ${entries.filter((e) => e.pronunciation).length} with IPA`);
  for (const [t, n] of themes) console.log(`  ${String(n).padStart(4)}  ${t}`);

  if (arg !== "--check") {
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1));
    console.log(`written ${path.relative(process.cwd(), SNAPSHOT)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
