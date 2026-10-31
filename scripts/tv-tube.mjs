/**
 * tv-tube — turns the television photograph into a *precise glass aperture*
 * and the layers that make the picture look like it lives inside the tube.
 *
 *   npm run tv-tube              # idempotent: skips when inputs are unchanged
 *   npm run tv-tube -- --force   # rewrite everything
 *   npm run tv-tube -- --qa      # + diagnostics and PNG previews in .qa/
 *   npm run tv-tube -- --write-override   # freeze the automatic fit into
 *                                           scripts/tv-tube.override.json
 *
 * Why the old approach looked "cut out and pasted":
 *   – the picture was clipped by a hand-drawn rectangle that sat ~12 px right
 *     of and ~9 px above the real glass (left sliver of photo glass, right edge
 *     on the chrome), and
 *   – nothing about the picture reacted to the tube it sits in.
 *
 * What this script produces (all derived from ONE analytic opening, so every
 * layer agrees with every other to a fraction of a pixel):
 *
 *   tube-mask    alpha, 2x photo resolution. Opening grown by `outset` per side
 *                (never past the dark-seam budget). Hidden under the bezel.
 *   tube-bezel   the photo's own pixels around the opening (box minus a hole),
 *                byte-identical to tv.webp, laid ON TOP of the picture. The
 *                picture may overlap it by a few px, so no seam is possible,
 *                and the visible edge is the photo's own bezel edge.
 *   tube-shade   multiplier (multiply): procedural edge/corner/top-lip falloff.
 *   tube-tint    low-frequency chroma of the photo's glass (multiply, weak).
 *   tube-reflect high-pass highlights of the photo's glass (screen).
 *   tube-ring    alpha ring for the spill layer: light thrown from the picture
 *                onto the dark seam and the inner lip (+ 3 % halation inside).
 *
 * Measuring the opening (no flood fill, no region growing):
 *   `rays` rays go from the glass centre outwards. A ray stops at the FIRST
 *   place the luma stays <= `gap` for `run` px — the dark seam between glass
 *   and chrome. It never walks on, so it cannot leak into the chrome or the
 *   wooden frame. Each edge is then fitted with a quadratic (the left edge
 *   bows outward ~12 px), corner radii by a 1-D search, giving an SDF.
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTv } from "./lib/read-tv.mjs";

const SCRIPT_VERSION = 5;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const QA = args.has("--qa");

const tv = readTv(root);
const T = tv.tube;
const SIDES = ["top", "right", "bottom", "left"];

const photoFile = path.join(root, "public", tv.src.replace(/^\//, ""));
const photoBytes = readFileSync(photoFile);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sourceHash = sha(photoBytes).slice(0, 12);

const overridePath = path.join(root, "scripts/tv-tube.override.json");
const overrides = existsSync(overridePath) ? JSON.parse(readFileSync(overridePath, "utf8")) : {};
// Keyed by the photo's hash: a replaced photo silently falls back to the automatic fit.
const override = overrides[sourceHash] ?? null;

const outDir = path.join(root, "public/images/tv-tube");
const jsonPath = path.join(root, "src/portfolio/content/tv-tube.json");
const inputHash = sha(JSON.stringify({ v: SCRIPT_VERSION, sourceHash, tube: T, screen: tv.screen, override })).slice(0, 12);

if (!args.has("--force") && !QA && !args.has("--write-override") && existsSync(jsonPath)) {
  const prev = JSON.parse(readFileSync(jsonPath, "utf8"));
  const files = Object.values(prev.files ?? {}).map((f) => path.join(root, "public", f.src));
  if (prev.inputHash === inputHash && files.length && files.every((f) => existsSync(f))) {
    console.log(`[tv-tube] up to date (source ${sourceHash}${override ? ", override" : ", auto fit"}) — nothing to do`);
    process.exit(0);
  }
}

const fail = (msg) => {
  console.error(`[tv-tube] ASSERTION FAILED: ${msg}`);
  process.exit(1);
};

/* ---------- pixels ------------------------------------------------------- */
const { data: rgb, info } = await sharp(photoBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
if (W !== tv.width || H !== tv.height) fail(`${tv.src} is ${W}x${H}, defaults.ts says ${tv.width}x${tv.height}`);
const luma = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) luma[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
const clampI = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Bilinear luma. Coordinates are pixel *indices* (pixel centres at integers). No blur is applied. */
function lumaAt(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = clampI(x0, 0, W - 1);
  const xb = clampI(x0 + 1, 0, W - 1);
  const ya = clampI(y0, 0, H - 1);
  const yb = clampI(y0 + 1, 0, H - 1);
  return (
    luma[ya * W + xa] * (1 - fx) * (1 - fy) + luma[ya * W + xb] * fx * (1 - fy) +
    luma[yb * W + xa] * (1 - fx) * fy + luma[yb * W + xb] * fx * fy
  );
}
const smooth = (a, b, x) => {
  const t = clampI((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- 1. measure: inward scan --------------------------------------- */
const seed = {
  x: (tv.screen.left / 100) * W,
  y: (tv.screen.top / 100) * H,
  w: (tv.screen.width / 100) * W,
  h: (tv.screen.height / 100) * H,
};
const cx = seed.x + seed.w / 2;
const cy = seed.y + seed.h / 2;
const hw = seed.w / 2;
const hh = seed.h / 2;

const pts = [];
let misses = 0;
const need = Math.max(2, Math.round(T.run / T.step));
for (let k = 0; k < T.rays; k++) {
  const ang = (k / T.rays) * Math.PI * 2;
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const t = Math.min(hw / Math.max(Math.abs(cs), 1e-9), hh / Math.max(Math.abs(sn), 1e-9));
  const r0 = T.startFrac * t;
  const r1 = T.searchFrac * t + T.searchPad;
  let streak = 0;
  let found = -1;
  let prevL = lumaAt(cx + r0 * cs, cy + r0 * sn);
  let first = r0;
  for (let r = r0 + T.step; r <= r1; r += T.step) {
    const L = lumaAt(cx + r * cs, cy + r * sn);
    if (L <= T.gap) {
      if (streak === 0) {
        // Sub-pixel crossing of the `gap` level between the last bright and first dark sample.
        const frac = prevL > T.gap ? (prevL - T.gap) / Math.max(prevL - L, 1e-6) : 1;
        first = r - T.step + frac * T.step;
      }
      if (++streak >= need) {
        found = first; // first *sustained* drop — we stop here, we never look for chrome
        break;
      }
    } else streak = 0;
    prevL = L;
  }
  if (found < 0) {
    misses++;
    continue;
  }
  pts.push({ x: cx + found * cs, y: cy + found * sn, ang, nx: (found * cs) / hw, ny: (found * sn) / hh });
}
if (pts.length < T.rays * 0.9) fail(`only ${pts.length}/${T.rays} rays found the dark seam — is works.tv.screen near the glass?`);

/* ---------- 2. fit edges and corners -------------------------------------- */
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < 3; r++) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let j = i + 1; j < 3; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}
/** value = pos + tilt*u + curve*u^2, robust (iterative outlier rejection). */
function fitQuadratic(samples) {
  let use = samples;
  let c = [0, 0, 0];
  for (let pass = 0; pass < 4; pass++) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const b = [0, 0, 0];
    for (const { u, v } of use) {
      const f = [1, u, u * u];
      for (let i = 0; i < 3; i++) {
        b[i] += f[i] * v;
        for (let j = 0; j < 3; j++) A[i][j] += f[i] * f[j];
      }
    }
    c = solve3(A, b);
    const keep = samples.filter(({ u, v }) => Math.abs(v - (c[0] + c[1] * u + c[2] * u * u)) <= T.fitRejectPx);
    if (keep.length === use.length || keep.length < 10) break;
    use = keep;
  }
  const rms = Math.sqrt(use.reduce((s, { u, v }) => s + (v - (c[0] + c[1] * u + c[2] * u * u)) ** 2, 0) / use.length);
  return { pos: c[0], tilt: c[1], curve: c[2], n: use.length, rms };
}

const bySide = { top: [], right: [], bottom: [], left: [] };
const byCorner = { tl: [], tr: [], br: [], bl: [] };
for (const p of pts) {
  if (Math.min(Math.abs(p.nx), Math.abs(p.ny)) > T.fitCorner) {
    byCorner[(p.ny < 0 ? "t" : "b") + (p.nx < 0 ? "l" : "r")].push(p);
    continue;
  }
  if (Math.abs(p.nx) >= Math.abs(p.ny)) bySide[p.nx > 0 ? "right" : "left"].push({ u: p.ny, v: p.x });
  else bySide[p.ny > 0 ? "bottom" : "top"].push({ u: p.nx, v: p.y });
}
const autoEdges = {};
for (const side of SIDES) autoEdges[side] = fitQuadratic(bySide[side]);

/* ---------- 3. analytic signed distance field ------------------------------ */
const makeShape = (edges, radius, off) => ({ edges, radius, off });
/**
 * < 0 inside the opening, > 0 outside, in photo px (≈ Euclidean). Four curved
 * sides joined by rounded corners; `off` grows each side outward independently.
 */
function sdf(shape, x, y) {
  const { edges: e, radius: rad, off } = shape;
  const ux = (x - cx) / hw;
  const uy = (y - cy) / hh;
  const xr = e.right.pos + off.right + (e.right.tilt + e.right.curve * uy) * uy;
  const xl = e.left.pos - off.left + (e.left.tilt + e.left.curve * uy) * uy;
  const yt = e.top.pos - off.top + (e.top.tilt + e.top.curve * ux) * ux;
  const yb = e.bottom.pos + off.bottom + (e.bottom.tilt + e.bottom.curve * ux) * ux;
  const sr = (e.right.tilt + 2 * e.right.curve * uy) / hh;
  const sl = (e.left.tilt + 2 * e.left.curve * uy) / hh;
  const st = (e.top.tilt + 2 * e.top.curve * ux) / hw;
  const sb = (e.bottom.tilt + 2 * e.bottom.curve * ux) / hw;
  const right = x >= cx;
  const low = y >= cy;
  const a = right ? (x - xr) / Math.hypot(1, sr) : (xl - x) / Math.hypot(1, sl);
  const b = low ? (y - yb) / Math.hypot(1, sb) : (yt - y) / Math.hypot(1, st);
  const q = rad[(low ? "b" : "t") + (right ? "r" : "l")] + (off[right ? "right" : "left"] + off[low ? "bottom" : "top"]) / 2;
  return Math.hypot(Math.max(a + q, 0), Math.max(b + q, 0)) + Math.min(Math.max(a + q, b + q), 0) - q;
}
const zeroOff = { top: 0, right: 0, bottom: 0, left: 0 };

// Corner radii: 1-D search per corner over the corner rays.
const autoRadius = {};
for (const key of Object.keys(byCorner)) {
  let best = { r: 20, cost: Infinity };
  for (let r = 4; r <= 70; r += 0.5) {
    const shape = makeShape(autoEdges, { tl: r, tr: r, br: r, bl: r }, zeroOff);
    const cost = byCorner[key].reduce((s, p) => s + sdf(shape, p.x, p.y) ** 2, 0);
    if (cost < best.cost) best = { r, cost };
  }
  autoRadius[key] = best.r;
}

const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
const roundEdges = (e) =>
  Object.fromEntries(SIDES.map((s) => [s, { pos: round(e[s].pos), tilt: round(e[s].tilt), curve: round(e[s].curve) }]));

// An override entry (keyed by the photo hash) wins over the automatic fit.
const edges = override?.edges ?? roundEdges(autoEdges);
const radius = override?.radius ?? autoRadius;
const outset = override?.outset ?? T.outset;
const reflectRois = override?.reflectRois ?? [];
const glass = makeShape(edges, radius, zeroOff);
const maskShape = makeShape(edges, radius, outset);
const holeOff = Object.fromEntries(SIDES.map((s) => [s, outset[s] - T.holeMargin]));
const holeShape = makeShape(edges, radius, holeOff);

if (args.has("--write-override")) {
  overrides[sourceHash] = {
    note: "Frozen automatic fit of public/images/tv.webp, keyed by its hash. Edit to hand-tune; delete the entry to return to the automatic fit. reflectRois lists the only places the photo's glass really reflects something.",
    edges: roundEdges(autoEdges),
    radius: autoRadius,
    outset: T.outset,
    reflectRois: reflectRois.length
      ? reflectRois
      : [
          { name: "street-lamp", x: 1201, y: 1069, rx: 17, ry: 15 },
          { name: "diagonal-bar", x: 1247, y: 1099, rx: 17, ry: 27 },
          { name: "right-green-bar", x: 1412, y: 1090, rx: 21, ry: 8 },
          { name: "left-line", x: 1112, y: 1101, rx: 14, ry: 6 },
        ],
  };
  writeFileSync(overridePath, JSON.stringify(overrides, null, 2) + "\n");
  console.log(`[tv-tube] wrote ${path.relative(root, overridePath)} for source ${sourceHash}`);
}

/** Trace the zero level set as a polygon (for debug overlays and bounds), in continuous photo coordinates. */
function outline(shape, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    let lo = 0;
    let hi = Math.max(hw, hh) * 1.6;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (sdf(shape, cx + mid * cs, cy + mid * sn) < 0) lo = mid;
      else hi = mid;
    }
    out.push([cx + lo * cs + 0.5, cy + lo * sn + 0.5]);
  }
  return out;
}
const bounds = (poly) => ({
  x0: Math.min(...poly.map((p) => p[0])),
  x1: Math.max(...poly.map((p) => p[0])),
  y0: Math.min(...poly.map((p) => p[1])),
  y1: Math.max(...poly.map((p) => p[1])),
});
const glassOutline = outline(glass, 128);
const maskOutline = outline(maskShape, 128);
const holeOutline = outline(holeShape, 128);
const gb = bounds(glassOutline);
const mb = bounds(maskOutline);

