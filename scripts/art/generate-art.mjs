/**
 * Renders the vector illustrations and starter placeholder media:
 *   public/images/tv-placeholder.webp   - the vector television scene
 *   public/images/tv.webp               - only if it does not exist yet (see below)
 *   public/images/phone-booth-cutout.png - the telephone booth
 *   public/images/figure.jpg             - hero image
 *   public/images/profilephoto.jpg       - biography portrait
 *   public/images/tree{1..5}.jpg         - gallery rolls
 *   public/images/accent-{1,2}.jpg       - gallery accents
 *   public/images/works/*.jpg            - sample project covers
 *
 * Run:  node scripts/art/generate-art.mjs
 *
 * It never overwrites `tv.webp` (your own photo) — see the note further down.
 */
import sharp from "sharp";
import { copyFile, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const out = path.join(root, "public", "images");
const worksOut = path.join(out, "works");
const iconsOut = path.join(root, "public", "icons");
mkdirSync(out, { recursive: true });
mkdirSync(worksOut, { recursive: true });
mkdirSync(iconsOut, { recursive: true });

const W = 2560;
const H = 1707;
// Glass rectangle of the *placeholder* cabinet, in the same percentages the
// content uses (`src/portfolio/content/defaults.ts` → `works.tv.screen`).
// They must agree: if this artwork is ever seeded as `tv.webp` (a fresh clone
// with no photo), the picture overlay is positioned from those percentages, so
// a placeholder with the glass somewhere else would look broken.
// Defaults today: { top: 57.18, left: 43.45, width: 12.9688, height: 15.8781 }.
const glass = { x: 0.4345 * W, y: 0.5718 * H, w: 0.129688 * W, h: 0.158781 * H };

const grain = (w, h, count, color) =>
  Array.from({ length: count }, (_, i) => {
    const yy = (i * 37.7) % h;
    const o = 0.05 + ((i * 13) % 7) / 60;
    return `<path d="M0 ${yy.toFixed(1)} q ${w / 4} ${(i % 3) - 1} ${w / 2} 0 t ${w / 2} 0" stroke="${color}" stroke-opacity="${o.toFixed(2)}" stroke-width="${1 + (i % 3)}" fill="none"/>`;
  }).join("");

const tvSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="room" cx="50%" cy="48%" r="70%">
      <stop offset="0" stop-color="#2a2420"/><stop offset="0.55" stop-color="#14110f"/><stop offset="1" stop-color="#050404"/>
    </radialGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b4429"/><stop offset="0.5" stop-color="#4d2f1b"/><stop offset="1" stop-color="#34200f"/>
    </linearGradient>
    <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0c0b0a"/><stop offset="1" stop-color="#1b1815"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1612"/><stop offset="0.5" stop-color="#060505"/>
    </linearGradient>
    <radialGradient id="knob" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="#d9c9a8"/><stop offset="4a3c26"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#room)"/>
  <g opacity="0.35">
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 190 - 40}" y="0" width="3" height="${H * 0.78}" fill="#000"/>`).join("")}
  </g>
  <rect x="0" y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="url(#floor)"/>
  <rect x="0" y="${H * 0.78}" width="${W}" height="6" fill="#3b2e22" opacity="0.6"/>
  <ellipse cx="${W / 2}" cy="${H * 0.835}" rx="640" ry="46" fill="#000" opacity="0.85" filter="url(#soft)"/>

  <rect x="930" y="1320" width="40" height="250" rx="6" fill="#2a190d"/>
  <rect x="1590" y="1320" width="40" height="250" rx="6" fill="#2a190d"/>
  <rect x="850" y="1290" width="860" height="46" rx="10" fill="url(#wood)"/>
  <rect x="850" y="1326" width="860" height="10" fill="#000" opacity="0.4"/>

  <rect x="868" y="782" width="824" height="516" rx="46" fill="url(#wood)"/>
  <svg x="868" y="782" width="824" height="516" viewBox="0 0 824 516" overflow="hidden">${grain(824, 516, 46, "#1c0e05")}</svg>
  <rect x="868" y="782" width="824" height="516" rx="46" fill="none" stroke="#8a5a36" stroke-opacity="0.55" stroke-width="3"/>
  ${Array.from({ length: 9 }, (_, i) => `<rect x="${1010 + i * 60}" y="812" width="38" height="8" rx="4" fill="#1a0f07" opacity="0.8"/>`).join("")}

  <rect x="${glass.x - 62}" y="${glass.y - 58}" width="${glass.w + 124}" height="${glass.h + 116}" rx="64" fill="url(#bezel)"/>
  <rect x="${glass.x - 62}" y="${glass.y - 58}" width="${glass.w + 124}" height="${glass.h + 116}" rx="64" fill="none" stroke="#3a322a" stroke-width="3"/>
  <rect x="${glass.x - 14}" y="${glass.y - 14}" width="${glass.w + 28}" height="${glass.h + 28}" rx="48" fill="#070606"/>
  <rect x="${glass.x + 2}" y="${glass.y + 2}" width="${glass.w - 4}" height="${glass.h - 4}" rx="34" fill="#fff"/>

  ${Array.from({ length: 11 }, (_, i) => `<rect x="918" y="${920 + i * 22}" width="86" height="6" rx="3" fill="#120a05" opacity="0.85"/>`).join("")}
  <circle cx="1560" cy="1000" r="38" fill="url(#knob)"/><circle cx="1560" cy="1000" r="38" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="3"/>
  <rect x="1556" y="966" width="8" height="26" rx="3" fill="#1a1208"/>
  <circle cx="1560" cy="1112" r="30" fill="url(#knob)"/><circle cx="1560" cy="1112" r="30" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="3"/>
  <rect x="1556" y="1084" width="8" height="22" rx="3" fill="#1a1208"/>
  <rect x="1526" y="1178" width="68" height="14" rx="7" fill="#120a05"/>
  <circle cx="1620" cy="1230" r="7" fill="#e55139"/>
  <rect x="1180" y="1262" width="200" height="16" rx="8" fill="#c9b48a" opacity="0.55"/>

  <g stroke="#9a8a72" stroke-width="5" stroke-linecap="round">
    <line x1="1230" y1="782" x2="1130" y2="560"/>
    <line x1="1330" y1="782" x2="1440" y2="566"/>
  </g>
  <rect x="1250" y="764" width="60" height="26" rx="12" fill="#1a1008"/>
