import { handleMedia } from "@/portfolio/server/api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleMedia(id);
}
