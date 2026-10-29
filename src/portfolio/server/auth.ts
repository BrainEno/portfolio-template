import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pf_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const DEMO_PASSWORD = "123456";

export type AuthMode = "demo" | "postgres";

export type AuthConfig = {
  mode: AuthMode;
  /** Password from the environment, if configured. */
  envPassword: string | null;
  /** scrypt hash stored in the database (first-run setup), if any. */
  storedPasswordHash: string | null;
  /** True when a Postgres backend is connected but no password exists yet. */
  needsSetup: boolean;
  /** Demo password is only live while no database is connected. */
  demoPasswordEnabled: boolean;
  /** Optional platform/runtime secret (including a Cloudflare binding). */
  sessionSecret: string | null;
};

export function hashPassword(password: string) {
  const salt = createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 32);
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function hashMatches(password: string, stored: string) {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const derived = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (expectedBuffer.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuffer);
}

function safeEqual(a: string, b: string) {
  return createHash("sha256").update(a).digest().equals(createHash("sha256").update(b).digest());
}

/** Which password is currently valid, and is login possible at all? */
export function verifyPassword(input: string, config: AuthConfig) {
  if (!input) return false;
  if (config.envPassword) return safeEqual(input, config.envPassword);
  if (config.storedPasswordHash) return hashMatches(input, config.storedPasswordHash);
  if (config.demoPasswordEnabled) return safeEqual(input, DEMO_PASSWORD);
  return false;
}

function secret(config?: AuthConfig) {
  return (
    config?.sessionSecret ||
    process.env.ADMIN_SECRET ||
    `pf::${config?.envPassword ?? config?.storedPasswordHash ?? "local"}::session`
  );
}

function sign(payload: string, config?: AuthConfig) {
  return createHmac("sha256", secret(config)).update(payload).digest("base64url");
}

export function createSessionToken(config?: AuthConfig) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expires);
  return `${payload}.${sign(payload, config)}`;
}

export function verifySessionToken(token: string | undefined | null, config?: AuthConfig) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload, config))) return false;
  return Number(payload) > Math.floor(Date.now() / 1000);
}

export function readCookie(header: string | null, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function isAuthenticated(request: Request, config?: AuthConfig) {
  return verifySessionToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE), config);
}

export function sessionCookie(token: string | null, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const maxAge = token ? SESSION_TTL_SECONDS : 0;
  return `${SESSION_COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
