import { handleContent } from "@/portfolio/server/api";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleContent(request);
export const PUT = (request: Request) => handleContent(request);
export const POST = (request: Request) => handleContent(request);
