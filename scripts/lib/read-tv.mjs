/**
 * Reads the `works.tv` block of `src/portfolio/content/defaults.ts` — the one
 * place that owns the television's artwork, glass seed rectangle and `tube`
 * settings — so the build scripts can never drift from the site.
 *
 * The block is plain literals (numbers, strings, nested objects), so it is
 * parsed by stripping comments, quoting keys and calling JSON.parse. Missing
 * keys throw: scripts must not invent defaults the content does not declare.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED = {
  top: ["src", "width", "height", "screen", "tube"],
  screen: ["top", "left", "width", "height"],
  tube: [
    "rays", "startFrac", "searchFrac", "searchPad", "step", "gap", "run", "fitCorner", "fitRejectPx",
    "chrome", "pad", "feather", "holeMargin", "holeFeather", "outset", "budget", "shade", "tint", "reflect", "ring",
  ],
  sides: ["top", "right", "bottom", "left"],
  shade: ["edge", "band", "corner", "cornerReach", "topLip", "topLipBand", "vignette"],
  tint: ["sigma"],
  reflect: ["sigma", "tight", "threshold", "gain", "inset"],
  ring: ["peak", "band", "halation", "darkLo", "darkHi"],
};

function need(obj, keys, where) {
  for (const key of keys) {
    if (obj?.[key] === undefined) throw new Error(`[read-tv] works.tv.${where}${key} is missing in defaults.ts`);
  }
}

export function readTv(root) {
  const file = path.join(root, "src/portfolio/content/defaults.ts");
  const text = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const at = text.search(/\btv:\s*\{/);
  if (at < 0) throw new Error("[read-tv] no `tv:` block in defaults.ts");
  const open = text.indexOf("{", at);
  let depth = 0;
  let close = open;
  for (; close < text.length; close++) {
    if (text[close] === "{") depth++;
    else if (text[close] === "}" && --depth === 0) break;
  }
  const json = text
    .slice(open, close + 1)
    .replace(/([A-Za-z_]\w*)\s*:/g, '"$1":')
    .replace(/,\s*([}\]])/g, "$1");
  const tv = JSON.parse(json);
  need(tv, REQUIRED.top, "");
  need(tv.screen, REQUIRED.screen, "screen.");
  need(tv.tube, REQUIRED.tube, "tube.");
  need(tv.tube.outset, REQUIRED.sides, "tube.outset.");
  need(tv.tube.budget, REQUIRED.sides, "tube.budget.");
  need(tv.tube.shade, REQUIRED.shade, "tube.shade.");
  need(tv.tube.tint, REQUIRED.tint, "tube.tint.");
  need(tv.tube.reflect, REQUIRED.reflect, "tube.reflect.");
  need(tv.tube.ring, REQUIRED.ring, "tube.ring.");
  return tv;
}
