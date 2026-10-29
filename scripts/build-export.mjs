import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stage = path.join(root, ".export-stage", "portfolio-react-router");
const out = path.join(root, "public", "downloads", "portfolio-react-router.zip");

rmSync(path.dirname(stage), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(path.join(root, "export", "react-router"), stage, { recursive: true });
cpSync(path.join(root, "src", "portfolio"), path.join(stage, "app", "portfolio"), { recursive: true });
mkdirSync(path.join(stage, "public"), { recursive: true });
for (const dir of ["images", "fonts"]) {
  cpSync(path.join(root, "public", dir), path.join(stage, "public", dir), { recursive: true });
}
if (existsSync(path.join(root, "public", "favicon.ico"))) {
  cpSync(path.join(root, "public", "favicon.ico"), path.join(stage, "public", "favicon.ico"));
}
mkdirSync(path.join(stage, "docs"), { recursive: true });
for (const doc of ["docs/NETLIFY_DEPLOY.md", "docs/SETUP.md", "docs/ROADMAP.md"]) {
  const from = path.join(root, doc);
  if (existsSync(from)) cpSync(from, path.join(stage, doc));
}

mkdirSync(path.dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync("zip", ["-qr", out, "portfolio-react-router"], { cwd: path.dirname(stage) });
rmSync(path.dirname(stage), { recursive: true, force: true });
console.log(`Export written to ${path.relative(root, out)}`);
