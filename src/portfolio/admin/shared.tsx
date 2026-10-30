"use client";

import { createContext } from "react";
import type { PortfolioContent } from "../content/types";

export type Patch = (mutate: (draft: PortfolioContent) => void) => void;
export type TabId = "identity" | "hero" | "intro" | "gallery" | "works" | "tv" | "contact" | "theme" | "data";

export const TABS: { id: TabId; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "hero", label: "Hero" },
  { id: "intro", label: "Biography" },
  { id: "gallery", label: "Gallery" },
  { id: "works", label: "Works" },
  { id: "tv", label: "Television" },
  { id: "contact", label: "Contact" },
  { id: "theme", label: "Theme" },
  { id: "data", label: "Data" },
];

/**
 * Uploads in a static site have nowhere to go: there is no API route and no
 * database. Images dropped into the studio are read into the draft as data URLs
 * (and end up inside `published.json` when you publish), so the context exposes
 * exactly one function and nothing else.
 */
export const StudioContext = createContext<{ upload: (file: File) => Promise<string> }>({
  upload: async () => {
    throw new Error("Upload unavailable");
  },
});

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * A draft lives in localStorage, which is a ~5 MB budget per origin. Keep
 * single uploads well under it, or one photo silently evicts the whole draft.
 */
export const UPLOAD_LIMIT = 1.4 * 1024 * 1024;
