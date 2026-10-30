import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inria_Serif, Inter } from "next/font/google";
import { requireFreshRender } from "@/portfolio/content/mode";
import { getSiteContent } from "@/portfolio/content/source";
import { htmlLang, pageTitle, pickText, siteUrl, absoluteUrl } from "@/portfolio/seo/site";
import PwaRegister from "@/portfolio/ui/PwaRegister";
import "./globals.css";

// Self-hosted at build time (no render-blocking request to Google at runtime,
// and the files are precached by the service worker for offline use).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const inria = Inria_Serif({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-inria", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  await requireFreshRender();
  const content = await getSiteContent();
  const lang = content.identity.defaultLanguage;
  const title = pageTitle(content);
  const description = pickText(content.identity.description, lang);
  const image = absoluteUrl(content.hero.image.src);
  return {
    metadataBase: siteUrl(),
    title: { default: title, template: `%s — ${pickText(content.identity.siteName, lang) || content.identity.name}` },
    description,
    applicationName: content.identity.name,
    authors: [{ name: content.identity.name }],
    creator: content.identity.name,
    keywords: [content.identity.name, ...content.works.items.map((w) => pickText(w.title, lang))],
    alternates: { canonical: "/" },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: content.identity.name, statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    openGraph: {
      type: "website",
      siteName: pickText(content.identity.siteName, lang) || content.identity.name,
      title,
      description,
      url: "/",
      locale: lang === "zh" ? "zh_CN" : "en_US",
      images: [{ url: image, alt: pickText(content.hero.image.alt, lang) }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  };
}

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await requireFreshRender();
  const content = await getSiteContent();
  return (
    <html lang={htmlLang(content.identity.defaultLanguage)} className={`${inter.variable} ${inria.variable}`} suppressHydrationWarning>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
