#!/usr/bin/env node
/**
 * Derive the CRT tube from the television artwork itself.
 *
 *   npm run tv-tube             # regenerate when stale
 *   npm run tv-tube -- --force  # rewrite every derivative
 *   npm run tv-tube -- --qa     # also write .qa/tv-tube.png to eyeball the result
 *
 * `.tv-screen` layers the project picture *above* `tv.webp` (see portfolio.css),
 * so everything that makes it read as being behind glass has to be rebuilt from
 * the photograph:
 *
 * 1. **Aperture** (`aperture-*.webp`) — where the glass actually is. The
 *    rectangle in `works.tv.screen` is only a seed: the script segments the
 *    photo (the tube is the one large lit region there), takes the connected
 *    blob around the seed's centre — which is the glass, including the bright
 *    rim a CRT has just outside its phosphor — and turns that silhouette into an
 *    alpha mask. A mask that follows the real glass cannot leave the strip of
 *    bezel the eye reads as "picture pasted on", and it fades out *on the bezel*
 *    rather than inside the glass: a fade inside would show the photo's green
 *    phosphor at half strength all the way round, the same tell in another
 *    colour.
 * 2. **Shade** (`shade-*.webp`) — the glass's own shading as a multiply layer:
 *    the vignette, the dark rim under the bezel lip, the corner falloff. It is a
 *    *local* ratio (blur 2 / blur 22), so it keeps the tube's real falloff and
 *    ignores the fact that the photo's phosphor is brighter on one side.
 * 3. **Glint** (`glint-*.webp`) — the specular highlight and the reflected
 *    street light already sitting on that glass, lifted out and screened back
 *    over the picture. A reflection that does not move when the channel changes
 *    is the strongest single cue that the picture is behind glass.
 * 4. **Scanlines** (`scanlines-*.webp`) — the raster, bowing with the tube (a
 *    parabola in x), so the frame reads as curved glass rather than a flat plane
 *    behind a rectangular hole.
 *
 * All four are crops of the same box, so they cannot drift out of alignment.
 * `content/tv-tube.json` records that box (percentages of the artwork) and the
 * four URLs; `ui/sections.tsx` feeds them into CSS custom properties and
 * `ui/TvShowreel.tsx` uses the mask for the channel change.
 *
 * `works.tv.tube` tunes the segmentation:
 *
 * - `glow`    — luminance at which a pixel counts as lit glass rather than bezel.
 *               The script raises it automatically if the blob would leak out of
 *               the tube.
 * - `feather` — width of the fade past the glass edge, in % of the seed's width.
 * - `grow`    — pixels the silhouette is grown by, in % of the seed's width, so
 *               the bright rim and the edge's anti-aliasing are covered too.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "src/portfolio/content/defaults.ts");
const OUTPUT_DIR = path.join(ROOT, "public/images/tv-tube");
const MANIFEST = path.join(ROOT, "src/portfolio/content/tv-tube.json");
const QA_FILE = path.join(ROOT, ".qa/tv-tube.png");

/** Fallbacks for anything `works.tv.tube` does not set. */
const DEFAULTS = { glow: 20, feather: 2.4, grow: 1.2 };
/** Thresholds tried in order until the segmented blob stops leaking out of the tube. */
const GLOW_LADDER = [12, 16, 20, 26, 32, 40, 50, 62];
/** Photo pixels between raster lines, and how much of the frame they take. */
const SCANLINE_PERIOD = 3.2;
const SCANLINE_OPACITY = 0.3;
/** How far the raster bows at the left/right edge, as a fraction of height. */
const SCANLINE_BOW = 0.02;

/* ------------------------------------------------------------------ input */

