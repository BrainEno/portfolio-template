import type { Metadata } from "next";
import AdminApp from "@/portfolio/admin/AdminApp";
import "@/portfolio/styles/admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

/**
 * Always reachable:
 *  - no database  -> opens directly on mock data, edits live in the browser cache;
 *  - PostgreSQL   -> first visit chooses a password, afterwards password-protected.
 */
export default function AdminPage() {
  return <AdminApp />;
}
