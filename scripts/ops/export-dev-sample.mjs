// Read-only production export. The resulting SQL can only replace the local
// yalies_dev database populated by npm run db:local:setup.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync, readFileSync, copyFileSync, renameSync, constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import net from "node:net";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = resolve(root, ".config/local");
const output = resolve(directory, "people-sample-250.sql");
const project = "yalies";
const connectionName = "yalies:us-central1:yalies-sql-prod";
const proxyPort = 15439;
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { Client, escapeIdentifier, escapeLiteral } = require("pg");
let proxy;
let client;
const enrich = process.argv[2] === "--include-email-birthdays-location";
if (process.argv.length > 3 || (process.argv[2] && !enrich)) throw new Error("Optional argument: --include-email-birthdays-location (requires explicit authorization for those fields)");
let previousSample;
let previousIds;

function gcloud(args) {
  const result = spawnSync("gcloud", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`gcloud ${args[0]} ${args[1]} failed; check your Google Cloud login and permissions`);
  return JSON.parse(result.stdout);
}
function literal(value) {
  if (value == null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid numeric person field");
    return String(value);
  }
  return escapeLiteral(String(value));
}

try {
  if (enrich) {
    previousSample = readFileSync(output, "utf8");
    previousIds = [...previousSample.matchAll(/^INSERT INTO public\.person \("id",[^\n]* VALUES \((\d+), /gm)].map(match => Number(match[1]));
    if (previousIds.length !== 250 || new Set(previousIds).size !== 250) throw new Error("Expected an existing 250-person sample with id as its first column");
  } else if (existsSync(output)) throw new Error("Sample already exists; move it aside before creating another random sample");
  mkdirSync(directory, { recursive: true });
  const instance = gcloud(["sql", "instances", "describe", "yalies-sql-prod", `--project=${project}`, "--format=json(connectionName,ipAddresses)"]);
  if (instance.connectionName !== connectionName) throw new Error("Production instance identity did not match");
  const service = gcloud(["run", "services", "describe", "yalies-backend", `--project=${project}`, "--region=us-central1", "--format=json(spec.template.spec.containers)"]);
  const value = service.spec.template.spec.containers.flatMap(container => container.env || [])
    .find(variable => variable.name === "DATABASE_URL")?.value;
  if (!value) throw new Error("Backend DATABASE_URL was not available as a runtime value");
  const url = new URL(value);
  const socket = url.searchParams.get("host") || "";
  if (!(instance.ipAddresses || []).some(address => address.ipAddress === url.hostname)
      && !socket.endsWith(`/cloudsql/${connectionName}`)) {
    throw new Error("Backend database URL does not match the verified production instance");
  }
  if (url.pathname !== "/postgres") throw new Error("Unexpected production database name");
  await new Promise((done, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`Export proxy port ${proxyPort} is unavailable`)));
    server.listen(proxyPort, "127.0.0.1", () => server.close(done));
  });
  const log = openSync(resolve(directory, "export-proxy.log"), "w", 0o600);
  const key = resolve(root, ".config/gcloud/service-key.json");
  proxy = spawn("cloud-sql-proxy", ["--address=127.0.0.1", `--port=${proxyPort}`,
    ...(existsSync(key) ? [`--credentials-file=${key}`] : []), connectionName],
  { stdio: ["ignore", log, log] });
  closeSync(log);
  proxy.once("error", () => {});
  url.hostname = "127.0.0.1";
  url.port = String(proxyPort);
  url.searchParams.delete("host");
  // The proxy encrypts the remote hop; this loopback connection needs no TLS.
  url.searchParams.delete("sslmode");
  let connected = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    client = new Client({ connectionString: url.href, connectionTimeoutMillis: 2000,
      application_name: "yalies-read-only-dev-sample", options: "-c default_transaction_read_only=on" });
    try {
      await client.connect();
      connected = true;
      break;
    } catch {
      await client.end().catch(() => {});
      if (proxy.exitCode !== null) throw new Error("Production proxy exited; see .config/local/export-proxy.log");
      await new Promise(done => setTimeout(done, 500));
    }
  }
  if (!connected) throw new Error("Could not connect through the production proxy");
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  const identity = (await client.query("SELECT current_database() AS db, current_setting('transaction_read_only') AS read_only")).rows[0];
  if (identity.db !== "postgres" || identity.read_only !== "on") throw new Error("Read-only database identity check failed");
  // Minimal fields by default. Email, birthday month/day, and city/state/country are opt-in and
  // require explicit authorization; enrichment preserves the original cohort.
  const columns = ["id", "netid", "first_name", "preferred_name", "middle_name", "last_name", "suffix",
    "school", "school_code", "year", "college", "college_code", "curriculum", "major", "image"];
  if (enrich) columns.push("email", "birth_month", "birth_day", "address", "address_state", "address_country");
  const identifiers = columns.map(escapeIdentifier).join(", ");
  // Match the API's location sanitization: copy only the last address line,
  // which contains city/state/country, rather than any street-address lines.
  const selection = columns.map(column => column === "address"
    ? '(string_to_array("address", chr(10)))[array_length(string_to_array("address", chr(10)), 1)] AS "address"'
    : escapeIdentifier(column)).join(", ");
  const { rows } = enrich ? await client.query(`SELECT ${selection} FROM public.person WHERE id = ANY($1::integer[]) ORDER BY id`, [previousIds]) : await client.query(`
    SELECT ${identifiers} FROM (
      SELECT DISTINCT ON (netid) ${identifiers}
      FROM public.person
      WHERE netid ~ '^[a-z][a-z0-9]*$'
      ORDER BY netid, id
    ) AS eligible
    ORDER BY random() LIMIT 250
  `);
  if (rows.length !== 250 || new Set(rows.map(row => row.netid)).size !== 250) {
    throw new Error("Expected exactly 250 distinct usable directory identities");
  }
  if (enrich && rows.some(row => !previousIds.includes(row.id))) throw new Error("Sample cohort changed unexpectedly");
  await client.query("ROLLBACK");
  const statements = rows.map(row => `INSERT INTO public.person (${identifiers}) VALUES (${columns.map(column => literal(row[column])).join(", ")});`);
  const contents = [
    "-- Yalies private development sample: 250 distinct people, selected at random from production.",
    `-- Exported ${new Date().toISOString()}. Contains real directory data; keep private and out of Git.`,
    `-- Names, NetIDs, schools, years, colleges, majors, curriculum, photo URLs${enrich ? ", email, birthday month/day, and city/state/country" : ""}.`,
    `-- ${enrich ? "Phone numbers, street addresses" : "Contact details, addresses, birthdays"}, UPI/access codes, and all other tables excluded.`,
    "-- Run npm run db:local:setup first. This replaces the local fixtures and clears local test sessions/social data.",
    "BEGIN;",
    "SET LOCAL standard_conforming_strings = on;",
    "DO $$ BEGIN",
    "  IF current_database() <> 'yalies_dev' OR current_user <> 'yalies_dev' THEN",
    "    RAISE EXCEPTION 'This sample may only be imported as yalies_dev into the local yalies_dev database';",
    "  END IF;",
    "END $$;",
    "TRUNCATE public.person, public.session, public.api_key, public.user_profile, public.profile_like, public.friendship, public.data_change_request;",
    ...statements,
    "DO $$ BEGIN",
    "  IF (SELECT count(*) FROM public.person) <> 250 OR (SELECT count(DISTINCT netid) FROM public.person) <> 250 THEN",
    "    RAISE EXCEPTION 'Expected 250 distinct imported people';",
    "  END IF;",
    "END $$;",
    "COMMIT;", "",
  ].join("\n");
  if (enrich) {
    const backup = resolve(directory, `people-sample-250-before-enrichment-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
    // Do not replace a sample that changed while the production read was running.
    if (readFileSync(output, "utf8") !== previousSample) throw new Error("Sample changed during export; leaving it intact");
    copyFileSync(output, backup, constants.COPYFILE_EXCL);
    const next = `${output}.next-${process.pid}`;
    writeFileSync(next, contents, { mode: 0o600, flag: "wx" });
    renameSync(next, output);
  } else writeFileSync(output, contents, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ file: output, people: rows.length, bytes: Buffer.byteLength(contents),
    ...(enrich && { sameCohort: true, emails: rows.filter(row => row.email).length,
      birthdays: rows.filter(row => row.birth_month != null && row.birth_day != null).length,
      locations: rows.filter(row => row.address || row.address_state || row.address_country).length }),
    sha256: createHash("sha256").update(contents).digest("hex"), productionWrites: 0 }, null, 2));
} catch (error) {
  console.error(error.message?.includes("postgresql://") ? "Export failed (database connection error)" : error.message);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  proxy?.kill("SIGTERM");
}
