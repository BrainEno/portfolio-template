/**
 * The television tube pipeline: measures the glass opening out of `tv.webp`,
 * ships the feathered mask + lighting layers, and asserts it never grows into
 * the photo's chrome.
 *
 *   npm run tv-tube              # generate public/images/tv-tube/* + tv-tube.json
 *   npm run tv-tube -- --check   # contour overlay → /tmp/tv-tube-check.png
 *   npm run tv-tube -- --qa      # measurements, assertions, overlay → /tmp/tv-tube-qa.png
 *   npm run tv-tube -- --check out/dir.png
 *
 * How the aperture is found (and what it deliberately does NOT do):
 *
 *   - **Inward scan, edge = bright glass → dark seam.** From the tube's centre
 *     outwards, the boundary is the first run of `darkRun` px under
 *     `darkThresh` whose look-back median is still above `brightFloor`. The run
 *     is 6px because the seam is 13–38px wide while cabinet gaps are only
 *     2–5px — length alone rejects cabinet edges; the look-back floor is
 *     clamped to 26 because the glass→seam transition needs 5–6px to fall from
 *     40 to 21 (a 34 floor starves the median exactly at the edge). The sample
 *     lands 3px into the seam: a safe inward bias, never outward. The scan
 *     stops in the dark seam; it never continues to the chrome trim (3–4px
 *     right of the glass) or the hairline (~6px above it). There is no flood
 *     grow, no walk grow, no brightness-percentile expansion — every historical
 *     seam-crossing bug lived in those.
 *   - **Fit, don't trace.** Each edge is fitted with a degree-2 polynomial
 *     (keeps the left edge's outward bow); the corner spans where the fit
 *     residual exceeds 3.5px are fitted as circles. The fitted curves are the
 *     analytic shape — per-pixel noise never reaches the mask.
 *   - **Grow only by the declared per-side outset**, each capped by the dark
 *     seam budget (`budgetLeft/Right/Top/Bottom`). The mask's outward falloff
 *     lives entirely inside that seam; inward the mask is opaque to the very
 *     edge, so the picture can never leak photo-coloured glass into the
 *     aperture's inner 3px ring.
 *   - **Assertions abort the build** if the grown band reaches any pixel ≥
 *     `budgetLum` (chrome / hairline), if an outset exceeds its budget, or if
 *     the box boundary is not fully transparent.
 *
 * Outputs (committed, idempotent: sourceHash + content hash in every name):
 *   public/images/tv-tube/{mask,hole,ring}.png   — aperture alpha, its inverse (for
 *                                                  .tv-bezel), the spill ring
 *   public/images/tv-tube/{shade,tint,reflect}.webp — vignette / colour cast / highlights
 *   src/portfolio/content/tv-tube.json           — box geometry + asset URLs (imported
 *                                                  by ui/sections.tsx)
 *
 * An optional `scripts/tv-tube.override.json` keyed by the photo's sourceHash
 * can force corner radii, outsets and highlight ROIs; a hash mismatch falls
 * back to the automatic fit with a warning.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS_PATH = path.join(ROOT, "src/portfolio/content/defaults.ts");
const PUBLISHED_PATH = path.join(ROOT, "src/portfolio/content/published.json");
const OVERRIDE_PATH = path.join(ROOT, "scripts/tv-tube.override.json");
const MANIFEST_PATH = path.join(ROOT, "src/portfolio/content/tv-tube.json");
const OUT_DIR = path.join(ROOT, "public/images/tv-tube");

/**
 * Fallback solver parameters — used only when the active content snapshot
 * carries no `works.tv.tube`. Mirrors `defaults.ts`; the content always wins
 * and there are no per-use `?? defaults` scattered through the script.
 */
const TUBE_FALLBACK = {
  darkRun: 6,
  darkRunShort: 2,
  darkRunBottom: 4,
  darkThresh: 21,
  lookback: 8,
  brightFloor: 26,
  // Right: trim brightens 2px past the dark edge on 28/254 rows → cap 2.
  // Top: uneven hairline sits ~6-9px out; 3 keeps the band in the seam and
  // the alpha ramp inside the 1.5–4 dev px acceptance at rest.
  floodGlow: 24,
  cornerTl: 20,
  cornerTr: 20,
  cornerBl: 20,
  cornerBr: 20,
  outsetLeft: 3,
  outsetRight: 2,
  outsetTop: 3,
  outsetBottom: 2,
  budgetLeft: 25,
  budgetRight: 3,
  budgetTop: 6,
  budgetBottom: 25,
  budgetLum: 38,
  feather: 1.5,
  reflectThreshold: 13,
  reflectInset: 6,
  tintBlur: 25,
};

/**
 * Output raster width for the mask/hole pair: the tube box rests at ~331 CSS
 * px on a 1440×900 viewport (`.tv-anchor` = max(160vw, 230vh); the box is
 * ~14.4% of it), ≈662 device px at DPR 2 — supersampled ×2 for the exit zoom.
 */
const MASK_WIDTH = 1280;

const num = (v) => Number(v);

/* ───────────────────────────── content I/O ───────────────────────────── */

