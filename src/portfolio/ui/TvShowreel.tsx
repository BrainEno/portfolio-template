"use client";

import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import type { LocalizedText } from "../content/types";
import { srcSetFor } from "./Img";

export type TvWork = { id: string; src: string; alt: LocalizedText };

type Props = {
  /** The work the page wants on screen; `null` powers the tube down. */
  active: TvWork | null;
  /** Alt text for the current language. */
  label: (text: LocalizedText) => string;
};

/**
 * The screen of the television in the works section.
 *
 * Changing the picture is a **channel change**, not a cross-fade: the tube loses
 * vertical hold (the frame collapses to a bright line), the space between
 * channels comes through as analogue snow, and the new picture snaps back into
 * sync from that line. That is the whole grammar of a CRT tuner — collapse,
 * snow, re-lock — so it reads as one physical event rather than a slideshow
 * effect.
 *
 * The timeline is deliberately short (≈580 ms end to end) and front-loaded: the
 * collapse is 110 ms, the snow owns the tube for most of the next third, and the
 * new frame expands faster than it collapsed, which is how a real set behaves
 * when the tuner lands on a station.
 * Everything is driven by GSAP on three cheap layers (the frame, a snow tile and
 * a rolling white bar) — no WebGL, no per-pixel work, nothing that can jank a
 * scroll.
 */
