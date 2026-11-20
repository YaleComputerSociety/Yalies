import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = resolve(root, ".config/local");
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { Client, escapeIdentifier } = require("pg");
const tables = ["person", "session", "api_key", "user_profile", "profile_like", "friendship", "data_change_request"];
let client;
try {
  if (!process.argv[2] || process.argv.length !== 3) throw new Error("Usage: npm run db:local:import -- /path/to/people-sample-250.sql");
  const sample = readFileSync(resolve(process.argv[2]), "utf8");
  if (!sample.startsWith("-- Yalies private development ")) throw new Error("Expected a Yalies development sample or local backup SQL file");
  for (const port of [1337, 3000]) {
    const running = await new Promise(done => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.setTimeout(1000);
      socket.once("connect", () => { socket.destroy(); done(true); });
      socket.once("error", () => done(false));
      socket.once("timeout", () => { socket.destroy(); done(false); });
    });
    if (running) throw new Error(`Stop dev:local before importing (port ${port} is still running). Then run npm run db:local:setup.`);
  }
  const settings = JSON.parse(readFileSync(resolve(directory, "database.json"), "utf8"));
  // Deliberately ignore DATABASE_URL and all cloud config/environment values.
  client = new Client({ host: "127.0.0.1", port: 55432, user: "yalies_dev", database: "yalies_dev",
    password: settings.password, connectionTimeoutMillis: 3000 });
  await client.connect();
  const identity = (await client.query("SELECT current_database() AS db, current_user AS username")).rows[0];
  if (identity.db !== "yalies_dev" || identity.username !== "yalies_dev") throw new Error("Unexpected local database identity");

  const backup = ["-- Yalies private development backup of local test data", "BEGIN;",
    "SET LOCAL standard_conforming_strings = on;",
    "DO $$ BEGIN IF current_database() <> 'yalies_dev' OR current_user <> 'yalies_dev' THEN",
    "RAISE EXCEPTION 'Local yalies_dev database required'; END IF; END $$;",
    `TRUNCATE ${tables.map(table => `public.${escapeIdentifier(table)}`).join(", ")};`];
  // PostgreSQL quotes its own values here, preserving arrays, JSON, dates, and
  // escaped text in a plain SQL backup without requiring pg_dump on the laptop.
  for (const table of tables) {
    const columns = (await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table])).rows
      .map(row => escapeIdentifier(row.column_name));
    if (!columns.length) throw new Error("Local schema is incomplete; run npm run db:local:setup first");
    const prefix = `INSERT INTO public.${escapeIdentifier(table)} (${columns.join(", ")}) VALUES (`;
    const rows = (await client.query(`SELECT $1 || concat_ws(', ', ${columns.map(column => `quote_nullable(${column})`).join(", ")})
      || ');' AS statement FROM public.${escapeIdentifier(table)}`, [prefix])).rows;
    backup.push(...rows.map(row => row.statement));
  }
  backup.push("COMMIT;", "");
  const backupDirectory = resolve(directory, "backups");
  mkdirSync(backupDirectory, { recursive: true });
  const backupFile = resolve(backupDirectory, `before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
  writeFileSync(backupFile, backup.join("\n"), { mode: 0o600, flag: "wx" });
  await client.query(sample); // Sample carries its own transaction and destination guard.
  const result = (await client.query("SELECT count(*) AS people, count(DISTINCT netid) AS distinct_netids FROM public.person")).rows[0];
  console.log(`Imported ${result.people} people (${result.distinct_netids} distinct NetIDs) into 127.0.0.1:55432/yalies_dev.`);
  console.log(`Previous local data backed up to ${backupFile}`);
  console.log("Run npm run dev:local, then log in again. No production credentials are needed.");
} catch (error) {
  await client?.query("ROLLBACK").catch(() => {});
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
