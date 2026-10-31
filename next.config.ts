/**
 * Copyright © 2026 BrainEno. 保留所有权利。
 *
 * 本文件及其包含的代码、设计和逻辑均为 BrainEno 的原创作品。
 * 未经作者明确书面授权，禁止复制、修改、分发或用于其他项目。
 *
 * 授权申请：nodeman24@outlook.com
 * 详见：LICENSE, TERMS.md
 */
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
  // Keep anything that is not a page (components, data, helpers) out of the
  // router: only `.tsx` pages and `.ts` route handlers/middleware become routes.
  //
  // This list must never hold exactly ONE entry. `getAppEntry` passes the loader
  // options through `querystring.stringify`, and a one-element array can only be
  // encoded once (`pageExtensions=tsx`), so webpack hands `next-app-loader` a
  // *string*; the loader's string branch forgets the leading dot and looks for
  // `pagetsx` → `Can't resolve private-next-app-dir/page`, i.e. HTTP 500 on
  // every page of `next dev --webpack` (Next 16.2.6). Two entries stay an array
  // (`pageExtensions=tsx&pageExtensions=ts`). `verify` boots the dev server so
  // this cannot come back unnoticed.
  pageExtensions: ["tsx", "ts"],
};

export default nextConfig;
