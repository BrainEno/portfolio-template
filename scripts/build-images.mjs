#!/usr/bin/env node
/**
 * Generate responsive WebP derivatives for the images in `public/images/` and a
 * manifest the components use to build `srcSet`s.
 *
 *   npm run images            # incremental: only stale outputs are rewritten
 *   npm run images -- --force # rewrite everything (after changing the ladder)
 *
 * Why a script instead of `next/image`: the site is a pure static export
 * (`output: "export"`), so there is no image-optimisation server. Whatever is
 * in `public/` is what the visitor downloads. A 1200×1600 hero photo displayed
 * at 56vw is ~430 KB of pixels a phone will never show — the classic
 * "properly size images" penalty. So the derivatives are produced at build
 * time, committed next to the originals, and offered through `srcSet`; the
 * original file stays as the `src` fallback, which is what makes this safe to
 * ship (a browser that ignores `srcSet`, or a missing derivative, still shows
 * the picture).
 *
 * The manifest (`src/portfolio/content/image-manifest.json`) is imported by
 * `ui/Img.tsx`, so it has to be committed too — the components must be able to
 * resolve `srcSet`s without running this script.
 *
 * File names carry a hash of the source (`figure-800.1f2a3b4c.webp`): hosts and
 * service workers cache `/images/*` aggressively, so regenerating
 * `figure-800.webp` in place would leave returning visitors looking at the
 * previous photo until their copy expired.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "public", "images");
const OUTPUT_DIR = path.join(SOURCE_DIR, "opt");
const MANIFEST = path.join(ROOT, "src", "portfolio", "content", "image-manifest.json");

/** Widths offered to the browser. Anything wider than the source is skipped. */
const WIDTHS = [480, 800, 1200];
const QUALITY = 78;
/** A derivative is only useful if it is at least this much smaller than the next one. */
const MIN_STEP = 1.15;
/**
 * Files that must keep their original bytes and get no derivatives:
 * - the booth cutout is a transparent PNG used as the pre-WebGL state (a
 *   lossy re-encode shows as a halo around the silhouette);
 * - `tv-glass-glow.webp` is referenced straight from a CSS background (inline
 *   style), not through `<Img>`, so it needs no srcSet ladder.
 * (The television *master* `tv.webp` lives in `assets/images/`, outside
 * `public/`, so it never reaches this walk at all.)
 */
const SKIP = new Set(["phone-booth-cutout.png", "tv-glass-glow.webp"]);

/**
 * Per-file overrides. The television artwork is the one image that is *not*
 * laid out at a CSS size: `.tv-anchor` is `max(160vw, 230vh)`, i.e. ~2300 px
 * wide on a desktop and ~1900 px on a phone (portrait), so the default
 * 480/800/1200 ladder would be a soft mess. It gets its own, wider ladder.
 * The cutout carries an alpha hole, so it is encoded at a higher quality than
 * the default to keep the feathered edge clean after resampling.
 */
const OVERRIDES = {
  "tv-cutout.webp": { widths: [1280, 1920, 2560], quality: 90 },
};

const force = process.argv.includes("--force");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "opt" ? [] : walk(full);
    // `.webp` sources are included because the television artwork ships as one
    // (a project usually replaces it with a photo); JPEG/PNG originals keep
    // working as the `src` fallback.
    return /\.(jpe?g|png|webp)$/i.test(entry.name) ? [full] : [];
  });
}

/** Public URL for a file under `public/`. */
const toUrl = (file) => `/${path.relative(path.join(ROOT, "public"), file).split(path.sep).join("/")}`;

/**
 * Pick the ladder for one image: drop widths the source cannot fill, then drop
 * neighbours that add no real choice (800 and 900 would be the same image).
 */
async function ladderFor(file, widths = WIDTHS) {
  const { width } = await sharp(file).metadata();
  const capped = widths.filter((w) => w <= width);
  if (!capped.length || width / capped[capped.length - 1] >= MIN_STEP * 1.05) capped.push(width);
  return capped.filter((w, index) => index === 0 || w / capped[index - 1] >= MIN_STEP);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const files = walk(SOURCE_DIR).filter((file) => !SKIP.has(path.basename(file)));
  const images = {};
  let written = 0;
  let reused = 0;

  const kept = new Set();

  for (const file of files) {
    const url = toUrl(file);
    const stem = path.relative(SOURCE_DIR, file).replace(/\.(jpe?g|png|webp)$/i, "").split(path.sep).join("-");
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
    const override = OVERRIDES[path.basename(file)];
    const widths = await ladderFor(file, override?.widths);
    const quality = override?.quality ?? QUALITY;
    const { width, height } = await sharp(file).metadata();
    const candidates = [];

    for (const target of widths) {
      const out = path.join(OUTPUT_DIR, `${stem}-${target}.${hash}.webp`);
      kept.add(path.basename(out));
      const fresh = existsSync(out) && statSync(out).mtimeMs >= statSync(file).mtimeMs;
      if (force || !fresh) {
        await sharp(file)
          .rotate()
          .resize({ width: target, withoutEnlargement: true })
          .webp({ quality, effort: 5 })
          .toFile(out);
        written += 1;
      } else {
        reused += 1;
      }
      candidates.push(`${toUrl(out)} ${target}w`);
    }

    images[url] = {
      width,
      height,
      quality,
      variants: [{ type: "image/webp", srcSet: candidates.join(", ") }],
    };
  }

  // Derivatives of replaced images are dead weight in the export; drop them so
  // `public/images/opt/` only ever contains files the manifest points at.
  let removed = 0;
  for (const name of readdirSync(OUTPUT_DIR)) {
    if (kept.has(name)) continue;
    rmSync(path.join(OUTPUT_DIR, name));
    removed += 1;
  }

  const manifest = { generator: "scripts/build-images.mjs", widths: WIDTHS, images };
  const serialised = `${JSON.stringify(manifest, null, 2)}\n`;
  const unchanged = existsSync(MANIFEST) && readFileSync(MANIFEST, "utf8") === serialised;
  if (!unchanged) writeFileSync(MANIFEST, serialised);

  console.log(
    `[images] ${files.length} sources → ${written} webp written, ${reused} reused, ${removed} stale removed` +
      `${unchanged ? "" : ", manifest updated"}`
  );
}

await main();
