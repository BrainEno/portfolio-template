import { handleBackup } from "@/portfolio/server/api";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleBackup(request);
export const POST = (request: Request) => handleBackup(request);
