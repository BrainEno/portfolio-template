#!/usr/bin/env node
/**
 * Build the pure static site.
 *
 *   npm run build:static
 *
 * Next is configured as `output: "export"` (see next.config.ts), so this is
 * `next build` with the deployment variables filled in: the origin is baked into
 * canonical URLs / sitemap.xml / robots.txt, and the optional base path makes
 * the export work under `/repo/` on GitHub Pages. The result has no server, no
 * API routes and no database — serve it with `npm run preview` or any static
 * host.
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
