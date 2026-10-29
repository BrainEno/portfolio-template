"use client";

import { defaultContent } from "../content/defaults";
import { normalizeContent } from "../content/normalize";
import type { PortfolioContent } from "../content/types";

/**
 * Browser-side draft store for the database-free demo mode.
 *
 * The payload is byte-for-byte the same JSON document the PostgreSQL
 * `site_content` row holds, so a draft produced here can be restored into a
 * live database (and vice versa) through the backup bundle.
 *
 * Persistence: localStorage (survives reloads) + BroadcastChannel (pushed to
 * every open tab instantly) + the `storage` event as a fallback for browsers
 * without BroadcastChannel.
 */
export const DEMO_STORAGE_KEY = "pf.demo.content.v2";
export const DEMO_CHANNEL = "pf.demo.content";
const DRAFT_META_KEY = "pf.demo.meta.v2";

export type DemoMeta = { savedAt: string | null };

type Listener = (content: PortfolioContent) => void;

const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;
let listening = false;

function hasWindow() {
  return typeof window !== "undefined";
}

function parse(raw: string | null): PortfolioContent | null {
  if (!raw) return null;
  try {
    return normalizeContent(JSON.parse(raw));
  } catch {
    return null;
  }
}

function ensureChannel() {
  if (!hasWindow() || listening) return;
  listening = true;

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(DEMO_CHANNEL);
    channel.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "content") emitFromStorage();
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === DEMO_STORAGE_KEY) emitFromStorage();
  });
}

function emitFromStorage() {
  const content = readDemoContent();
  if (!content) return;
  listeners.forEach((listener) => listener(content));
}

export function subscribeDemoContent(listener: Listener) {
  ensureChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readDemoContent(): PortfolioContent | null {
  if (!hasWindow()) return null;
  return parse(window.localStorage.getItem(DEMO_STORAGE_KEY));
}

export function readDemoMeta(): DemoMeta {
  if (!hasWindow()) return { savedAt: null };
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_META_KEY) ?? "{}") as DemoMeta;
  } catch {
    return { savedAt: null };
  }
}

function writeDemoMeta(meta: DemoMeta) {
  if (!hasWindow()) return;
  window.localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));
}

/** Seed a draft from the bundled mock content (idempotent). */
export function seedDemoContent(seed: PortfolioContent = defaultContent) {
  if (!hasWindow() || readDemoContent()) return;
  saveDemoContent(seed);
}

export function saveDemoContent(content: PortfolioContent) {
  if (!hasWindow()) return;
  const normalized = normalizeContent(content);
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Most likely QuotaExceededError from large inline image uploads.
    throw new Error(
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "Browser storage is full — use image URLs instead of uploads in demo mode (or restore a backup later in a real database)."
        : "Could not save the draft in this browser"
    );
  }
  writeDemoMeta({ savedAt: new Date().toISOString() });
  channel?.postMessage({ type: "content" });
  listeners.forEach((listener) => listener(normalized));
}

export function clearDemoContent() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(DEMO_STORAGE_KEY);
  window.localStorage.removeItem(DRAFT_META_KEY);
  channel?.postMessage({ type: "content" });
}
