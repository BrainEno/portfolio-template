import type { MetadataRoute } from "next";
import { requireFreshRender } from "@/portfolio/content/mode";
import { getContentSource, getSiteContent } from "@/portfolio/content/source";
import { siteUrl } from "@/portfolio/seo/site";

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await requireFreshRender();
  const content = await getSiteContent();
  const origin = siteUrl().toString().replace(/\/$/, "");
  // A static export must not claim "now" as the last modification, or every
  // deployment would look changed to crawlers; it uses the build's content date.
  const now = (await getContentSource().getUpdatedAt()) ?? new Date().toISOString();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    ...content.works.items.map((work) => ({
      url: `${origin}/works/${work.id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
