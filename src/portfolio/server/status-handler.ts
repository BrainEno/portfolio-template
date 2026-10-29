import { getAuthConfig, probeBackend } from "./backend";
import { json } from "./http";

/** Public status endpoint used by /admin and /adam headers. */
export async function handleStatus() {
  const config = await getAuthConfig();
  const status = await probeBackend();
  return json({
    mode: status.mode,
    connected: status.connected,
    platform: status.platform,
    connectionSource: status.connectionSource,
    database: status.database,
    host: status.host,
    error: status.error,
    needsSetup: config.needsSetup,
    demoPasswordEnabled: config.demoPasswordEnabled,
    envPasswordConfigured: Boolean(config.envPassword),
    checkedAt: status.checkedAt,
  });
}