/* ---------- 4. assertions ---------------------------------------------------- */
const residuals = pts.map((p) => sdf(glass, p.x, p.y));
const rms = Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / residuals.length);
const worst = Math.max(...residuals.map(Math.abs));
if (QA) console.log(`[tv-tube:qa] per-edge fit  ${SIDES.map((s) => `${s} n=${autoEdges[s].n}/${bySide[s].length} rms ${autoEdges[s].rms.toFixed(2)}`).join(" · ")}  corner rays ${Object.entries(byCorner).map(([k, v]) => `${k}:${v.length}`).join(" ")}`);
if (!override && rms > 1.5) fail(`edge fit rms ${rms.toFixed(2)} px > 1.5 px`);

for (const s of SIDES) if (outset[s] > T.budget[s]) fail(`outset.${s}=${outset[s]} exceeds the seam budget ${T.budget[s]} px`);

// Measured seam: from each contour point walk outward to the first chrome-bright pixel.
const measuredSeam = Object.fromEntries(SIDES.map((s) => [s, Infinity]));
for (const p of pts) {
  if (Math.min(Math.abs(p.nx), Math.abs(p.ny)) > T.fitCorner) continue;
  const cs = Math.cos(p.ang);
  const sn = Math.sin(p.ang);
  const horizontal = Math.abs(p.nx) >= Math.abs(p.ny);
  const side = horizontal ? (p.nx > 0 ? "right" : "left") : p.ny > 0 ? "bottom" : "top";
  for (let d = 0; d <= 60; d += 0.5) {
    if (lumaAt(p.x + d * cs, p.y + d * sn) >= T.chrome) {
      measuredSeam[side] = Math.min(measuredSeam[side], d * Math.abs(horizontal ? cs : sn));
      break;
    }
  }
}
for (const s of SIDES) {
  const reach = outset[s] + T.feather / 2;
  if (reach > measuredSeam[s] - 0.25) {
    fail(`${s}: outset ${outset[s]} + feather/2 reaches ${reach.toFixed(2)} px but chrome starts ${measuredSeam[s].toFixed(2)} px from the glass`);
  }
}

