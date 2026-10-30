import type { NextConfig } from "next";

/**
 * Two deployment shapes, one codebase:
 *
 * - `CONTENT_MODE=static` (or `npm run build:static`) — content is resolved at
 *   build time and the whole site is written as plain files to `out/`. No API
 *   routes, no server, no database driver: the folder can be served by GitHub
 *   Pages, an object-storage bucket or `python -m http.server`.
 * - default / `CONTENT_MODE=postgres` — the original server build with the CMS.
 *
 * `NEXT_OUTPUT=standalone` is set by the Dockerfile / VPS script to emit a
 * minimal self-contained server. Netlify, Vercel and Cloudflare (OpenNext) use
 * their own adapters and must not set either variable.
 */
const staticExport = process.env.CONTENT_MODE === "static";
/**
 * GitHub Pages serves project sites from `/<repo>/`, not from the domain root.
 * Setting `NEXT_PUBLIC_BASE_PATH=/repo` makes Next prefix both the router and
 * every asset URL, so an export works unchanged under a sub-path.
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
const assetPrefix = basePath || undefined;
const standalone = !staticExport && process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  output: staticExport ? "export" : standalone ? "standalone" : undefined,
  basePath: assetPrefix,
  assetPrefix,
  poweredByHeader: false,
  compress: true,
  // An exported site is a directory tree: `works/<slug>/index.html` rather than
  // `works/<slug>.html`, which is what every static host resolves by default.
  trailingSlash: staticExport ? true : undefined,
  // There is no image optimisation server in a static export, so `next/image`
  // falls back to plain `<img>` semantics instead of pointing at `/_next/image`.
  images: staticExport ? { unoptimized: true } : undefined,
  // The `/api` handlers, the CMS data layer and the worker-side adapters are
  // all `.ts`. Restricting the page extensions to `.tsx` in a static build
  // simply excludes them from the router, which is how Next documents keeping
  // server-only routes out of an export.
  pageExtensions: staticExport ? ["tsx"] : ["ts", "tsx"],
  // pg-cloudflare ships a Node and a workerd entry; make sure the one Hyperdrive
  // needs is traced into the Cloudflare bundle.
  outputFileTracingIncludes: staticExport
    ? undefined
    : {
        "/*": ["./node_modules/pg-cloudflare/dist/**/*", "./node_modules/pg-cloudflare/esm/**/*"],
      },
  // Headers are a server feature; an export has no config to apply them, and
  // Next rejects the key outright in that mode, so the block is added only for
  // builds that actually serve requests.
  ...(staticExport
    ? {}
    : {
        async headers() {
          const longCache = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
          return [
            { source: "/images/:path*", headers: longCache },
            { source: "/gltfs/:path*", headers: longCache },
            { source: "/icons/:path*", headers: longCache },
            { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }, { key: "Service-Worker-Allowed", value: "/" }] },
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
