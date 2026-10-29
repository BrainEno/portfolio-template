import type { MetadataRoute } from "next";
import { loadContent } from "@/portfolio/server/api";
import { pickText } from "@/portfolio/seo/site";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const content = await loadContent();
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
