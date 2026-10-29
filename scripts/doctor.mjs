// `npm run doctor` - tells you, in plain words, what is configured and what is missing.
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`);

// Minimal .env loader (same precedence as Next: real env wins).
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

console.log("\nPortfolio doctor\n");
const major = Number(process.versions.node.split(".")[0]);
major >= 20 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} is too old - install Node 20 or 22 (https://nodejs.org)`);
existsSync("node_modules") ? ok("dependencies installed") : bad("dependencies missing - run: npm install");
existsSync(".env") ? ok(".env found") : warn(".env not found - the site will run in demo mode (copy .env.example to .env to configure)");

const KEYS = ["DATABASE_URL", "NETLIFY_DB_URL", "NETLIFY_DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "SUPABASE_DB_URL", "NEON_DATABASE_URL", "RAILWAY_DATABASE_URL"];
const key = KEYS.find((k) => /^postgres(ql)?:\/\//.test(process.env[k] ?? ""));
let live = false;
if (!key) {
  warn("no PostgreSQL URL -> DEMO MODE: /admin opens directly on mock data, edits stay in this browser");
} else {
  const url = process.env[key];
  const host = new URL(url).hostname;
  const plain = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host) || !host.includes(".") || /sslmode=disable/i.test(url) || process.env.DATABASE_SSL === "false";
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 6000, ssl: plain ? undefined : { rejectUnauthorized: false } });
  try {
    await pool.query("select 1");
    ok(`${key} reachable (${host}) -> LIVE MODE: data is stored in PostgreSQL, mock data is ignored`);
    live = true;
  } catch (error) {
    bad(`${key} is set but unreachable: ${error.message}`);
    warn("the site still starts in DEMO MODE until the database answers. Start it with: docker compose up -d db");
  } finally {
    await pool.end().catch(() => undefined);
  }
}
live
  ? process.env.ADMIN_PASSWORD
    ? ok("ADMIN_PASSWORD is set")
    : warn("ADMIN_PASSWORD is empty - the FIRST visitor of /admin chooses the password. Open /admin right after deploying (or set ADMIN_PASSWORD).")
  : null;
console.log("");
process.exit(0);
