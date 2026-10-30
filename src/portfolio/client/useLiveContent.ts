"use client";

import { useSyncExternalStore } from "react";
import type { PortfolioContent } from "../content/types";
import { getDemoSnapshot, subscribeDemoSnapshot } from "./demo-store";

/**
 * Renders whatever draft the studio left in this browser, falling back to the
 * content baked into the build.
 *
 * That is the whole preview mechanism of a static site: `/admin` writes to
 * localStorage, this hook subscribes (same tab, other tabs via BroadcastChannel
 * / `storage` events), so an edit shows up on `/` instantly without a deploy.
 * Visitors who never opened the studio have no draft and see exactly what was
 * built.
 *
 * `useSyncExternalStore` rather than an effect: the draft is an external store,
 * and reading it during render is both what it is designed for and what keeps
 * the server render (no draft) and the first client render from disagreeing.
 */
export function useLiveContent(bakedContent: PortfolioContent) {
  const draft = useSyncExternalStore(subscribeDemoSnapshot, getDemoSnapshot, () => null);
  return {
    content: draft?.content ?? bakedContent,
    revision: draft?.revision ?? 0,
  };
}