/* ---------- 5. box + grids ---------------------------------------------------- */
if (T.pad < 20) fail("pad must be >= 20 so the bezel keeps >= 20 px outside the opening");
const bx0 = Math.floor(Math.min(gb.x0, mb.x0)) - T.pad;
const by0 = Math.floor(Math.min(gb.y0, mb.y0)) - T.pad;
const bx1 = Math.ceil(Math.max(gb.x1, mb.x1)) + T.pad;
const by1 = Math.ceil(Math.max(gb.y1, mb.y1)) + T.pad;
const bw = bx1 - bx0;
const bh = by1 - by0;
const glassH = gb.y1 - gb.y0;

/** Evaluate fn(photoX, photoY) at `res` samples per photo px over the box (index coordinates). */
function grid(res, fn) {
  const w = bw * res;
  const h = bh * res;
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) out[j * w + i] = fn(bx0 + (i + 0.5) / res - 0.5, by0 + (j + 0.5) / res - 0.5);
  }
  return { w, h, a: out };
}
function downsample({ w, h, a }, f) {
  const ow = w / f;
  const oh = h / f;
  const out = new Float32Array(ow * oh);
  for (let j = 0; j < oh; j++) {
    for (let i = 0; i < ow; i++) {
      let s = 0;
      for (let v = 0; v < f; v++) for (let u = 0; u < f; u++) s += a[(j * f + v) * w + i * f + u];
      out[j * ow + i] = s / (f * f);
    }
  }
  return { w: ow, h: oh, a: out };
}
function resample({ w, h, a }, ow, oh) {
  const out = new Float32Array(ow * oh);
  for (let j = 0; j < oh; j++) {
    const y = ((j + 0.5) / oh) * h - 0.5;
    for (let i = 0; i < ow; i++) {
      const x = ((i + 0.5) / ow) * w - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const g = (xx, yy) => a[clampI(yy, 0, h - 1) * w + clampI(xx, 0, w - 1)];
      out[j * ow + i] =
        g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
    }
  }
  return { w: ow, h: oh, a: out };
}
function gauss(a, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[y * w + clampI(x + i, 0, w - 1)] * k[i + r];
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += tmp[clampI(y + i, 0, h - 1) * w + x] * k[i + r];
      out[y * w + x] = s;
    }
  }
  return out;
}
const boxPixel = (i, j) => ((by0 + j) * W + (bx0 + i)) * 3;

