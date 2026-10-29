import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline", robots: { index: false, follow: false } };

/** Served by the service worker when a page is requested without a connection. */
export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        padding: "6vw",
        background: "#000",
        color: "#fcfcfc",
        fontFamily: "var(--font-sans)",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 7vw, 5rem)", margin: 0 }}>You are offline</p>
        <p style={{ color: "#898989", maxWidth: "32em", margin: "1.2em auto 2em" }}>
          This page has not been cached yet. Reconnect once and the portfolio will be available offline from then on.
          当前处于离线状态，联网访问一次首页后即可离线查看。
        </p>
        <Link href="/" style={{ color: "#e55139", textDecoration: "underline" }}>Retry / 重试</Link>
      </div>
    </main>
  );
}
