import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin", "routes/admin.tsx"),
  route("adam", "routes/adam.tsx"),
  route("api/content", "routes/api.content.ts"),
  route("api/session", "routes/api.session.ts"),
  route("api/status", "routes/api.status.ts"),
  route("api/backup", "routes/api.backup.ts"),
  route("api/media", "routes/api.media.ts"),
  route("api/media/:id", "routes/api.media.$id.ts"),
] satisfies RouteConfig;