// 5a. screen mask — 4x supersampled, reduced to 2x.
const mask = downsample(grid(4, (x, y) => 1 - smooth(-T.feather / 2, T.feather / 2, sdf(maskShape, x, y))), 2);
for (let i = 0; i < mask.w; i++) {
  if (mask.a[i] > 0 || mask.a[(mask.h - 1) * mask.w + i] > 0) fail("mask alpha is not 0 on the top/bottom box edge");
}
for (let j = 0; j < mask.h; j++) {
  if (mask.a[j * mask.w] > 0 || mask.a[j * mask.w + mask.w - 1] > 0) fail("mask alpha is not 0 on the left/right box edge");
}
// Aperture = bounding box of everything the mask lets through.
let ax0 = mask.w, ax1 = -1, ay0 = mask.h, ay1 = -1;
for (let j = 0; j < mask.h; j++) {
  for (let i = 0; i < mask.w; i++) {
    if (mask.a[j * mask.w + i] > 0.004) {
      ax0 = Math.min(ax0, i); ax1 = Math.max(ax1, i); ay0 = Math.min(ay0, j); ay1 = Math.max(ay1, j);
    }
  }
}
const aperture = { x: bx0 + ax0 / 2, y: by0 + ay0 / 2, w: (ax1 - ax0 + 1) / 2, h: (ay1 - ay0 + 1) / 2 };

