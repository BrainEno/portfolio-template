#!/usr/bin/env node
/**
 * Serve the static export the way a static host would.
 *
 *   npm run build:static && npm run preview   # http://localhost:3300
 *
 * This is deliberately a plain file server (no SPA fallback, no rewrites): if a
 * page only works here with help from a framework, it would not work on GitHub
 * Pages / Netlify / an OSS bucket either. Directory URLs resolve to
 * `index.html`; a missing path gets `404.html` with a 404 status, exactly like
 * the hosts described in docs/STATIC_EXPORT.md.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.cwd(), process.env.OUT_DIR || "out");
const port = Number(process.env.PORT || 3300);
const host = process.env.HOST || "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
};

const resolve = (urlPath) => {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/\/+$/, "");
  const target = path.join(root, clean);
  if (!target.startsWith(root)) return null;
  if (existsSync(target) && statSync(target).isDirectory()) {
    const index = path.join(target, "index.html");
    return existsSync(index) ? index : null;
  }
  if (existsSync(target) && statSync(target).isFile()) return target;
  // Trailing-slash URLs (`works/slug/`) are directories in the export.
  const index = path.join(target, "index.html");
  return existsSync(index) ? index : null;
};

createServer((req, res) => {
  const file = resolve(req.url || "/");
  const status = file ? 200 : 404;
  const body = file || path.join(root, "404.html");
  if (!existsSync(body)) {
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(status === 404 ? "Not found" : "No build found — run `npm run build:static` first.");
    return;
  }
  res.writeHead(status, {
    "content-type": TYPES[path.extname(body)] || "application/octet-stream",
    // Mirrors the caching rules in netlify.toml so preview == production.
    "cache-control": body.includes(`${path.sep}_next${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(body).pipe(res);
}).listen(port, host, () => {
  console.log(`[preview] ${root} → http://localhost:${port}`);
});
