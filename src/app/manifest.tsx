import type { MetadataRoute } from "next";
import { requireFreshRender } from "@/portfolio/content/mode";
import { getSiteContent } from "@/portfolio/content/source";
import { pickText } from "@/portfolio/seo/site";

/**
 * A metadata route is a route handler, and `output: "export"` only accepts a
 * handler that can be prerendered. Declaring the (empty) static params set is
 * how this file tells the exporter "yes, this one is buildable" without
 * pinning `dynamic` to a literal that the server build cannot use; during the
 * server build `requireFreshRender()` above keeps it per-request.
 */
export function generateStaticParams() {
  return [];
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  await requireFreshRender();
  const content = await getSiteContent();
  const lang = content.identity.defaultLanguage;
  const name = pickText(content.identity.siteName, lang) || content.identity.name;
  return {
    id: "/",
    name,
    short_name: content.identity.name.slice(0, 12),
    description: pickText(content.identity.description, lang),
    lang: lang === "zh" ? "zh-Hans" : "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: content.theme.stage || "#000000",
    theme_color: "#000000",
    categories: ["portfolio", "personalization"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Works", short_name: "Works", url: "/#works" }, { name: "Contact", short_name: "Contact", url: "/#contact" }],
  };
}
