/**
 * Draws the television geometry over the MASTER artwork so it can be
 * eyeballed against the real photo:
 *
 *   red    = `works.tv.screen` aperture (defaults.ts — the zoom centre)
 *   green  = the hole actually punched into the cutout (aperture + outset)
 *   blue   = the on-page layer box (aperture + bleed, from tv-tube.json)
 *
 * All three come from `scripts/tv-tube.mjs` measurements (json) plus the
 * content seed, so a misaligned edge on the photo is a bug you can see:
 * the green hole must cover the whole glass (including its dark unlit
 * flanks) and land inside the dark seam — never on the chrome edge (right
 * side has only ~4 px of seam).
 *
 * Run:  node scripts/tv-glass.mjs [out.png]
 *   → default output /tmp/tv-glass-check.png
 */
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = readFileSync(path.join(root, "src/portfolio/content/defaults.ts"), "utf8");

const tv = content.match(/tv:\s*\{([\s\S]*?)\n      \}/);
if (!tv) {
  console.error("[tv-glass] could not find the `tv` block in defaults.ts");
  process.exit(1);
}
const screenBlock = tv[1].match(/screen:\s*\{([^}]*)\}/)?.[1];
if (!screenBlock) throw new Error("[tv-glass] missing `screen` in works.tv");
const num = (key) => {
  const m = screenBlock.match(new RegExp(`${key}:\\s*([0-9.]+)`));
  if (!m) throw new Error(`[tv-glass] missing \`${key}\` in works.tv.screen`);
  return Number(m[1]);
};
// The check always draws on the *master* artwork, not on `works.tv.src`
// (which points at the generated cutout): the master is where the geometry
// has to be measured.
const src = "assets/images/tv.webp";
const file = path.join(root, src);
const meta = await sharp(file).metadata();
const W = meta.width;
const H = meta.height;

const screen = { top: num("top"), left: num("left"), width: num("width"), height: num("height") };
const aperture = {
  x: Math.round((screen.left / 100) * W),
  y: Math.round((screen.top / 100) * H),
  w: Math.round((screen.width / 100) * W),
  h: Math.round((screen.height / 100) * H),
};

// Measured geometry from tv-tube.json (run `npm run tv-tube` first).
const jsonPath = path.join(root, "src/portfolio/content/tv-tube.json");
const geo = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, "utf8")) : null;
const outset = geo?.outset ?? { l: 15, r: 15, t: 15, b: 15 };
const boxPct = geo?.box ?? screen;
const box = {
  x: Math.round((boxPct.left / 100) * W),
  y: Math.round((boxPct.top / 100) * H),
  w: Math.round((boxPct.width / 100) * W),
  h: Math.round((boxPct.height / 100) * H),
};
const hole = {
  x: aperture.x - outset.l,
  y: aperture.y - outset.t,
  w: aperture.w + outset.l + outset.r,
  h: aperture.h + outset.t + outset.b,
};

const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
     <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"
           fill="none" stroke="#2266ff" stroke-width="6"/>
     <rect x="${aperture.x}" y="${aperture.y}" width="${aperture.w}" height="${aperture.h}"
           fill="none" stroke="#ff0044" stroke-width="6"/>
     <rect x="${hole.x}" y="${hole.y}" width="${hole.w}" height="${hole.h}"
           fill="none" stroke="#00ff88" stroke-width="4" stroke-dasharray="18 12"/>
   </svg>`,
);

const out = process.argv[2] ?? "/tmp/tv-glass-check.png";
await sharp(file).composite([{ input: overlay, top: 0, left: 0 }]).png().toFile(out);

console.log(
  `[tv-glass] ${src} ${W}x${H}\n` +
    `[tv-glass] layer box (blue)   → x ${box.x}–${box.x + box.w}, y ${box.y}–${box.y + box.h} ` +
    `(${box.w}x${box.h}px)\n` +
    `[tv-glass] aperture (red)     → x ${aperture.x}–${aperture.x + aperture.w}, y ${aperture.y}–${aperture.y + aperture.h} ` +
    `(${aperture.w}x${aperture.h}px)\n` +
    `[tv-glass] cutout hole (green)→ x ${hole.x}–${hole.x + hole.w}, y ${hole.y}–${hole.y + hole.h} ` +
    `(${hole.w}x${hole.h}px, outset l${outset.l}/r${outset.r}/t${outset.t}/b${outset.b})\n` +
    `[tv-glass] the green hole must cover the whole glass (incl. its dark flanks)\n` +
    `[tv-glass] and land inside the dark seam — never on the chrome (right seam ~4px);\n` +
    `[tv-glass] the blue box must stay larger than the hole on every side.\n` +
    `[tv-glass] overlay written to ${out}`
);
