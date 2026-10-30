import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defaultContent } from "./defaults";
import { IS_STATIC_BUILD } from "./mode";
import { normalizeContent } from "./normalize";
import type { PortfolioContent } from "./types";

/**
 * The one place a page asks for the site's content.
 *
 * Everything that renders the site (layout, home page, work pages, sitemap and
 * manifest) goes through `getSiteContent()` instead of reaching into the
 * storage layer, so the two deployment shapes differ in exactly one file:
 *
 * - **static** — content is baked in at build time. Either the site's authored
 *   defaults (`content/defaults.ts`) or a snapshot exported from a live
 *   installation (`content/published.json`, written by `npm run content:export`).
 *   No database driver is ever imported, which is what lets `output: "export"`
 *   produce a folder that runs on any static host.
 * - **postgres** — the original path, resolved lazily so `pg` only ends up in
 *   the server bundle when a server actually exists.
 */
export type ContentSource = {
  mode: "static" | "postgres";
  getContent(): Promise<PortfolioContent>;
  /** Timestamp for `sitemap.xml` when the source knows one. */
  getUpdatedAt(): Promise<string | null>;
};

const PUBLISHED_FILE = path.join(process.cwd(), "src", "portfolio", "content", "published.json");

/**
 * A snapshot committed by `npm run content:export`. Optional on purpose: a
 * fresh clone builds from the authored defaults without having to run anything
 * first.
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

export const staticSource: ContentSource = {
  mode: "static",
  async getContent() {
    const published = readPublishedSnapshot();
    return published ? normalizeContent(published) : defaultContent;
  },
  async getUpdatedAt() {
    try {
      return existsSync(PUBLISHED_FILE) ? readFileSync(PUBLISHED_FILE, "utf8").match(/"exportedAt":\s*"([^"]+)"/)?.[1] ?? null : null;
    } catch {
      return null;
    }
  },
};

/**
 * Reads whatever the running server would render. Imported dynamically so the
 * PostgreSQL driver, `node:crypto` and the platform adapters stay out of the
 * static bundle entirely — in a static build this function is dead code.
 */
export const postgresSource: ContentSource = {
  mode: "postgres",
  async getContent() {
    const { loadContent } = await import("../server/content-handlers");
    return loadContent();
  },
  async getUpdatedAt() {
    return new Date().toISOString();
  },
};

export function getContentSource(): ContentSource {
  return IS_STATIC_BUILD ? staticSource : postgresSource;
}

/** Resolve the content for the current build shape. */
export function getSiteContent(): Promise<PortfolioContent> {
  return getContentSource().getContent();
}
