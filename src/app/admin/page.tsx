import type { Metadata } from "next";
import AdminApp from "@/portfolio/admin/AdminApp";
import "@/portfolio/styles/admin.css";

export const metadata: Metadata = {
  title: "Studio — Portfolio admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminApp exportUrl="/downloads/portfolio-react-router.zip" />;
}
