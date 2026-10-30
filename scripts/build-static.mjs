#!/usr/bin/env node
/**
 * Build the pure static site.
 *
 *   npm run build:static
 *
 * Two steps: the responsive image derivatives are regenerated first (incremental,
 * a no-op unless an image changed), then the export is produced.
 *
 * Next is configured as `output: "export"` (see next.config.ts), so this is
 * `next build` with the deployment variables filled in: the origin is baked into
 * canonical URLs / sitemap.xml / robots.txt, and the optional base path makes
 * the export work under `/repo/` on GitHub Pages. The result has no server, no
 * API routes and no database — serve it with `npm run preview` or any static
 * host.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

if (!origin) {
  console.warn(
    "[build:static] NEXT_PUBLIC_SITE_URL is not set — sitemap.xml, robots.txt and\n" +
      "              canonical/og URLs will point at http://localhost:3000.\n" +
      "              Set it to the site's public address before deploying."
  );
}

const env = {
  ...process.env,
  // A static host cannot read a request-time env var, so the public origin is
  // baked into sitemap.xml / robots.txt / Open Graph tags at build time.
  SITE_URL: origin || "http://localhost:3000",
  ...(basePath ? { NEXT_PUBLIC_BASE_PATH: basePath } : {}),
};

/** `npm run build` gets this from the `prebuild` hook; this script bypasses npm. */
function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const images = await run(process.execPath, ["scripts/build-images.mjs"]);
if (images !== 0) process.exit(images);

const build = await run(process.platform === "win32" ? "next.cmd" : "next", ["build"]);

// How this folder was built, in the folder itself. `preview` mounts the export
// at the right sub-path and `smoke` checks the right URLs without being told —
// testing a prefixed build against an unprefixed server is a mistake that looks
// exactly like a broken site, so the deployment shape travels with the bytes.
if (build === 0) {
  writeFileSync(
    path.join(process.cwd(), "out", "build-meta.json"),
    `${JSON.stringify({ basePath: basePath.replace(/\/+$/, ""), siteUrl: env.SITE_URL, builtAt: new Date().toISOString() }, null, 2)}\n`
  );
}
process.exit(build);
