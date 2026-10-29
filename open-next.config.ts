import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * This portfolio does not use ISR; dynamic content is read directly from
 * PostgreSQL. Dummy caches keep the Cloudflare deployment zero-infrastructure
 * (no R2/D1 setup required).
 */
export default defineCloudflareConfig({
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "direct",
});
