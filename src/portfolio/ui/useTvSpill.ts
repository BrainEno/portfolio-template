"use client";

import { useEffect, useRef, type RefObject } from "react";
import tube from "../content/tv-tube.json";

/**
 * The light a CRT picture throws onto its own surroundings.
 *
 * The picture is sampled into a tiny (24 × 16) canvas with `drawImage` only —
 * no `getImageData`, no readback, so it costs a few microseconds and works with
 * cross-origin artwork. CSS then scales that canvas up (bilinear = a free, very
 * wide blur) and shows it through the `tube-ring` mask: the dark seam and the
 * inner lip get at most 25 % of the picture's colour, a 3 % halation sits inside
 * the glass, and nothing reaches the chrome or the wood (see scripts/tv-tube.mjs).
 *
 *  – still works: sampled once, when the image has loaded (the channel change
 *    commits the new source at t = 0.2 s, under the snow);
 *  – video: sampled at ≤ 12 fps, and only while it is playing AND on screen AND
 *    the tab is visible. Every one of those conditions stops the timer;
 *  – prefers-reduced-motion: the spill is a still (one sample, no loop).
 */
const CW = 24;
const CH = 16;
const FRAME_MS = 1000 / 12;

type Drawable = HTMLImageElement | HTMLVideoElement;

/** Draw `el` like `object-fit: cover` into the rectangle (dx, dy, dw, dh) of the canvas. */
function drawCover(ctx: CanvasRenderingContext2D, el: Drawable, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
  const scale = Math.max(dw / sw, dh / sh);
  const cw = dw / scale;
  const ch = dh / scale;
  ctx.drawImage(el, (sw - cw) / 2, (sh - ch) / 2, cw, ch, dx, dy, dw, dh);
}

/**
 * The canvas covers the whole tube box; the picture covers only the aperture
 * inside it. The picture is first stretched over the entire canvas (so the ring
 * outside the aperture has a plausible colour to sample) and then drawn again
 * where it really is.
 */
function paint(canvas: HTMLCanvasElement, el: Drawable, sw: number, sh: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !sw || !sh) return;
  const a = tube.aperture;
  ctx.clearRect(0, 0, CW, CH);
  drawCover(ctx, el, sw, sh, 0, 0, CW, CH);
  drawCover(ctx, el, sw, sh, (a.left / 100) * CW, (a.top / 100) * CH, (a.width / 100) * CW, (a.height / 100) * CH);
}

type Options = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Something is on the tube. */
  hasWork: boolean;
  isVideo: boolean;
  /** Resolved (asset()-prefixed) poster URL of a video work. */
  poster?: string;
  playing: boolean;
  /** Changes whenever the still's source changes. */
  stillKey?: string;
};

export function useTvSpill({ canvasRef, imgRef, videoRef, hasWork, isVideo, poster, playing, stillKey }: Options) {
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Stills, and the poster of a video that has not started yet: one sample on load.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasWork) {
      canvas.getContext("2d")?.clearRect(0, 0, CW, CH);
      return;
    }
    let cancelled = false;
    if (!isVideo) {
      const img = imgRef.current;
      if (!img) return;
      const run = () => {
        if (!cancelled && img.naturalWidth) paint(canvas, img, img.naturalWidth, img.naturalHeight);
      };
      if (img.complete) run();
      img.addEventListener("load", run);
      return () => {
        cancelled = true;
        img.removeEventListener("load", run);
      };
    }
    if (!poster) return;
    const still = new Image();
    still.onload = () => {
      if (!cancelled && !playingRef.current) paint(canvas, still, still.naturalWidth, still.naturalHeight);
    };
    still.src = poster;
    return () => {
      cancelled = true;
      still.onload = null;
    };
  }, [canvasRef, imgRef, hasWork, isVideo, poster, stillKey]);

  // Video: ≤ 12 fps while playing, on screen and visible. Everything else stops the timer.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !isVideo || !playing) return;
    const sample = () => {
      if (video.readyState >= 2) paint(canvas, video, video.videoWidth, video.videoHeight);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sample();
      return;
    }
    let inView = true;
    let timer = 0;
    const tick = () => {
      timer = 0;
      if (!inView || document.hidden) return; // resumed by `wake`
      sample();
      timer = window.setTimeout(tick, FRAME_MS);
    };
    const wake = () => {
      if (!timer && inView && !document.hidden) timer = window.setTimeout(tick, 0);
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      wake();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [canvasRef, videoRef, isVideo, playing]);
}
