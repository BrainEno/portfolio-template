"use client";

import { createContext } from "react";
import { type PortfolioContent } from "../content/types";

export type Session = {
  authenticated: boolean;
  mode: "demo" | "postgres";
  connected: boolean;
  platform: "local" | "netlify" | "cloudflare" | "vercel" | "railway" | "render" | "fly" | "generic";
  needsSetup: boolean;
  demoPasswordEnabled: boolean;
  defaultPassword: boolean;
  connectionSource: string | null;
  database: string | null;
  error: string | null;
};

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

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

/* Demo-mode uploads become inline data URLs; live uploads go to the database. */
export const StudioModeContext = createContext<{
  mode: "demo" | "postgres";
  upload: (file: File) => Promise<string>;
}>({
  mode: "demo",
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

export const DEMO_UPLOAD_LIMIT = 1.4 * 1024 * 1024;