/** Pull the `works.tv` numbers out of the authored defaults. */
function readTv() {
  const source = readFileSync(CONTENT, "utf8");
  const block = source.match(/tv:\s*\{([\s\S]*?)\n    \}/)?.[1];
  if (!block) throw new Error("[tv-tube] could not find the `tv` block in defaults.ts");
  const num = (key, text = block) => {
    const hit = text.match(new RegExp(`${key}:\\s*(-?[0-9.]+)`));
    if (!hit) throw new Error(`[tv-tube] missing \`${key}\` in works.tv`);
    return Number(hit[1]);
  };
  const screen = block.match(/screen:\s*\{([^}]*)\}/)?.[1];
  const tube = block.match(/tube:\s*\{([^}]*)\}/)?.[1] ?? "";
  const src = block.match(/src:\s*"([^"]+)"/)?.[1];
  if (!src || !screen) throw new Error("[tv-tube] works.tv needs `src` and `screen`");
  const optional = (key) => (new RegExp(`${key}:`).test(tube) ? num(key, tube) : DEFAULTS[key]);
  return {
    src,
    screen: {
      top: num("top", screen),
      left: num("left", screen),
      width: num("width", screen),
      height: num("height", screen),
    },
    tube: { glow: optional("glow"), feather: optional("feather"), grow: optional("grow") },
  };
}

/* --------------------------------------------------------------- helpers */

/** 0 → 1 ramp with a smooth middle. */
function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Box blur of a float plane: one horizontal pass, one vertical. */
function boxBlur(plane, width, height, radius) {
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const r = Math.max(1, Math.round(radius));
  const n = 2 * r + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = -r; x <= r; x += 1) sum += plane[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / n;
      sum += plane[row + Math.min(width - 1, x + r + 1)] - plane[row + Math.min(width - 1, Math.max(0, x - r))];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / n;
      sum += tmp[Math.min(height - 1, y + r + 1) * width + x] - tmp[Math.min(height - 1, Math.max(0, y - r)) * width + x];
    }
  }
  return out;
}

/**
 * Majority filter on a byte mask: a pixel flips when most of its 3×3
 * neighbourhood disagrees. One pass removes the single-pixel specks and pinholes
 * that grain puts on a segmentation boundary, which is all the smoothing a mask
 * edge needs — a distance-based fade takes care of the rest.
 */
function despeckle(mask, width, height) {
  const out = Uint8Array.from(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) count += mask[(y + dy) * width + (x + dx)];
      const i = y * width + x;
      out[i] = count >= 6 ? 1 : count <= 3 ? 0 : mask[i];
    }
  }
  return out;
}

/**
 * Two-pass chamfer distance (3-4 metric ≈ Euclidean) from the nearest pixel of
 * `target`, capped at `max` so a wide-open background does not cost precision.
 * Returns a Float32Array of distances in pixels.
 */
function distanceTo(mask, width, height, target, max) {
  const far = max + 2;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) dist[i] = mask[i] === target ? 0 : far;
  const relax = (i, j, w) => {
    const candidate = dist[j] + w;
    if (candidate < dist[i]) dist[i] = candidate;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (dist[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) {
        relax(i, i - width, 1);
        if (x > 0) relax(i, i - width - 1, 1.414);
        if (x < width - 1) relax(i, i - width + 1, 1.414);
      }
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (dist[i] === 0) continue;
      if (x < width - 1) relax(i, i + 1, 1);
      if (y < height - 1) {
        relax(i, i + width, 1);
        if (x < width - 1) relax(i, i + width + 1, 1.414);
        if (x > 0) relax(i, i + width - 1, 1.414);
      }
    }
  }
  for (let i = 0; i < dist.length; i += 1) dist[i] = Math.min(dist[i], max);
  return dist;
}

/* ----------------------------------------------------------------- build */

