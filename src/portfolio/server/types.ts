import type { PortfolioContent } from "../content/types";

export type PortfolioStorage = {
  readContent(): Promise<unknown | null>;
  writeContent(content: PortfolioContent): Promise<void>;
  putMedia(file: { name: string; type: string; bytes: Uint8Array }): Promise<string>;
  /** Used by backup restore so `/api/media/<id>` links stay valid. */
  putMediaWithId(file: { id: string; name: string; type: string; bytes: Uint8Array }): Promise<void>;
  getMedia(id: string): Promise<{ type: string; bytes: Uint8Array } | null>;
};

export type BackendMode = "demo" | "postgres";
export type DeploymentPlatform = "local" | "netlify" | "cloudflare" | "vercel" | "railway" | "render" | "fly" | "generic";

export type ConnectionInfo = {
  key: string;
  url: string;
  platform: DeploymentPlatform;
  /** Netlify Database applies committed migrations before publish. */
  migrationManaged: boolean;
  /** Hyperdrive owns the connection pool; keep the Worker-side pool tiny. */
  hyperdrive: boolean;
};

export type BackendStatus = {
  mode: BackendMode;
  connected: boolean;
  platform: DeploymentPlatform;
  /** Environment variable / platform binding that supplied the URL. */
  connectionSource: string | null;
  database: string | null;
  host: string | null;
  needsSetup: boolean;
  demoPasswordEnabled: boolean;
  error: string | null;
  checkedAt: string;
};
