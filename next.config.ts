import type { NextConfig } from "next";

/**
 * This site ships as plain files: `npm run build:static` writes `out/`, and
 * GitHub Pages (or any static host) serves it. There is no server build, no API
 * routes and no database.
 *
 * `NEXT_PUBLIC_BASE_PATH` prefixes the router and every asset, for hosts that
 * serve a project site from a sub-path (`/repo/`). The public origin
 * (`NEXT_PUBLIC_SITE_URL`) is baked into canonical URLs, `sitemap.xml` and
 * `robots.txt` at build time, because a static host cannot read env vars at
 * request time either.
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  poweredByHeader: false,
  // An exported site is a directory tree: `works/<slug>/index.html` rather than
  // `works/<slug>.html`, which is what every static host resolves by default.
  trailingSlash: true,
  // There is no image optimisation server in an export, so `next/image` falls
  // back to plain `<img>` semantics instead of pointing at `/_next/image`.
  images: { unoptimized: true },
  // Restricting page extensions to `.tsx` keeps anything that is not a page
  // (handlers, helpers) out of the router.
  pageExtensions: ["tsx"],
};

export default nextConfig;
