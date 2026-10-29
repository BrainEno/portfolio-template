import { Pool } from "pg";
import type { PortfolioContent } from "../content/types";
import { hashPassword } from "./auth";
import { CONTENT_ID, REQUIRED_TABLES, SCHEMA_SQL, cache } from "./state";
import type { ConnectionInfo, PortfolioStorage } from "./types";

/* ------------------------------------------------------------------ */
/* PostgreSQL storage                                                  */
/* ------------------------------------------------------------------ */

export async function verifyManagedSchema(pool: Pool) {
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

export async function ensureSchema(pool: Pool, info: ConnectionInfo) {
  if (cache.schemaReady) return;
  if (info.migrationManaged) await verifyManagedSchema(pool);
  else await pool.query(SCHEMA_SQL);
  cache.schemaReady = true;
}

/**
 * TLS is skipped for loopback / docker-network hosts (`db`, `postgres`), when the
 * URL asks for `sslmode=disable`, or when DATABASE_SSL=false. Every managed
 * provider (Neon, Supabase, Netlify, Railway...) keeps TLS on by default.
 */
function isPlainTcp(url: string) {
  if (process.env.DATABASE_SSL === "false" || /sslmode=disable/i.test(url)) return true;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "::1" || host === "[::1]" || /^(127|10)\./.test(host) || host === "0.0.0.0" || !host.includes(".");
  } catch {
    return false;
  }
}

export async function poolFor(info: ConnectionInfo) {
  if (cache.pool && cache.poolUrl === info.url) return cache.pool;
  const local = isPlainTcp(info.url);
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

export function postgresStorage(pool: Pool, info: ConnectionInfo): PortfolioStorage {
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

export async function readStoredPassword(pool: Pool, info: ConnectionInfo): Promise<string | null> {
  await ensureSchema(pool, info);
  const result = await pool.query<{ value: string }>("select value from admin_settings where key = 'admin_password' limit 1");
  return result.rows[0]?.value ?? null;
}

export async function storeAdminPassword(pool: Pool, info: ConnectionInfo, password: string) {
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

export const demoStorage: PortfolioStorage = {
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
export function newMediaId() {
  return `${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