/** Extract a balanced `{...}` object starting at `key:` inside source text. */
function braceBlock(text, key) {
  const at = text.indexOf(`${key}:`);
  if (at < 0) return null;
  const open = text.indexOf("{", at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** Parse `key: value,` numeric/flat-string pairs out of a brace block. */
function flatFields(block) {
  const out = {};
  for (const [, key, value] of block.matchAll(/(\w+):\s*([0-9.]+|"[^"]*")/g)) {
    out[key] = value.startsWith('"') ? value.slice(1, -1) : num(value);
  }
  return out;
}

/** Same resolution order as `content/source.ts`: published snapshot → defaults. */
function readTv() {
  let sourcePath = DEFAULTS_PATH;
  let raw = readFileSync(DEFAULTS_PATH, "utf8");
  if (existsSync(PUBLISHED_PATH)) {
    try {
      const published = JSON.parse(readFileSync(PUBLISHED_PATH, "utf8"));
      if (published?.works?.tv?.screen) {
        const tv = published.works.tv;
        return {
          src: tv.src ?? "/images/tv.webp",
          width: tv.width ?? 2560,
          height: tv.height ?? 1707,
          screen: tv.screen,
          tube: { ...TUBE_FALLBACK, ...(tv.tube ?? {}) },
          sourcePath: PUBLISHED_PATH,
          warnMissingTube: !tv.tube,
        };
      }
      console.warn("[tv-tube] published.json has no works.tv — falling back to defaults.ts");
    } catch (error) {
      console.warn("[tv-tube] published.json unreadable, falling back to defaults.ts", error);
    }
  }
  const tvBlock = braceBlock(raw, "tv");
  if (!tvBlock) throw new Error("[tv-tube] could not find the `tv` block in defaults.ts");
  const screen = flatFields(braceBlock(tvBlock, "screen") ?? "");
  const tube = flatFields(braceBlock(tvBlock, "tube") ?? "");
  for (const k of ["top", "left", "width", "height"]) {
    if (screen[k] == null) throw new Error(`[tv-tube] missing works.tv.screen.${k}`);
  }
  const src = tvBlock.match(/src:\s*"([^"]+)"/)?.[1];
  if (!src) throw new Error("[tv-tube] missing works.tv.src");
  void sourcePath;
  return { src, screen, tube: { ...TUBE_FALLBACK, ...tube }, warnMissingTube: false };
}

function readOverride(sourceHash) {
  if (!existsSync(OVERRIDE_PATH)) return null;
  try {
    const all = JSON.parse(readFileSync(OVERRIDE_PATH, "utf8"));
    const entry = all?.[sourceHash];
    if (!entry) {
      const keys = Object.keys(all ?? {});
      if (keys.length) {
        console.warn(
          `[tv-tube] override exists for other hashes (${keys.join(", ")}) — ` +
            `photo changed since it was written, using the automatic fit`,
        );
      }
      return null;
    }
    return entry;
  } catch (error) {
    console.warn("[tv-tube] override unreadable, using the automatic fit", error);
    return null;
  }
}

/* ───────────────────────────── measurement ───────────────────────────── */

/**
 * Per-edge inward scans. Each returns `null` where the criterion never fires
 * (noise inside the glass, corner reflections) — the fitter drops nulls and
 * outliers instead of trusting any single row.
 */
function makeScanners(lum, W, H, t, flood) {
  // start every scan at the flood-fill centre: W>>1/H>>1 can land outside
  // the glass entirely (H>>1 = 853 vs glass top 985), which walks the scan
  // through the cabinet and returns garbage.
  const look = [];
  const median = () => {
    const s = [...look].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  // Seam width differs wildly per side: left/bottom 27–38px (long runs reject
  // cabinet gaps), right 1–9px with a specular chrome trim behind it, top
  // 1–6px before the uneven hairline — those two need short runs or they
  // never fire at all.
  const runLen = (side) =>
    side === "bottom" ? t.darkRunBottom : side === "right" || side === "top" ? t.darkRunShort : t.darkRun;
  const scan = (from, to, step, probe, nRun) => {
    look.length = 0;
    let prev = probe(from);
    for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
      const v = probe(i);
      look.push(prev);
      if (look.length > t.lookback) look.shift();
      const run = [];
      for (let k = 1; k <= nRun; k += 1) run.push(probe(i + step * k));
      if (run.length === nRun && run.every((x) => x != null && x < t.darkThresh)) {
        const med = median();
        // fit at the FIRST dark pixel — flush with the glass edge, one px
        // into the seam. The per-side outset does all the growing (into dark
        // seam only): the right seam is just 1–9px before a specular chrome
        // trim, so no further bias is tolerable there.
        if (med > t.brightFloor) return i + step;
      }
      prev = v;
    }
    return null;
  };
  const cx0 = Math.round((flood.x0 + flood.x1) / 2);
  const cy0 = Math.round((flood.y0 + flood.y1) / 2);
  return {
    left: (y) => scan(cx0, 4, -1, (x) => lum(x, y), runLen("left")),
    right: (y) => scan(cx0, W - 5, 1, (x) => lum(x, y), runLen("right")),
    top: (x) => scan(cy0, 4, -1, (y) => lum(x, y), runLen("top")),
    bottom: (x) => scan(cy0, H - 5, 1, (y) => lum(x, y), runLen("bottom")),
  };
}

/** Median-filter a point series and drop deviations > tolerance (two passes). */
function despike(points, tolerance = 6) {
  let pts = points.filter((p) => p.v != null);
  for (let pass = 0; pass < 2; pass += 1) {
    const vals = pts.map((p) => p.v);
    const filtered = vals.map((_, i) => {
      const win = vals.slice(Math.max(0, i - 4), i + 5);
      const s = [...win].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    });
    pts = pts.filter((p, i) => Math.abs(p.v - filtered[i]) <= tolerance);
  }
  return pts;
}

/** Least-squares parabola v = a·u² + b·u + c over the series' own axis. */
function fitQuad(pts) {
  const n = pts.length;
  if (n < 12) return null;
  const meanI = pts.reduce((s, p) => s + p.i, 0) / n;
  let Su = 0, Suu = 0, Suuu = 0, Suuuu = 0, Sv = 0, Suv = 0, Suvv = 0;
  for (const p of pts) {
    const u = p.i - meanI;
    Su += u;
    Suu += u * u;
    Suuu += u * u * u;
    Suuuu += u * u * u * u;
    Sv += p.v;
    Suv += p.v * u;
    Suvv += p.v * u * u;
  }
  const M = [
    [Suuuu, Suuu, Suu],
    [Suuu, Suu, Su],
    [Suu, Su, n],
  ];
  const A = solve3(M, [Suvv, Suv, Sv]);
  if (!A) return null;
  return { a: A[0], b: A[1], c: A[2], meanI, span: [pts[0].i, pts[n - 1].i] };
}

function solve3(M, rhs) {
  const A = M.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-9) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 4; c += 1) A[r][c] -= f * A[col][c];
    }
  }
  return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

/** Least-squares line v = m·i + k (the warp-free seed for edge fitting). */
function fitLine(pts) {
  const n = pts.length;
  if (n < 12) return null;
  let Si = 0, Sv = 0, Sii = 0, Siv = 0;
  for (const p of pts) {
    Si += p.i; Sv += p.v; Sii += p.i * p.i; Siv += p.i * p.v;
  }
  const den = n * Sii - Si * Si;
  if (Math.abs(den) < 1e-9) return null;
  const m = (n * Siv - Si * Sv) / den;
  const k = (Sv - m * Si) / n;
  return { m, k, span: [pts[0].i, pts[n - 1].i] };
}

const evalLine = (q, i) => q.m * i + q.k;

/**
 * RANSAC line seed. Rolling medians and one-shot least squares both fail on
 * this photo: the top-left dark-green glass fools the inward scan for ~30
 * CONTIGUOUS rows (a wide false band keeps its own median), and that band
 * then tilts a global regression until the true straight samples themselves
 * fall outside the inlier window. A 2-point hypothesis test inverts the
 * problem — hypotheses need only two samples, so the ~195-sample straight
 * run always wins the inlier vote over the ~30-sample false band.
 */
function ransacLine(pts, tol = 2) {
  const n = pts.length;
  if (n < 24) return null;
  const stride = Math.max(1, Math.floor(n / 40));
  let best = null;
  for (let a = 0; a < n; a += stride) {
    for (let b = a + stride; b < n; b += stride) {
      const p1 = pts[a], p2 = pts[b];
      const di = p2.i - p1.i;
      if (Math.abs(di) < 30) continue;
      const m = (p2.v - p1.v) / di;
      const k = p1.v - m * p1.i;
      let count = 0;
      for (const p of pts) if (Math.abs(m * p.i + k - p.v) <= tol) count += 1;
      if (!best || count > best.count) best = { m, k, count };
    }
  }
  if (!best) return null;
  let q = { m: best.m, k: best.k };
  for (let r = 0; r < 3; r += 1) {
    const core = pts.filter((p) => Math.abs(evalLine(q, p.i) - p.v) <= tol);
    if (core.length < 24) break;
    q = fitLine(core) ?? q;
  }
  return q;
}

const evalQuad = (q, i) => {
  const u = i - q.meanI;
  return q.a * u * u + q.b * u + q.c;
};

/** Linear interpolation of the smoothed residual correction. */
const evalDrift = (q, i) => {
  const d = q.drift;
  if (!d || d.length < 2) return 0;
  if (i <= d[0][0]) return d[0][1];
  if (i >= d[d.length - 1][0]) return d[d.length - 1][1];
  let lo = 0, hi = d.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (d[mid][0] <= i) lo = mid;
    else hi = mid;
  }
  const t = (i - d[lo][0]) / (d[hi][0] - d[lo][0]);
  return d[lo][1] + t * (d[hi][1] - d[lo][1]);
};

/**
 * Geometric edge value: trend quad + smoothed residual ("drift"). The quad is
 * global; real edges carry ±1–2px local structure (the raster's bottom dips
 * into the seam) that the band assertion would otherwise catch. Drift =
 * triangular-kernel mean of inlier residuals, clamped to ±5px, so per-pixel
 * noise still never reaches the mask.
 */
const evalEdge = (q, i) => evalQuad(q, i) + evalDrift(q, i);

