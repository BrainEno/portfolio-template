/**
 * Generates the television's *glass optics* from the artwork itself, and keeps
 * a rect-overlay mode for eyeballing the measurement.
 *
 *   npm run tv-glass            # generate public/images/tv-glass/* + manifest
 *   npm run tv-glass -- --check # draw the rects over the photo (QA)
 *
 * Why generated from the photo: the picture on the tube used to be a hard
 * rectangle clipped by a hand-drawn SVG path — it never quite matched the
 * glass opening, its edge had no falloff, and it wore none of the scene's
 * light, so it read as a sticker pasted onto the set. A real CRT picture is
 * bounded by the tube's curved opening and is *wearing* the glass: the
 * vignette of the tube, the reflections of the room, the hotspot of the
 * phosphor. All of that is already in the photograph — so instead of faking it
 * with generic CSS gradients, this script measures it out of `tv.webp`:
 *
 *   mask   — alpha channel: a feathered rounded rect traced at the glass
 *            opening. The DOM rectangle is deliberately *larger* than the
 *            glass (it may overlap the inner bezel, never the reverse); the
 *            mask decides where the picture visibly ends, and the falloff
 *            lands on the photo's own dark curved edge instead of a line.
 *   shade  — the glass's low-frequency luminance (its real vignette and
 *            uneven phosphor brightness), normalised so the lit side sits near
 *            white. Multiplied over the picture: it takes the scene's light.
 *   sheen  — the positive high-frequency residual (reflections, the bright
 *            spot, streaks), screened over the picture: the picture sits
 *            *behind* the same glass the photo shows.
 *
 * The hand measurement stays where it was: `works.tv.screen` in
 * `src/portfolio/content/defaults.ts` is the *glass* rect, eyeballed with
 * `--check` the same way as before. Everything else — the layout bleed, the
 * feather, the lighting layers — is derived from it, so a new photo needs no
 * new tuning: measure the glass, run this script (predev/prebuild do it for
 * you), done.
 *
 * Outputs (committed, like the responsive derivatives):
 *   public/images/tv-glass/{mask,shade,sheen}.<hash>.{png,webp}
 *   src/portfolio/content/tv-glass-manifest.json   ← imported by sections.tsx
 *
 * Run:  node scripts/tv-glass.mjs [--check] [out.png]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_PATH = path.join(ROOT, "src/portfolio/content/defaults.ts");
const MANIFEST_PATH = path.join(ROOT, "src/portfolio/content/tv-glass-manifest.json");
const OUT_DIR = path.join(ROOT, "public/images/tv-glass");

/**
 * How far the DOM rectangle may reach past the glass onto the dark inner
 * bezel, as a fraction of the glass width. It has to cover the feather of the
 * mask (so the falloff happens *inside* the rectangle, over the photo's own
 * glass edge) with margin to spare — bigger only ever costs a few pixels of
 * bezel, smaller re-opens the "pasted rectangle" seam.
 */
const BLEED = 0.08;
/** Supersampling factor for the generated rasters (smoother feather on zoom). */
const SS = 2;
/** Corner radii of the tube opening, as fractions of glass width / height. */
const CORNER_X = 0.13;
const CORNER_Y = 0.17;
/** Script version: bump to invalidate hashes when the maths changes. */
const VERSION = "1";