// 5b. "no chrome under the picture": every pixel the mask can show outside the real glass must be dark —
// unless it is a reflection that runs *continuously* out of the glass (the left horizontal line and the
// right green bar touch the edge in the photo). Chrome is bright AND separated from the glass by the seam,
// so a bright pixel fails only if the straight path back to the glass passes through a pixel <= `gap`.
function separatedFromGlass(px, py) {
  const dx = cx - px;
  const dy = cy - py;
  const n = Math.hypot(dx, dy);
  for (let d = 0.5; d < 40; d += 0.5) {
    const x = px + (dx / n) * d;
    const y = py + (dy / n) * d;
    if (sdf(glass, x, y) <= 0) return false;
    if (lumaAt(x, y) <= T.gap) return true;
  }
  return false;
}
let bandPixels = 0;
let bandMax = 0;
let touching = 0;
for (let j = 0; j < bh; j++) {
  for (let i = 0; i < bw; i++) {
    const px = bx0 + i;
    const py = by0 + j;
    if (sdf(glass, px, py) > 0 && sdf(maskShape, px, py) < T.feather / 2) {
      bandPixels++;
      const L = luma[py * W + px];
      if (L >= T.chrome) {
        if (separatedFromGlass(px, py)) {
          fail(`pixel (${px},${py}) has luma ${L.toFixed(0)} >= ${T.chrome} behind the seam inside the picture's outset band — chrome / a bright hairline would be covered`);
        }
        touching++; // a reflection continuing out of the glass, not chrome
      } else bandMax = Math.max(bandMax, L);
    }
  }
}

// 5c. bezel: the photo's own pixels, with a feathered hole whose edge lies in the seam.
const bezel = Buffer.alloc(bw * bh * 4);
let holePixels = 0;
for (let j = 0; j < bh; j++) {
  for (let i = 0; i < bw; i++) {
    const alpha = smooth(-T.holeFeather / 2, T.holeFeather / 2, sdf(holeShape, bx0 + i, by0 + j));
    const o = (j * bw + i) * 4;
    if (alpha > 0) {
      const p = boxPixel(i, j);
      bezel[o] = rgb[p]; bezel[o + 1] = rgb[p + 1]; bezel[o + 2] = rgb[p + 2];
    } else holePixels++;
    bezel[o + 3] = Math.round(alpha * 255);
  }
}