export async function buildTvTube({ force = false, quiet = false } = {}) {
  const tv = readTv();
  const file = path.join(ROOT, "public", tv.src.replace(/^\//, ""));
  const meta = await sharp(file).metadata();
  const sourceHash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
  const W = meta.width;
  const H = meta.height;

  const seed = {
    left: (tv.screen.left / 100) * W,
    top: (tv.screen.top / 100) * H,
    width: (tv.screen.width / 100) * W,
    height: (tv.screen.height / 100) * H,
  };
  seed.right = seed.left + seed.width;
  seed.bottom = seed.top + seed.height;
  const midX = Math.round(seed.left + seed.width / 2);
  const midY = Math.round(seed.top + seed.height / 2);

  const { data: rgb } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = 3;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    const o = i * channels;
    lum[i] = 0.2126 * rgb[o] + 0.7152 * rgb[o + 1] + 0.0722 * rgb[o + 2];
  }
  // A 1 px blur is enough to keep the grain in the glass from punching holes in
  // a threshold, and small enough not to move the edge.
  const soft = boxBlur(lum, W, H, 1);

  const feather = Math.max(1.5, (tv.tube.feather / 100) * seed.width);
  const grow = Math.max(0, (tv.tube.grow / 100) * seed.width);

  /* --------------------------------------------------------- segmentation */

  /**
   * The tube is the one large lit region in the photograph, so "lit pixels
   * connected to the middle of the glass" is the glass — including the bright
   * rim a CRT has just outside its phosphor, which is exactly the strip that
   * makes an injected picture look pasted on when it is left showing.
   *
   * The search is confined to a box a little larger than the seed; if the blob
   * reaches that box the threshold was too low and the fill has leaked into the
   * cabinet, so the threshold goes up and the search starts again. That makes
   * the script survive a different photo without babysitting.
   */
  const region = {
    left: Math.max(0, Math.round(seed.left - seed.width * 0.16)),
    top: Math.max(0, Math.round(seed.top - seed.height * 0.16)),
  };
  region.right = Math.min(W - 1, Math.round(seed.right + seed.width * 0.16));
  region.bottom = Math.min(H - 1, Math.round(seed.bottom + seed.height * 0.16));
  const rw = region.right - region.left + 1;
  const rh = region.bottom - region.top + 1;

  const flood = (glow) => {
    const lit = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y += 1) {
      const row = (y + region.top) * W + region.left;
      for (let x = 0; x < rw; x += 1) lit[y * rw + x] = soft[row + x] >= glow ? 1 : 0;
    }
    const sx = midX - region.left;
    const sy = midY - region.top;
    if (!lit[sy * rw + sx]) return null;
    const blob = new Uint8Array(rw * rh);
    const queue = new Int32Array(rw * rh);
    let head = 0;
    let tail = 0;
    queue[tail += 1] = sy * rw + sx;
    blob[sy * rw + sx] = 1;
    let touchesEdge = false;
    while (head < tail) {
      const i = queue[head += 1];
      const x = i % rw;
      const y = (i - x) / rw;
      if (x === 0 || y === 0 || x === rw - 1 || y === rh - 1) touchesEdge = true;
      const push = (j) => {
        if (!blob[j] && lit[j]) {
          blob[j] = 1;
          queue[tail += 1] = j;
        }
      };
      if (x > 0) push(i - 1);
      if (x < rw - 1) push(i + 1);
      if (y > 0) push(i - rw);
      if (y < rh - 1) push(i + rw);
    }
    return { blob, touchesEdge };
  };

  let glow = tv.tube.glow;
  let found = flood(glow);
  for (const candidate of GLOW_LADDER) {
    if (candidate <= glow) continue;
    if (found && !found.touchesEdge) break;
    const next = flood(candidate);
    if (next) {
      glow = candidate;
      found = next;
    }
  }
  if (!found) throw new Error("[tv-tube] the seed rectangle is not on lit glass — check works.tv.screen");

  // Grow the silhouette so the rim's outer anti-aliasing is inside it, smooth the
  // boundary, then measure it: the box the mask is cropped to comes from the
  // silhouette itself, not from the seed, so an edge can never run off the crop.
  /**
   * The segmentation stops at the phosphor, but a CRT's glass keeps glowing a
   * little beyond it (a lit rim, then a hairline gap, then the black bezel), and
   * that rim is the strip that makes an injected picture look pasted on. So the
   * silhouette is grown out to where the photograph actually goes dark: walk
   * outward from the blob on every row and column until the bezel, and use the
   * median of those walks. A median rather than a per-row value because a trace
   * that follows every wobble reads as a torn edge; the shape that matters (the
   * curved corners) stays the segmentation's, only the offset is constant.
   */
  const walks = { left: [], right: [], top: [], bottom: [] };
  const bezel = 6;
  const walkFrom = (x, y, stepX, stepY, limit) => {
    let walked = 0;
    // Skip whatever of the blob is still under this scanline, then keep going
    // while the photograph is still lit (the rim, the haze around it).
    while (Math.abs(stepX ? x + stepX - midX : y + stepY - midY) < (stepX ? seed.width : seed.height)) {
      const bx = x - region.left;
      const by = y - region.top;
      const inBlob = bx >= 0 && by >= 0 && bx < rw && by < rh && found.blob[by * rw + bx];
      if (!inBlob && soft[y * W + x] < bezel) break;
      if (!inBlob) walked += 1;
      if (walked >= limit) break;
      x += stepX;
      y += stepY;
    }
    return walked;
  };
  for (let y = Math.max(0, Math.round(seed.top)); y <= Math.min(H - 1, seed.bottom); y += 2) {
    walks.left.push(walkFrom(midX, y, -1, 0, seed.width * 0.12));
    walks.right.push(walkFrom(midX, y, 1, 0, seed.width * 0.12));
  }
  for (let x = Math.max(0, Math.round(seed.left)); x <= Math.min(W - 1, seed.right); x += 2) {
    walks.top.push(walkFrom(x, midY, 0, -1, seed.height * 0.12));
    walks.bottom.push(walkFrom(x, midY, 0, 1, seed.height * 0.12));
  }
  /**
   * A high percentile, not the median: the seam is judged at its worst place, so
   * the growth has to cover the widest stretch of the photo's lit rim, not the
   * typical one. Overshooting costs a strip of black bezel (which the shading
   * layer already draws dark); undershooting leaves a pale band of photograph
   * around the injected frame, which is the failure this whole pass exists to
   * prevent.
   */
  const widest = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  };
  /**
   * Growth is per side, and it is a *closing* rather than a dilation: each row's
   * lit span and each column's lit span are extended by their own side's rim
   * depth, then intersected. A plain dilation with one radius under-covers the
   * side of the artwork where the glass's bright rim is widest — and whatever it
   * misses is exactly the band of photograph this is meant to hide. Because the
   * extension is measured from the segmentation's own curved outline, the corners
   * keep their shape and the long edges stay dead straight.
   */
  const growPx = {
    left: Math.round(widest(walks.left) + grow),
    right: Math.round(widest(walks.right) + grow),
    top: Math.round(widest(walks.top) + grow),
    bottom: Math.round(widest(walks.bottom) + grow),
  };

  /**
   * Silhouette bbox from the segmentation; everything after this is analytic.
   * A traced silhouette wobbles by a pixel or two (grain, dim shine) and a
   * wobbling edge reads as a torn sticker, so the shape that is actually used is
   * a *rounded rectangle* fitted to those four measured sides: dead-straight
   * edges, one honest corner radius. The bow a CRT face has is not reproduced —
   * at the corners it pinches inwards and leaves slivers of the photo's own
   * bright glass showing, which is precisely the gap this exists to remove.
   */
  let minX = rw;
  let maxX = 0;
  let minY = rh;
  let maxY = 0;
  for (let y = 0; y < rh; y += 1) {
    for (let x = 0; x < rw; x += 1) {
      if (!found.blob[y * rw + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bounds = {
    left: region.left + minX - growPx.left,
    top: region.top + minY - growPx.top,
    right: region.left + maxX + growPx.right,
    bottom: region.top + maxY + growPx.bottom,
  };
  const radius = Math.max(4, ((bounds.bottom - bounds.top) * (tv.tube.radius ?? 12)) / 100);

  const margin = Math.ceil(feather * 2) + 2;
  const crop = {
    left: Math.max(0, Math.floor(bounds.left - margin)),
    top: Math.max(0, Math.floor(bounds.top - margin)),
  };
  crop.width = Math.min(W - crop.left, Math.ceil(bounds.right - bounds.left + margin * 2));
  crop.height = Math.min(H - crop.top, Math.ceil(bounds.bottom - bounds.top + margin * 2));
  const cw = crop.width;
  const ch = crop.height;

  /* --------------------------------------------------------- the distance fields */

  /**
   * Signed distance to the aperture, in artwork pixels, positive inside — the
   * same shape CSS draws for `border-radius`, so the mask and the CSS fallback
   * agree and there is no corner for the picture to leak through.
   */
  const insideSdf = (x, y) => {
    const qx = Math.abs(x - (bounds.left + bounds.right) / 2) - ((bounds.right - bounds.left) / 2 - radius);
    const qy = Math.abs(y - (bounds.top + bounds.bottom) / 2) - ((bounds.bottom - bounds.top) / 2 - radius);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    return radius - (outside + Math.min(Math.max(qx, qy), 0));
  };

  const insideOut = new Uint8Array(cw * ch);
  const sdf = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const value = insideSdf(x + crop.left + 0.5, y + crop.top + 0.5);
      sdf[y * cw + x] = value;
      insideOut[y * cw + x] = value >= 0 ? 1 : 0;
    }
  }
  // "How far inside the glass am I" — the number the reflection pass needs, kept
  // clear of the edge where the photo's own bright rim lives.
  const edgeBand = Math.max(3, ((tv.tube.band ?? 6) / 100) * seed.width);
  const distIn = distanceTo(insideOut, cw, ch, 0, Math.ceil(edgeBand * 1.5) + 1);

  /* --------------------------------------------------------------- layers */

  const params = JSON.stringify({ seed, crop, glow, feather, grow, scan: [SCANLINE_PERIOD, SCANLINE_OPACITY, SCANLINE_BOW] });
  const hash = createHash("sha256").update(sourceHash).update(params).digest("hex").slice(0, 8);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputs = {
    mask: path.join(OUTPUT_DIR, `aperture-${hash}.webp`),
    shade: path.join(OUTPUT_DIR, `shade-${hash}.webp`),
    glint: path.join(OUTPUT_DIR, `glint-${hash}.webp`),
    scanlines: path.join(OUTPUT_DIR, `scanlines-${hash}.webp`),
  };
  const stale = (out) => !existsSync(out) || statSync(out).mtimeMs < statSync(file).mtimeMs;

  const boxLum = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) boxLum[y * cw + x] = lum[(y + crop.top) * W + (x + crop.left)];
  }
  const boxPixel = (x, y) => {
    const o = ((y + crop.top) * W + (x + crop.left)) * channels;
    return [rgb[o], rgb[o + 1], rgb[o + 2]];
  };

  /* 1 — aperture: white, alpha = how much of the picture shows. */
  {
    // Rendered at 2× so the tube can be scaled up without showing the mask's own
    // pixel grid; the ramp is a distance field, so it survives upsampling.
    const scale = 2;
    const mw = cw * scale;
    const mh = ch * scale;
    const rgba = Buffer.alloc(mw * mh * 4);
    for (let y = 0; y < mh; y += 1) {
      const sy = Math.min(ch - 1, Math.floor(y / scale));
      for (let x = 0; x < mw; x += 1) {
        const sx = Math.min(cw - 1, Math.floor(x / scale));
        const i = (y * mw + x) * 4;
        // Fully opaque inside the glass, gone `feather` pixels outside it: the
        // fade lands on the bezel, which is black. Fading inside the glass instead
        // would show the photograph's own (green) phosphor at half strength all
        // the way round — a halo, which is the same paste-on tell in another
        // colour.
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        rgba[i + 3] = Math.round(smoothstep(-feather, 0, sdf[sy * cw + sx]) * 255);
      }
    }
    if (force || stale(outputs.mask)) {
      await sharp(rgba, { raw: { width: mw, height: mh, channels: 4 } })
        .webp({ quality: 92, alphaQuality: 95, effort: 5 })
        .toFile(outputs.mask);
    }
  }

  /* 2 — shade: the glass's local darkening, as a multiply layer. */
  {
    const broad = boxBlur(boxLum, cw, ch, Math.max(5, seed.width * 0.06));
    const local = boxBlur(boxLum, cw, ch, Math.max(2, seed.width * 0.012));
    // Tight blur over wide blur: 1 on flat glass, below 1 where the glass falls
    // into shadow (the rim under the bezel, the corners). Normalising against the
    // tube's own plateau — not an absolute number — keeps the layer honest for a
    // dark or a bright artwork; the gamma keeps the photograph's depth without
    // flattening the picture that goes on top.
    const ratios = new Float32Array(cw * ch);
    const samples = [];
    for (let i = 0; i < cw * ch; i += 1) {
      ratios[i] = local[i] / Math.max(broad[i], 4);
      if (i % 7 === 0) samples.push(ratios[i]);
    }
    samples.sort((a, b) => a - b);
    const ceiling = Math.max(0.5, samples[Math.floor(samples.length * 0.5)] ?? 1);
    const rgba = Buffer.alloc(cw * ch * 4);
    for (let i = 0; i < cw * ch; i += 1) {
      const value = Math.round(255 * Math.min(1, Math.max(0.06, (ratios[i] / ceiling) ** 0.45)));
      rgba[i * 4] = value;
      rgba[i * 4 + 1] = value;
      rgba[i * 4 + 2] = value;
      rgba[i * 4 + 3] = 255;
    }
    if (force || stale(outputs.shade)) {
      await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } }).webp({ quality: 82, effort: 5 }).toFile(outputs.shade);
    }
  }

  /* 3 — glint: whatever the glass is reflecting, as a screen layer. */
  {
    const tight = boxBlur(boxLum, cw, ch, 2);
    const mid = boxBlur(boxLum, cw, ch, Math.max(4, seed.width * 0.04));
    const rgba = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const i = y * cw + x;
        // Well above its surroundings = a reflection, not the picture: the tube's
        // phosphor is smooth, highlights are not. Collecting anything near the
        // edge would lift the photo's lit rim and draw a glowing outline along the
        // seam instead — the exact artefact this pass exists to remove.
        const strength = Math.max(boxLum[i] - tight[i], boxLum[i] - mid[i]);
        const interior = 1 - smoothstep(edgeBand, edgeBand * 2.2, distIn[i]);
        const alpha = smoothstep(9, 32, strength) * interior;
        if (alpha <= 0.004) continue;
        const [r, g, b] = boxPixel(x, y);
        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = Math.round(alpha * 255);
      }
    }
    if (force || stale(outputs.glint)) {
      await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
        .webp({ quality: 86, alphaQuality: 90, effort: 5 })
        .toFile(outputs.glint);
    }
  }

  /* 4 — scanlines: the raster, bowing with the tube. */
  {
    const scale = 2;
    const sw = cw * scale;
    const sh = ch * scale;
    const rgba = Buffer.alloc(sw * sh * 4);
    for (let y = 0; y < sh; y += 1) {
      const ay = y / scale;
      for (let x = 0; x < sw; x += 1) {
        const nx = (x / scale + crop.left - seed.left) / seed.width;
        // A parabola in x: the raster dips towards the middle and rides up at the
        // edges — how a real tube's field reads through glass.
        const shift = SCANLINE_BOW * seed.height * (2 * nx - 1) ** 2;
        const phase = (ay + shift) / SCANLINE_PERIOD;
        const f = phase - Math.floor(phase);
        const coverage = Math.max(0, 1 - Math.abs(f - 0.5) / 0.34);
        if (coverage <= 0.002) continue;
        rgba[(y * sw + x) * 4 + 3] = Math.round(Math.min(1, coverage) * SCANLINE_OPACITY * 255);
      }
    }
    if (force || stale(outputs.scanlines)) {
      await sharp(rgba, { raw: { width: sw, height: sh, channels: 4 } })
        .webp({ quality: 78, alphaQuality: 92, effort: 5 })
        .toFile(outputs.scanlines);
    }
  }

  // Derivatives of a replaced artwork are dead weight; keep the folder honest.
  const keep = new Set(Object.values(outputs).map((p) => path.basename(p)));
  for (const name of readdirSync(OUTPUT_DIR)) if (!keep.has(name)) rmSync(path.join(OUTPUT_DIR, name), { force: true });

  const url = (p) => `/images/tv-tube/${path.basename(p)}`;
  const manifest = {
    generator: "scripts/tv-tube.mjs",
    source: tv.src,
    sourceHash,
    /**
     * The box `.tv-screen` is placed on — the segmented glass plus the fade — in
     * percent of the artwork. Everything below is a crop of it, so the four layers
     * cannot drift apart.
     */
    box: {
      top: (crop.top / H) * 100,
      left: (crop.left / W) * 100,
      width: (cw / W) * 100,
      height: (ch / H) * 100,
    },
    /** The seed rectangle, as fractions of that box (documentation / QA). */
    seed: {
      top: (seed.top - crop.top) / ch,
      left: (seed.left - crop.left) / cw,
      width: seed.width / cw,
      height: seed.height / ch,
    },
    mask: url(outputs.mask),
    shade: url(outputs.shade),
    glint: url(outputs.glint),
    scanlines: url(outputs.scanlines),
  };
  const serialised = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!existsSync(MANIFEST) || readFileSync(MANIFEST, "utf8") !== serialised) writeFileSync(MANIFEST, serialised);

  await writePreview({ file, crop, outputs, seed });
  if (!quiet) {
    const px = (v) => v.toFixed(1);
    console.log(
      `[tv-tube] ${tv.src} ${W}×${H} · glow ≥ ${glow} · glass ${px(maxX - minX + 1)}×${px(maxY - minY + 1)}px` +
        ` · grow L/R ${growPx.left}/${growPx.right} T/B ${growPx.top}/${growPx.bottom}px · box ${crop.left},${crop.top} ${cw}×${ch}`
    );
    console.log(`[tv-tube] wrote ${Object.values(outputs).map((p) => path.basename(p)).join(", ")}`);
  }
  return manifest;
}

