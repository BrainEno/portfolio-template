import type { MetadataRoute } from "next";
import { loadContent } from "@/portfolio/server/api";
import { siteUrl } from "@/portfolio/seo/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await loadContent();
  const origin = siteUrl().toString().replace(/\/$/, "");
  const now = new Date();
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
