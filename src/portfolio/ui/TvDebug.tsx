"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import tube from "../content/tv-tube.json";
import type { ScreenRect } from "../content/types";

/**
 * `?tvdebug=1` — development builds only (the import in sections.tsx is dead
 * code in production, so none of this ships).
 *
 *  red     the measured glass opening (tv-tube.json → outline.glass)
 *  blue    the seed rectangle from defaults.ts (works.tv.screen)
 *  yellow  the edge of the picture mask (opening + per-side outset)
 *  green   the hole in the bezel layer
 *
 * The panel switches each layer of the tube on and off by writing
 * `data-tv-off="…"` on `.tv-box`; portfolio.css hides the matching layer.
 * "stage 1" is the stop-gap state (aperture + mask only, no bezel, no light).
 */
const LAYERS = ["screen", "picture", "tint", "shade", "reflect", "black", "spill", "bezel", "outlines"] as const;
const STAGE_ONE = ["tint", "shade", "reflect", "black", "spill", "bezel"];

const toPoints = (poly: number[][]) => poly.map(([x, y]) => `${x},${y}`).join(" ");

export default function TvDebug({ seed }: { seed: ScreenRect }) {
  const [off, setOff] = useState<string[]>(() => {
    const preset = new URLSearchParams(window.location.search).get("tvoff");
    return preset === "stage1" ? STAGE_ONE : preset ? preset.split(",") : [];
  });
  // Only ever rendered client-side, after mount (see sections.tsx), so the DOM is there.
  const box = document.querySelector<HTMLElement>(".tv-box");
  useEffect(() => {
    box?.setAttribute("data-tv-off", off.join(" "));
    return () => box?.removeAttribute("data-tv-off");
  }, [box, off]);

  const { width: W, height: H } = tube.photo;
  const seedPoly = [
    [seed.left, seed.top],
    [seed.left + seed.width, seed.top],
    [seed.left + seed.width, seed.top + seed.height],
    [seed.left, seed.top + seed.height],
  ].map(([x, y]) => [(x / 100) * W, (y / 100) * H]);

  const toggle = (name: string) => setOff((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));

  return (
    <>
      {box && !off.includes("outlines")
        ? createPortal(
            <svg className="tv-debug-outlines" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <polygon points={toPoints(seedPoly)} fill="none" stroke="#2a6bff" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              <polygon points={toPoints(tube.outline.glass)} fill="none" stroke="#ff2a2a" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              <polygon points={toPoints(tube.outline.mask)} fill="none" stroke="#ffe600" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              <polygon points={toPoints(tube.outline.hole)} fill="none" stroke="#00ffa0" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            </svg>,
            box,
          )
        : null}
      {createPortal(
        <div className="tv-debug-panel">
          <strong>tvdebug</strong>
          {LAYERS.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={!off.includes(name)} onChange={() => toggle(name)} /> {name}
            </label>
          ))}
          <button type="button" onClick={() => setOff(STAGE_ONE)}>stage 1</button>
          <button type="button" onClick={() => setOff([])}>all</button>
        </div>,
        document.body,
      )}
    </>
  );
}
