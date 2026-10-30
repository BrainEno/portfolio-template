import type { MetadataRoute } from "next";
import { getSiteContent } from "@/portfolio/content/source";
import { pickText } from "@/portfolio/seo/site";
import { asset, BASE_PATH } from "@/portfolio/seo/asset";

/**
 * `output: "export"` only accepts metadata routes that can be prerendered at
 * build time; declaring the empty params set is what tells the exporter that
 * this one is buildable (there is nothing to enumerate — it is a single file).
 */
export function generateStaticParams() {
  return [];
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const content = await getSiteContent();
  const lang = content.identity.defaultLanguage;
  const name = pickText(content.identity.siteName, lang) || content.identity.name;
  return {
    id: `${BASE_PATH}/`,
    name,
    short_name: content.identity.name.slice(0, 12),
    description: pickText(content.identity.description, lang),
    lang: lang === "zh" ? "zh-Hans" : "en",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "any",
    background_color: content.theme.stage || "#000000",
    theme_color: "#000000",
    categories: ["portfolio", "personalization"],
    icons: [
      { src: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: asset("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: asset("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Works", short_name: "Works", url: `${BASE_PATH}/#works` }, { name: "Contact", short_name: "Contact", url: `${BASE_PATH}/#contact` }],
  };
}