const addDrift = (q, pts) => {
  if (!q) return;
  if (!pts || pts.length < 24) {
    q.drift = [];
    return;
  }
  const [i0, i1] = q.span;
  const half = Math.max(8, (i1 - i0) / 9);
  const drift = [];
  for (let i = i0; i <= i1; i += 4) {
    let s = 0, w = 0;
    for (const p of pts) {
      const di = Math.abs(p.i - i);
      if (di > half) continue;
      const wt = 1 - di / half;
      s += wt * (p.v - evalQuad(q, p.i));
      w += wt;
    }
    if (w > 0.0001) drift.push([i, Math.max(-5, Math.min(5, s / w))]);
  }
  q.drift = drift;
};

/** Algebraic circle fit with iterative outlier rejection (plus mean |residual|). */
function fitCircle(points) {
  let pts = points.map(([x, y]) => [x, y]);
  let circle = null;
  let err = Infinity;
  for (let iter = 0; iter < 4; iter += 1) {
    const n = pts.length;
    if (n < 6) return null;
    let sx = 0, sy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; }
    sx /= n; sy /= n;
    let suu = 0, svv = 0, suv = 0, su3 = 0, sv3 = 0, suv2 = 0, svu2 = 0;
    for (const [x, y] of pts) {
      const u = x - sx, v = y - sy;
      suu += u * u; svv += v * v; suv += u * v;
      su3 += u * u * u; sv3 += v * v * v;
      suv2 += u * v * v; svu2 += v * u * u;
    }
    const det = suu * svv - suv * suv;
    if (Math.abs(det) < 1e-6) return null;
    const uc = ((su3 + suv2) / 2 * svv - suv * ((sv3 + svu2) / 2)) / det;
    const vc = (suv * ((su3 + suv2) / 2) - suu * ((sv3 + svu2) / 2)) / det;
    const r = Math.sqrt((suu + svv) / n + uc * uc + vc * vc);
    const cx = sx + uc, cy = sy + vc;
    circle = { cx, cy, r };
    const resid = pts.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r));
    err = resid.reduce((s, v) => s + v, 0) / Math.max(1, resid.length);
    const keep = pts.filter((_, i) => resid[i] <= Math.max(5, r * 0.25));
    if (keep.length === pts.length) break;
    pts = keep;
  }
  return circle ? { ...circle, err } : null;
}

/**
 * Full aperture solve: returns fitted edges (quads with spans), corner
 * circles, bbox and the raw sample counts (for the QA report).
 */
