#!/usr/bin/env node
/**
 * Cuts the CRT glass out of the television artwork and derives the glass
 * "light field" overlay from it.
 *
 *   assets/images/tv.webp            master artwork (never modified — replace it
 *                                    with your own photo, then re-run this;
 *                                    kept out of `public/` so the export does
 *                                    not ship an unreferenced 700 KB photo)
 *     → public/images/tv-cutout.webp  the artwork with a feathered, rounded
 *                                    hole where the glass is; this is what
 *                                    `works.tv.src` points at
 *     → public/images/tv-glass-glow.webp  the screen-rect crop of the master,
 *                                    turned into a mid-grey-normalised light
 *                                    field (peach/green cast, highlight blobs,
 *                                    edge vignette) blended OVER the injected
 *                                    picture so it picks up the scene's light
 *
 * Why a hole instead of an SVG clip-path on the overlay: a clip-path is a
 * second, hand-measured copy of the glass opening, and any drift between the
 * two is exactly the "pasted rectangle" ring around the screen. Cutting the
 * hole into the artwork makes the photo's own bezel the boundary — the picture
 * can never misalign with it, at any zoom or rotation, because both live in
 * the same image. The overlay layer (`works.tv.screen`) only has to be larger
 * than the hole, so it always underlaps the bezel.
 *
 * Geometry comes from ONE place — `works.tv.screen` in
 * `src/portfolio/content/defaults.ts` (percentages of the artwork). Measure it
 * with `npm run tv-glass`, which draws the rect and the derived hole on the
 * master photo. The hole is the screen rect inset by HOLE_INSET px on every
 * side, so its edge lands on the bezel, never on the glass itself.
 *
 * Run:  node scripts/tv-cutout.mjs [--in assets/images/tv.webp] [--out …]
 * It is wired into `predev` / `prebuild`, so a normal `npm run dev` / build
 * regenerates both outputs automatically after the photo or the rect changes.
 */
import sharp from "sharp";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const MASTER = path.resolve(root, arg("in", "assets/images/tv.webp"));
const CUTOUT = path.resolve(root, arg("out", "public/images/tv-cutout.webp"));
const GLOW = path.resolve(root, arg("glow", "public/images/tv-glass-glow.webp"));

/** Hole edge sits this many source-px inside the screen rect → on the bezel. */
const HOLE_INSET = 15;
/** Corner radius of the hole, in source px (the tube corners are rounded). */
const HOLE_RADIUS = 30;
/** Feather of the hole edge, in source px — kills the hard cut line. */
const HOLE_FEATHER = 5;
/** Blur radii for the light field: keeps the colour cast + vignette + blobs,
 *  drops the flat brightness and the sensor grain. */
const GLOW_KEEP = 24;
const GLOW_DROP = 120;
/** Contrast of the light field around mid-grey. */
const GLOW_GAIN = 1.35;

// --- read works.tv.screen from defaults.ts (same parse as scripts/tv-glass.mjs)
const content = readFileSync(path.join(root, "src/portfolio/content/defaults.ts"), "utf8");
const tv = content.match(/tv:\s*\{([\s\S]*?)\n      \}/);
if (!tv) {
  console.error("[tv-cutout] could not find the `tv` block in defaults.ts");
  process.exit(1);
}
const screenBlock = tv[1].match(/screen:\s*\{([^}]*)\}/)?.[1];
if (!screenBlock) throw new Error("[tv-cutout] missing `screen` in works.tv");
const num = (key) => {
  const m = screenBlock.match(new RegExp(`${key}:\\s*([0-9.]+)`));
  if (!m) throw new Error(`[tv-cutout] missing \`${key}\` in works.tv.screen`);
  return Number(m[1]);
};
const screen = { top: num("top"), left: num("left"), width: num("width"), height: num("height") };

const meta = await sharp(MASTER).metadata();
const W = meta.width;
const H = meta.height;
const rect = {
  x: Math.round((screen.left / 100) * W),
  y: Math.round((screen.top / 100) * H),
  w: Math.round((screen.width / 100) * W),
  h: Math.round((screen.height / 100) * H),
};
const hole = {
  x: rect.x + HOLE_INSET,
  y: rect.y + HOLE_INSET,
  w: rect.w - HOLE_INSET * 2,
  h: rect.h - HOLE_INSET * 2,
};

// --- 1. cutout: master artwork + feathered rounded-rect hole (alpha)
const maskSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect x="${hole.x}" y="${hole.y}" width="${hole.w}" height="${hole.h}" rx="${HOLE_RADIUS}" fill="#ffffff"/>` +
    `</svg>`
);
const mask = await sharp(maskSvg).blur(HOLE_FEATHER).png().toBuffer();
// `dest-out` removes the master where the mask is opaque → the hole.
await sharp(MASTER)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-out" }])
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(CUTOUT);

// --- 2. light field: screen-rect crop, mid-grey-normalised high pass
const crop = await sharp(MASTER)
  .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const keep = await sharp(MASTER)
  .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
  .blur(GLOW_KEEP)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const drop = await sharp(MASTER)
  .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
  .blur(GLOW_DROP)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const ch = crop.info.channels;
const out = Buffer.alloc(crop.data.length);
for (let i = 0; i < crop.data.length; i += ch) {
  for (let c = 0; c < 3; c++) {
    const v = 128 + GLOW_GAIN * (keep.data[i + c] - drop.data[i + c]);
    out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  out[i + 3] = 255;
}
await sharp(out, { raw: { width: rect.w, height: rect.h, channels: ch } })
  .webp({ quality: 95, effort: 6 })
  .toFile(GLOW);

const fresh =
  existsSync(CUTOUT) &&
  existsSync(GLOW) &&
  statSync(CUTOUT).mtimeMs >= statSync(MASTER).mtimeMs &&
  statSync(GLOW).mtimeMs >= statSync(MASTER).mtimeMs;
console.log(
  `[tv-cutout] ${path.relative(root, MASTER)} ${W}x${H}\n` +
    `[tv-cutout] screen rect → x ${rect.x}–${rect.x + rect.w}, y ${rect.y}–${rect.y + rect.h} (${rect.w}x${rect.h}px)\n` +
    `[tv-cutout] hole        → x ${hole.x}–${hole.x + hole.w}, y ${hole.y}–${hole.y + hole.h} ` +
    `(${hole.w}x${hole.h}px, r=${HOLE_RADIUS}, feather=${HOLE_FEATHER})\n` +
    `[tv-cutout] wrote ${path.relative(root, CUTOUT)} and ${path.relative(root, GLOW)}${fresh ? "" : " (regenerated)"}`
);
