import { probeBackend } from "@/portfolio/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await probeBackend();
  return Response.json({
    ok: true,
    mode: status.mode,
    platform: status.platform,
    database: status.connected ? "connected" : status.error ? "unavailable" : "not-configured",
  });
}
