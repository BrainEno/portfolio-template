import type { Metadata } from "next";
import Link from "next/link";
import AdminApp from "@/portfolio/admin/AdminApp";
import { IS_STATIC_BUILD, requireFreshRender } from "@/portfolio/content/mode";
import "@/portfolio/styles/admin.css";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

/**
 * Always reachable:
 *  - no database  -> opens directly on mock data, edits live in the browser cache;
 *  - PostgreSQL   -> first visit chooses a password, afterwards password-protected.
 */
export default async function AdminPage() {
  await requireFreshRender();
  // A static export has no server, so there is no session, no upload endpoint
  // and nowhere to persist an edit. Say so plainly instead of showing a studio
  // whose every button would fail.
  if (IS_STATIC_BUILD) {
    return (
      <main className="ad-root ad-center">
        <div className="ad-login-card">
          <h1 className="ad-login-title">静态构建</h1>
          <p className="ad-login-sub">
            这个版本是用 <code>CONTENT_MODE=static</code> 导出的纯静态站点，没有后端，所以工作室不可用。
          </p>
          <p className="ad-login-sub">
            要编辑内容，请在服务器构建下打开本页，或修改 <code>content/defaults.ts</code> 后重新导出。
          </p>
          <div className="ad-actions">
            <Link className="ad-button" href="/">返回首页</Link>
          </div>
        </div>
      </main>
    );
  }
  return <AdminApp />;
}
