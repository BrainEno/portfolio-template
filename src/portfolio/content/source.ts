import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defaultContent } from "./defaults";
import { normalizeContent } from "./normalize";
import type { PortfolioContent } from "./types";

/**
 * The one place a page asks for the site's content.
 *
 * Content is resolved at build time, from a file in the repository — either the
 * committed snapshot `content/published.json` or the authored defaults in
 * `content/defaults.ts`.
 * There is no database and no request-time lookup, which is what lets the whole
 * site be `output: "export"`-ed into a folder any static host can serve.
 *
 * To change the site, edit `published.json` (or `defaults.ts`) and rebuild —
 * the deploy is the editor. `/admin` deliberately does not exist: a static site
 * has no session to protect and nowhere to save a request, so a browser-only
 * "studio" would only ever be a mock-up of one.
 */
const PUBLISHED_FILE = path.join(process.cwd(), "src", "portfolio", "content", "published.json");

/**
 * An optional content snapshot. Without one, a fresh clone builds from the
 * authored defaults and needs nothing else.
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
