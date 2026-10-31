#!/usr/bin/env node
/** Check that the painted picture covers every substantially transparent pixel. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const alphaFile = new URL("public/images/tv-alpha.webp", root);
const originalFile = new URL("public/images/tv.webp", root);
const source = await readFile(new URL("src/portfolio/content/defaults.ts", root), "utf8");
const match = source.match(/screen:\s*\{\s*top:\s*([\d.]+),\s*left:\s*([\d.]+),\s*width:\s*([\d.]+),\s*height:\s*([\d.]+)\s*\}/);
assert.ok(match, "default screen rectangle not found");
const [, top, left, width, height] = match.map(Number);
const { data, info } = await sharp(alphaFile.pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const original = await sharp(originalFile.pathname).metadata();
assert.ok(Math.abs(info.width / info.height - original.width / original.height) < 0.001, "photo and alpha aspect ratios must agree");
let count = 0;
let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    // WebP alpha is slightly below 255 outside the hole; 200 distinguishes the
    // real transparent/antialiased opening from incidental compression noise.
    if (data[(y * info.width + x) * 4 + 3] >= 200) continue;
    count++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
}
assert.ok(count > 1000, "the TV image must have a transparent opening");
assert.ok(minX >= info.width * left / 100 && maxX < info.width * (left + width) / 100, "screen rectangle must cover the opening horizontally");
assert.ok(minY >= info.height * top / 100 && maxY < info.height * (top + height) / 100, "screen rectangle must cover the opening vertically");
console.log(`[tv assets] ${count} transparent pixels covered; opening: (${minX}, ${minY})–(${maxX}, ${maxY})`);
