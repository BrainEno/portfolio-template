import type { MetadataRoute } from "next";
import { siteUrl } from "@/portfolio/seo/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl().toString().replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/offline"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