export default function TvShowreel({ active, label }: Props) {
  const coverRef = useRef<HTMLImageElement>(null);
  const staticRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  /** What is actually painted right now — swapped in the middle of the timeline. */
  const [shown, setShown] = useState<TvWork | null>(active);
  const shownRef = useRef<TvWork | null>(active);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  /** One 160 px tile of analogue snow, reused as a repeating background. */
  useEffect(() => {
    const tile = document.createElement("canvas");
    tile.width = 160;
    tile.height = 160;
    const ctx = tile.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(tile.width, tile.height);
    for (let i = 0; i < image.data.length; i += 4) {
      // Mostly dark grain with occasional hot pixels, like real snow seen
      // through a thick glass front. A dark-but-not-black grain: bright specks on grey, which is what makes
      // the layer opaque enough to actually hide the outgoing picture instead
      // of merely glowing on top of it.
      const value = Math.random() < 0.9 ? 40 + Math.random() * 120 : 205 + Math.random() * 50;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (staticRef.current) staticRef.current.style.backgroundImage = `url(${tile.toDataURL("image/png")})`;
  }, []);

  useEffect(() => {
    const nextId = active?.id ?? null;
    const currentId = shownRef.current?.id ?? null;
    if (nextId === currentId) return;

    const cover = coverRef.current;
    const staticLayer = staticRef.current;
    const roll = rollRef.current;
    const line = lineRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const commit = (work: TvWork | null) => {
      shownRef.current = work;
      setShown(work);
    };

    if (reduce || !cover || !staticLayer || !roll || !line) {
      commit(active);
      return;
    }

    timeline.current?.kill();
    const hadPicture = Boolean(currentId) && Boolean(active);

    const tl = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: () => {
        gsap.set([staticLayer, roll], { opacity: 0 });
      },
    });
    timeline.current = tl;
    // QA hook: lets the screenshot harness slow the channel change down to a
    // crawl so it can be inspected frame by frame. Development only — the
    // branch is dropped from production builds.
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as Record<string, unknown>;
      w.__tvTl = tl;
      const rate = w.__tvRate as number | undefined;
      if (rate) tl.timeScale(rate);
    }

    // Nothing on the tube yet (first hover): come up out of pure snow.
    // Losing the picture (leaving the rows): collapse to the line and go dark.
    if (!hadPicture) {
      gsap.set([staticLayer, roll, line], { clearProps: "opacity" });
      gsap.set(cover, { scaleY: currentId ? 1 : 0.02, opacity: currentId ? 1 : 0, transformOrigin: "50% 50%" });
      tl.to(staticLayer, { opacity: 1, duration: 0.08 }, 0)
        .to(line, { opacity: 0.85, duration: 0.05 }, 0)
        .to(roll, { opacity: 0.5, duration: 0.06 }, 0);
      if (active) {
        tl.call(() => commit(active), undefined, 0.1)
          .to(cover, { scaleY: 1, opacity: 1, duration: 0.3, ease: "power3.out" }, 0.1)
          .to(line, { opacity: 0, duration: 0.14 }, 0.12)
          .to(staticLayer, { opacity: 0, duration: 0.24 }, 0.14)
          .to(roll, { opacity: 0, duration: 0.2 }, 0.16);
      } else {
        tl.to(cover, { scaleY: 0.02, duration: 0.14, ease: "power2.in" }, 0)
          .to(staticLayer, { opacity: 0, duration: 0.2 }, 0.12)
          .to(line, { opacity: 0, duration: 0.2 }, 0.12)
          .to(roll, { opacity: 0, duration: 0.18 }, 0.12);
      }
      return;
    }

    // A real channel change. The order matters: the picture has to leave the
    // glass *before* the snow arrives, and the new picture may only start
    // expanding while the snow is already clearing — otherwise the swap shows
    // up as a frame pasted onto the grain instead of emerging from it.
    tl
      // 1 — vertical hold goes: the picture squashes into the sync line and
      //     blows out, exactly like a set that lost the field pulse.
      .to(cover, { scaleY: 0.02, transformOrigin: "50% 50%", duration: 0.11, ease: "power2.in" }, 0)
      .to(cover, { filter: "brightness(3.4) saturate(0) contrast(1.4)", duration: 0.11 }, 0)
      .to(cover, { opacity: 0, duration: 0.04, ease: "none" }, 0.09)
      // 2 — the sync line holds for a beat, then smears out.
      .fromTo(line, { opacity: 0, scaleX: 0.98 }, { opacity: 0.9, scaleX: 1, duration: 0.03, ease: "none" }, 0.06)
      .to(line, { opacity: 0, duration: 0.14, ease: "power1.in" }, 0.2)
      // 3 — between stations: full analogue snow and a rolling bar. The grain
      //     owns the tube from 0.12 until 0.30, and the source is swapped
      //     underneath it at 0.2.
      .to(staticLayer, { opacity: 1, duration: 0.04, ease: "none" }, 0.1)
      .to(roll, { opacity: 0.6, duration: 0.05 }, 0.1)
      .fromTo(staticLayer, { backgroundPosition: "0px 0px" }, { backgroundPosition: "480px 240px", duration: 0.42, ease: "steps(9)" }, 0.1)
      .fromTo(roll, { yPercent: -140 }, { yPercent: 140, duration: 0.36, ease: "power1.in" }, 0.1)
      .call(() => commit(active), undefined, 0.2)
      // 4 — the tuner lands. The picture re-locks *behind* the grain (still a
      //     full screen of noise at this point), and only once it is a solid
      //     frame does the snow clear away: the new channel resolves out of the
      //     noise instead of being drawn on top of it.
      .to(cover, { scaleY: 1, duration: 0.24, ease: "power3.out" }, 0.26)
      .to(cover, { opacity: 1, duration: 0.1, ease: "none" }, 0.26)
      .to(cover, { filter: "saturate(1.12) contrast(1.06) brightness(0.88)", duration: 0.3 }, 0.3)
      .to(staticLayer, { opacity: 0, duration: 0.16, ease: "power1.out" }, 0.42)
      .to(roll, { opacity: 0, duration: 0.16 }, 0.42);
  }, [active]);

  useEffect(
    () => () => {
      timeline.current?.kill();
    },
    []
  );

  return (
    <>
      {/* The tube is ~21vw wide when it rests, but the works choreography
          zooms it to the full viewport, so the candidate ladder is chosen for
          the zoomed size — a screen that pixelates mid-transition would be a
          far worse trade than the extra ~20 KB. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- GSAP drives this
          node directly (the channel change animates the element itself), so it
          needs the ref; the responsive candidates are attached above. */}
      <img
        ref={coverRef}
        className="tv-cover"
        src={shown?.src || undefined}
        srcSet={shown ? srcSetFor(shown.src) : undefined}
        sizes={shown?.src ? "(max-width: 767px) 80vw, 55vw" : undefined}
        alt={shown ? label(shown.alt) : ""}
        decoding="async"
        draggable={false}
      />
      <div ref={staticRef} className="tv-static" aria-hidden="true" />
      <div ref={lineRef} className="tv-sync-line" aria-hidden="true" />
      <div ref={rollRef} className="tv-roll" aria-hidden="true" />
    </>
  );
}
