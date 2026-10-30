import type { MetadataRoute } from "next";
import { requireFreshRender } from "@/portfolio/content/mode";
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

export default async function robots(): Promise<MetadataRoute.Robots> {
  await requireFreshRender();
  const origin = siteUrl().toString().replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/offline"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
