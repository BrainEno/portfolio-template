import type { Language, PortfolioContent } from "../content/types";

/**
 * Canonical origin of the site. Resolution order covers every supported host:
 * explicit NEXT_PUBLIC_SITE_URL / SITE_URL, then the URL variables injected by
 * Netlify, Vercel, Cloudflare Pages and Render, finally localhost.
 */
export function siteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.URL || // Netlify
    process.env.DEPLOY_PRIME_URL || // Netlify previews
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    process.env.CF_PAGES_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const htmlLang = (lang: Language) => (lang === "zh" ? "zh-Hans" : "en");

export function pickText(value: { zh: string; en: string } | undefined, lang: Language) {
  return (value?.[lang] || value?.[lang === "zh" ? "en" : "zh"] || "").trim();
}

/** Absolute URL for a stored image reference (relative paths, /api/media/<id>, remote links). */
export function absoluteUrl(src: string) {
  try {
    return new URL(src, siteUrl()).toString();
  } catch {
    return siteUrl().toString();
  }
}

export function pageTitle(content: PortfolioContent) {
  const lang = content.identity.defaultLanguage;
  const title = pickText(content.identity.pageTitle, lang) || content.identity.name;
  const site = pickText(content.identity.siteName, lang);
  return site && site !== title ? `${title} — ${site}` : title;
}

/** schema.org graph (Person + WebSite + one CreativeWork per project). */
export function jsonLd(content: PortfolioContent) {
  const lang = content.identity.defaultLanguage;
  const origin = siteUrl().toString().replace(/\/$/, "");
  const description = pickText(content.identity.description, lang);
  const sameAs = [content.contact.credit.url].filter((url) => /^https?:\/\//.test(url));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: pickText(content.identity.siteName, lang) || content.identity.name,
        description,
        inLanguage: htmlLang(lang),
      },
      {
        "@type": "Person",
        "@id": `${origin}/#person`,
        name: content.identity.name,
        description,
        url: origin,
        image: absoluteUrl(content.hero.image.src),
        email: content.contact.email ? `mailto:${content.contact.email}` : undefined,
        sameAs,
      },
      ...content.works.items.map((work) => ({
        "@type": "CreativeWork",
        "@id": `${origin}/works/${work.id}`,
        name: pickText(work.title, lang),
        description: pickText(work.description, lang),
        image: work.image.src ? absoluteUrl(work.image.src) : undefined,
        url: `${origin}/works/${work.id}`,
        dateCreated: work.year,
        creator: { "@id": `${origin}/#person` },
      })),
    ],
  };
}