/**
 * A look at the result: the artwork with the generated tube composited on it in
 * the same order the CSS stacks it. It goes to `.qa/` (ignored by git) — the
 * quality of the seam is a judgement call, so there is a picture to make it on.
 */
async function writePreview({ file, crop, outputs, seed }) {
  if (!(process.argv.includes("--qa") || process.env.TV_TUBE_QA === "1")) return;
  try {
    mkdirSync(path.dirname(QA_FILE), { recursive: true });
    const meta = await sharp(file).metadata();
    const pad = Math.round(seed.width * 0.45);
    const view = { left: Math.max(0, crop.left - pad), top: Math.max(0, crop.top - pad) };
    view.width = Math.min(meta.width - view.left, crop.width + pad * 2);
    view.height = Math.min(meta.height - view.top, crop.height + pad * 2);

    const test = await sharp(path.join(ROOT, "public/images/works/lyric-forge-ktv.jpg"))
      .resize(crop.width, crop.height, { fit: "cover" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    // The layers are generated at different supersampling factors (2× mask and
    // scanlines, 1× shading); bring them all to box size before stacking, or the
    // QA image shows a seam the browser would never show.
    const size = { fit: "fill" };
    const mask = await sharp(outputs.mask).resize(crop.width, crop.height, size).ensureAlpha().raw().toBuffer();
    const shade = await sharp(outputs.shade).resize(crop.width, crop.height, size).removeAlpha().raw().toBuffer();
    const glint = await sharp(outputs.glint).resize(crop.width, crop.height, size).ensureAlpha().raw().toBuffer();
    const scan = await sharp(outputs.scanlines).resize(crop.width, crop.height, size).ensureAlpha().raw().toBuffer();
    const composed = Buffer.alloc(crop.width * crop.height * 4);
    for (let i = 0; i < crop.width * crop.height; i += 1) {
      const shadeV = shade[i * 3] / 255;
      const scanA = (scan[i * 4 + 3] / 255) * 0.85;
      for (let c = 0; c < 3; c += 1) {
        // picture → × shade → × (1 − scanline) → screen the glint on top.
        const base = (test[i * 4 + c] / 255) * shadeV * (1 - scanA);
        const gl = (glint[i * 4 + c] / 255) * (glint[i * 4 + 3] / 255);
        composed[i * 4 + c] = Math.round(Math.min(1, 1 - (1 - base) * (1 - gl)) * 255);
      }
      composed[i * 4 + 3] = mask[i * 4 + 3];
    }
    const tube = await sharp(composed, { raw: { width: crop.width, height: crop.height, channels: 4 } }).png().toBuffer();
    await sharp(file)
      .extract({
        left: Math.round(view.left),
        top: Math.round(view.top),
        width: Math.round(view.width),
        height: Math.round(view.height),
      })
      .composite([{ input: tube, left: Math.round(crop.left - view.left), top: Math.round(crop.top - view.top) }])
      .toFile(QA_FILE);
    console.log(`[tv-tube] preview → ${path.relative(ROOT, QA_FILE)}`);
  } catch (error) {
    console.warn("[tv-tube] could not write the preview:", error.message);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildTvTube({ force: process.argv.includes("--force") });
}
