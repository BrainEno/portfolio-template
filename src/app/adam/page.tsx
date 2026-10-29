import type { Metadata } from "next";
import AdminApp from "@/portfolio/admin/AdminApp";
import { probeBackend } from "@/portfolio/server/db";
import "@/portfolio/styles/admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio preview — /adam",
  robots: { index: false, follow: false },
};

/**
 * Temporary, read-only view of the studio structure.
 *
 * While no PostgreSQL service is connected the page opens with the temporary
 * password (123456) and shows sample content, so the layout can be reviewed
 * without a database. As soon as a Postgres connection is detected it stops
 * being a preview and points at the real, persisted studio.
 */
export default async function AdamPreviewPage() {
  const status = await probeBackend(true);

  if (status.mode === "postgres" && status.connected) {
    return (
      <main className="ad-root ad-center">
        <div className="ad-login-card">
          <h1 className="ad-login-title">Live</h1>
          <p className="ad-login-sub">
            PostgreSQL is connected{status.database ? ` (${status.database})` : ""}. The temporary preview has been
            retired and the temporary password no longer works.
          </p>
          <p className="ad-login-sub">
            Continue in the studio to edit works, image links and copy — every publish is stored in the database.
          </p>
          <div className="ad-actions">
            <a className="ad-button" href="/admin">Open studio</a>
            <a className="ad-button is-ghost" href="/">View site</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <AdminApp preview />
    </>
  );
}
