import { probeBackend } from "@/portfolio/server/backend";

export const dynamic = "force-dynamic";

/** Liveness probe. Always 200 when the server runs; the database is reported, never required. */
export async function GET() {
  const status = await probeBackend();
  return Response.json(
    {
      ok: true,
      mode: status.mode,
      platform: status.platform,
      database: status.connected ? "connected" : status.error ? "unavailable" : "not-configured",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
