import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's output tracer sees pg-cloudflare's Node/default export and would
  // copy only dist/empty.js. OpenNext subsequently bundles with the `workerd`
  // condition, which needs dist/index.js / esm/index.mjs for Hyperdrive TCP.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/pg-cloudflare/dist/**/*",
      "./node_modules/pg-cloudflare/esm/**/*",
    ],
  },
};

export default nextConfig;