</svg>`;

const panes = [0, 1, 2, 3, 4, 5]
  .flatMap((r) =>
    [0, 1, 2].map((c) => {
      const x = 134 + c * 168;
      const y = 296 + r * 190;
      return `<rect x="${x}" y="${y}" width="150" height="172" fill="url(#pane)"/><polygon points="${x},${y + 172} ${x + 150},${y} ${x + 150},${y + 26} ${x + 40},${y + 172}" fill="#fff" opacity="0.5"/>`;
    })
  )
  .join("");

const sidePanes = [0, 1, 2, 3, 4, 5]
  .map((r) => {
    const t = 330 + r * 190;
    return `<polygon points="672,${t - 70 + r * 3} 778,${t - 38 + r * 2} 778,${t + 118 - r * 2} 672,${t + 140 - r * 3}" fill="url(#paneSide)"/>`;
  })
  .join("");

const boothSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600" viewBox="0 0 900 1600">
  <defs>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1a1a1a"/><stop offset="0.5" stop-color="#3a3a3a"/><stop offset="1" stop-color="#151515"/>
    </linearGradient>
    <linearGradient id="pane" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2f4f4"/><stop offset="1" stop-color="#bfc6c6"/>
    </linearGradient>
    <linearGradient id="paneSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#cfd5d5"/><stop offset="1" stop-color="#8d9595"/>
    </linearGradient>
    <linearGradient id="sign" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fafafa"/><stop offset="1" stop-color="#d4d4d4"/>
    </linearGradient>
  </defs>
  <polygon points="650,230 800,290 800,1475 650,1500" fill="url(#frame)"/>
  ${sidePanes}
  <rect x="100" y="230" width="550" height="1270" fill="url(#frame)"/>
  <polygon points="70,230 100,150 650,150 680,230" fill="#232323"/>
  <polygon points="100,150 160,98 590,98 650,150" fill="#2c2c2c"/>
  <polygon points="650,150 680,230 830,290 800,206" fill="#181818"/>
  <polygon points="590,98 650,150 800,206 730,134" fill="#1f1f1f"/>
  <rect x="150" y="168" width="450" height="96" fill="url(#sign)"/>
  <rect x="150" y="168" width="450" height="96" fill="none" stroke="#111" stroke-width="6"/>
  <text x="375" y="238" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="64" letter-spacing="9" text-anchor="middle" fill="#151515">TELEPHONE</text>
  ${panes}
  <g opacity="0.55" fill="#202020">
    <rect x="330" y="760" width="90" height="170" rx="10"/>
    <rect x="344" y="780" width="62" height="40" rx="6" fill="#d8dcdc"/>
    <circle cx="375" cy="870" r="26" fill="#d8dcdc"/>
    <path d="M292 770 q -22 60 6 120" stroke="#202020" stroke-width="14" fill="none" stroke-linecap="round"/>
  </g>
  <rect x="603" y="860" width="12" height="150" rx="5" fill="#cfcfcf"/>
  <rect x="86" y="1478" width="580" height="44" fill="#151515"/>
  <polygon points="666,1478 816,1458 816,1500 666,1522" fill="#0f0f0f"/>
</svg>`;

const escapeXml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

