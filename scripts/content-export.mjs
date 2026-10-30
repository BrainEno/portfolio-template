#!/usr/bin/env node
/**
 * Snapshot a running installation's content into
 * `src/portfolio/content/published.json`, which the static build uses instead of
 * the authored defaults.
 *
 *   npm run content:export                       # http://localhost:3000
 *   CONTENT_URL=https://example.com npm run content:export
 *
 * Run it against the server build (or a deployed instance) whenever the content
 * in the CMS should be published as a static site. Commit the JSON so
 * `npm run build:static` reproduces the same site anywhere.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const base = (process.env.CONTENT_URL || "http://localhost:3000").replace(/\/$/, "");
const target = path.join(process.cwd(), "src", "portfolio", "content", "published.json");

const response = await fetch(`${base}/api/content`);
if (!response.ok) {
  console.error(`[content:export] ${base}/api/content answered ${response.status}`);
  process.exit(1);
}
const { content } = await response.json();
if (!content || !content.identity) {
  console.error("[content:export] response did not contain site content");
  process.exit(1);
}

await writeFile(target, `${JSON.stringify({ exportedAt: new Date().toISOString(), source: base, content }, null, 2)}\n`);
console.log(`[content:export] wrote ${path.relative(process.cwd(), target)} (${content.works?.items?.length ?? 0} works)`);
