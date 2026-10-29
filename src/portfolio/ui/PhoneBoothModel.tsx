"use client";

import { useEffect, useRef } from "react";
import type { BoothHandle } from "../three/booth";

type Props = {
  /** Optimised GLB of the uploaded telephone model. */
  src: string;
  /** Flat cutout kept as the pre-WebGL state and the no-WebGL fallback. */
  fallback: string;
  /** Idle self-rotation, radians per second. */
  spin?: number;
};

/**
 * Mounts the WebGL booth only when the contact section is getting close, and
 * keeps the photographic cutout underneath so the entrance animation never
 * plays into an empty box (and so the page still reads correctly without
 * WebGL, on reduced motion, or while the 2 MB model streams in).
 */
export function PhoneBoothModel({ src, fallback, spin = 0.42 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let handle: BoothHandle | null = null;
    let loading = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mount = async () => {
      if (loading || disposed || handle) return;
      loading = true;
      try {
        const { mountBooth } = await import("../three/booth");
        if (disposed) return;
        const mounted = await mountBooth(host, { url: src, spin, reduceMotion: reduce });
        if (disposed) {
          mounted.dispose();
          return;
        }
        handle = mounted;
        // Written straight to the DOM instead of through state: the canvas is
        // already painted at this point and the cutout underneath must be
        // hidden in the same frame (a React re-render would let one frame of
        // the flat image show through the model).
        host.dataset.ready = "true";
      } catch (error) {
        // A failed decode / unsupported WebGL must not break the section.
        console.warn("[booth] falling back to the cutout image", error);
        if (!disposed) host.dataset.fallback = "true";
      }
    };

    // Fetch the model before the section scrolls in so the entrance is never
    // waiting on the network.
    const preload = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        preload.disconnect();
        void mount();
      },
      { rootMargin: "150% 0px 150% 0px" }
    );
    preload.observe(host);

    // Park the render loop whenever the booth is off screen.
    const pause = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        handle?.setPaused(!visible);
      },
      { rootMargin: "20% 0px 20% 0px" }
    );
    pause.observe(host);

    return () => {
      disposed = true;
      preload.disconnect();
      pause.disconnect();
      handle?.dispose();
      handle = null;
    };
  }, [src, spin]);

  return (
    <div ref={hostRef} className="contact-booth-canvas" aria-hidden="true">
      <img className="contact-booth-still" src={fallback} alt="" loading="lazy" decoding="async" />
    </div>
  );
}
