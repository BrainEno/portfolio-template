#!/usr/bin/env node
/**
 * Build the pure static site.
 *
 *   npm run build:static
 *
 * Sets `CONTENT_MODE=static` for the whole build, which makes Next
 * prerender every route and write plain files to `out/` (see next.config.ts).
 * The result has no server, no `/api` routes and no database driver — drop the
 * folder on GitHub Pages, an S3/OSS bucket, nginx, or try it locally with
 * `python -m http.server -d out`.
 */
import { spawn } from "node:child_process";

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
  CONTENT_MODE: "static",
  // A static host cannot read a request-time env var, so the public origin is
  // baked into sitemap.xml / robots.txt / Open Graph tags at build time.
  SITE_URL: origin || "http://localhost:3000",
  ...(basePath ? { NEXT_PUBLIC_BASE_PATH: basePath } : {}),
};

const child = spawn(process.platform === "win32" ? "next.cmd" : "next", ["build"], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
