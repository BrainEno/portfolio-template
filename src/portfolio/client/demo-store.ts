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

/**
 * Everything the UI needs to render a draft, in one immutable value.
 *
 * `useSyncExternalStore` requires `getSnapshot()` to return the same reference
 * until the underlying storage actually changes, so the parsed content and the
 * saved-at stamp are cached here and rebuilt only when the raw strings differ.
 * That also gives hooks a monotonic `revision` to re-run layout effects with.
 */
export type DemoSnapshot = { content: PortfolioContent; savedAt: string | null; revision: number };

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
      if (event.data?.type !== "content") return;
      emitFromStorage();
      snapshotListeners.forEach((listener) => listener());
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== DEMO_STORAGE_KEY && event.key !== DRAFT_META_KEY) return;
    emitFromStorage();
    snapshotListeners.forEach((listener) => listener());
  });
}

function emitFromStorage() {
  const content = readDemoContent();
  if (!content) return;
  listeners.forEach((listener) => listener(content));
}

/* ---- snapshot cache -------------------------------------------------- */
let cachedContent: PortfolioContent | null = null;
let cachedContentRaw: string | null = null;
let cachedMeta: DemoMeta = { savedAt: null };
let cachedMetaRaw: string | null = null;
let snapshot: DemoSnapshot | null = null;
let revision = 0;
const snapshotListeners = new Set<() => void>();

function demoMetaRaw(): string | null {
  return hasWindow() ? window.localStorage.getItem(DRAFT_META_KEY) : null;
}

export function readDemoMeta(): DemoMeta {
  const raw = demoMetaRaw();
  if (raw !== cachedMetaRaw) {
    cachedMetaRaw = raw;
    try {
      cachedMeta = JSON.parse(raw ?? "{}") as DemoMeta;
    } catch {
      cachedMeta = { savedAt: null };
    }
  }
  return cachedMeta;
}

/** Current draft, or `null` when this browser has none. Referentially stable. */
export function getDemoSnapshot(): DemoSnapshot | null {
  if (!hasWindow()) return null;
  const contentRaw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (contentRaw !== cachedContentRaw) {
    cachedContentRaw = contentRaw;
    cachedContent = parse(contentRaw);
    snapshot = null;
    revision += 1;
  }
  const meta = readDemoMeta();
  if (meta.savedAt !== (snapshot ? snapshot.savedAt : null)) snapshot = null;
  if (!cachedContent) return null;
  if (!snapshot) snapshot = { content: cachedContent, savedAt: meta.savedAt, revision };
  return snapshot;
}

/** Subscribe to draft changes (this tab, other tabs, or a save). */
export function subscribeDemoSnapshot(listener: () => void) {
  ensureChannel();
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
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
  snapshotListeners.forEach((listener) => listener());
}

export function clearDemoContent() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(DEMO_STORAGE_KEY);
  window.localStorage.removeItem(DRAFT_META_KEY);
  channel?.postMessage({ type: "content" });
  snapshotListeners.forEach((listener) => listener());
}
