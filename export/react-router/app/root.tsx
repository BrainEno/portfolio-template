import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export const links = () => [
  { rel: "icon", href: "/favicon.ico" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inria+Serif:wght@400;700&display=swap" },
  { rel: "preload", href: "/fonts/Aeonik-Regular.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" as const },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <Meta />
        <Links />
        <style>{"html,body{margin:0;padding:0;background:#000}"}</style>
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something went wrong";
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#fff", fontFamily: "sans-serif" }}>
      <h1 style={{ fontWeight: 400 }}>{message}</h1>
    </main>
  );
}
