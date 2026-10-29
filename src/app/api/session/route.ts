import { handleSession } from "@/portfolio/server/api";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleSession(request);
export const POST = (request: Request) => handleSession(request);
export const DELETE = (request: Request) => handleSession(request);
