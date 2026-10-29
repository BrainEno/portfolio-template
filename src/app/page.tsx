import type { Metadata } from "next";
import { loadContent } from "@/portfolio/server/api";
import { probeBackend } from "@/portfolio/server/backend";
import { jsonLd } from "@/portfolio/seo/site";
import Portfolio from "@/portfolio/ui/Portfolio";
import "@/portfolio/styles/portfolio.css";

export const dynamic = "force-dynamic";

// Title / description / Open Graph come from the root layout (one source of truth).
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [content, status] = await Promise.all([loadContent(), probeBackend()]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(content)).replace(/</g, "\\u003c") }} />
      {/* Demo mode renders the browser-cached draft so /admin edits preview live. */}
      <Portfolio content={content} mode={status.mode} />
    </>
  );
}
