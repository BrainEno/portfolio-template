#!/usr/bin/env node
/**
 * Measures the real glass aperture of the television master photo, cuts it
 * out of the artwork, and derives the glass "light field" overlay.
 *
 *   assets/images/tv.webp              master artwork (never modified — replace
 *                                      it with your own photo, re-run this;
 *                                      kept out of `public/` so the export does
 *                                      not ship an unreferenced ~700 KB photo)
 *     → public/images/tv-cutout.webp    the artwork with a feathered hole where
 *                                      the glass is; this is what `works.tv.src`
 *                                      points at, and its alpha hole is the ONE
 *                                      true screen boundary (the photo's own
 *                                      bezel masks the picture layer)
 *     → public/images/tv-glass-glow.webp  the box crop of the master turned into
 *                                      a mid-grey-normalised light field (peach/
 *                                      green cast, highlight blobs, edge vignette)
 *     → src/portfolio/content/tv-tube.json  measured geometry (aperture + layer
 *                                      box + per-side outsets), imported by
 *                                      ui/sections.tsx to position .tv-screen
 *
 * How the aperture is found (measured, not guessed): flood fill from the seed
 * rect centre at luminance > GLOW_THRESHOLD. The glass includes dark unlit
 * edges (the photo's tube is lit only in the middle — a high threshold misses
 * the dark green flanks and leaves exactly the "gap strip" that reads as a
 * pasted rectangle). The blob's per-row / per-column profiles become the hole
 * shape, grown outward by a per-side outset. The outset is capped by the
 * "dark seam budget" of each side: the distance from the glass edge to the
 * first bright (chrome / hairline) pixel, so the hole can never eat the
 * chrome edge on the tight right side (~4 px) while it may use ~20 px on the
 * roomy left.
 *
 * Layers on the page (bottom → top): .tv-screen (picture, sized to `box`) sits
 * UNDER .tv-frame (the cutout artwork), so the hole edge lands inside the dark
 * seam and the visible boundary is always the photo's own bezel. `box` is the
 * aperture grown by BLEED on every side — deliberately larger than the hole,
 * so the picture always underlaps the bezel and no seam can ever open at any
 * zoom or rotation. `aperture` (also mirrored into `works.tv.screen` in
 * defaults.ts) stays the zoom centre (--screen-cx/cy) and the CSS fallback.
 *
 * Run:  node scripts/tv-tube.mjs [--in assets/images/tv.webp] [--out …]
 * Wired into `predev` / `prebuild`; `npm run tv-glass` draws aperture / hole /
 * box on the master for eyeballing. All outputs are deterministic for a given
 * master (json is only rewritten when it changes).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const MASTER = path.resolve(root, arg("in", "assets/images/tv.webp"));
const CUTOUT = path.resolve(root, arg("out", "public/images/tv-cutout.webp"));
const GLOW = path.resolve(root, arg("glow", "public/images/tv-glass-glow.webp"));
const JSON_OUT = path.resolve(root, arg("json", "src/portfolio/content/tv-tube.json"));

/** Flood-fill threshold: above this a pixel belongs to the lit/dark glass. */
const GLOW_THRESHOLD = 24;
/** Pixels at/above this luminance are chrome, hairlines, cabinet — the hole
 *  must not reach them. */
const BRIGHT = 38;
/** Feather of the hole edge, sigma in master px — soft but never past the seam. */
const FEATHER = 1.5;
/** Layer box beyond the aperture, every side, in master px. Must be ≥ every
 *  outset + 2·FEATHER so the picture always underlaps the hole edge. */
const BLEED = 28;
/** Stay this far inside the dark-seam budget when growing the hole. */
const OUTSET_MARGIN = 4;
/** Hard cap for any side's outset. */
const OUTSET_CAP = 22;
/** Light-field blurs: keep the colour cast + vignette + blobs (σ≈24), drop the
 *  flat brightness and grain (σ≈120), renormalise around mid grey. */
const GLOW_KEEP = 24;
const GLOW_DROP = 120;
const GLOW_GAIN = 1.35;

