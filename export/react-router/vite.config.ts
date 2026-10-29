import path from "node:path";
import { fileURLToPath } from "node:url";
import netlify from "@netlify/vite-plugin";
import netlifyReactRouter from "@netlify/vite-plugin-react-router";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // The shared database resolver supports both Next-on-Cloudflare and
      // Netlify. This export is Netlify-only, so tiny server shims keep it from
      // bundling the OpenNext adapter while retaining NETLIFY_DB_URL support.
      "@opennextjs/cloudflare": path.join(root, "app/shims/opennext-cloudflare.ts"),
      "@netlify/database": path.join(root, "app/shims/netlify-database.ts"),
    },
  },
  plugins: [reactRouter(), netlifyReactRouter(), netlify()],
});
