import { defaultContent } from "../content/defaults";
import { normalizeContent } from "../content/normalize";
import { DEMO_PASSWORD, type AuthConfig } from "./auth";
import { connectionInfo, describeUrl, detectNodePlatform, runtimeSecret } from "./connection";
import { STATUS_TTL_MS, cache } from "./state";
import { demoStorage, ensureSchema, poolFor, postgresStorage, readStoredPassword, storeAdminPassword } from "./storage";
import type { BackendStatus, PortfolioStorage } from "./types";

export type { BackendMode, BackendStatus, DeploymentPlatform, PortfolioStorage } from "./types";
export { newMediaId, resetDemoData } from "./storage";

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


export { DEMO_PASSWORD, defaultContent, normalizeContent };