// --- seed rect from works.tv.screen in defaults.ts (fallback + zoom centre)
const content = readFileSync(path.join(root, "src/portfolio/content/defaults.ts"), "utf8");
const tv = content.match(/tv:\s*\{([\s\S]*?)\n      \}/);
if (!tv) {
  console.error("[tv-tube] could not find the `tv` block in defaults.ts");
  process.exit(1);
}
const screenBlock = tv[1].match(/screen:\s*\{([^}]*)\}/)?.[1];
if (!screenBlock) throw new Error("[tv-tube] missing `screen` in works.tv.screen");
const num = (key) => {
  const m = screenBlock.match(new RegExp(`${key}:\\s*([0-9.]+)`));
  if (!m) throw new Error(`[tv-tube] missing \`${key}\` in works.tv.screen`);
  return Number(m[1]);
};
const screenPct = { top: num("top"), left: num("left"), width: num("width"), height: num("height") };

const masterBuf = readFileSync(MASTER);
const sourceHash = createHash("sha256").update(masterBuf).digest("hex").slice(0, 8);
const { data, info } = await sharp(masterBuf).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const CH = info.channels;
const lum = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const o = i * CH;
  lum[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
}

// --- flood fill the glass from the seed centre
const seedX = Math.round(((screenPct.left + screenPct.width / 2) / 100) * W);
const seedY = Math.round(((screenPct.top + screenPct.height / 2) / 100) * H);
const seen = new Uint8Array(W * H);
const stack = [[seedX, seedY]];
seen[seedY * W + seedX] = 1;
let minX = W, maxX = -1, minY = H, maxY = -1, count = 0;
const rowL = new Map(), rowR = new Map(), colT = new Map(), colB = new Map();
while (stack.length) {
  const [x, y] = stack.pop();
  count++;
  if (x < minX) minX = x;
  if (x > maxX) maxX = x;
  if (y < minY) minY = y;
  if (y > maxY) maxY = y;
  if (!rowL.has(y) || x < rowL.get(y)) rowL.set(y, x);
  if (!rowR.has(y) || x > rowR.get(y)) rowR.set(y, x);
  if (!colT.has(x) || y < colT.get(x)) colT.set(x, y);
  if (!colB.has(x) || y > colB.get(x)) colB.set(x, y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const id = ny * W + nx;
    if (!seen[id] && lum[id] > GLOW_THRESHOLD) {
      seen[id] = 1;
      stack.push([nx, ny]);
    }
  }
}