async function renderCard(targetPath, w, h, title, subtitle, [c1, c2, c3]) {
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="50%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <circle cx="${w * 0.85}" cy="${h * 0.25}" r="${Math.min(w, h) * 0.35}" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
  <circle cx="${w * 0.85}" cy="${h * 0.25}" r="${Math.min(w, h) * 0.2}" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/>
  <line x1="${w * 0.08}" y1="${h * 0.82}" x2="${w * 0.92}" y2="${h * 0.82}" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/>
  <text x="${w * 0.08}" y="${h * 0.72}" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="${Math.round(h * 0.085)}" fill="#f5f5f5" letter-spacing="1">${safeTitle}</text>
  <text x="${w * 0.08}" y="${h * 0.77}" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="${Math.round(h * 0.038)}" fill="#bbbbbb" letter-spacing="2">${safeSubtitle}</text>
  <text x="${w * 0.92}" y="${h * 0.87}" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="${Math.round(h * 0.03)}" fill="#888888" text-anchor="end" letter-spacing="3">PORTFOLIO / 2026</text>
</svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(targetPath);
}

// 1. Core vector artworks
//
// The TV is the one piece of artwork a project is expected to *replace* with a
// photo of its own, so regenerating it in place would silently destroy that
// work. The vector scene is written to `tv-placeholder.webp`; `tv.webp` is
// only seeded when it is still missing (a fresh clone of the template).
const tvTarget = path.join(out, "tv.webp");
await sharp(Buffer.from(tvSvg)).webp({ quality: 88 }).toFile(path.join(out, "tv-placeholder.webp"));
if (existsSync(tvTarget)) {
  console.log("[art] public/images/tv.webp exists — kept as is (placeholder written to tv-placeholder.webp)");
} else {
  await copyFile(path.join(out, "tv-placeholder.webp"), tvTarget);
  console.log("[art] seeded public/images/tv.webp from the vector placeholder");
}
await sharp(Buffer.from(boothSvg)).png({ compressionLevel: 9 }).toFile(path.join(out, "phone-booth-cutout.png"));

// 2. Portrait and Hero images
await renderCard(path.join(out, "figure.jpg"), 1200, 1600, "FIGURE", "HERO SCENE", ["#1e1b18", "#110f0d", "#080706"]);
await renderCard(path.join(out, "profilephoto.jpg"), 1000, 1400, "PORTRAIT", "BIOGRAPHY / ABOUT", ["#1f1a1d", "#131012", "#090708"]);

// 3. Gallery rolls & accents
const palettes = [
  ["#18232c", "#0f161c", "#070b0e"],
  ["#1c2826", "#111817", "#080c0b"],
  ["#2b1e1e", "#1b1212", "#0d0909"],
  ["#231d28", "#161219", "#0b090c"],
  ["#26231c", "#171511", "#0b0a08"],
];
for (let i = 1; i <= 5; i++) {
  await renderCard(path.join(out, `tree${i}.jpg`), 1200, 900, `ARCHIVE 0${i}`, "ATMOSPHERE & NATURE", palettes[i - 1]);
}
await renderCard(path.join(out, "accent-1.jpg"), 900, 1200, "ACCENT I", "PERFORMANCE STILL", ["#2d1b18", "#1a0f0d", "#0d0806"]);
await renderCard(path.join(out, "accent-2.jpg"), 900, 1200, "ACCENT II", "SHOWCASE STILL", ["#182324", "#0e1516", "#070a0b"]);

// 4. Works covers
const works = [
  { file: "lyric-forge-ktv.jpg", title: "LYRIC FORGE KTV", sub: "LOCAL-FIRST KTV PRODUCTION" },
  { file: "no-wave.jpg", title: "NO WAVE", sub: "EXPERIMENTAL AUDIO & VISUAL" },
  { file: "remix-partfolio.jpg", title: "REMIX PORTFOLIO", sub: "INTERACTIVE DESIGN SYSTEM" },
  { file: "scribeforge.jpg", title: "SCRIBE FORGE", sub: "EDITORIAL WORKSPACE ENGINE" },
  { file: "win7-book-management.jpg", title: "BOOK MANAGEMENT", sub: "FLUTTER DESKTOP SUITE" },
];

for (const w of works) {
  await renderCard(path.join(worksOut, w.file), 1600, 1000, w.title, w.sub, ["#221d2a", "#141119", "#09080c"]);
}

// 5. PWA Icons from icon.svg
const iconSvgPath = path.join(root, "src", "app", "icon.svg");
const iconSvgBuf = readFileSync(iconSvgPath);
await sharp(iconSvgBuf).resize(192, 192).png().toFile(path.join(iconsOut, "icon-192.png"));
await sharp(iconSvgBuf).resize(512, 512).png().toFile(path.join(iconsOut, "icon-512.png"));
await sharp(iconSvgBuf).resize(512, 512).png().toFile(path.join(iconsOut, "maskable-512.png"));

console.log("all artwork, images, and PWA icons rendered successfully");