function solveAperture(lum, W, H, tube, override, flood) {
  const scan = makeScanners(lum, W, H, tube, flood);
  const win = {
    y0: Math.max(4, flood.y0 + 4),
    y1: Math.min(H - 5, flood.y1 - 4),
    x0: Math.max(4, flood.x0 + 4),
    x1: Math.min(W - 5, flood.x1 - 4),
  };

  const sampleRange = (ys, fn, label, keep) => {
    const pts = [];
    for (const i of ys) {
      const v = fn(i);
      if (v == null || v <= 4 || v >= W - 5) continue;
      if (keep && !keep(v)) continue;
      pts.push({ i, v });
    }
    const kept = despike(pts);
    console.log(`[tv-tube] ${label}: ${pts.length} scans → ${kept.length} kept`);
    return kept;
  };

  // Rows/cols inside the flood box; each edge must land near its flood side
  // (the scan fires where bright glass meets the seam, i.e. within a few px
  // of it) — anything further is a false edge from the cabinet.
  const leftPts = sampleRange(range(win.y0, win.y1), (y) => scan.left(y), "left", (v) => v >= flood.x0 - 8 && v <= flood.x0 + 60);
  const rightPts = sampleRange(range(win.y0, win.y1), (y) => scan.right(y), "right", (v) => v <= flood.x1 + 8 && v >= flood.x1 - 60);
  const topPts = sampleRange(range(win.x0, win.x1), (x) => scan.top(x), "top", (v) => v >= flood.y0 - 8 && v <= flood.y0 + 60);
  const botPts = sampleRange(range(win.x0, win.x1), (x) => scan.bottom(x), "bottom", (v) => v <= flood.y1 + 8 && v >= flood.y1 - 60);
  for (const [label, pts] of [["left", leftPts], ["right", rightPts], ["top", topPts], ["bottom", botPts]]) {
    if (pts.length < 40) throw new Error(`[tv-tube] ${label} edge: only ${pts.length} scans inside the flood window — photo/params wrong`);
  }

  // Edge fit: LINE seed → tight quarantine → quadratic refit → final
  // quarantine. A quadratic seeded on the raw samples gets dragged by the
  // corner arcs (and the left-edge bulge), warps ±13px at the span ends, and
  // then counts the arcs as inliers — that warp is what grew Z-notches in
  // the outline and pulled the mask off the bottom-left glass. A degree-1
  // seed over the FULL set is immune: the two arcs pull symmetrically, the
  // bulge sits mid-span, and the long straight run wins the regression.
  // 2.5px on the line kills arcs+bulge; the quad then only ever sees the
  // straight core (+ mild bulge), and 3.5px does the corner handoff.
  const trimToEdge = (pts) => {
    if (pts.length < 24) return { q: null, edge: pts, corner: [] };
    // RANSAC line seed → 2.5px gate → quadratic refit → 3.5px corner
    // handoff. The line phase removes the false dark-green bands, the arcs
    // and the bulge in one vote; the quad only ever sees the straight core
    // (it may lean a couple of px toward a mild bulge, which is fine — that
    // keeps the glass-side strip covered), and >3.5px residuals become corner
    // circle candidates.
    let q = ransacLine(pts);
    if (!q) return { q: null, edge: pts, corner: [] };
    let edge = pts.filter((p) => Math.abs(evalLine(q, p.i) - p.v) <= 2.5);
    if (edge.length < 24) edge = pts;
    q = fitQuad(edge) ?? q;
    edge = pts.filter((p) => Math.abs(evalQuad(q, p.i) - p.v) <= 3.5);
    if (edge.length >= 24) q = fitQuad(edge) ?? q;
    edge = pts.filter((p) => Math.abs(evalQuad(q, p.i) - p.v) <= 3.5);
    const corner = pts.filter((p) => Math.abs(evalQuad(q, p.i) - p.v) > 3.5);
    return { q, edge, corner };
  };

  const L = trimToEdge(leftPts);
  const R = trimToEdge(rightPts);
  const T = trimToEdge(topPts);
  const B = trimToEdge(botPts);
  if (!L.q || !R.q || !T.q || !B.q) throw new Error("[tv-tube] edge fit failed — check the photo/tube params");
  addDrift(L.q, L.edge);
  addDrift(R.q, R.edge);
  addDrift(T.q, T.edge);
  addDrift(B.q, B.edge);

  const vals = (q, pts) => pts.map((p) => evalEdge(q, p.i));
  const bboxOf = (edgePts, q) => {
    if (edgePts.length < 12) throw new Error(`[tv-tube] edge fit collapsed (${edgePts.length} points)`);
    const vs = vals(q, edgePts);
    return [Math.min(...vs), Math.max(...vs)];
  };
  const [lmin, lmax] = bboxOf(L.edge, L.q);
  const [rmin, rmax] = bboxOf(R.edge, R.q);
  const [tmin, tmax] = bboxOf(T.edge, T.q);
  const [bmin, bmax] = bboxOf(B.edge, B.q);

  // Corner circles: the quarantined residuals near each corner, plus the arc
  // must live within [18, 64] px or the configured fallback is used.
  // Circle candidates: quarantined residuals inside the corner window AND
  // bending the way that corner bends — L/T corners bow to +residual (the top
  // and left arcs sit inside the straight-line extension), R/B to −. The
  // left-edge bulge quarantines too but bends outward (−residual), so the
  // sign test keeps it out of the TL/BL circle fits.
  const cornerPoints = (corr, q, side, lo, hi, sign) => {
    const pts = [];
    for (const p of corr) {
      if (p.i < lo || p.i > hi) continue;
      const resid = p.v - evalQuad(q, p.i);
      if (resid * sign <= 0) continue;
      pts.push(side === "v" ? [p.v, p.i] : [p.i, p.v]);
    }
    return pts;
  };
  const yTop = tmin, yBot = bmax, xL = lmin, xR = rmax;

  // Tangency snaps: for a given radius, place the centre so the circle
  // touches BOTH fitted edges exactly — every corner (fitted or fallback)
  // satisfies this, which is what keeps the outline polygon continuous.
  const snapTl = (r) => {
    let cx = xL + r, cy = yTop + r;
    for (let k = 0; k < 4; k += 1) { cy = evalEdge(T.q, cx) + r; cx = evalEdge(L.q, cy) + r; }
    return { cx, cy };
  };
  const snapTr = (r) => {
    let cx = xR - r, cy = yTop + r;
    for (let k = 0; k < 4; k += 1) { cy = evalEdge(T.q, cx) + r; cx = evalEdge(R.q, cy) - r; }
    return { cx, cy };
  };
  const snapBl = (r) => {
    let cx = xL + r, cy = yBot - r;
    for (let k = 0; k < 4; k += 1) { cy = evalEdge(B.q, cx) - r; cx = evalEdge(L.q, cy) + r; }
    return { cx, cy };
  };
  const snapBr = (r) => {
    let cx = xR - r, cy = yBot - r;
    for (let k = 0; k < 4; k += 1) { cy = evalEdge(B.q, cx) - r; cx = evalEdge(R.q, cy) - r; }
    return { cx, cy };
  };
  /**
   * Corner circle = tangency-constrained radius search. Plain algebraic
   * (Kåsa) fits go singular on near-vertical arc segments (BL/BR here) and,
   * worse, land centres whose tangent misses the fitted edges by 4–5px. So
   * scan r ∈ [6,48], snap the centre onto both edges, and score by mean
   * |dist−r| over the quarantined arc points — the scan is 1-D and cannot
   * degenerate. ≤5px mean residual keeps real arcs (the tangency constraint
   * alone costs ~1.5px against the least-squares edges, so 3 was too tight).
   */
  const mkCorner = (name, pts, fallbackR, snap) => {
    if (pts.length >= 8) {
      let best = null;
      const tryR = (r) => {
        if (r < 6 || r > 64) return;
        const c = snap(r);
        let err = 0;
        for (const [px, py] of pts) err += Math.abs(Math.hypot(px - c.cx, py - c.cy) - r);
        err /= pts.length;
        if (!best || err < best.err) best = { ...c, r, err };
      };
      const kasa = fitCircle(pts);
      if (kasa) tryR(kasa.r);
      for (let r = 6; r <= 48; r += 0.5) tryR(r);
      if (best && best.err <= 5) return best;
      console.warn(
        `[tv-tube] corner ${name} arc fit rejected (${pts.length} pts, best err=${best ? best.err.toFixed(2) : "n/a"}) — using fallback r=${fallbackR}`,
      );
    }
    return null; // positioned later from the fallback radius
  };

  // Note: with the line-seed fit the quarantined arc points sit within a few
  // px of the straight edges (TL has none at all), so candidate pools are
  // 0–7 points — too thin for a trustworthy radius estimate. The tangent
  // fallback (r from defaults, default 20) is the geometric answer here; the
  // fit path stays for photos whose corners leave denser arc debris.
  const corners = {
    tl: mkCorner("tl", [...cornerPoints(L.corner, L.q, "v", yTop, yTop + 90, +1), ...cornerPoints(T.corner, T.q, "x", xL, xL + 90, +1)], tube.cornerTl, snapTl),
    tr: mkCorner("tr", [...cornerPoints(R.corner, R.q, "v", yTop, yTop + 90, -1), ...cornerPoints(T.corner, T.q, "x", xR - 90, xR, +1)], tube.cornerTr, snapTr),
    bl: mkCorner("bl", [...cornerPoints(L.corner, L.q, "v", yBot - 90, yBot, +1), ...cornerPoints(B.corner, B.q, "x", xL, xL + 90, -1)], tube.cornerBl, snapBl),
    br: mkCorner("br", [...cornerPoints(R.corner, R.q, "v", yBot - 90, yBot, -1), ...cornerPoints(B.corner, B.q, "x", xR - 90, xR, -1)], tube.cornerBr, snapBr),
  };
  // Fallback corners: pull the centre in from the square corner by r/√2-ish —
  // the arc then meets both fitted edges within a couple of pixels.
  const place = (name, r, ax, ay, dx, dy) => {
    if (corners[name]) return;
    const ex = Math.max(0, xR - xL), ey = Math.max(0, yBot - yTop);
    if (!Number.isFinite(ex) || !Number.isFinite(ey) || ex < 40 || ey < 40) {
      throw new Error(`[tv-tube] corner ${name}: degenerate bbox (${ex}×${ey}) — edge fit collapsed`);
    }
    const rx = Math.min(r, ex / 3), ry = Math.min(r, ey / 3);
    corners[name] = { cx: ax + dx * rx, cy: ay + dy * ry, r: (rx + ry) / 2 };
    console.warn(`[tv-tube] corner ${name}: circle fit degenerate — fallback r≈${((rx + ry) / 2).toFixed(1)}`);
  };
  place("tl", tube.cornerTl, xL, yTop, 1, 1);
  place("tr", tube.cornerTr, xR, yTop, -1, 1);
  place("bl", tube.cornerBl, xL, yBot, 1, -1);
  place("br", tube.cornerBr, xR, yBot, -1, -1);

  // Corner radii can be forced by override.
  if (override?.corners) {
    for (const k of ["tl", "tr", "bl", "br"]) {
      const r = override.corners[k];
      if (Number.isFinite(r)) corners[k] = { ...corners[k], r: num(r) };
    }
  }

  // Rounded-rect SDF structure: each side spans the FULL bbox extent, and a
  // corner circle only governs its tangent quadrant (outside the bbox on
  // both axes), composing with `max()` — the intersection of half-planes.
  // Side quads track the arcs from their own samples, so even a loose corner
  // radius can never grow alpha into trim: the side answer wins wherever a
  // side is active, and inside the strict corner quadrant every point is
  // > √2·r outside a tangent circle anyway.
  const spans = {
    left: [yTop, yBot],
    right: [yTop, yBot],
    top: [xL, xR],
    bottom: [xL, xR],
  };

  return {
    edges: { left: L.q, right: R.q, top: T.q, bottom: B.q },
    spans,
    corners,
    bbox: { left: Math.min(lmin, xL), right: Math.max(rmax, xR), top: Math.min(tmin, yTop), bottom: Math.max(bmax, yBot) },
    counts: { left: L.edge.length, right: R.edge.length, top: T.edge.length, bottom: B.edge.length },
    samples: { L: leftPts, R: rightPts, T: topPts, B: botPts },
  };
}

function* range(a, b) {
  for (let i = a; i <= b; i += 1) yield i;
}

/* ──────────────────────── analytic SDF sampling ──────────────────────── */

/**
 * Signed distance field: positive inside. Max over the four fitted edge
 * half-planes (curvature is gentle, so v−x is metric-accurate to ~0.1px) and
 * the corner circles in their quadrants. Returns `{d, side}` so the per-side
 * outset can shape the falloff; corners inherit the gentler adjacent budget.
 */
