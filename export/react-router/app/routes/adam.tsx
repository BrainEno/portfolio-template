import AdminApp from "../portfolio/admin/AdminApp";
import { probeBackend } from "../portfolio/server/db";
import "../portfolio/styles/admin.css";

export const meta = () => [{ title: "Studio preview — /adam" }, { name: "robots", content: "noindex, nofollow" }];

export async function loader() {
  const status = await probeBackend(true);
  return { live: status.mode === "postgres" && status.connected, database: status.database };
}

export default function AdamPreview({ loaderData }: { loaderData: { live: boolean; database: string | null } }) {
  if (loaderData.live) {
    return (
      <main className="ad-root ad-center">
        <div className="ad-login-card">
          <h1 className="ad-login-title">Live</h1>
          <p className="ad-login-sub">
            PostgreSQL is connected{loaderData.database ? ` (${loaderData.database})` : ""}. The temporary preview is
            retired and the temporary password no longer works.
          </p>
          <div className="ad-actions">
            <a className="ad-button" href="/admin">Open studio</a>
            <a className="ad-button is-ghost" href="/">View site</a>
          </div>
        </div>
      </main>
    );
  }
  return <AdminApp preview />;
}