/** Read `works.tv` (glass rect + artwork identity) out of the active content. */
function readTvContent() {
  // Same resolution order as `content/source.ts`: a committed snapshot wins
  // over the authored defaults — the optics must be generated from whatever
  // the site will actually render.
  const publishedPath = path.join(ROOT, "src/portfolio/content/published.json");
  if (existsSync(publishedPath)) {
    try {
      const tv = JSON.parse(readFileSync(publishedPath, "utf8"))?.works?.tv;
      if (tv?.src && tv?.screen?.left != null) return { src: tv.src, glass: tv.screen };
      console.warn("[tv-glass] published.json has no works.tv — falling back to defaults.ts");
    } catch (error) {
      console.warn("[tv-glass] published.json is not readable, falling back to defaults.ts", error);
    }
  }
  const content = readFileSync(CONTENT_PATH, "utf8");
  const tv = content.match(/tv:\s*\{([\s\S]*?)\n      \}/);
  if (!tv) throw new Error("[tv-glass] could not find the `tv` block in defaults.ts");
  const block = tv[1];
  const screenBlock = block.match(/screen:\s*\{([^}]*)\}/)?.[1];
  if (!screenBlock) throw new Error("[tv-glass] missing `screen` in works.tv");
  const num = (key) => {
    const m = screenBlock.match(new RegExp(`${key}:\\s*([0-9.]+)`));
    if (!m) throw new Error(`[tv-glass] missing \`${key}\` in works.tv.screen`);
    return Number(m[1]);
  };
  const src = block.match(/src:\s*"([^"]+)"/)?.[1];
  if (!src) throw new Error("[tv-glass] missing `src` in works.tv");
  return { src, glass: { top: num("top"), left: num("left"), width: num("width"), height: num("height") } };
}

