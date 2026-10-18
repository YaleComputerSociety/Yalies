import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const app = process.argv[2];
const configs = { web: "external/.env.web", api: "external/.env.backend.development", dashboard: "internal/.env.dashboard", pipeline: "internal/.env.data-pipeline" };
if (!(app in configs)) throw new Error("Expected web, api, dashboard, or pipeline");
const config = resolve(root, ".config", configs[app]);
if (!existsSync(config)) throw new Error(`Missing ${config}; see ONBOARDING.md`);
if (["web", "dashboard"].includes(app)) copyFileSync(config, resolve(root, "apps", app, ".env.local"));
const build = spawnSync("npm", ["run", "build:shared"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  process.exitCode = code;
}
function start(args, cwd) {
  const child = spawn("npm", args, { cwd, stdio: "inherit", detached: true, env: { ...process.env, NODE_ENV: "development" } });
  children.push(child);
  child.on("error", error => { console.error(error.message); stop(1); });
  child.on("exit", code => stop(code ?? 1));
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
start(["run", "watch", "-w", "yalies-shared"], root);
start(["run", app === "pipeline" ? "server" : "dev"], resolve(root, "apps", app));
