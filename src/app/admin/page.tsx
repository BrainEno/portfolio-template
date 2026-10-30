import type { Metadata } from "next";
import AdminApp from "@/portfolio/admin/AdminApp";
import { getSiteContent } from "@/portfolio/content/source";
import "@/portfolio/styles/admin.css";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

/**
 * The studio of a static site: it edits a draft in your browser and exports the
 * JSON the build reads. Nothing here needs a server, so the page is just
 * prerendered like any other route.
 */
export default async function AdminPage() {
  const content = await getSiteContent();
  return <AdminApp initialContent={content} />;
}