// 5d. shade T (multiply) — procedural, from the SDF only (no photo grain). <= 256 px.
const shadeScale = Math.min(1, 256 / Math.max(bw, bh));
const sw = Math.round(bw * shadeScale);
const sh = Math.round(bh * shadeScale);
const S = T.shade;
const cornerPts = [[gb.x0, gb.y0], [gb.x1, gb.y0], [gb.x0, gb.y1], [gb.x1, gb.y1]];
const topEdgeY = (x) => edges.top.pos + (edges.top.tilt + edges.top.curve * ((x - cx) / hw)) * ((x - cx) / hw);
const shadeGrid = new Float32Array(sw * sh);
for (let j = 0; j < sh; j++) {
  for (let i = 0; i < sw; i++) {
    const x = bx0 + ((i + 0.5) / sw) * bw - 0.5;
    const y = by0 + ((j + 0.5) / sh) * bh - 0.5;
    const dIn = -sdf(glass, x, y);
    // Smooth darkening over the outer `band` of the glass height, hard black in the seam itself.
    let t = 1 - (1 - S.edge) * (1 - smooth(0, S.band * glassH, dIn));
    if (dIn < 0) t *= 1 - smooth(0, 1.5, -dIn);
    // Corners are the thickest part of the glass: an extra multiplier.
    const cornerness = Math.max(
      ...cornerPts.map(([px, py]) => Math.exp(-(((x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2) / (2 * (S.cornerReach * glassH) ** 2)))),
    );
    t *= 1 - (1 - S.corner) * cornerness;
    // Under the top lip of the bezel: the heaviest shadow.
    t *= 1 - S.topLip * (1 - smooth(0, S.topLipBand * glassH, y - topEdgeY(x)));
    const rn = Math.hypot((x - cx) / hw, (y - cy) / hh);
    t *= 1 - (S.vignette * Math.min(rn * rn, 1.4)) / 1.4;
    shadeGrid[j * sw + i] = clampI(t, 0, 1);
  }
}

// 5e. tint (multiply, weak): low-frequency CHROMA of the photo's glass, luminance-normalised.
const tintW = Math.round(bw * 0.4);
const tintH = Math.round(bh * 0.4);
const tintImg = (() => {
  const wgt = new Float32Array(bw * bh);
  const ch = [0, 1, 2].map(() => new Float32Array(bw * bh));
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const p = boxPixel(i, j);
      const m = smooth(3, 9, -sdf(glass, bx0 + i, by0 + j)); // glass pixels only
      const mx = Math.max(rgb[p], rgb[p + 1], rgb[p + 2], 1);
      // Colour / its own brightest channel: a dim green edge counts as much as a bright orange centre.
      for (let c = 0; c < 3; c++) ch[c][j * bw + i] = (rgb[p + c] / mx) * m;
      wgt[j * bw + i] = m;
    }
  }
  // Normalised convolution: blur(chroma·m) / blur(m) extends the glass colour smoothly past the opening.
  const wb = gauss(wgt, bw, bh, T.tint.sigma);
  const cb = ch.map((a) => gauss(a, bw, bh, T.tint.sigma));
  const out = [0, 1, 2].map(() => new Float32Array(bw * bh));
  for (let n = 0; n < bw * bh; n++) {
    const v = cb.map((a) => a[n] / Math.max(wb[n], 1e-4));
    const mx = Math.max(...v, 1e-4);
    for (let c = 0; c < 3; c++) out[c][n] = v[c] / mx;
  }
  return out.map((a) => resample({ w: bw, h: bh, a }, tintW, tintH).a);
})();

// 5f. reflect R (screen): high-pass highlights of the glass, inset >= 6 px, restricted to the listed ROIs.
const R = T.reflect;
const reflectImg = (() => {
  const out = [0, 1, 2].map(() => new Float32Array(bw * bh));
  for (let c = 0; c < 3; c++) {
    const plane = new Float32Array(bw * bh);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) plane[j * bw + i] = rgb[boxPixel(i, j) + c];
    const tight = gauss(plane, bw, bh, R.tight);
    const wide = gauss(plane, bw, bh, R.sigma);
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const x = bx0 + i;
        const y = by0 + j;
        // Inset from the opening: the glass's own edge ring is *not* a reflection.
        const inset = smooth(R.inset, R.inset + 4, -sdf(glass, x, y));
        let roi = 1;
        if (reflectRois.length) {
          roi = 0;
          for (const r of reflectRois) roi = Math.max(roi, 1 - smooth(1, 1.35, Math.hypot((x - r.x) / r.rx, (y - r.y) / r.ry)));
        }
        const hp = tight[j * bw + i] - wide[j * bw + i];
        out[c][j * bw + i] = clampI(((hp - R.threshold) * R.gain) / 255, 0, 1) * inset * roi;
      }
    }
  }
  return out;
})();

// 5g. ring (spill + halation): alpha only.
const G = T.ring;
const ringImg = (() => {
  const lb = new Float32Array(bw * bh);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) lb[j * bw + i] = luma[(by0 + j) * W + bx0 + i];
  const blurred = gauss(lb, bw, bh, 2);
  const out = new Float32Array(bw * bh);
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const d = sdf(glass, bx0 + i, by0 + j);
      // Only the dark seam and the dark inner lip may receive light — never chrome or wood.
      const dark = 1 - smooth(G.darkLo, G.darkHi, blurred[j * bw + i]);
      const fall = (1 - smooth(0, G.band * glassH, Math.max(d, 0))) ** 2;
      const spill = G.peak * fall * dark * smooth(-2, 0, d);
      // Inside the glass: a faint halation, fading in over the first 3 px.
      const halation = G.halation * smooth(0, -3, d);
      out[j * bw + i] = Math.max(halation, spill);
    }
  }
  return out;
})();

