/** Barrel for the Web-standard request handlers used by `src/app/api/*` routes. */
export { handleContent, handleMedia, handleUpload, loadContent } from "./content-handlers";
export { handleSession, type SessionPayload } from "./session-handlers";
export { handleBackup, collectMediaIds, type BackupBundle } from "./backup-handlers";
export { handleStatus } from "./status-handler";
export { defaultContent } from "../content/defaults";
export { normalizeContent } from "../content/normalize";
export type { PortfolioContent } from "../content/types";