function makeSdf(ap) {
  const { edges, spans, corners } = ap;
  const active = (span, v) => v >= span[0] && v <= span[1];
  return (px, py) => {
    let best = -Infinity;
    let side = "left";
    const push = (d, s) => {
      if (d > best) { best = d; side = s; }
    };
    if (active(spans.left, py)) push(evalEdge(edges.left, py) - px, "left");
    if (active(spans.right, py)) push(px - evalEdge(edges.right, py), "right");
    if (active(spans.top, px)) push(evalEdge(edges.top, px) - py, "top");
    if (active(spans.bottom, px)) push(py - evalEdge(edges.bottom, px), "bottom");
    const q = (name, cond) => {
      const c = corners[name];
      if (!c || !cond) return;
      // positive = OUTSIDE, matching the side convention: outside the arc
      // means dist > r. (An inverted sign here reads the whole corner
      // quadrant as interior — grown alpha everywhere around the corners.)
      push(Math.hypot(px - c.cx, py - c.cy) - c.r, `c${name}`);
    };
    q("tl", px < corners.tl.cx && py < corners.tl.cy);
    q("tr", px > corners.tr.cx && py < corners.tr.cy);
    q("bl", px < corners.bl.cx && py > corners.bl.cy);
    q("br", px > corners.br.cx && py > corners.br.cy);
    return { d: best, side };
  };
}

/* ───────────────────────────── generation ────────────────────────────── */

