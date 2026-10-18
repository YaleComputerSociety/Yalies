import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import net from "node:net";
const root = fileURLToPath(new URL("../../", import.meta.url));
let problems = 0;
function report(ok, message) { console.log(`${ok ? "OK" : "CHECK"} ${message}`); if (!ok) problems++; }
report(process.versions.node.startsWith("22."), "Node 22 (use nvm use)");
for (const tool of ["git", "npm"]) report(spawnSync(tool, ["--version"], { stdio: "ignore" }).status === 0, tool);
const manifest = {
  "external/.env.web": ["NEXT_PUBLIC_YALIES_API_URL"],
  "external/.env.backend.development": ["DATABASE_URL", "SESSION_SECRET", "PORT", "NODE_ENV", "AUTH_MODE", "FRONTEND_URL"],
};
if (process.argv.includes("--all")) Object.assign(manifest, {
  "internal/.env.dashboard": ["NEXT_PUBLIC_SCRAPER_API_URL", "NEXT_PUBLIC_BACKEND_API_URL"],
  "internal/.env.data-pipeline": ["DATABASE_URL", "SESSION_SECRET", "AUTH_MODE", "DASHBOARD_URL", "NODE_ENV"],
});
for (const [file, required] of Object.entries(manifest)) {
  const location = resolve(root, ".config", file);
  if (!existsSync(location)) { report(false, `Missing .config/${file}`); continue; }
  let values;
  try { values = parseEnv(readFileSync(location, "utf8")); } catch { report(false, `Cannot parse .config/${file}`); continue; }
  for (const key of required) {
    const value = values[key]?.trim();
    report(Boolean(value) && !/replace-with|USER:PASSWORD|yournetid/.test(value), `${file}: ${key} configured`);
  }
  if (values.AUTH_MODE === "dev") report(Boolean(values.DEV_NETID?.trim()), `${file}: DEV_NETID present`);
  if (values.NODE_ENV) report(values.NODE_ENV === "development", `${file}: development environment`);
}
if (process.argv.includes("--cloud")) {
  for (const tool of ["gcloud", "cloud-sql-proxy"]) report(spawnSync("/bin/sh", ["-c", `command -v ${tool}`], { stdio: "ignore" }).status === 0, tool);
  const file = resolve(root, ".config/.env.proxy");
  if (!existsSync(file)) report(false, "Missing .config/.env.proxy");
  else {
    const values = parseEnv(readFileSync(file, "utf8"));
    report(values.DEV_MODE === "development", "Proxy selects development");
    report(Boolean(values.CLOUD_SQL_DEV_INSTANCE), "Development Cloud SQL instance configured");
  }
}
for (const port of process.argv.includes("--all") ? [1337, 3000, 3001, 8080] : [1337, 3000]) {
  await new Promise(done => {
    const server = net.createServer();
    server.once("error", error => { report(false, `Port ${port}: ${error.code === "EADDRINUSE" ? "already in use" : "cannot inspect"}`); done(); });
    server.listen(port, "127.0.0.1", () => server.close(() => { report(true, `Port ${port} available`); done(); }));
  });
}
console.log("No credentials displayed; no database or cloud connection attempted.");
process.exitCode = problems ? 1 : 0;
