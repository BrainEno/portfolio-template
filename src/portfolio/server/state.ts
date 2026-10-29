import type { Pool } from "pg";
import type { BackendStatus, ConnectionInfo } from "./types";

/** Shared, per-isolate state (pool, probe cache, connection cache). */
export const CONTENT_ID = "portfolio";
export const CONNECTION_ENV_KEYS = [
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

export const REQUIRED_TABLES = ["site_content", "media_assets", "admin_settings"] as const;

export type GlobalCache = {
  pool?: Pool;
  poolUrl?: string;
  schemaReady?: boolean;
  status?: BackendStatus;
  lastProbe?: number;
  connection?: ConnectionInfo | null;
  connectionAt?: number;
};

export const globalCache = globalThis as typeof globalThis & { __pfBackend?: GlobalCache };
export const cache: GlobalCache = (globalCache.__pfBackend ??= {});
export const STATUS_TTL_MS = 15_000;
