import { defaultContent } from "../content/defaults";
import { normalizeContent } from "../content/normalize";
import type { PortfolioContent } from "../content/types";
import { isAuthenticated } from "./auth";
import { getAuthConfig, getStorage } from "./backend";
import { json, unauthorized } from "./http";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = /^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/;

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
    return json({ error: "File exceeds 12 MB — compress it or use an image URL" }, { status: 413 });
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
