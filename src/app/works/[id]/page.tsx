import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteContent } from "@/portfolio/content/source";
import { absoluteUrl, pickText, siteUrl } from "@/portfolio/seo/site";
import "@/portfolio/styles/work-detail.css";

/**
 * Every project page is prerendered in a static build, so the export needs the
 * complete list up front; the server build keeps answering per request, so the
 * list is not consulted there.
 */
export async function generateStaticParams() {
  const content = await getSiteContent();
  return content.works.items.map((work) => ({ id: work.id }));
}

type Params = { params: Promise<{ id: string }> };

async function findWork(id: string) {
  const content = await getSiteContent();
  const work = content.works.items.find((item) => item.id === id);
  return { content, work };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const { content, work } = await findWork(id);
  if (!work) return { title: "Not found", robots: { index: false } };
  const lang = content.identity.defaultLanguage;
  const title = pickText(work.title, lang);
  const description = pickText(work.description, lang);
  return {
    title,
    description,
    alternates: { canonical: `/works/${work.id}` },
    openGraph: { type: "article", title, description, url: `/works/${work.id}`, images: work.image.src ? [absoluteUrl(work.image.src)] : undefined },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Server-rendered project page: crawlable detail copy + detail images from the database. */
export default async function WorkPage({ params }: Params) {
  const { id } = await params;
  const { content, work } = await findWork(id);
  if (!work) notFound();
  const lang = content.identity.defaultLanguage;
  const images = [work.image, ...work.detailImages].filter((image) => image.src);
  const origin = siteUrl().toString().replace(/\/$/, "");
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: content.identity.name, item: origin },
      { "@type": "ListItem", position: 2, name: pickText(work.title, lang), item: `${origin}/works/${work.id}` },
    ],
  };

  return (
    <main className="wd">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Link className="wd-back" href="/#works">← {content.identity.name}</Link>
      <header className="wd-head">
        <p className="wd-meta">{work.year} / {pickText(work.credit, lang)}</p>
        <h1 className="wd-title">{pickText(work.title, lang)}</h1>
      </header>
      <p className="wd-text">{pickText(work.description, lang)}</p>
      {work.url ? (
        <a className="wd-link" href={work.url} target="_blank" rel="noreferrer noopener">{work.url.replace(/^https?:\/\//, "")} ↗</a>
      ) : null}
      <div className="wd-grid">
        {images.map((image, index) => (
          <figure key={`${image.src}-${index}`} className="wd-frame">
            {/* Fixed frame + object-fit: any aspect ratio can be uploaded. */}
            <img src={image.src} alt={pickText(image.alt, lang) || pickText(work.title, lang)} loading={index ? "lazy" : "eager"} decoding="async" />
          </figure>
        ))}
      </div>
    </main>
  );
}