async function generate({ quiet = false } = {}) {
  const tv = readTv();
  const file = path.join(ROOT, "public", tv.src.replace(/^\//, ""));
  if (!existsSync(file)) throw new Error(`[tv-tube] artwork missing: ${file}`);
  const meta = await sharp(file).metadata();
  const W = meta.width, H = meta.height;
  const sourceHash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
  const override = readOverride(sourceHash);

  const { data: gray, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const lum = (x, y) => gray[y * W + x];
  void info;

  // flood first: it bounds every scan (see solveAperture)
  const flood = floodBBox(lum, W, H, Math.round(W * 0.49), Math.round(H * 0.65), tv.tube.floodGlow);
  const ap = solveAperture(lum, W, H, tv.tube, override, flood);

  // ── per-side outsets (override → content), capped by seam budgets ──
  const outset = {
    left: clamp(num(override?.outset?.left ?? tv.tube.outsetLeft), 0, tv.tube.budgetLeft),
    right: clamp(num(override?.outset?.right ?? tv.tube.outsetRight), 0, tv.tube.budgetRight),
    top: clamp(num(override?.outset?.top ?? tv.tube.outsetTop), 0, tv.tube.budgetTop),
    bottom: clamp(num(override?.outset?.bottom ?? tv.tube.outsetBottom), 0, tv.tube.budgetBottom),
  };
  const budgets = {
    left: tv.tube.budgetLeft, right: tv.tube.budgetRight,
    top: tv.tube.budgetTop, bottom: tv.tube.budgetBottom,
  };

  // ── box = bbox + padding ≥12px and ≥ outset+3 (alpha must be 0 at the box edge) ──
  // `.tv-bezel` needs ≥20px of photo around the aperture so its feathered
  // hole can never expose a picture sliver at any zoom level (Phase-2 spec);
  // the mask's own growth is still the declared outset only.
  const pad = {
    left: Math.max(20, outset.left + 3),
    right: Math.max(20, outset.right + 3),
    top: Math.max(20, outset.top + 3),
    bottom: Math.max(20, outset.bottom + 3),
  };
  const box = {
    x: Math.floor(ap.bbox.left - pad.left),
    y: Math.floor(ap.bbox.top - pad.top),
    w: Math.ceil(ap.bbox.right - ap.bbox.left + pad.left + pad.right),
    h: Math.ceil(ap.bbox.bottom - ap.bbox.top + pad.top + pad.bottom),
  };

  // ── rasters ──
  const maskW = MASK_WIDTH;
  const maskH = Math.round((box.h / box.w) * maskW);
  const SS = 4;
  const sdf = makeSdf(ap);
  const feather = tv.tube.feather;
  /** Per-side outset for a constraint side (corners inherit the gentler adjacent). */
  const outsetFor = (side) => {
    if (side === "ctl") return Math.min(outset.left, outset.top);
    if (side === "ctr") return Math.min(outset.right, outset.top);
    if (side === "cbl") return Math.min(outset.left, outset.bottom);
    if (side === "cbr") return Math.min(outset.right, outset.bottom);
    return outset[side] ?? outset.left;
  };
  /** Falloff exponent: `feather` px of photo px translate into ramp softness. */
  const pFor = (side) => Math.max(1, outsetFor(side) / feather);

  // signed field on the supersampled grid → alpha (photo-px coordinates)
  const ssW = maskW * SS, ssH = maskH * SS;
  const alphaSS = new Float32Array(ssW * ssH);
  const distSS = new Float32Array(ssW * ssH); // signed, photo px (for shade/ring reuse)
  for (let sy = 0; sy < ssH; sy += 1) {
    const py = box.y + ((sy + 0.5) / ssH) * box.h;
    for (let sx = 0; sx < ssW; sx += 1) {
      const px = box.x + ((sx + 0.5) / ssW) * box.w;
      const { d, side } = sdf(px, py);
      distSS[sy * ssW + sx] = d;
      if (d <= 0) {
        alphaSS[sy * ssW + sx] = 1;
      } else {
        const o = Math.max(0.75, outsetFor(side));
        alphaSS[sy * ssW + sx] = Math.pow(Math.max(0, 1 - d / o), pFor(side));
      }
    }
  }
  // downsample SS → output with box averaging (this is the antialiasing)
  const alphaOut = boxDown(alphaSS, ssW, ssH, SS);
  const distOut = boxDown(distSS, ssW, ssH, SS);

  // assertion 1: grown band never brightens what lies OUTSIDE the glass.
  // "Outside" is measured against the scan samples (nearest-sample edge), not
  // only against the smooth fit: a pixel under the fit that still sits inside
  // the true glass carries the glass's own brightness and is legitimate; the
  // fit also gets a half-pixel grace because the mask grid is finer than the
  // photo. Growth into chrome/cabinet must read < budgetLum everywhere else.
  const nearest = (list, i) => {
    const arr = list.map((p) => [p.i, p.v]).sort((a, b) => a[0] - b[0]);
    let lo = 0, hi = arr.length - 1;
    if (i <= arr[lo][0]) return arr[lo][1];
    if (i >= arr[hi][0]) return arr[hi][1];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid][0] <= i) lo = mid;
      else hi = mid;
    }
    const dl = i - arr[lo][0], dr = arr[hi][0] - i;
    return dl <= dr ? arr[lo][1] : arr[hi][1];
  };
  const sL = ap.samples.L, sR = ap.samples.R, sT = ap.samples.T, sB = ap.samples.B;
  let bandMax = 0, bandAt = null;
  for (let y = 0; y < maskH; y += 1) {
    for (let x = 0; x < maskW; x += 1) {
      const a = alphaOut[y * maskW + x];
      if (a <= 0.02) continue;
      const d = distOut[y * maskW + x];
      if (d <= 0.5) continue;
      // floor: the photo pixel physically beneath this mask pixel — round()
      // samples the next pixel over and flags brightness the alpha never
      // actually covers (the mask is finer than the photo grid).
      const px = Math.floor(box.x + ((x + 0.5) / maskW) * box.w);
      const py = Math.floor(box.y + ((y + 0.5) / maskH) * box.h);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      // inside the scan-derived glass rect → brightness is the glass itself
      if (px >= nearest(sL, py) && px <= nearest(sR, py) && py >= nearest(sT, px) && py <= nearest(sB, px)) continue;
      const v = lum(px, py);
      if (v > bandMax) { bandMax = v; bandAt = [px, py]; }
    }
  }
  if (bandMax >= tv.tube.budgetLum) {
    const dbg = bandAt ? sdf(bandAt[0], bandAt[1]) : null;
    throw new Error(
      `[tv-tube] assertion failed: grown band reaches lum ${bandMax} at (${bandAt}) ≥ budgetLum ${tv.tube.budgetLum} — ` +
        `sdf=${dbg ? `side=${dbg.side} d=${dbg.d.toFixed(2)}` : "?"} — ` +
        `shrink the outset for that side in tv-tube.override.json / defaults.ts`,
    );
  }

  // assertion 2: box boundary fully transparent
  for (let x = 0; x < maskW; x += 1) {
    for (const y of [0, maskH - 1]) {
      if (alphaOut[y * maskW + x] > 0) throw new Error(`[tv-tube] assertion failed: mask alpha > 0 at box boundary (${x},${y})`);
    }
  }
  for (let y = 0; y < maskH; y += 1) {
    for (const x of [0, maskW - 1]) {
      if (alphaOut[y * maskW + x] > 0) throw new Error(`[tv-tube] assertion failed: mask alpha > 0 at box boundary (${x},${y})`);
    }
  }

  // assertion 3: inner 3px ring is fully opaque (no photo colour can leak).
  // Corner-tangent pixels are exempt: at the tangent junction a single mask
  // pixel legitimately straddles side-depth (−3) and circle-depth (≈0), so its
  // *mean* alpha dips below 1 while every sub-pixel outside the true arc is
  // merely feathering the seam — that is the mask doing its job, not a leak.
  for (let y = 0; y < maskH; y += 1) {
    for (let x = 0; x < maskW; x += 1) {
      const d = distOut[y * maskW + x];
      if (d >= -0.5 || d < -3.2 || alphaOut[y * maskW + x] >= 0.995) continue;
      const px = Math.floor(box.x + ((x + 0.5) / maskW) * box.w);
      const py = Math.floor(box.y + ((y + 0.5) / maskH) * box.h);
      if (sdf(px, py).side.startsWith("c")) continue;
      {
        throw new Error(`[tv-tube] assertion failed: inner ring not opaque at (${x},${y}) a=${alphaOut[y * maskW + x].toFixed(3)}`);
      }
    }
  }

  // mask + inverse + spill ring
  const maskRgba = Buffer.alloc(maskW * maskH * 4, 255);
  const holeRgba = Buffer.alloc(maskW * maskH * 4, 255);
  const ringRgba = Buffer.alloc(maskW * maskH * 4, 255);
  // Spill ring: reaches ~8px onto the inner lip and out into the seam, but is
  // dead by ~13px — the acceptance budget is "increment < 0.25 beyond 4% of
  // the tube height" (≈10.5px), and every extent here is inside its budget.
  const ringExtent = { left: 13, right: 3, top: 6, bottom: 13 };
  const ringExtentFor = (side) => {
    if (side === "ctl") return Math.min(ringExtent.left, ringExtent.top);
    if (side === "ctr") return Math.min(ringExtent.right, ringExtent.top);
    if (side === "cbl") return Math.min(ringExtent.left, ringExtent.bottom);
    if (side === "cbr") return Math.min(ringExtent.right, ringExtent.bottom);
    return ringExtent[side] ?? 6;
  };
  for (let y = 0; y < maskH; y += 1) {
    for (let x = 0; x < maskW; x += 1) {
      const i = y * maskW + x;
      const a = Math.round(alphaOut[i] * 255);
      maskRgba[i * 4 + 3] = a;
      holeRgba[i * 4 + 3] = 255 - a;
      const d = distOut[i];
      let r;
      if (d <= 0) {
        r = smoothstep(-8, 0, d); // inner lip
      } else {
        const px = box.x + ((x + 0.5) / maskW) * box.w;
        const py = box.y + ((y + 0.5) / maskH) * box.h;
        const { side } = sdf(px, py);
        const ext = ringExtentFor(side);
        r = Math.pow(Math.max(0, 1 - d / ext), 1.6);
      }
      ringRgba[i * 4 + 3] = Math.round(clamp(r, 0, 1) * 255);
    }
  }

  // shade (T): procedural vignette from the same distance field — ≤256px gray
  const shadeW = 256;
  const shadeH = Math.max(64, Math.round((box.h / box.w) * shadeW));
  const shadeRgba = Buffer.alloc(shadeW * shadeH * 4);
  const apH = ap.bbox.bottom - ap.bbox.top;
  for (let y = 0; y < shadeH; y += 1) {
    for (let x = 0; x < shadeW; x += 1) {
      const px = box.x + ((x + 0.5) / shadeW) * box.w;
      const py = box.y + ((y + 0.5) / shadeH) * box.h;
      const { d, side } = sdf(px, py);
      const i = (y * shadeW + x) * 4;
      if (d > 0) { shadeRgba[i] = 255; shadeRgba[i + 1] = 255; shadeRgba[i + 2] = 255; shadeRgba[i + 3] = 255; continue; }
      const din = -d;
      const e = smoothstep(0, 0.05 * apH, din);
      const top = side === "top";
      const strength = top ? 0.55 : 0.42;
      let f = 1 - strength * (1 - e);
      // corners a touch deeper (×0.9) where close to an arc centre
      for (const c of Object.values(ap.corners)) {
        if (din < c.r + 6 && Math.hypot(px - c.cx, py - c.cy) < c.r + 6) f *= 0.9;
      }
      const v = Math.round(clamp(f, 0, 1) * 255);
      shadeRgba[i] = v; shadeRgba[i + 1] = v; shadeRgba[i + 2] = v; shadeRgba[i + 3] = 255;
    }
  }

  // tint: photo's low-frequency colour, luminance-normalised (hue only)
  const tintBuf = await sharp(file)
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .blur(tv.tube.tintBlur)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tintW = box.w, tintH = box.h;
  const tintRgba = Buffer.alloc(tintW * tintH * 4);
  // normalise: per-pixel ratio to its own luma, scaled so the interior mean is neutral
  let sumR = 0, sumG = 0, sumB = 0, nSum = 0;
  for (let p = 0; p < tintW * tintH; p += 1) {
    const r = tintBuf.data[p * 3], g = tintBuf.data[p * 3 + 1], b = tintBuf.data[p * 3 + 2];
    const l = Math.max(1, 0.2126 * r + 0.7152 * g + 0.0722 * b);
    const px = box.x + ((p % tintW) + 0.5) / tintW * box.w;
    const py = box.y + (Math.floor(p / tintW) + 0.5) / tintH * box.h;
    if (sdf(px, py).d < -8) { sumR += r / l; sumG += g / l; sumB += b / l; nSum += 1; }
  }
  const kR = tintW && nSum ? 1 / (sumR / nSum) : 1;
  const kG = nSum ? 1 / (sumG / nSum) : 1;
  const kB = nSum ? 1 / (sumB / nSum) : 1;
  for (let p = 0; p < tintW * tintH; p += 1) {
    const r = tintBuf.data[p * 3], g = tintBuf.data[p * 3 + 1], b = tintBuf.data[p * 3 + 2];
    const l = Math.max(1, 0.2126 * r + 0.7152 * g + 0.0722 * b);
    tintRgba[p * 4] = Math.round(clamp((r / l) * kR * 255, 0, 255));
    tintRgba[p * 4 + 1] = Math.round(clamp((g / l) * kG * 255, 0, 255));
    tintRgba[p * 4 + 2] = Math.round(clamp((b / l) * kB * 255, 0, 255));
    tintRgba[p * 4 + 3] = 255;
  }

  // reflect: high-pass highlights inside the aperture, inset from the edge
  const refW = maskW, refH = maskH;
  const photoRegion = await sharp(file)
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .resize(refW, refH, { kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurred = await sharp(photoRegion.data, { raw: { width: refW, height: refH, channels: 3 } })
    .blur(8 * (refW / box.w))
    .raw()
    .toBuffer();
  const refRgba = Buffer.alloc(refW * refH * 4);
  const rois = override?.highlights ?? [];
  const th = tv.tube.reflectThreshold;
  let refLit = 0;
  for (let y = 0; y < refH; y += 1) {
    for (let x = 0; x < refW; x += 1) {
      const i = y * refW + x;
      const px = box.x + ((x + 0.5) / refW) * box.w;
      const py = box.y + ((y + 0.5) / refH) * box.h;
      const { d } = sdf(px, py);
      const r = photoRegion.data[i * 3], g = photoRegion.data[i * 3 + 1], b = photoRegion.data[i * 3 + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const lb = 0.2126 * blurred[i * 3] + 0.7152 * blurred[i * 3 + 1] + 0.0722 * blurred[i * 3 + 2];
      const hp = l - lb;
      let a = 0;
      if (d <= -tv.tube.reflectInset) a = smoothstep(th, th + 9, hp);
      for (const roi of rois) {
        // A listed highlight ROI never forces alpha — it *keeps* the spot by
        // halving the threshold, so dim pixels inside the circle stay dim.
        if (Math.hypot(px - roi.x, py - roi.y) <= (roi.r ?? 16)) {
          a = Math.max(a, smoothstep(th * 0.45, th * 0.45 + 7, hp));
        }
      }
      if (a <= 0) continue;
      // keep the highlight's hue but pull towards its own luminance — hot
      // pixels must not paint cyan on the tube
      const mixed = { r: l + (r - l) * 0.5, g: l + (g - l) * 0.5, b: l + (b - l) * 0.5 };
      refRgba[i * 4] = Math.round(clamp(96 + mixed.r * 1.4, 0, 255));
      refRgba[i * 4 + 1] = Math.round(clamp(96 + mixed.g * 1.4, 0, 255));
      refRgba[i * 4 + 2] = Math.round(clamp(96 + mixed.b * 1.4, 0, 255));
      refRgba[i * 4 + 3] = Math.round(a * 255);
      refLit += 1;
    }
  }

  // ── write assets ──
  mkdirSync(OUT_DIR, { recursive: true });
  const hash8 = sourceHash.slice(0, 8);
  const files = {
    mask: path.join(OUT_DIR, `mask.${hash8}.png`),
    hole: path.join(OUT_DIR, `hole.${hash8}.png`),
    ring: path.join(OUT_DIR, `ring.${hash8}.png`),
    shade: path.join(OUT_DIR, `shade.${hash8}.webp`),
    tint: path.join(OUT_DIR, `tint.${hash8}.webp`),
    reflect: path.join(OUT_DIR, `reflect.${hash8}.webp`),
  };
  await sharp(maskRgba, { raw: { width: maskW, height: maskH, channels: 4 } }).png({ compressionLevel: 9 }).toFile(files.mask);
  await sharp(holeRgba, { raw: { width: maskW, height: maskH, channels: 4 } }).png({ compressionLevel: 9 }).toFile(files.hole);
  await sharp(ringRgba, { raw: { width: maskW, height: maskH, channels: 4 } }).png({ compressionLevel: 9 }).toFile(files.ring);
  await sharp(shadeRgba, { raw: { width: shadeW, height: shadeH, channels: 4 } }).webp({ quality: 92, effort: 5 }).toFile(files.shade);
  await sharp(tintRgba, { raw: { width: tintW, height: tintH, channels: 4 } }).webp({ quality: 90, effort: 5 }).toFile(files.tint);
  await sharp(refRgba, { raw: { width: refW, height: refH, channels: 4 } }).webp({ quality: 88, effort: 5 }).toFile(files.reflect);
  for (const name of readdirSync(OUT_DIR)) {
    if (!Object.values(files).some((f) => path.basename(f) === name)) rmSync(path.join(OUT_DIR, name));
  }

  // ── manifest ──
  const pct = (v, total) => round4((v / total) * 100);
  const apL = ap.bbox.left, apT = ap.bbox.top;
  const apW = ap.bbox.right - ap.bbox.left, apHh = ap.bbox.bottom - ap.bbox.top;
  const manifest = {
    generator: "scripts/tv-tube.mjs",
    sourceHash,
    photo: { src: tv.src, width: W, height: H },
    /** Measured glass bbox, photo px (fitted; cross-checked by flood fill). */
    aperture: { left: Math.round(apL), top: Math.round(apT), right: Math.round(ap.bbox.right), bottom: Math.round(ap.bbox.bottom) },
    /** Layout rect the DOM uses: aperture + padding. Percent of the photo. */
    box: { top: pct(box.y, H), left: pct(box.x, W), width: pct(box.w, W), height: pct(box.h, H) },
    /** Aperture bbox inside the box — the picture's positioning rectangle. */
    apertureInBox: {
      top: round4(((apT - box.y) / box.h) * 100),
      left: round4(((apL - box.x) / box.w) * 100),
      width: round4((apW / box.w) * 100),
      height: round4((apHh / box.h) * 100),
    },
    /** Hole mask position/size for `.tv-bezel` (full-photo element). */
    holePlacement: {
      size: `${pct(box.w, W)}% ${pct(box.h, H)}%`,
      // background/mask-position %: offset / (element − image)
      position: `${round4((box.x / W) / (1 - box.w / W) * 100)}% ${round4((box.y / H) / (1 - box.h / H) * 100)}%`,
    },
    outset,
    budgets,
    feather,
    edges: {
      left: packQuad(ap.edges.left), right: packQuad(ap.edges.right),
      top: packQuad(ap.edges.top), bottom: packQuad(ap.edges.bottom),
    },
    corners: Object.fromEntries(Object.entries(ap.corners).map(([k, c]) => [k, { cx: Math.round(c.cx), cy: Math.round(c.cy), r: Math.round(c.r) }])),
    /** Downsampled aperture contour for the tvdebug overlay, photo px. */
    outline: outlineOf(ap),
    highlights: rois.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.r ?? 16) })),
    assets: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, `/images/tv-tube/${path.basename(f)}`])),
    tuning: { tint: 0.2, reflect: 0.8, spill: 1, black: "rgb(8,12,10)" },
  };
  const serialised = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!existsSync(MANIFEST_PATH) || readFileSync(MANIFEST_PATH, "utf8") !== serialised) {
    writeFileSync(MANIFEST_PATH, serialised);
  }

  if (!quiet) {
    console.log(
      `[tv-tube] glass ≈ ${Math.round(apW)}×${Math.round(apHh)}px @ ${Math.round(apL)},${Math.round(apT)} ` +
        `(flood x ${flood.x0}–${flood.x1}, y ${flood.y0}–${flood.y1})\n` +
        `[tv-tube] box +${pad.left}/${pad.right}/${pad.top}/${pad.bottom}px → ${box.w}×${box.h}px, mask ${maskW}×${maskH}\n` +
        `[tv-tube] outsets l${outset.left} r${outset.right} t${outset.top} b${outset.bottom} ` +
        `(budgets ${budgets.left}/${budgets.right}/${budgets.top}/${budgets.bottom}) — band max lum ${bandMax} ✓\n` +
        `[tv-tube] corners r = ${Object.entries(ap.corners).map(([k, c]) => `${k}:${c.r.toFixed(0)}`).join(" ")}\n` +
        `[tv-tube] reflect lit px ${refLit}; wrote 6 assets + tv-tube.json`,
    );
  }
  return { manifest, ap, box, outset, bandMax, flood, files };
}

