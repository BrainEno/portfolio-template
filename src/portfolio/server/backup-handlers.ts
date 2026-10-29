import { normalizeContent } from "../content/normalize";
import type { PortfolioContent } from "../content/types";
import { isAuthenticated } from "./auth";
import { getAuthConfig, getStorage } from "./backend";
import { loadContent } from "./content-handlers";
import { json, unauthorized } from "./http";

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