/** Raw RGB at supersampled canvas size, cropped from the layout rectangle. */
async function readRegion(file, layout, width, height) {
  const { data, info } = await sharp(file)
    .extract({ left: layout.x, top: layout.y, width: layout.w, height: layout.h })
    .resize(width, height, { kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`[tv-glass] expected RGB, got ${info.channels} channels`);
  return data;
}

const blurRaw = (data, width, height, sigma) =>
  sharp(data, { raw: { width, height, channels: 3 } }).blur(sigma).removeAlpha().raw().toBuffer();

const percentile = (values, p) => {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

/** Feathered alpha mask of the glass opening, at canvas size. */
async function buildMask(layout, glass, width, height) {
  // Inflate slightly before the blur so the 50 %-alpha line lands a few pixels
  // *outside* the glass edge: the picture then stays solid to the very edge of
  // the opening and dies away across the bezel, not across the picture.
  const inflate = 5 * SS;
  const rx = CORNER_X * glass.w * SS;
  const ry = CORNER_Y * glass.h * SS;
  const shape = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <rect x="${glass.x * SS - inflate}" y="${glass.y * SS - inflate}"
             width="${glass.w * SS + inflate * 2}" height="${glass.h * SS + inflate * 2}"
             rx="${rx}" ry="${ry}" fill="#fff"/>
     </svg>`,
  );
  const sigma = layout.w * BLEED * 0.5 * SS;
  const { data, info } = await sharp(shape).blur(sigma).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  // The blurred red channel of a white shape is the coverage; keep a longish
  // tail so the last few percent die out over the bezel instead of stopping.
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) {
    const a = data[i] / 255;
    alpha[i] = Math.round(255 * Math.pow(a, 0.8) * Math.min(1, a * 4));
  }
  void info;
  return alpha;
}

/** Low-frequency glass luminance → a multiply layer that wears the scene light. */
async function buildShade(rgb, mask, width, height, glass) {
  const lowpass = await blurRaw(rgb, width, height, glass.w * 0.2 * SS);
  // Normalise on the lit interior so the glass never dims the picture overall;
  // the *relative* falloff (the vignette, the darker right/bottom of the tube)
  // is what carries over.
  const interior = [];
  const gx0 = Math.round(glass.x * SS);
  const gy0 = Math.round(glass.y * SS);
  const gw = Math.round(glass.w * SS);
  const gh = Math.round(glass.h * SS);
  for (let y = gy0; y < gy0 + gh; y += 3) {
    for (let x = gx0; x < gx0 + gw; x += 3) {
      const i = (y * width + x) * 3;
      interior.push(0.2126 * lowpass[i] + 0.7152 * lowpass[i + 1] + 0.0722 * lowpass[i + 2]);
    }
  }
  const ref = percentile(interior, 92);
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    const l = 0.2126 * lowpass[i * 3] + 0.7152 * lowpass[i * 3 + 1] + 0.0722 * lowpass[i * 3 + 2];
    // Gamma < 1 keeps the mid-tones near white; the clamp only catches the
    // deep corners, which should stay dark but not black.
    const shade = Math.min(1, Math.max(0.26, Math.pow(l / ref, 0.78) * 0.97));
    const v = Math.round(shade * 255);
    out[p] = v;
    out[p + 1] = v;
    out[p + 2] = v;
    out[p + 3] = mask[i];
  }
  return out;
}

/** Positive high-frequency residual → a screen layer of the real reflections. */
async function buildSheen(rgb, mask, width, height, glass) {
  const soft = await blurRaw(rgb, width, height, glass.w * 0.05 * SS);
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    const r = rgb[i * 3] - soft[i * 3];
    const g = rgb[i * 3 + 1] - soft[i * 3 + 1];
    const b = rgb[i * 3 + 2] - soft[i * 3 + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Below the grain floor there is nothing worth keeping; above it, scale so
    // the brightest reflection lands near white. The residual's own hue is
    // kept — the room's light in this photo is warm, and that warmth is the
    // point — but pulled halfway towards its own luminance so a hot pixel's
    // chroma fringe cannot paint a cyan dot on the tube.
    const strength = Math.max(0, Math.min(1, (l - 11) / 55));
    raw[p] = Math.max(0, Math.min(255, 128 + (l + (r - l) * 0.5) * 2.2));
    raw[p + 1] = Math.max(0, Math.min(255, 128 + (l + (g - l) * 0.5) * 2.2));
    raw[p + 2] = Math.max(0, Math.min(255, 128 + (l + (b - l) * 0.5) * 2.2));
    // Mask³: the photo's glass *edge* is itself a bright residual (the tube
    // rim catches light), and screening that back onto the picture would draw
    // a glowing outline around the opening — the exact "pasted-on" artefact
    // this whole layer exists to kill. Cubing the mask keeps reflections only
    // where the picture is solidly visible (the hotspot, the streaks, the arc)
    // and lets the rim stay the photograph's own.
    const m = mask[i] / 255;
    raw[p + 3] = Math.round(m * m * m * Math.pow(strength, 0.9) * 0.9);
  }
  // A touch of blur removes the last of the film grain from the highlight mask.
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .blur(1.6 * SS)
    .raw()
    .toBuffer();
}

/**
 * Generate the three optics rasters + the manifest. Returns the manifest
 * object; throws if the content file or artwork cannot be read.
 */
export async function generateTvGlass({ quiet = false } = {}) {
  const { src, glass } = readTvContent();
  const file = path.join(ROOT, "public", src.replace(/^\//, ""));
  const meta = await sharp(file).metadata();

  // Glass rect in photo pixels.
  const gx = Math.round((glass.left / 100) * meta.width);
  const gy = Math.round((glass.top / 100) * meta.height);
  const gw = Math.round((glass.width / 100) * meta.width);
  const gh = Math.round((glass.height / 100) * meta.height);
  // The DOM rectangle: the glass, grown by the bleed on every side. It is the
  // *layout* rect (what `.tv-screen` uses, what the manifest publishes); the
  // mask decides visibility.
  const b = Math.max(12, Math.round(gw * BLEED));
  const layout = { x: gx - b, y: gy - b, w: gw + b * 2, h: gh + b * 2 };
  const glassLocal = { x: b, y: b, w: gw, h: gh };

  const width = layout.w * SS;
  const height = layout.h * SS;
  const rgb = await readRegion(file, layout, width, height);
  const mask = await buildMask(layout, glassLocal, width, height);
  const shade = await buildShade(rgb, mask, width, height, glassLocal);
  const sheen = await buildSheen(rgb, mask, width, height, glassLocal);

  const hash = createHash("sha256")
    .update(VERSION)
    .update(readFileSync(file))
    .update(JSON.stringify([glass.left, glass.top, glass.width, glass.height]))
    .digest("hex")
    .slice(0, 8);

  mkdirSync(OUT_DIR, { recursive: true });
  const maskFile = path.join(OUT_DIR, `mask.${hash}.png`);
  const shadeFile = path.join(OUT_DIR, `shade.${hash}.webp`);
  const sheenFile = path.join(OUT_DIR, `sheen.${hash}.webp`);

  const maskRgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < mask.length; i += 1) maskRgba[i * 4 + 3] = mask[i];
  await sharp(maskRgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(maskFile);
  await sharp(shade, { raw: { width, height, channels: 4 } }).webp({ quality: 92, effort: 5 }).toFile(shadeFile);
  await sharp(sheen, { raw: { width, height, channels: 4 } }).webp({ quality: 86, effort: 5 }).toFile(sheenFile);

  // Drop derivatives of a previous photo / measurement.
  const kept = new Set([path.basename(maskFile), path.basename(shadeFile), path.basename(sheenFile)]);
  for (const name of readdirSync(OUT_DIR)) {
    if (!kept.has(name)) rmSync(path.join(OUT_DIR, name));
  }

  const toUrl = (f) => `/images/tv-glass/${path.basename(f)}`;
  const manifest = {
    generator: "scripts/tv-glass.mjs",
    photo: { src, width: meta.width, height: meta.height },
    /** Layout rectangle (glass + bleed), percent of the photo — what the DOM uses. */
    screen: {
      top: +(((layout.y) / meta.height) * 100).toFixed(4),
      left: +(((layout.x) / meta.width) * 100).toFixed(4),
      width: +((layout.w / meta.width) * 100).toFixed(4),
      height: +((layout.h / meta.height) * 100).toFixed(4),
    },
    assets: { mask: toUrl(maskFile), shade: toUrl(shadeFile), sheen: toUrl(sheenFile) },
  };
  const serialised = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!existsSync(MANIFEST_PATH) || readFileSync(MANIFEST_PATH, "utf8") !== serialised) {
    writeFileSync(MANIFEST_PATH, serialised);
  }
  if (!quiet) {
    console.log(
      `[tv-glass] glass ${gw}x${gh}px @ ${gx},${gy} → layout +${b}px bleed\n` +
        `[tv-glass] wrote ${path.relative(ROOT, maskFile)}, shade, sheen + manifest`,
    );
  }
  return manifest;
}

/** `--check`: paint the glass rect and the layout rect over the photo. */
async function checkOverlay(outPath) {
  const { src, glass } = readTvContent();
  const file = path.join(ROOT, "public", src.replace(/^\//, ""));
  const meta = await sharp(file).metadata();
  const gx = Math.round((glass.left / 100) * meta.width);
  const gy = Math.round((glass.top / 100) * meta.height);
  const gw = Math.round((glass.width / 100) * meta.width);
  const gh = Math.round((glass.height / 100) * meta.height);
  const b = Math.max(12, Math.round(gw * BLEED));
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">
       <rect x="${gx - b}" y="${gy - b}" width="${gw + b * 2}" height="${gh + b * 2}"
             fill="none" stroke="#3aa7ff" stroke-width="6"/>
       <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}"
             fill="none" stroke="#ff0044" stroke-width="4"/>
     </svg>`,
  );
  await sharp(file).composite([{ input: overlay, top: 0, left: 0 }]).png().toFile(outPath);
  console.log(
    `[tv-glass] glass ${src} ${meta.width}x${meta.height}\n` +
      `[tv-glass] glass rect (red) x ${gx}–${gx + gw}, y ${gy}–${gy + gh}\n` +
      `[tv-glass] layout  rect (blue) +${b}px bleed\n` +
      `[tv-glass] overlay written to ${outPath}`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--check")) {
    await checkOverlay(process.argv.at(-1) ?? "/tmp/tv-glass-check.png");
  } else {
    await generateTvGlass();
  }
}