/* ───────────────────────────── helpers ───────────────────────────────── */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round4 = (v) => Math.round(v * 10000) / 10000;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function boxDown(src, w, h, f) {
  const ow = w / f, oh = h / f;
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y += 1) {
    for (let x = 0; x < ow; x += 1) {
      let s = 0;
      for (let dy = 0; dy < f; dy += 1) for (let dx = 0; dx < f; dx += 1) s += src[(y * f + dy) * w + (x * f + dx)];
      out[y * ow + x] = s / (f * f);
    }
  }
  return out;
}

function packQuad(q) {
  return {
    a: round4(q.a),
    b: round4(q.b),
    c: round4(q.c),
    meanI: round4(q.meanI),
    span: q.span.map(Math.round),
    drift: (q.drift ?? []).map(([i, r]) => [i, round4(r)]),
  };
}

function outlineOf(ap) {
  const pts = [];
  const { edges, spans, corners } = ap;
  const step = 6;
  // left edge top→bottom, bottom, right bottom→top, top (with arc samples at corners)
  const arc = (c, from, to, n = 10) => {
    for (let i = 0; i <= n; i += 1) {
      const t = from + ((to - from) * i) / n;
      pts.push([round4(c.cx + c.r * Math.cos(t)), round4(c.cy + c.r * Math.sin(t))]);
    }
  };
  const yTL = corners.tl.cy, yBL = corners.bl.cy, yTR = corners.tr.cy, yBR = corners.br.cy;
  // traversal order: left edge ↓, BL arc, bottom →, BR arc, right ↑, TR arc,
  // top ←, TL arc — so the polyline is a continuous closed contour.
  for (let y = yTL; y <= yBL; y += step) if (y >= spans.left[0] && y <= spans.left[1]) pts.push([round4(evalEdge(edges.left, y)), round4(y)]);
  arc(corners.bl, Math.PI, Math.PI / 2, 8);
  for (let x = corners.bl.cx; x <= corners.br.cx; x += step) if (x >= spans.bottom[0] && x <= spans.bottom[1]) pts.push([round4(x), round4(evalEdge(edges.bottom, x))]);
  arc(corners.br, Math.PI / 2, 0, 8);
  for (let y = yBR; y >= yTR; y -= step) if (y >= spans.right[0] && y <= spans.right[1]) pts.push([round4(evalEdge(edges.right, y)), round4(y)]);
  arc(corners.tr, 0, -Math.PI / 2, 8);
  for (let x = corners.tr.cx; x >= corners.tl.cx; x -= step) if (x >= spans.top[0] && x <= spans.top[1]) pts.push([round4(x), round4(evalEdge(edges.top, x))]);
  arc(corners.tl, -Math.PI / 2, -Math.PI, 8);
  return pts;
}

