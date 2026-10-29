import type { Metadata } from "next";
import { loadContent } from "@/portfolio/server/api";
import { probeBackend } from "@/portfolio/server/db";
import Portfolio from "@/portfolio/ui/Portfolio";
import "@/portfolio/styles/portfolio.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadContent();
  const lang = content.identity.defaultLanguage;
  const pageTitle = content.identity.pageTitle[lang] || content.identity.name;
  const siteName = content.identity.siteName?.[lang] ?? "";
  return {
    title: siteName && siteName !== pageTitle ? `${pageTitle} — ${siteName}` : pageTitle,
    description: content.identity.description[lang],
    openGraph: {
      title: content.identity.name,
      description: content.identity.description[lang],
      images: [content.hero.image.src],
    },
  };
}

export default async function HomePage() {
  const [content, status] = await Promise.all([loadContent(), probeBackend()]);
  // Demo mode renders the browser-cached draft so /admin edits preview live.
  return <Portfolio content={content} mode={status.mode} />;
}
