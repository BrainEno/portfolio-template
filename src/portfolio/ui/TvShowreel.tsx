/** Copyright © 2026 BrainEno. See LICENSE and TERMS.md. */
"use client";

import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import type { LocalizedText } from "../content/types";
import { srcSetFor } from "./Img";
import { asset } from "../seo/asset";

export type TvWork = {
  id: string;
  src: string;
  alt: LocalizedText;
  videoSrc?: string;
  videoPoster?: string;
};

type Props = {
  active: TvWork | null;
  label: (text: LocalizedText) => string;
};

/** Switch sources behind opaque snow; the alpha-cut cabinet provides the edge. */
export default function TvShowreel({ active, label }: Props) {
  const staticRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shownRef = useRef<TvWork | null>(null);
  const [shown, setShown] = useState<TvWork | null>(null);
  const id = active?.id;
  const src = active?.src;
  const altZh = active?.alt.zh;
  const altEn = active?.alt.en;
  const videoSrc = active?.videoSrc;
  const videoPoster = active?.videoPoster;

  useEffect(() => {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 160;
    const ctx = tile.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(160, 160);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.random() < 0.9 ? 40 + Math.random() * 120 : 205 + Math.random() * 50;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (staticRef.current) staticRef.current.style.backgroundImage = `url(${tile.toDataURL("image/png")})`;
  }, []);

  useEffect(() => {
    const snow = staticRef.current;
    const roll = rollRef.current;
    const next: TvWork | null = id && src ? {
      id, src, alt: { zh: altZh ?? "", en: altEn ?? "" }, videoSrc, videoPoster,
    } : null;
    const commit = (work: TvWork | null) => {
      shownRef.current = work;
      setShown(work);
    };

    if (!next) {
      videoRef.current?.pause();
      if (snow && roll) gsap.set([snow, roll], { opacity: 0 });
      // Keep the last frame through the CSS cross-fade back to the photo.
      const timer = window.setTimeout(() => commit(null), 240);
      return () => window.clearTimeout(timer);
    }
    videoRef.current?.pause();
    if (!snow || !roll || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const sameVideo = shownRef.current?.id === next.id && shownRef.current.videoSrc === next.videoSrc;
      commit(next);
      if (sameVideo && videoRef.current) void videoRef.current.play().catch(() => undefined);
      return;
    }

    // Start covered even on the first hover. Killing this timeline on every
    // change prevents stale delayed commits during rapid pointer movement.
    gsap.set(snow, { opacity: 1, backgroundPosition: "0px 0px" });
    gsap.set(roll, { opacity: 0.4, yPercent: -70 });
    const tl = gsap.timeline();
    tl.to(snow, { backgroundPosition: "480px 240px", duration: 0.42, ease: "steps(9)" }, 0)
      .to(roll, { yPercent: 70, duration: 0.35, ease: "none" }, 0)
      .call(() => {
        const sameVideo = shownRef.current?.id === next.id && shownRef.current.videoSrc === next.videoSrc;
        commit(next);
        if (sameVideo && videoRef.current) {
          void videoRef.current.play().catch(() => undefined);
        }
      }, undefined, 0.14)
      .to(snow, { opacity: 0, duration: 0.18, ease: "power1.out" }, 0.3)
      .to(roll, { opacity: 0, duration: 0.16 }, 0.3);
    return () => { tl.kill(); };
  }, [id, src, altZh, altEn, videoSrc, videoPoster]);

  return (
    <>
      {shown?.videoSrc ? (
        <video
          ref={videoRef}
          key={shown.id}
          className="tv-cover tv-video"
          src={asset(shown.videoSrc)}
          poster={asset(shown.videoPoster ?? shown.src)}
          preload="metadata"
          autoPlay
          muted
          loop
          playsInline
          aria-label={label(shown.alt)}
          onClick={(event) => {
            const video = event.currentTarget;
            if (video.paused) void video.play().catch(() => undefined);
            else video.pause();
          }}
        />
      ) : shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- responsive static export
        <img className="tv-cover" src={asset(shown.src)} srcSet={srcSetFor(shown.src)} sizes="(max-width: 767px) 80vw, 55vw" alt={label(shown.alt)} decoding="async" draggable={false} />
      ) : null}
      <div ref={staticRef} className="tv-static" aria-hidden="true" />
      <div ref={rollRef} className="tv-roll" aria-hidden="true" />
    </>
  );
}