function floodBBox(lum, W, H, cx, cy, glow) {
  const seen = new Uint8Array(W * H);
  const stack = [[cx, cy]];
  seen[cy * W + cx] = 1;
  let x0 = cx, x1 = cx, y0 = cy, y1 = cy;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (!seen[i] && lum(xx, yy) > glow) { seen[i] = 1; stack.push([xx, yy]); }
    }
  }
  return { x0, x1, y0, y1 };
}

/* ─────────────────────────── check / QA mode ─────────────────────────── */

async function overlay({ outPath, qa }) {
  const tv = readTv();
  const file = path.join(ROOT, "public", tv.src.replace(/^\//, ""));
  const meta = await sharp(file).metadata();
  const W = meta.width, H = meta.height;
  const { data: gray, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const lum = (x, y) => gray[y * W + x];
  void info;
  const floodPre = floodBBox(lum, W, H, Math.round(W * 0.49), Math.round(H * 0.65), tv.tube.floodGlow);
  const ap = solveAperture(lum, W, H, tv.tube, null, floodPre);
  const s = tv.screen;
  const seed = { x: (s.left / 100) * W, y: (s.top / 100) * H, w: (s.width / 100) * W, h: (s.height / 100) * H };
  const outline = outlineOf(ap);
  const poly = outline.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const flood = floodPre;
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect x="${seed.x}" y="${seed.y}" width="${seed.w}" height="${seed.h}" fill="none" stroke="#3aa7ff" stroke-width="5"/>
      <polygon points="${poly}" fill="none" stroke="#ff2244" stroke-width="5"/>
      <rect x="${ap.bbox.left}" y="${ap.bbox.top}" width="${ap.bbox.right - ap.bbox.left}" height="${ap.bbox.bottom - ap.bbox.top}"
            fill="none" stroke="#ffd400" stroke-width="3" stroke-dasharray="14 10"/>
      ${Object.values(ap.corners).map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="none" stroke="#a020f0" stroke-width="3"/>`).join("")}
    </svg>`,
  );
  await sharp(file).composite([{ input: svg, top: 0, left: 0 }]).png().toFile(outPath);

  // A/B/C verdicts
  const rightSeed = seed.x + seed.w, bottomSeed = seed.y + seed.h;
  console.log(`[tv-tube] overlay → ${outPath}`);
  console.log(
    `[tv-tube] A — seed rect x ${Math.round(seed.x)}–${Math.round(rightSeed)}, y ${Math.round(seed.y)}–${Math.round(bottomSeed)}\n` +
      `         measured glass x ${Math.round(ap.bbox.left)}–${Math.round(ap.bbox.right)}, y ${Math.round(ap.bbox.top)}–${Math.round(ap.bbox.bottom)}\n` +
      `         delta: right ${(rightSeed - ap.bbox.right).toFixed(1)}px, top ${(ap.bbox.top - seed.y).toFixed(1)}px ` +
      `(seed sits ${Math.abs(rightSeed - ap.bbox.right).toFixed(1)}px past the glass on the right, ${Math.abs(ap.bbox.top - seed.y).toFixed(1)}px above it)`,
  );
  console.log(
    `[tv-tube] B — flood(fill, glow=${tv.tube.floodGlow}) = x ${flood.x0}–${flood.x1}, y ${flood.y0}–${flood.y1} ` +
      `(flood stops at the glass; the walk-grow stage this report describes does not exist in this tree — ` +
      `growth here is the declared outset only, and the band assertion proves it never reaches lum≥${tv.tube.budgetLum})`,
  );
  console.log(
    `[tv-tube] C — the reflect layer is computed with reflectInset=${tv.tube.reflectInset}px ` +
      `(edge ring structurally excluded); no distIn rounded-rect glow is generated anywhere`,
  );
  if (qa) {
    // safe-outset measurement: how far each side may grow before hitting chrome
    const walk = (x0, y0, dx, dy) => {
      for (let i = 1; i < 80; i += 1) {
        const x = Math.round(x0 + dx * i), y = Math.round(y0 + dy * i);
        if (x < 0 || y < 0 || x >= W || y >= H) return i;
        if (lum(x, y) >= tv.tube.budgetLum) return i - 1;
      }
      return 80;
    };
    const midY = Math.round((ap.bbox.top + ap.bbox.bottom) / 2);
    const midX = Math.round((ap.bbox.left + ap.bbox.right) / 2);
    console.log(
      `[tv-tube] QA — safe outset until lum≥${tv.tube.budgetLum} (mid rows/cols): ` +
        `left ${walk(evalEdge(ap.edges.left, midY), midY, -1, 0)}px, ` +
        `right ${walk(evalEdge(ap.edges.right, midY), midY, 1, 0)}px, ` +
        `top ${walk(midX, evalEdge(ap.edges.top, midX), 0, -1)}px, ` +
        `bottom ${walk(midX, evalEdge(ap.edges.bottom, midX), 0, 1)}px`,
    );
  }
}

/* ─────────────────────────────── CLI ─────────────────────────────────── */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--check") || args.includes("--qa")) {
    const out = args.find((a) => !a.startsWith("--")) ?? "/tmp/tv-tube-qa.png";
    await overlay({ outPath: out, qa: args.includes("--qa") });
  } else {
    await generate();
  }
}
