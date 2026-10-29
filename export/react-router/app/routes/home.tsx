import { useLoaderData } from "react-router";
import { loadContent } from "../portfolio/server/api";
import { probeBackend } from "../portfolio/server/db";
import Portfolio from "../portfolio/ui/Portfolio";
import "../portfolio/styles/portfolio.css";

export async function loader() {
  const [content, status] = await Promise.all([loadContent(), probeBackend()]);
  return { content, mode: status.mode };
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, must-revalidate" };
}

export function meta({ data }: { data?: Awaited<ReturnType<typeof loader>> }) {
  if (!data) return [{ title: "Portfolio" }];
  const { identity, hero } = data.content;
  const lang = identity.defaultLanguage;
  return [
    { title: identity.pageTitle[lang] || identity.name },
    { name: "description", content: identity.description[lang] },
    { property: "og:title", content: identity.name },
    { property: "og:description", content: identity.description[lang] },
    { property: "og:image", content: hero.image.src },
  ];
}

export default function Home() {
  const { content, mode } = useLoaderData<typeof loader>();
  return <Portfolio content={content} mode={mode} />;
}