/* ---------- 6. write ------------------------------------------------------------ */
mkdirSync(outDir, { recursive: true });
async function emit(name, ext, image) {
  const buf = await image;
  const file = `tube-${name}.${sha(buf).slice(0, 8)}.${ext}`;
  writeFileSync(path.join(outDir, file), buf);
  return { file, bytes: buf.length };
}
const to8 = (v) => Math.round(clampI(v, 0, 1) * 255);
function gray(w, h, a) {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) buf[i] = to8(a[i]);
  return sharp(buf, { raw: { width: w, height: h, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
}
function whiteAlpha(w, h, a) {
  const buf = Buffer.alloc(w * h * 4, 255);
  for (let i = 0; i < w * h; i++) buf[i * 4 + 3] = to8(a[i]);
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}
function color(w, h, planes) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) buf[i * 3 + c] = to8(planes[c][i]);
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
}

const results = {
  mask: await emit("mask", "png", whiteAlpha(mask.w, mask.h, mask.a)),
  shade: await emit("shade", "png", gray(sw, sh, shadeGrid)),
  tint: await emit("tint", "png", color(tintW, tintH, tintImg)),
  reflect: await emit("reflect", "png", color(bw, bh, reflectImg)),
  ring: await emit("ring", "png", whiteAlpha(bw, bh, ringImg)),
  bezel: await emit("bezel", "webp", sharp(bezel, { raw: { width: bw, height: bh, channels: 4 } }).webp({ lossless: true, effort: 6, exact: true }).toBuffer()),
};
const dims = { mask: [mask.w, mask.h], shade: [sw, sh], tint: [tintW, tintH], reflect: [bw, bh], ring: [bw, bh], bezel: [bw, bh] };
const keep = new Set(Object.values(results).map((r) => r.file));
for (const name of readdirSync(outDir)) if (/^tube-/.test(name) && !keep.has(name)) rmSync(path.join(outDir, name));

const pct = (v, total) => round((v / total) * 100, 4);
const manifest = {
  generator: "scripts/tv-tube.mjs",
  version: SCRIPT_VERSION,
  sourceHash,
  inputHash,
  mode: override ? "override" : "auto",
  photo: { src: tv.src, width: W, height: H },
  // Every layer of the tube lives in this rectangle (opening + padding).
  box: { x: bx0, y: by0, w: bw, h: bh, top: pct(by0, H), left: pct(bx0, W), width: pct(bw, W), height: pct(bh, H) },
  // The picture's bounding box (mask > 0) as percentages of `box`: raster children are positioned against it.
  aperture: {
    x: aperture.x, y: aperture.y, w: aperture.w, h: aperture.h,
    top: pct(aperture.y - by0, bh), left: pct(aperture.x - bx0, bw), width: pct(aperture.w, bw), height: pct(aperture.h, bh),
  },
  glass: { bounds: { x0: round(gb.x0, 2), x1: round(gb.x1, 2), y0: round(gb.y0, 2), y1: round(gb.y1, 2) }, edges, radius },
  outset,
  seam: Object.fromEntries(SIDES.map((s) => [s, round(measuredSeam[s], 2)])),
  stats: { rays: pts.length, misses, rmsPx: round(rms, 2), worstPx: round(worst, 2), bandPixels, bandMaxLuma: round(bandMax, 1), bandReflectionPixels: touching, holePixels },
  files: Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, { src: `/images/tv-tube/${v.file}`, width: dims[k][0], height: dims[k][1], bytes: v.bytes }]),
  ),
  outline: {
    glass: glassOutline.map(([x, y]) => [round(x, 1), round(y, 1)]),
    mask: maskOutline.map(([x, y]) => [round(x, 1), round(y, 1)]),
    hole: holeOutline.map(([x, y]) => [round(x, 1), round(y, 1)]),
  },
};
writeFileSync(jsonPath, JSON.stringify(manifest, null, 2) + "\n");

const f1 = (v) => v.toFixed(1);
console.log(`[tv-tube] source ${sourceHash} (${override ? "override" : "automatic fit"}) · ${pts.length}/${T.rays} rays`);
console.log(`[tv-tube] glass  x ${f1(gb.x0)}–${f1(gb.x1)}  y ${f1(gb.y0)}–${f1(gb.y1)}  (${(gb.x1 - gb.x0).toFixed(0)}×${(gb.y1 - gb.y0).toFixed(0)})   fit rms ${rms.toFixed(2)} px, worst ${worst.toFixed(2)} px`);
console.log(`[tv-tube] mask   x ${f1(mb.x0)}–${f1(mb.x1)}  y ${f1(mb.y0)}–${f1(mb.y1)}   outset ${SIDES.map((s) => `${s} ${outset[s]}`).join(" · ")}`);
console.log(`[tv-tube] seam to chrome  ${SIDES.map((s) => `${s} ${f1(measuredSeam[s])}`).join(" · ")}  (budget ${SIDES.map((s) => `${s} ${T.budget[s]}`).join(" · ")})`);
console.log(`[tv-tube] band check: ${bandPixels} px in the outset band, brightest non-reflection luma ${f1(bandMax)} < ${T.chrome}, ${touching} px are reflections continuous with the glass, 0 behind the seam ✓   box ${bw}×${bh} @ (${bx0},${by0})`);
console.log(`[tv-tube] radii ${Object.entries(radius).map(([k, v]) => `${k} ${(+v).toFixed(1)}`).join(" · ")}`);
console.log(`[tv-tube] edges ${SIDES.map((s) => `${s}: pos ${edges[s].pos} tilt ${edges[s].tilt} curve ${edges[s].curve}`).join(" | ")}`);
console.log(`[tv-tube] wrote ${Object.entries(results).map(([k, v]) => `${k} ${(v.bytes / 1024).toFixed(1)}KB`).join(", ")}`);

