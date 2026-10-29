import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `NEXT_OUTPUT=standalone` is set by the Dockerfile / VPS script to emit a
  // minimal self-contained server. Netlify, Vercel and Cloudflare (OpenNext)
  // use their own adapters and must not set it.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  compress: true,
  // pg-cloudflare ships a Node and a workerd entry; make sure the one Hyperdrive
  // needs is traced into the Cloudflare bundle.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pg-cloudflare/dist/**/*", "./node_modules/pg-cloudflare/esm/**/*"],
  },
  async headers() {
    const longCache = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    return [
      { source: "/images/:path*", headers: longCache },
      { source: "/gltfs/:path*", headers: longCache },
      { source: "/icons/:path*", headers: longCache },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }, { key: "Service-Worker-Allowed", value: "/" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
