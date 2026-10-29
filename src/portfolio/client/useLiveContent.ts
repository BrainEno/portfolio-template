"use client";

import { useEffect, useRef, useState } from "react";
import type { PortfolioContent } from "../content/types";
import { readDemoContent, subscribeDemoContent } from "./demo-store";

/**
 * In demo mode the index page renders whatever draft lives in the browser,
 * so edits made in /admin show up immediately (same tab via state, other tabs
 * via BroadcastChannel / storage events) without a reload.
 *
 * In live mode the database payload always wins and any local draft is
 * ignored — connecting PostgreSQL automatically retires the mock data.
 */
export function useLiveContent(serverContent: PortfolioContent, mode: "demo" | "postgres") {
  const isDemo = mode === "demo";
  const [content, setContent] = useState<PortfolioContent>(serverContent);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (!isDemo) {
      setContent(serverContent);
      return;
    }
    const cached = readDemoContent();
    if (cached) setContent(cached);
    return subscribeDemoContent((next) => {
      setContent(next);
      setRevision((value) => value + 1);
    });
  }, [isDemo, serverContent]);

  return { content, revision };
}
