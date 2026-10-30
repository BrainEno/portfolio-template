import type { Metadata } from "next";
import { IS_STATIC_BUILD, requireFreshRender } from "@/portfolio/content/mode";
import { getSiteContent } from "@/portfolio/content/source";
import { jsonLd } from "@/portfolio/seo/site";
import Portfolio from "@/portfolio/ui/Portfolio";
import "@/portfolio/styles/portfolio.css";

// Title / description / Open Graph come from the root layout (one source of truth).
export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * A static export has no server to probe, so the mode is known at build time;
 * the server build still asks the storage layer whether PostgreSQL is reachable
 * (demo mode renders the browser-cached draft so `/admin` edits preview live).
 */
async function resolveMode(): Promise<"demo" | "postgres" | "static"> {
  if (IS_STATIC_BUILD) return "static";
  const { probeBackend } = await import("@/portfolio/server/backend");
  return (await probeBackend()).mode;
}

export default async function HomePage() {
  await requireFreshRender();
  const [content, mode] = await Promise.all([getSiteContent(), resolveMode()]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(content)).replace(/</g, "\\u003c") }} />
      <Portfolio content={content} mode={mode} />
    </>
  );
}
