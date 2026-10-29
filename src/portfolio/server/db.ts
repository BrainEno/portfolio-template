import { Pool } from "pg";
import { defaultContent } from "../content/defaults";
import { normalizeContent } from "../content/normalize";
import type { PortfolioContent } from "../content/types";
import { DEMO_PASSWORD, hashPassword, type AuthConfig } from "./auth";

export type PortfolioStorage = {
  readContent(): Promise<unknown | null>;
  writeContent(content: PortfolioContent): Promise<void>;
  putMedia(file: { name: string; type: string; bytes: Uint8Array }): Promise<string>;
  /** Used by backup restore so `/api/media/<id>` links stay valid. */
  putMediaWithId(file: { id: string; name: string; type: string; bytes: Uint8Array }): Promise<void>;
  getMedia(id: string): Promise<{ type: string; bytes: Uint8Array } | null>;
};

export type BackendMode = "demo" | "postgres";
export type DeploymentPlatform = "local" | "netlify" | "cloudflare" | "vercel" | "railway" | "render" | "fly" | "generic";

type ConnectionInfo = {
  key: string;
  url: string;
  platform: DeploymentPlatform;
  /** Netlify Database applies committed migrations before publish. */
  migrationManaged: boolean;
  /** Hyperdrive owns the connection pool; keep the Worker-side pool tiny. */
  hyperdrive: boolean;
};

export type BackendStatus = {
  mode: BackendMode;
  connected: boolean;
  platform: DeploymentPlatform;
  /** Environment variable / platform binding that supplied the URL. */
  connectionSource: string | null;
  database: string | null;
  host: string | null;
  needsSetup: boolean;
  demoPasswordEnabled: boolean;
  error: string | null;
  checkedAt: string;
};

const CONTENT_ID = "portfolio";
const CONNECTION_ENV_KEYS = [
  "DATABASE_URL",
  "NETLIFY_DB_URL",
  "NETLIFY_DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "SUPABASE_DB_URL",
  "NEON_DATABASE_URL",
  "RAILWAY_DATABASE_URL",
] as const;

/** Used for local, Cloudflare and generic hosts. Netlify uses the migration file. */
export const SCHEMA_SQL = `
create table if not exists site_content (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists media_assets (
  id text primary key,
  filename text not null,
  mime_type text not null,
  size integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create table if not exists admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
`;

const REQUIRED_TABLES = ["site_content", "media_assets", "admin_settings"] as const;

type GlobalCache = {
  pool?: Pool;
  poolUrl?: string;
  schemaReady?: boolean;
  status?: BackendStatus;
  lastProbe?: number;
  connection?: ConnectionInfo | null;
  connectionAt?: number;
};

const globalCache = globalThis as typeof globalThis & { __pfBackend?: GlobalCache };
const cache: GlobalCache = (globalCache.__pfBackend ??= {});
const STATUS_TTL_MS = 15_000;

function detectNodePlatform(): DeploymentPlatform {
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
async function connectionInfo(force = false): Promise<ConnectionInfo | null> {
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

async function runtimeSecret(key: string) {
  const nodeValue = process.env[key]?.trim();
  if (nodeValue) return nodeValue;
  const cfEnv = await getCloudflareEnv();
  const value = cfEnv?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function describeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, database: parsed.pathname.replace(/^\//, "") || null };
  } catch {
    return { host: null, database: null };
  }
}

/* ------------------------------------------------------------------ */
/* PostgreSQL storage                                                  */
/* ------------------------------------------------------------------ */

async function verifyManagedSchema(pool: Pool) {
  const result = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])",
    [REQUIRED_TABLES]
  );
  const found = new Set(result.rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
  if (missing.length) {
    throw new Error(
      `PostgreSQL is connected but migrations have not created: ${missing.join(", ")}. ` +
      "On Netlify, commit netlify/database/migrations and redeploy."
    );
  }
}

async function ensureSchema(pool: Pool, info: ConnectionInfo) {
  if (cache.schemaReady) return;
  if (info.migrationManaged) await verifyManagedSchema(pool);
  else await pool.query(SCHEMA_SQL);
  cache.schemaReady = true;
}

async function poolFor(info: ConnectionInfo) {
  if (cache.pool && cache.poolUrl === info.url) return cache.pool;
  const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(info.url);
  cache.pool = new Pool({
    connectionString: info.url,
    // Hyperdrive already pools globally. Serverless hosts also benefit from a
    // deliberately tiny per-isolate pool.
    max: info.hyperdrive ? 1 : 4,
    maxUses: info.hyperdrive ? 1 : 7500,
    idleTimeoutMillis: info.hyperdrive ? 1000 : 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: local || info.hyperdrive ? undefined : { rejectUnauthorized: false },
  });
  cache.poolUrl = info.url;
  cache.schemaReady = false;
  return cache.pool;
}

