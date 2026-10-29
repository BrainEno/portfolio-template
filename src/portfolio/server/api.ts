import { defaultContent } from "../content/defaults";
import { normalizeContent } from "../content/normalize";
import type { PortfolioContent } from "../content/types";
import {
  createSessionToken,
  isAuthenticated,
  sessionCookie,
  verifyPassword,
  type AuthConfig,
} from "./auth";
import { getAuthConfig, getStorage, probeBackend, setInitialAdminPassword, type BackendStatus } from "./db";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = /^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

const unauthorized = () => json({ error: "Unauthorized" }, { status: 401 });

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

export async function loadContent(): Promise<PortfolioContent> {
  try {
    const { storage } = await getStorage();
    const stored = await storage.readContent();
    return stored ? normalizeContent(stored) : defaultContent;
  } catch (error) {
    console.error("[portfolio] failed to read content, using defaults", error);
    return defaultContent;
  }
}

export async function handleContent(request: Request) {
  if (request.method === "GET") {
    return json({ content: await loadContent() });
  }
  if (request.method !== "PUT" && request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const config = await getAuthConfig();
  if (!isAuthenticated(request, config)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = (body as { content?: unknown; reset?: boolean }) ?? {};
  const content = payload.reset ? defaultContent : normalizeContent(payload.content);

  try {
    const { storage, status } = await getStorage();
    await storage.writeContent(content);
    return json({ content, savedAt: new Date().toISOString(), mode: status.mode });
  } catch (error) {
    console.error("[portfolio] failed to write content", error);
    return json({ error: "Storage unavailable — check the PostgreSQL connection and try again" }, { status: 503 });
  }
}

export async function handleUpload(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const config = await getAuthConfig();
  if (!isAuthenticated(request, config)) return unauthorized();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "No file received" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.test(file.type)) {
    return json({ error: `Unsupported file type: ${file.type || "unknown"}` }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: "File exceeds 4 MB — compress it or use an image URL" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const { storage } = await getStorage();
    const id = await storage.putMedia({ name: file.name, type: file.type, bytes });
    return json({ id, url: `/api/media/${id}` }, { status: 201 });
  } catch (error) {
    console.error("[portfolio] failed to store upload", error);
    return json({ error: "Storage unavailable — check the PostgreSQL connection and try again" }, { status: 503 });
  }
}

export async function handleMedia(id: string | undefined) {
  if (!id || !/^[\w-]{6,80}$/.test(id)) return new Response("Not found", { status: 404 });
  try {
    const { storage } = await getStorage();
    const media = await storage.getMedia(id);
    if (!media) return new Response("Not found", { status: 404 });
    const body = media.bytes.buffer.slice(
      media.bytes.byteOffset,
      media.bytes.byteOffset + media.bytes.byteLength
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "content-type": media.type,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
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

/* ------------------------------------------------------------------ */
/* One-click backup / migration                                       */
/* ------------------------------------------------------------------ */

const BACKUP_FORMAT = "portfolio-backup";
const MAX_BACKUP_MEDIA_BYTES = 24 * 1024 * 1024;

export type BackupBundle = {
  format: typeof BACKUP_FORMAT;
  version: 2;
  exportedAt: string;
  content: PortfolioContent;
  media: { id: string; filename: string; type: string; dataBase64: string }[];
};

/** Every `/api/media/<id>` reference inside the content document. */
export function collectMediaIds(content: PortfolioContent): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const match = value.match(/\/api\/media\/([\w-]{6,80})/);
      if (match) ids.add(match[1]);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(content);
  return [...ids];
}

export async function handleBackup(request: Request) {
  const config = await getAuthConfig();
  if (!isAuthenticated(request, config)) return unauthorized();

  const { storage, status } = await getStorage();

  if (request.method === "GET") {
    const content = await loadContent();
    const media: BackupBundle["media"] = [];
    let budget = MAX_BACKUP_MEDIA_BYTES;
    for (const id of collectMediaIds(content)) {
      const asset = await storage.getMedia(id).catch(() => null);
      if (!asset || asset.bytes.byteLength > budget) continue;
      budget -= asset.bytes.byteLength;
      media.push({
        id,
        filename: `${id}`,
        type: asset.type,
        dataBase64: Buffer.from(asset.bytes).toString("base64"),
      });
    }
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: new Date().toISOString(),
      content,
      media,
    };
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="portfolio-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = (await request.json().catch(() => null)) as Partial<BackupBundle> | null;
  if (!body || !body.content) return json({ error: "Invalid backup file" }, { status: 400 });
  if (body.format && body.format !== BACKUP_FORMAT) {
    return json({ error: "This file is not a portfolio backup" }, { status: 415 });
  }

  try {
    const content = normalizeContent(body.content);
    for (const asset of body.media ?? []) {
      if (!asset?.id || !asset.dataBase64) continue;
      await storage.putMediaWithId({
        id: asset.id,
        name: asset.filename || asset.id,
        type: asset.type || "application/octet-stream",
        bytes: new Uint8Array(Buffer.from(asset.dataBase64, "base64")),
      });
    }
    await storage.writeContent(content);
    return json({
      restored: true,
      mode: status.mode,
      content,
      mediaRestored: (body.media ?? []).length,
    });
  } catch (error) {
    console.error("[portfolio] backup restore failed", error);
    return json({ error: "Restore failed — check the file and the database connection" }, { status: 500 });
  }
}

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

export { defaultContent, normalizeContent };
export type { PortfolioContent };
