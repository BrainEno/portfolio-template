"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (offline cache) in production builds. In `next dev` any
 * previously installed worker is removed so stale caches never mask edits.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((list) => list.forEach((reg) => void reg.unregister()));
      return;
    }
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