function postgresStorage(pool: Pool, info: ConnectionInfo): PortfolioStorage {
  return {
    async readContent() {
      await ensureSchema(pool, info);
      const result = await pool.query<{ data: unknown }>("select data from site_content where id = $1 limit 1", [CONTENT_ID]);
      return result.rows[0]?.data ?? null;
    },
    async writeContent(content) {
      await ensureSchema(pool, info);
      await pool.query(
        `insert into site_content (id, data, updated_at) values ($1, $2::jsonb, now())
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        [CONTENT_ID, JSON.stringify(content)]
      );
    },
    async putMedia({ name, type, bytes }) {
      await ensureSchema(pool, info);
      const id = newMediaId();
      await pool.query(
        "insert into media_assets (id, filename, mime_type, size, data) values ($1, $2, $3, $4, $5)",
        [id, name.slice(0, 200), type, bytes.byteLength, Buffer.from(bytes)]
      );
      return id;
    },
    async putMediaWithId({ id, name, type, bytes }) {
      await ensureSchema(pool, info);
      await pool.query(
        `insert into media_assets (id, filename, mime_type, size, data) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set filename = excluded.filename, mime_type = excluded.mime_type,
           size = excluded.size, data = excluded.data`,
        [id, name.slice(0, 200), type, bytes.byteLength, Buffer.from(bytes)]
      );
    },
    async getMedia(id) {
      await ensureSchema(pool, info);
      const result = await pool.query<{ mime_type: string; data: Buffer }>(
        "select mime_type, data from media_assets where id = $1 limit 1",
        [id]
      );
      const row = result.rows[0];
      return row ? { type: row.mime_type, bytes: new Uint8Array(row.data) } : null;
    },
  };
}

async function readStoredPassword(pool: Pool, info: ConnectionInfo): Promise<string | null> {
  await ensureSchema(pool, info);
  const result = await pool.query<{ value: string }>("select value from admin_settings where key = 'admin_password' limit 1");
  return result.rows[0]?.value ?? null;
}

async function storeAdminPassword(pool: Pool, info: ConnectionInfo, password: string) {
  await ensureSchema(pool, info);
  await pool.query(
    `insert into admin_settings (key, value, updated_at) values ('admin_password', $1, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [hashPassword(password)]
  );
}

/* ------------------------------------------------------------------ */
/* Demo storage (browser cache is the UI source of truth)              */
/* ------------------------------------------------------------------ */

const demoState = globalThis as typeof globalThis & {
  __pfDemo?: { content: PortfolioContent | null; media: Map<string, { type: string; bytes: Uint8Array }> };
};
const demo = (demoState.__pfDemo ??= { content: null, media: new Map() });

const demoStorage: PortfolioStorage = {
  async readContent() { return demo.content; },
  async writeContent(content) { demo.content = content; },
  async putMedia({ type, bytes }) {
    const id = newMediaId();
    demo.media.set(id, { type, bytes });
    return id;
  },
  async putMediaWithId({ id, type, bytes }) { demo.media.set(id, { type, bytes }); },
  async getMedia(id) { return demo.media.get(id) ?? null; },
};

export function resetDemoData() {
  demo.content = null;
  demo.media.clear();
}

/* ------------------------------------------------------------------ */
/* Resolution + probing                                               */
/* ------------------------------------------------------------------ */

export async function probeBackend(force = false): Promise<BackendStatus> {
  const now = Date.now();
  if (!force && cache.status && cache.lastProbe && now - cache.lastProbe < STATUS_TTL_MS) return cache.status;

  const info = await connectionInfo(force);
  const platform = info?.platform ?? detectNodePlatform();
  const described = info ? describeUrl(info.url) : { host: null, database: null };
  const base: BackendStatus = {
    mode: "demo",
    connected: false,
    platform,
    connectionSource: info?.key ?? null,
    database: described.database,
    host: described.host,
    needsSetup: false,
    demoPasswordEnabled: true,
    error: null,
    checkedAt: new Date().toISOString(),
  };

  if (!info) {
    cache.status = base;
    cache.lastProbe = now;
    return base;
  }

  try {
    const pool = await poolFor(info);
    await ensureSchema(pool, info);
    const ping = await pool.query<{ ok: number }>("select 1 as ok");
    if (ping.rows[0]?.ok !== 1) throw new Error("Unexpected probe response");
    const storedHash = await readStoredPassword(pool, info);
    const envPassword = await runtimeSecret("ADMIN_PASSWORD");
    const status: BackendStatus = {
      ...base,
      mode: "postgres",
      connected: true,
      needsSetup: !envPassword && !storedHash,
      demoPasswordEnabled: false,
    };
    cache.status = status;
    cache.lastProbe = now;
    return status;
  } catch (error) {
    const status: BackendStatus = {
      ...base,
      error: error instanceof Error ? error.message : "Unable to reach PostgreSQL",
    };
    cache.status = status;
    cache.lastProbe = now;
    return status;
  }
}

export async function getStorage(): Promise<{ storage: PortfolioStorage; status: BackendStatus }> {
  const status = await probeBackend();
  if (status.mode === "postgres" && status.connected) {
    const info = await connectionInfo();
    if (info) return { storage: postgresStorage(await poolFor(info), info), status };
  }
  return { storage: demoStorage, status };
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const status = await probeBackend();
  const [envPassword, sessionSecret] = await Promise.all([
    runtimeSecret("ADMIN_PASSWORD"),
    runtimeSecret("ADMIN_SECRET"),
  ]);

  if (status.mode === "postgres" && status.connected) {
    const info = await connectionInfo();
    const storedPasswordHash = info ? await readStoredPassword(await poolFor(info), info) : null;
    return {
      mode: "postgres",
      envPassword,
      storedPasswordHash,
      needsSetup: !envPassword && !storedPasswordHash,
      demoPasswordEnabled: false,
      sessionSecret,
    };
  }

  return {
    mode: "demo",
    envPassword,
    storedPasswordHash: null,
    needsSetup: false,
    // The UI auto-enters in demo mode. This remains true only as a status flag.
    demoPasswordEnabled: !envPassword,
    sessionSecret,
  };
}

export async function setInitialAdminPassword(password: string) {
  const status = await probeBackend();
  if (status.mode !== "postgres") throw new Error("Configure PostgreSQL before setting a permanent password");
  const info = await connectionInfo();
  if (!info) throw new Error("No PostgreSQL connection configured");
  await storeAdminPassword(await poolFor(info), info, password);
  return probeBackend(true);
}

export function newMediaId() {
  return `${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export { DEMO_PASSWORD, defaultContent, normalizeContent };
