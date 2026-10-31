/**
 * Draws the current `works.tv.screen` rectangle over the television artwork so
 * the glass position can be eyeballed, and prints the rectangle in pixels.
 *
 * The overlay is the *content's* percentage rect, not a guess: whatever
 * `src/portfolio/content/defaults.ts` says is exactly what the site will use,
 * so a red edge that sits on the photo's bezel is a bug you can see.
 *
 * Run:  node scripts/tv-glass.mjs [out.png]
 *   → default output /tmp/tv-glass-check.png
 *
 * Why not auto-detect: the tube is a dark, vignetted, grain-heavy region inside
 * a dark bezel — a threshold finds the bezel, and a "brightest rectangle"
 * search finds the asphalt. Measuring the four edges by hand on the native file
 * (row-wise luminance gradient, the tube's edge is the strongest |dL/dx| in that
 * band) takes a minute and cannot silently wander. This script is the check,
 * not the measurement.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentPath = path.join(root, "src/portfolio/content/defaults.ts");
const content = readFileSync(contentPath, "utf8");

const tv = content.match(/tv:\s*\{([\s\S]*?)\n      \}/);
if (!tv) {
  console.error("[tv-glass] could not find the `tv` block in defaults.ts");
  process.exit(1);
}
const block = tv[1];
// `works.tv` holds the artwork's intrinsic `width`/`height` *and* the
// `screen` rect, so the percentages must be read from `screen` only.
const screenBlock = block.match(/screen:\s*\{([^}]*)\}/)?.[1];
if (!screenBlock) throw new Error("[tv-glass] missing `screen` in works.tv");
const num = (key, source = screenBlock) => {
  const m = source.match(new RegExp(`${key}:\\s*([0-9.]+)`));
  if (!m) throw new Error(`[tv-glass] missing \`${key}\` in works.tv.screen`);
  return Number(m[1]);
};
// The check always draws on the *master* artwork (`assets/images/tv.webp`),
// not on `works.tv.src` (which now points at the generated cutout): the master
// is where the rect has to be measured.
const src = "assets/images/tv.webp";

const screen = {
  top: num("top"),
  left: num("left"),
  width: num("width"),
  height: num("height"),
};
const file = path.join(root, src);
const meta = await sharp(file).metadata();
const box = {
  x: Math.round((screen.left / 100) * meta.width),
  y: Math.round((screen.top / 100) * meta.height),
  w: Math.round((screen.width / 100) * meta.width),
  h: Math.round((screen.height / 100) * meta.height),
};

// HOLE_INSET / HOLE_RADIUS mirror scripts/tv-cutout.mjs: the hole that gets
// punched into the artwork is the screen rect inset by HOLE_INSET, so this
// overlay shows both boundaries — the layer rect (red) and the hole (cyan).
const HOLE_INSET = 15;
const HOLE_RADIUS = 30;
const hole = {
  x: box.x + HOLE_INSET,
  y: box.y + HOLE_INSET,
  w: box.w - HOLE_INSET * 2,
  h: box.h - HOLE_INSET * 2,
};

const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">
     <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"
           fill="none" stroke="#ff0044" stroke-width="6"/>
     <rect x="${hole.x}" y="${hole.y}" width="${hole.w}" height="${hole.h}" rx="${HOLE_RADIUS}"
           fill="none" stroke="#00ffcc" stroke-width="4" stroke-dasharray="18 12"/>
   </svg>`,
);

const out = process.argv[2] ?? "/tmp/tv-glass-check.png";
await sharp(file).composite([{ input: overlay, top: 0, left: 0 }]).png().toFile(out);

console.log(
  `[tv-glass] ${src} ${meta.width}x${meta.height}\n` +
    `[tv-glass] screen rect (red)  → x ${box.x}–${box.x + box.w}, y ${box.y}–${box.y + box.h} ` +
    `(${box.w}x${box.h}px)\n` +
    `[tv-glass] cutout hole (cyan) → x ${hole.x}–${hole.x + hole.w}, y ${hole.y}–${hole.y + hole.h} ` +
    `(${hole.w}x${hole.h}px)\n` +
    `[tv-glass] the cyan hole must cover the lit glass and land on the dark bezel;\n` +
    `[tv-glass] the red rect must stay larger than the hole on every side.\n` +
    `[tv-glass] overlay written to ${out}`,
);
