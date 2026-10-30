import type { MetadataRoute } from "next";
import { getContentUpdatedAt, getSiteContent } from "@/portfolio/content/source";
import { siteUrl } from "@/portfolio/seo/site";

/**
 * `output: "export"` only accepts metadata routes that can be prerendered at
 * build time; declaring the empty params set is what tells the exporter that
 * this one is buildable (there is nothing to enumerate — it is a single file).
 */
export function generateStaticParams() {
  return [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await getSiteContent();
  const origin = siteUrl().toString().replace(/\/$/, "");
  // Never claim "now" as the last modification: every deployment would then
  // look changed to crawlers. Use the committed snapshot's export date.
  const now = (await getContentUpdatedAt()) ?? new Date().toISOString();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    ...content.works.items.map((work) => ({
      // `trailingSlash: true` makes `/works/<id>/` the canonical address, so
      // the sitemap must not advertise the extensionless form (GitHub Pages
      // would answer it with a 301, which wastes a crawl).
      url: `${origin}/works/${work.id}/`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
