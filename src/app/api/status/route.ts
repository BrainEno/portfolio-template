import { handleStatus } from "@/portfolio/server/api";

export const dynamic = "force-dynamic";

export const GET = () => handleStatus();
