import type { MetadataRoute } from "next";
import { siteUrl } from "@/portfolio/seo/site";

/**
 * `output: "export"` only accepts metadata routes that can be prerendered at
 * build time; declaring the empty params set is what tells the exporter that
 * this one is buildable (there is nothing to enumerate — it is a single file).
 */
export function generateStaticParams() {
  return [];
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = siteUrl().toString().replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/offline"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
