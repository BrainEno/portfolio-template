#!/usr/bin/env node
/**
 * Serve the static export the way a static host would.
 *
 *   npm run build:static && npm run preview   # http://localhost:3300
 *
 * Three rules, all about honesty:
 *
 * 1. **No help from a framework.** No SPA fallback, no rewrites, no extension
 *    guessing: a directory URL resolves to `index.html`, a missing path gets
 *    `404.html` with a 404 status — exactly like GitHub Pages. If a page only
 *    works here because the server was clever, it is broken in production.
 *
 * 2. **The same layout as production.** The export is mounted at whatever
 *    sub-path it was built for (`out/build-meta.json`), so a project site is
 *    previewed at `/repo/` and 404s everything outside it — the same place
 *    a forgotten `asset()` prefix would break.
 *
 * 3. **Compression on.** Hosts compress; a preview that serves raw JS would
 *    report transfer sizes nobody sees. Text assets are compressed on demand
 *    and cached in memory, keyed by mtime.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = path.resolve(process.cwd(), process.env.OUT_DIR || "out");
const port = Number(process.env.PORT || 3300);
const host = process.env.HOST || "0.0.0.0";
/**
 * Sub-path the export is published under. Defaults to whatever the build was
 * made for (`out/build-meta.json`), so `npm run preview` after a GitHub Pages
 * build serves `http://localhost:3300/<repo>/` and 404s everything else — the
 * same shape as the real host. `MOUNT=` (empty) forces the domain root.
 */
const metaFile = path.join(root, "build-meta.json");
const builtBasePath = (() => {
  try {
    return JSON.parse(readFileSync(metaFile, "utf8")).basePath || "";
  } catch {
    return "";
  }
})();
const mount = (process.env.MOUNT ?? builtBasePath).replace(/\/+$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
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

/** Already-compressed formats: running them through Brotli only wastes CPU. */
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".xml", ".txt", ".svg"]);

const resolve = (urlPath) => {
  let requested = decodeURIComponent(urlPath.split("?")[0]);
  if (mount) {
    if (requested !== mount && !requested.startsWith(`${mount}/`)) return null;
    requested = requested.slice(mount.length) || "/";
  }
  const clean = requested.replace(/\/+$/, "");
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

/**
 * `encoding:file:mtime → bytes`. The mtime belongs in the key: a preview server
 * that keeps re-serving the previously compressed HTML after a rebuild is worse
 * than one that does not compress at all — you would be reviewing the old page.
 * (That exact bug shipped in the first version of this file.)
 */
const compressed = new Map();

function encoded(file, encoding, mtime) {
  const key = `${encoding}:${file}:${mtime}`;
  const cached = compressed.get(key);
  if (cached) return cached;
  const source = readFileSync(file);
  const body = encoding === "br" ? brotliCompressSync(source, { params: { 1: 11 } }) : gzipSync(source, { level: 9 });
  compressed.set(key, body);
  return body;
}

const server = createServer((req, res) => {
  const file = resolve(req.url || "/");
  const status = file ? 200 : 404;
  const body = file || path.join(root, "404.html");
  if (!existsSync(body)) {
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(status === 404 ? "Not found" : "No build found — run `npm run build:static` first.");
    return;
  }

  const ext = path.extname(body);
  const accept = String(req.headers["accept-encoding"] || "");
  const encoding = COMPRESSIBLE.has(ext) ? (/\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null) : null;

  const headers = {
    "content-type": TYPES[ext] || "application/octet-stream",
    // The best case a host can do; GitHub Pages itself serves `max-age=600`.
    // Fingerprinted bundles are immutable; HTML and everything else revalidate.
    // (GitHub Pages cannot set headers and serves `max-age=600` — this is the
    // best case, which is why the local numbers are the optimistic ones.)
    "cache-control": body.includes(`${path.sep}_next${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
    vary: "accept-encoding",
  };

  const { mtimeMs } = statSync(body);
  if (encoding) {
    const payload = encoded(body, encoding, mtimeMs);
    headers["content-encoding"] = encoding;
    headers["content-length"] = String(payload.length);
    res.writeHead(status, headers);
    res.end(req.method === "HEAD" ? undefined : payload);
    return;
  }

  headers["content-length"] = String(statSync(body).size);
  headers.etag = `W/"${mtimeMs.toString(36)}"`;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : readFileSync(body));
});

server.listen(port, host, () => {
  // `PORT=0` asks the OS for a free port (used by smoke, so two runs can never
  // collide); the real port is printed either way.
  const actual = server.address().port;
  console.log(
    `[preview] ${root} → http://localhost:${actual}${mount || "/"}  (brotli/gzip on demand` +
      `${mount ? `, mounted at ${mount}` : ""})`
  );
});
