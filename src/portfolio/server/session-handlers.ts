import {
  createSessionToken,
  isAuthenticated,
  sessionCookie,
  verifyPassword,
  type AuthConfig,
} from "./auth";
import { getAuthConfig, probeBackend, setInitialAdminPassword, type BackendStatus } from "./backend";
import { json } from "./http";

export type SessionPayload = {
  authenticated: boolean;
  mode: BackendStatus["mode"];
  connected: boolean;
  platform: BackendStatus["platform"];
  needsSetup: boolean;
  demoPasswordEnabled: boolean;
  defaultPassword: boolean;
  connectionSource: string | null;
  database: string | null;
  error: string | null;
};

async function sessionPayload(request: Request, config: AuthConfig): Promise<SessionPayload> {
  const status = await probeBackend();
  return {
    // Database-free demo mode is intentionally open: all edits stay in the
    // visitor's browser cache. The moment Postgres connects, this becomes a
    // normal signed-cookie session and the mock data is ignored.
    authenticated: config.mode === "demo" ? true : isAuthenticated(request, config),
    mode: status.mode,
    connected: status.connected,
    platform: status.platform,
    needsSetup: config.needsSetup,
    demoPasswordEnabled: config.demoPasswordEnabled,
    defaultPassword: config.demoPasswordEnabled,
    connectionSource: status.connectionSource,
    database: status.database,
    error: status.error,
  };
}

export async function handleSession(request: Request) {
  const config = await getAuthConfig();

  if (request.method === "GET") {
    return json(await sessionPayload(request, config));
  }
  if (request.method === "DELETE") {
    return json({ ...(await sessionPayload(request, config)), authenticated: false }, {
      headers: { "set-cookie": sessionCookie(null, request) },
    });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = (await request.json().catch(() => ({}))) as { password?: unknown; newPassword?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  // First run on a freshly connected database: choose the permanent password.
  if (config.needsSetup && newPassword) {
    if (newPassword.length < 6) {
      return json({ error: "Use at least 6 characters" }, { status: 422 });
    }
    await setInitialAdminPassword(newPassword);
    const next = await getAuthConfig();
    // The cookie is set on this response, so the incoming request already
    // represents a signed-in session from the client's point of view.
    return json({ ...(await sessionPayload(request, next)), authenticated: true }, {
      headers: { "set-cookie": sessionCookie(createSessionToken(next), request) },
    });
  }

  if (config.needsSetup) {
    return json({ error: "setup_required" }, { status: 428 });
  }

  if (!verifyPassword(password, config)) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return json({ error: "Incorrect password" }, { status: 401 });
  }
  return json({ ...(await sessionPayload(request, config)), authenticated: true }, {
    headers: { "set-cookie": sessionCookie(createSessionToken(config), request) },
  });
}
