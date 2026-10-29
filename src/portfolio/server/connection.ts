import type { ConnectionInfo, DeploymentPlatform } from "./types";
import { CONNECTION_ENV_KEYS, STATUS_TTL_MS, cache } from "./state";

/**
 * Platform detection + connection-string resolution for every supported host
 * (local, Netlify, Cloudflare Workers/Hyperdrive, Vercel, Railway, Render, Fly,
 * any VPS). Nothing in here is imported by client code.
 */
export function detectNodePlatform(): DeploymentPlatform {
  if (process.env.NETLIFY || process.env.CONTEXT || process.env.NETLIFY_LOCAL) return "netlify";
  if (process.env.CF_PAGES || process.env.CLOUDFLARE_ENV) return "cloudflare";
  if (process.env.VERCEL) return "vercel";
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) return "railway";
  if (process.env.RENDER || process.env.RENDER_SERVICE_ID) return "render";
  if (process.env.FLY_APP_NAME) return "fly";
  if (process.env.NODE_ENV === "development") return "local";
  return "generic";
}

/**
 * OpenNext exposes Cloudflare bindings through getCloudflareContext. The
 * dynamic import keeps the same source runnable on Node/Netlify/Vercel.
 */
async function getCloudflareEnv(): Promise<Record<string, unknown> | null> {
  try {
    // Only Workers runtimes carry Cloudflare bindings; skip the import on Node.
    if (typeof navigator === "undefined" || navigator.userAgent !== "Cloudflare-Workers") return null;
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return context.env as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validUrl(value: unknown): value is string {
  return typeof value === "string" && /^postgres(ql)?:\/\//.test(value.trim());
}

/** Resolve every supported host without importing platform code in the client. */
export async function connectionInfo(force = false): Promise<ConnectionInfo | null> {
  const now = Date.now();
  if (!force && cache.connectionAt && now - cache.connectionAt < STATUS_TTL_MS && cache.connection !== undefined) {
    return cache.connection;
  }

  const nodePlatform = detectNodePlatform();
  const cfEnv = await getCloudflareEnv();

  // Cloudflare Hyperdrive is preferred to a raw URL: it supplies global
  // pooling/caching and avoids exhausting the origin's connection limit.
  const hyperdrive = cfEnv?.HYPERDRIVE as { connectionString?: unknown } | undefined;
  if (validUrl(hyperdrive?.connectionString)) {
    cache.connection = {
      key: "HYPERDRIVE.connectionString",
      url: hyperdrive.connectionString.trim(),
      platform: "cloudflare",
      migrationManaged: false,
      hyperdrive: true,
    };
    cache.connectionAt = now;
    return cache.connection;
  }

  // Cloudflare secrets/vars can also expose a direct DATABASE_URL.
  if (cfEnv) {
    for (const key of CONNECTION_ENV_KEYS) {
      const value = cfEnv[key];
      if (validUrl(value)) {
        cache.connection = {
          key,
          url: value.trim(),
          platform: "cloudflare",
          migrationManaged: false,
          hyperdrive: false,
        };
        cache.connectionAt = now;
        return cache.connection;
      }
    }
  }

  for (const key of CONNECTION_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (!validUrl(value)) continue;
    const netlifyManaged = key === "NETLIFY_DB_URL" && nodePlatform === "netlify";
    cache.connection = {
      key,
      url: value,
      platform: nodePlatform,
      migrationManaged: netlifyManaged,
      hyperdrive: false,
    };
    cache.connectionAt = now;
    return cache.connection;
  }

  // Modern Netlify Database can resolve branch-aware credentials through the
  // package even when the raw runtime variable isn't directly exposed.
  if (nodePlatform === "netlify") {
    try {
      const { getConnectionString } = await import("@netlify/database");
      const value = getConnectionString();
      if (validUrl(value)) {
        cache.connection = {
          key: "@netlify/database",
          url: value,
          platform: "netlify",
          migrationManaged: true,
          hyperdrive: false,
        };
        cache.connectionAt = now;
        return cache.connection;
      }
    } catch {
      // No Netlify Database provisioned — demo mode is intentional.
    }
  }

  cache.connection = null;
  cache.connectionAt = now;
  return null;
}

export async function runtimeSecret(key: string) {
  const nodeValue = process.env[key]?.trim();
  if (nodeValue) return nodeValue;
  const cfEnv = await getCloudflareEnv();
  const value = cfEnv?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function describeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, database: parsed.pathname.replace(/^\//, "") || null };
  } catch {
    return { host: null, database: null };
  }
}