/* ---------- 7. QA ----------------------------------------------------------------- */
if (QA) {
  const qaDir = path.join(root, ".qa");
  mkdirSync(qaDir, { recursive: true });
  const pad = 40;
  const crop = { left: Math.max(0, bx0 - pad), top: Math.max(0, by0 - pad), width: bw + pad * 2, height: bh + pad * 2 };
  const poly = (list, stroke) =>
    `<polygon points="${list.map(([x, y]) => `${(x - crop.left).toFixed(1)},${(y - crop.top).toFixed(1)}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="0.8"/>`;
  const seedRect = `<rect x="${seed.x - crop.left}" y="${seed.y - crop.top}" width="${seed.w}" height="${seed.h}" fill="none" stroke="#2a6bff" stroke-width="0.8"/>`;
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width}" height="${crop.height}">${seedRect}${poly(glassOutline, "#ff2a2a")}${poly(maskOutline, "#ffe600")}${poly(holeOutline, "#00ffa0")}</svg>`,
  );
  const overlay = await sharp(svg, { density: 72 * 4 }).resize({ width: crop.width * 4 }).png().toBuffer();
  await sharp(photoBytes)
    .extract(crop)
    .resize({ width: crop.width * 4, kernel: "nearest" })
    .composite([{ input: overlay }])
    .png()
    .toFile(path.join(qaDir, "tv-tube-outline.png"));
  console.log("[tv-tube:qa] .qa/tv-tube-outline.png   red = measured glass · yellow = mask edge · green = bezel hole · blue = seed rectangle");

  // The legacy rectangle (43.45 / 57.18 / 12.9688 / 15.8781 %) against the measured glass.
  const legacy = { x: 0.4345 * W, y: 0.5718 * H, w: 0.129688 * W, h: 0.158781 * H };
  const dL = legacy.x - gb.x0;
  const dR = legacy.x + legacy.w - gb.x1;
  const dT = legacy.y - gb.y0;
  const dB = legacy.y + legacy.h - gb.y1;
  console.log(`[tv-tube:qa] LEGACY rect vs glass: left ${dL.toFixed(1)} px (${dL > 0 ? "photo glass left uncovered" : "ok"}), right ${dR.toFixed(1)} px (chrome starts ${f1(measuredSeam.right)} px beyond the glass → ${Math.max(0, dR - measuredSeam.right).toFixed(1)} px of chrome covered), top ${dT.toFixed(1)} px, bottom ${dB.toFixed(1)} px`);
  console.log(`[tv-tube:qa] current seed vs glass: left ${(seed.x - gb.x0).toFixed(1)} · right ${(seed.x + seed.w - gb.x1).toFixed(1)} · top ${(seed.y - gb.y0).toFixed(1)} · bottom ${(seed.y + seed.h - gb.y1).toFixed(1)} px`);

  // Contact sheet of the derived layers (alpha shown over mid grey).
  const cell = { w: bw * 2, h: bh * 2 };
  const names = ["mask", "shade", "tint", "reflect", "ring", "bezel"];
  const composites = [];
  for (let i = 0; i < names.length; i++) {
    const buf = await sharp(path.join(outDir, results[names[i]].file))
      .resize({ width: cell.w, height: cell.h, fit: "fill", kernel: "nearest" })
      .flatten({ background: { r: 100, g: 100, b: 100 } })
      .png()
      .toBuffer();
    composites.push({ input: buf, left: (i % 3) * (cell.w + 8), top: Math.floor(i / 3) * (cell.h + 8) });
  }
  await sharp({ create: { width: 3 * (cell.w + 8), height: 2 * (cell.h + 8), channels: 3, background: { r: 30, g: 30, b: 30 } } })
    .composite(composites)
    .png()
    .toFile(path.join(qaDir, "tv-tube-layers.png"));
  console.log("[tv-tube:qa] .qa/tv-tube-layers.png   mask · shade · tint / reflect · ring · bezel");
}
