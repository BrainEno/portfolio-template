import type { Metadata } from "next";
import { getSiteContent } from "@/portfolio/content/source";
import { jsonLd } from "@/portfolio/seo/site";
import Portfolio from "@/portfolio/ui/Portfolio";
import "@/portfolio/styles/portfolio.css";

// Title / description / Open Graph come from the root layout (one source of truth).
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const content = await getSiteContent();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(content)).replace(/</g, "\\u003c") }} />
      <Portfolio content={content} />
    </>
  );
}
