import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import net from "node:net";
import { parseEnv } from "node:util";
import { seedLocal } from "./seed-local.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = resolve(root, ".config/local");
const data = resolve(directory, "postgres");
const container = `yalies-local-${createHash("sha256").update(root).digest("hex").slice(0, 10)}`;
const mode = process.argv[2];
if (mode && !["--setup", "--stop"].includes(mode)) throw new Error("Use dev:local, db:local:setup, or db:local:stop");
if (!process.versions.node.startsWith("22.")) throw new Error("Use Node 22: nvm use");
mkdirSync(directory, { recursive: true });
const settingsFile = resolve(directory, "database.json");
const envFile = resolve(directory, "backend.env");
const children = [];
let stopping = false;
let startedDatabase = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error?.message || result.stdout}`);
  return result.stdout?.trim();
}
function binary(name) {
  for (const candidate of [name, ...["/opt/homebrew", "/usr/local"].flatMap(prefix =>
    ["postgresql@16", "postgresql@17", "postgresql@18", "postgresql"].map(pkg => `${prefix}/opt/${pkg}/bin/${name}`))]) {
    if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) return candidate;
  }
}
// libpq includes initdb/pg_ctl without the postgres server. Locate the server first
// and use its matching tools (multiple PostgreSQL majors may be installed).
const postgres = binary("postgres");
const serverDirectory = postgres && dirname(realpathSync(postgres.includes("/") ? postgres
  : run("/bin/sh", ["-c", "command -v postgres"])));
const pgCtl = serverDirectory && resolve(serverDirectory, "pg_ctl");
const initdb = serverDirectory && resolve(serverDirectory, "initdb");
let settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, "utf8")) : undefined;
function stopDatabase() {
  if (settings?.engine === "native" && existsSync(resolve(data, "postmaster.pid"))) {
    if (!pgCtl) throw new Error("pg_ctl is required to stop this local database");
    run(pgCtl, ["-D", data, "-m", "fast", "-w", "stop"]);
  } else if (settings?.engine === "docker") {
    run("docker", ["stop", container]);
  }
}
if (mode === "--stop") {
  stopDatabase();
  console.log("Local database stopped; data is preserved in .config/local or the Docker volume.");
  process.exit(0);
}

async function assertPortFree(port) {
  await new Promise((done, reject) => {
    const server = net.createServer();
    server.once("error", error => reject(new Error(error.code === "EADDRINUSE"
      ? `Port ${port} is in use. Stop that service before starting dev:local.`
      : `Cannot listen on port ${port}: ${error.code}`)));
    server.listen(port, "127.0.0.1", () => server.close(done));
  });
}
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  if (startedDatabase) {
    try { stopDatabase(); } catch (error) { console.error(error.message); code = 1; }
  }
  process.exitCode = code;
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  if (!mode) {
    await assertPortFree(1337);
    await assertPortFree(3000);
  }
  if (!settings) {
    if ((!pgCtl || !initdb) && spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
      throw new Error("Install PostgreSQL (macOS: brew install postgresql@16), or install and start Docker Desktop.");
    }
    settings = {
      engine: pgCtl && initdb ? "native" : "docker",
      password: randomBytes(24).toString("hex"),
    };
    writeFileSync(settingsFile, JSON.stringify(settings), { mode: 0o600, flag: "wx" });
  }
  if (settings.engine === "native") {
    if (!pgCtl || !initdb) throw new Error("Install PostgreSQL tools (macOS: brew install postgresql@16).");
    if (!existsSync(resolve(data, "PG_VERSION"))) {
      const passwordFile = resolve(directory, "init-password");
      writeFileSync(passwordFile, settings.password, { mode: 0o600 });
      try {
        run(initdb, ["-D", data, "-U", "yalies_dev", "--auth-local=trust", "--auth-host=scram-sha-256", `--pwfile=${passwordFile}`]);
      } finally { unlinkSync(passwordFile); }
    }
    if (spawnSync(pgCtl, ["-D", data, "status"], { stdio: "ignore" }).status !== 0) {
      await assertPortFree(55432);
      run(pgCtl, ["-D", data, "-l", resolve(directory, "postgres.log"), "-o", "-h 127.0.0.1 -p 55432 -k /tmp", "-w", "start"]);
      startedDatabase = true;
    }
  } else {
    if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
      throw new Error("Install PostgreSQL (macOS: brew install postgresql@16), or install and start Docker Desktop.");
    }
    const inspection = spawnSync("docker", ["inspect", container], { encoding: "utf8" });
    if (inspection.status === 0) {
      const info = JSON.parse(inspection.stdout)[0];
      if (info.Config.Labels?.["io.yalies.local"] !== root) throw new Error("Container name is already used by another project");
      if (!info.State.Running) {
        await assertPortFree(55432);
        run("docker", ["start", container]);
        startedDatabase = true;
      }
    } else {
      await assertPortFree(55432);
      run("docker", ["run", "--detach", "--name", container, "--label", `io.yalies.local=${root}`,
        "--publish", "127.0.0.1:55432:5432", "--env", "POSTGRES_USER=yalies_dev",
        "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=yalies_dev",
        "--volume", `${container}-data:/var/lib/postgresql/data`, "postgres:16"],
      { env: { ...process.env, POSTGRES_PASSWORD: settings.password }, stdio: ["ignore", "pipe", "inherit"] });
      startedDatabase = true;
    }
  }
  const databaseUrl = `postgresql://yalies_dev:${settings.password}@127.0.0.1:55432/yalies_dev`;
  const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
  const { Client } = require("pg");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const client = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 1000 });
    try {
      await client.connect();
      const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'yalies_dev'");
      if (!result.rowCount) await client.query("CREATE DATABASE yalies_dev");
      ready = true;
      break;
    } catch (error) {
      if (attempt === 59) throw new Error(`Local PostgreSQL did not become ready (${error.code || "connection failed"})`);
      await new Promise(done => setTimeout(done, 500));
    } finally { await client.end(); }
  }
  if (!ready || stopping) throw new Error("Local startup stopped");
  run("npm", ["run", "build", "-w", "yalies-backend"], { stdio: "inherit" });
  const preferredNetid = process.env.DEV_NETID
    || (existsSync(envFile) && parseEnv(readFileSync(envFile, "utf8")).DEV_NETID);
  const netid = await seedLocal(databaseUrl, preferredNetid || undefined);
  const sessionSecret = (existsSync(envFile) && parseEnv(readFileSync(envFile, "utf8")).SESSION_SECRET)
    || randomBytes(32).toString("hex");
  const previousEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const yalemojiEnv = ["YALEMOJI_API_KEY", "YALEMOJI_API_URL"].flatMap(name => {
    const value = process.env[name] || previousEnv[name];
    return value ? [`${name}=${JSON.stringify(value)}`] : [];
  });
  writeFileSync(envFile, [
    `DATABASE_URL=${databaseUrl}`, `SESSION_SECRET=${sessionSecret}`, "PORT=1337", "HOST=127.0.0.1", "NODE_ENV=development",
    "AUTH_MODE=dev", `DEV_NETID=${netid}`, `ADMIN_NETIDS=${netid}`, "FRONTEND_URL=http://localhost:3000",
    "OIDC_ENABLED=false", "FACECHECK_ENABLED=false", "PHOTO_STORAGE_ENABLED=false", "PREVIEW_READ_ONLY=false", ...yalemojiEnv, "",
  ].join("\n"), { mode: 0o600 });
  console.log("Local PostgreSQL ready at 127.0.0.1:55432/yalies_dev (no cloud credentials used).");
  if (mode === "--setup") {
    console.log("Config: .config/local/backend.env. Stop with npm run db:local:stop.");
    startedDatabase = false; // Setup intentionally leaves the database available.
  } else {
    function start(command, args, env = {}) {
      const child = spawn(command, args, { cwd: root, stdio: "inherit", detached: true,
        env: { ...process.env, NODE_ENV: "development", ...env } });
      children.push(child);
      child.once("error", error => { console.error(error.message); shutdown(1); });
      child.once("exit", code => shutdown(code ?? 1));
    }
    start("npm", ["run", "watch", "-w", "yalies-shared"]);
    start(process.execPath, ["apps/api/build/index.js"], { YALIES_API_ENV_FILE: envFile });
    start("npm", ["run", "dev", "-w", "yalies-web", "--", "--hostname", "127.0.0.1", "--port", "3000"],
      { NEXT_PUBLIC_YALIES_API_URL: "http://localhost:1337" });
    console.log(`Open http://localhost:3000 and click Log in (${netid}). Ctrl+C stops the apps.`);
  }
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}
