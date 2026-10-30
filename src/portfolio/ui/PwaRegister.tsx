"use client";

import { useEffect } from "react";

/**
 * Base path of the deployment (`/repo` on GitHub Pages project sites, empty at a
 * domain root). Inlined at build time by Next, so it is a constant here.
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

/**
 * Registers /sw.js (offline cache) in production builds. In `next dev` any
 * previously installed worker is removed so stale caches never mask edits.
 *
 * The worker's cache list is written against the site root, so it is only
 * registered when the site is actually served from the root — a sub-path
 * deployment keeps working, it just loses the offline cache instead of caching
 * the wrong URLs.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((list) => list.forEach((reg) => void reg.unregister()));
      return;
    }
    if (BASE_PATH) return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
