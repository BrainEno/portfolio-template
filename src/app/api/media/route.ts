import { handleUpload } from "@/portfolio/server/api";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => handleUpload(request);
