import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Optional: the app creates its own tables on first connection. This config is
// only for `npm run db:push` (schema sync) and `npm run db:studio`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      process.env.NETLIFY_DB_URL ||
      process.env.POSTGRES_URL ||
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
