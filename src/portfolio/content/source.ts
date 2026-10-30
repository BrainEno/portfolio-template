import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defaultContent } from "./defaults";
import { normalizeContent } from "./normalize";
import type { PortfolioContent } from "./types";

/**
 * The one place a page asks for the site's content.
 *
 * Content is resolved at build time, from a file in the repository — either the
 * snapshot a live install exported (`npm run content:export` →
 * `content/published.json`) or the authored defaults in `content/defaults.ts`.
 * There is no database and no request-time lookup, which is what lets the whole
 * site be `output: "export"`-ed into a folder any static host can serve.
 *
 * Editing happens in `/admin`: it writes a draft to this browser's localStorage
 * so the site previews the change instantly, and can download `published.json`
 * which you commit to publish for everyone.
 */
const PUBLISHED_FILE = path.join(process.cwd(), "src", "portfolio", "content", "published.json");

/**
 * A snapshot committed by `npm run content:export` or downloaded from
 * `/admin`. Optional on purpose: a fresh clone builds from the authored
 * defaults without having to run anything first.
 */
function readPublishedSnapshot(): unknown | null {
  try {
    if (!existsSync(PUBLISHED_FILE)) return null;
    return JSON.parse(readFileSync(PUBLISHED_FILE, "utf8"));
  } catch (error) {
    console.warn("[portfolio] published.json is not readable, falling back to defaults", error);
    return null;
  }
}

export async function getSiteContent(): Promise<PortfolioContent> {
  const published = readPublishedSnapshot();
  return published ? normalizeContent(published) : defaultContent;
}

/** When the committed snapshot was exported, for `sitemap.xml`'s lastmod. */
export async function getContentUpdatedAt(): Promise<string | null> {
  try {
    if (!existsSync(PUBLISHED_FILE)) return null;
    return readFileSync(PUBLISHED_FILE, "utf8").match(/"(?:exportedAt|exportedAtIso)":\s*"([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}
