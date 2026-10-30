#!/usr/bin/env node
/**
 * Post-build smoke test: boot the exported folder exactly as a static host
 * would and check the things that a `next build` success does not prove.
 *
 *   npm run build:static && npm run smoke
 *
 * It is deliberately browser-free (node's `fetch` against `scripts/preview.mjs`,
 * which has no framework fallbacks) so it can run in CI in a couple of seconds,
 * right before the deploy step, and catch the classic static-hosting
 * regressions:
 *
 *   - a route that only exists because the dev server rewrites URLs
 *   - a 404 that returns 200 (soft 404s poison search results)
 *   - `robots.txt` that leaks the whole site out of the index
 *   - an image `srcSet` candidate that was never exported
 *
 * Exit code 1 on any failure, with every problem listed — not just the first.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, process.env.OUT_DIR || "out");
const PORT = Number(process.env.SMOKE_PORT || 3411);
const BASE = `http://127.0.0.1:${PORT}`;
/**
 * A GitHub Pages project site is exported with `NEXT_PUBLIC_BASE_PATH` baked
 * into every link, while the files themselves sit at the root of `out/`. The
 * preview server publishes `out/` at `/`, so the prefix is stripped before the
 * request — otherwise a perfectly good export would look broken here.
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(`${name}${detail ? ` (${detail})` : ""}`);
};

if (!existsSync(path.join(OUT, "index.html"))) {
  console.error(`[smoke] no export at ${OUT} — run \`npm run build:static\` first.`);
  process.exit(1);
}

/** Every page in the export, taken from the sitemap the site itself publishes. */
function sitemapPaths() {
  const xml = readFileSync(path.join(OUT, "sitemap.xml"), "utf8");
  const origin = xml.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
  let base = "";
  try {
    base = new URL(origin).pathname.replace(/\/[^/]*$/, "");
  } catch {
    /* a relative sitemap: paths are already absolute */
  }
  return [...xml.matchAll(/<loc>[^<]+<\/loc>/g)].map(([loc]) => {
    const pathname = loc.replace(/<\/?loc>/g, "").replace(/^https?:\/\/[^/]+/, "").slice(base.length) || "/";
    return BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) || "/" : pathname;
  });
}

const server = spawn(process.execPath, [path.join(ROOT, "scripts", "preview.mjs")], {
  env: { ...process.env, PORT: String(PORT), OUT_DIR: OUT },
  stdio: ["ignore", "pipe", "inherit"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("preview server did not start")), 15000);
  server.stdout.on("data", (chunk) => {
    if (String(chunk).includes("[preview]")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`preview server exited (${code})`)));
});

const head = (path, method = "GET") => fetch(`${BASE}${path}`, { method, redirect: "manual" });

try {
  console.log("[smoke] pages");
  const paths = sitemapPaths();
  check("sitemap lists pages", paths.length > 0, `${paths.length} URLs`);
  for (const pathname of paths) {
    const response = await head(pathname);
    const html = response.headers.get("content-type")?.includes("text/html");
    check(`${pathname} → 200 html`, response.status === 200 && Boolean(html), `status ${response.status}`);
  }

  console.log("[smoke] 404s");
  for (const pathname of ["/admin/", "/nope/", "/works/not-a-project/"]) {
    const response = await head(pathname);
    check(`${pathname} → 404`, response.status === 404, `status ${response.status}`);
  }

  console.log("[smoke] metadata routes");
  const robots = await head("/robots.txt");
  const robotsBody = await robots.text();
  check("robots.txt → 200", robots.status === 200, `status ${robots.status}`);
  check(
    "robots.txt only disallows /offline",
    /Disallow: \/offline/.test(robotsBody) && (robotsBody.match(/^Disallow:/gm)?.length ?? 0) === 1,
    robotsBody.match(/^Disallow:.*$/gm)?.join(" ")
  );
  check("robots.txt points at the sitemap", /Sitemap: https?:\/\//.test(robotsBody));
  const manifest = await head("/manifest.webmanifest");
  check("manifest.webmanifest → 200", manifest.status === 200, `status ${manifest.status}`);
  const sitemap = await head("/sitemap.xml");
  check("sitemap.xml → 200", sitemap.status === 200, `status ${sitemap.status}`);

  console.log("[smoke] images referenced by the home page");
  // Anything the markup asks for must exist in the export: a missing `srcSet`
  // candidate is silent in the browser (it falls back), but a missing `src` is
  // an empty box, and both mean the image step of the build was skipped.
  const index = readFileSync(path.join(OUT, "index.html"), "utf8");
  const localise = (url) =>
    BASE_PATH && url.startsWith(`${BASE_PATH}/`) ? url.slice(BASE_PATH.length) : url;
  const urls = new Set();
  for (const [, srcset] of index.matchAll(/srcSet="([^"]+)"/g)) {
    for (const candidate of srcset.split(",")) urls.add(localise(candidate.trim().split(" ")[0]));
  }
  for (const [, src] of index.matchAll(/<img[^>]*?src="(\/[^"]+)"/g)) urls.add(localise(src));
  let missing = 0;
  for (const url of urls) {
    const response = await head(url, "HEAD");
    if (response.status !== 200) {
      missing += 1;
      failures.push(`${url} → ${response.status}`);
    }
  }
  check("every home-page image resolves", missing === 0, `${urls.size} URLs, ${missing} missing`);

  console.log("[smoke] transfer encoding");
  const compressed = await fetch(`${BASE}/`, { headers: { "accept-encoding": "br" } });
  check(
    "html is served brotli-encoded for br clients",
    compressed.headers.get("content-encoding") === "br",
    compressed.headers.get("content-encoding") ?? "identity"
  );
} finally {
  server.kill();
}

console.log(failures.length ? `\n[smoke] ${failures.length} failure(s)` : "\n[smoke] all checks passed");
process.exit(failures.length ? 1 : 0);