// Fallback: if the flood did not find a sane glass blob (photo swapped and the
// seed rect is stale), use the seed rect itself as the aperture.
let aperture;
if (count < 2000 || (maxX - minX) * (maxY - minY) > 0.25 * W * H) {
  console.warn("[tv-tube] flood fill found no sane glass blob — falling back to the works.tv.screen rect");
  aperture = {
    x: Math.round((screenPct.left / 100) * W),
    y: Math.round((screenPct.top / 100) * H),
    w: Math.round((screenPct.width / 100) * W),
    h: Math.round((screenPct.height / 100) * H),
  };
  rowL.clear(); rowR.clear(); colT.clear(); colB.clear();
  for (let y = aperture.y; y <= aperture.y + aperture.h; y++) { rowL.set(y, aperture.x); rowR.set(y, aperture.x + aperture.w); }
  for (let x = aperture.x; x <= aperture.x + aperture.w; x++) { colT.set(x, aperture.y); colB.set(x, aperture.y + aperture.h); }
  minX = aperture.x; maxX = aperture.x + aperture.w; minY = aperture.y; maxY = aperture.y + aperture.h;
} else {
  aperture = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// --- dark-seam budget per side: distance from the glass edge to the first
//     bright pixel, sampled along the edge; use p10 so corner outliers and
//     the tightest scanline decide.
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const scan = (getEdge, horizontal, dir) => {
  const out = [];
  if (horizontal) {
    for (let y = minY + 6; y <= maxY - 6; y += 2) {
      const v = getEdge(y);
      let d = 1;
      if (dir < 0) { let x = v - 1; while (x > 0 && lum[y * W + x] < BRIGHT) { x--; d++; } }
      else { let x = v + 1; while (x < W - 1 && lum[y * W + x] < BRIGHT) { x++; d++; } }
      out.push(d);
    }
  } else {
    for (let x = minX + 6; x <= maxX - 6; x += 2) {
      const v = getEdge(x);
      let d = 1;
      if (dir < 0) { let y = v - 1; while (y > 0 && lum[y * W + x] < BRIGHT) { y--; d++; } }
      else { let y = v + 1; while (y < H - 1 && lum[y * W + x] < BRIGHT) { y++; d++; } }
      out.push(d);
    }
  }
  return out;
};
const budgetP10 = {
  l: pct(scan((y) => rowL.get(y), true, -1), 0.1),
  r: pct(scan((y) => rowR.get(y), true, 1), 0.1),
  t: pct(scan((x) => colT.get(x), false, -1), 0.1),
  b: pct(scan((x) => colB.get(x), false, 1), 0.1),
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const outset = {
  l: clamp(budgetP10.l - OUTSET_MARGIN, 1, OUTSET_CAP),
  r: clamp(budgetP10.r - OUTSET_MARGIN, 1, OUTSET_CAP),
  t: clamp(budgetP10.t - OUTSET_MARGIN, 1, OUTSET_CAP),
  b: clamp(budgetP10.b - OUTSET_MARGIN, 1, OUTSET_CAP),
};
const box = {
  x: Math.max(0, aperture.x - BLEED),
  y: Math.max(0, aperture.y - BLEED),
  w: Math.min(W, aperture.x + aperture.w + BLEED) - Math.max(0, aperture.x - BLEED),
  h: Math.min(H, aperture.y + aperture.h + BLEED) - Math.max(0, aperture.y - BLEED),
};

// --- hole mask: UNION of the row-grown band and the column-grown band (the
// blob itself is inside both). An intersection (row band ∩ column band) is
// wrong: along the bowed left edge some columns are only reached by a thin
// flood-fill tendril, so their colT/colB span just a few rows and every row
// outside that span was left uncut — a thin opaque WALL inside the hole,
// visible at zoom as a jagged strip of cabinet inside the screen edge.
// Union keeps every flank pixel grown by its own side's outset. Profiles are
// lightly smoothed first so flood-fill jaggies don't become edge waviness.
const smooth = (map) => {
  const keys = [...map.keys()].sort((a, b) => a - b);
  const out = new Map();
  for (const k of keys) {
    let s = 0, n = 0;
    for (let d = -2; d <= 2; d++) {
      const v = map.get(k + d);
      if (v !== undefined) { s += v; n++; }
    }
    out.set(k, Math.round(s / n));
  }
  return out;
};
const rowLs = smooth(rowL), rowRs = smooth(rowR), colTs = smooth(colT), colBs = smooth(colB);
// Danger zone: bright pixels (chrome / hairlines outside the glass) dilated by
// 2·FEATHER — the hole edge feather spreads ±~2σ, so the mask must stop this
// far from any bright pixel or the blurred edge would shave the chrome.
const R_DANGER = Math.ceil(2 * FEATHER);
const danger = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  if (seen[i] || lum[i] < BRIGHT) continue;
  const x = i % W, y = (i / W) | 0;
  for (let dy = -R_DANGER; dy <= R_DANGER; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= H) continue;
    for (let dx = -R_DANGER; dx <= R_DANGER; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < W) danger[yy * W + xx] = 1;
    }
  }
}
const mask = new Uint8Array(W * H);
let brightInHole = 0;
let maxHoleLum = 0;
const mark = (x, y) => {
  if (danger[y * W + x]) return;
  mask[y * W + x] = 255;
  // guard: the grown hole must never reach chrome / hairlines (lum ≥ BRIGHT)
  if (!seen[y * W + x]) {
    const l = lum[y * W + x];
    if (l >= BRIGHT) brightInHole++;
    if (l > maxHoleLum) maxHoleLum = l;
  }
};
for (let y = minY; y <= maxY; y++) {
  const l = Math.max(0, rowLs.get(y) - outset.l);
  const r = Math.min(W - 1, rowRs.get(y) + outset.r);
  for (let x = l; x <= r; x++) mark(x, y);
}
for (let x = minX; x <= maxX; x++) {
  const t = Math.max(0, colTs.get(x) - outset.t);
  const b = Math.min(H - 1, colBs.get(x) + outset.b);
  for (let y = t; y <= b; y++) mark(x, y);
}
if (brightInHole > 0) {
  console.warn(
    `[tv-tube] WARNING: ${brightInHole} bright (≥${BRIGHT}) pixels inside the grown hole ` +
      `(max ${maxHoleLum.toFixed(0)}) — the outset is eating the chrome edge; lower OUTSET_MARGIN/CAP`
  );
}
// NOTE: sharp reads 1-channel raw input as all-zero — build the mask as RGB
// (grey repeated), blur, then move channel 0 into the alpha channel.
const maskRgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  maskRgb[i * 3] = mask[i];
  maskRgb[i * 3 + 1] = mask[i];
  maskRgb[i * 3 + 2] = mask[i];
}
const gray = await sharp(maskRgb, { raw: { width: W, height: H, channels: 3 } })
  .blur(FEATHER)
  .raw()
  .toBuffer();
const maskRgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  maskRgba[i * 4] = 255;
  maskRgba[i * 4 + 1] = 255;
  maskRgba[i * 4 + 2] = 255;
  maskRgba[i * 4 + 3] = gray[i * 3];
}
const maskPng = await sharp(maskRgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

// --- 1. cutout artwork with the feathered hole
await sharp(masterBuf)
  .ensureAlpha()
  .composite([{ input: maskPng, blend: "dest-out" }])
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(CUTOUT);

// --- 2. light field from the box crop (mid-grey-normalised high pass)
const cropRaw = async (blur) =>
  sharp(masterBuf)
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .blur(blur)
    .raw()
    .toBuffer({ resolveWithObject: true });
const keep = await cropRaw(GLOW_KEEP);
const drop = await cropRaw(GLOW_DROP);
const base = await sharp(masterBuf)
  .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
  .raw()
  .toBuffer({ resolveWithObject: true });
const cch = base.info.channels;
const glowBuf = Buffer.alloc(base.data.length);
for (let i = 0; i < base.data.length; i += cch) {
  for (let c = 0; c < 3; c++) {
    const v = 128 + GLOW_GAIN * (keep.data[i + c] - drop.data[i + c]);
    glowBuf[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  glowBuf[i + 3] = 255;
}
await sharp(glowBuf, { raw: { width: box.w, height: box.h, channels: cch } })
  .webp({ quality: 95, effort: 6 })
  .toFile(GLOW);

// --- 3. geometry json for the page
const pctOf = (r) => ({
  left: +((r.x / W) * 100).toFixed(2),
  top: +((r.y / H) * 100).toFixed(2),
  width: +((r.w / W) * 100).toFixed(2),
  height: +((r.h / H) * 100).toFixed(2),
});
const geo = {
  generator: "scripts/tv-tube.mjs",
  sourceHash,
  master: "assets/images/tv.webp",
  aperture: { ...aperture, ...pctOf(aperture) },
  box: { ...box, ...pctOf(box) },
  outset,
  budgetP10,
  feather: FEATHER,
  bleed: BLEED,
  note: "aperture = measured glass opening (also mirrored in works.tv.screen, used as zoom centre); box = layer rect for .tv-screen/.tv-number-layer; hole = aperture grown by outset, feathered. Regenerate with `npm run tv-tube` after replacing the master photo.",
};
const serialized = `${JSON.stringify(geo, null, 2)}\n`;
if (!existsSync(JSON_OUT) || readFileSync(JSON_OUT, "utf8") !== serialized) writeFileSync(JSON_OUT, serialized);

console.log(
  `[tv-tube] ${path.relative(root, MASTER)} ${W}x${H} (sourceHash ${sourceHash})\n` +
    `[tv-tube] aperture (glass) → x ${aperture.x}–${aperture.x + aperture.w}, y ${aperture.y}–${aperture.y + aperture.h} ` +
    `(${aperture.w}x${aperture.h}px) = screen { top: ${pctOf(aperture).top}, left: ${pctOf(aperture).left}, width: ${pctOf(aperture).width}, height: ${pctOf(aperture).height} }\n` +
    `[tv-tube] seam budget p10   → l ${budgetP10.l} r ${budgetP10.r} t ${budgetP10.t} b ${budgetP10.b} px\n` +
    `[tv-tube] hole outset        → l ${outset.l} r ${outset.r} t ${outset.t} b ${outset.b} px (feather ${FEATHER})\n` +
    `[tv-tube] layer box          → x ${box.x}–${box.x + box.w}, y ${box.y}–${box.y + box.h} (${box.w}x${box.h}px) = ` +
    `{ top: ${pctOf(box).top}, left: ${pctOf(box).left}, width: ${pctOf(box).width}, height: ${pctOf(box).height} }\n` +
    `[tv-tube] hole guard        → bright pixels in grown hole: ${brightInHole} (max lum ${maxHoleLum.toFixed(0)})\n` +
    `[tv-tube] wrote ${path.relative(root, CUTOUT)}, ${path.relative(root, GLOW)}, ${path.relative(root, JSON_OUT)}`
);
