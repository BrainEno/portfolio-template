/**
 * Where the site's content comes from for this build.
 *
 * - `postgres` — the original behaviour (default): every request reads
 *   PostgreSQL, or the browser-cached demo draft, and renders on demand.
 * - `static` — content is resolved once, at build time, and every route is
 *   prerendered into plain files. Nothing in the output talks to a server, so
 *   the whole `out/` folder can be dropped on GitHub Pages, an OSS bucket or a
 *   plain nginx directory.
 *
 * The switch is a build-time constant rather than a runtime flag on purpose:
 * Next has to know it before it compiles, because it decides the route segment
 * config (`force-static` vs `force-dynamic`), the `output` mode and whether the
 * `/api` and `/admin` routes exist at all. See `next.config.ts` and
 * `scripts/build-static.mjs`.
 */
export type ContentMode = "static" | "postgres";

/** `CONTENT_MODE=static npm run build` (or `npm run build:static`). */
export const CONTENT_MODE: ContentMode = process.env.CONTENT_MODE === "static" ? "static" : "postgres";

/** True when this build is a pure static export (`output: "export"`). */
export const IS_STATIC_BUILD = CONTENT_MODE === "static";

/**
 * Opt a route into per-request rendering, the way `export const dynamic =
 * "force-dynamic"` used to.
 *
 * It is a runtime call rather than a segment config because a segment config
 * has to be a literal that Next parses at compile time — the same file cannot
 * hold both `force-static` and `force-dynamic`. `connection()` is the
 * documented way to express "never prerender this" from inside the render, and
 * in a static build the guard below removes the call entirely, so the exporter
 * sees a plain prerenderable page.
 */
export async function requireFreshRender(): Promise<void> {
  if (IS_STATIC_BUILD) return;
  const { connection } = await import("next/server");
  await connection();
}
