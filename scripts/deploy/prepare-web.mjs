// Run inside a staged workspace. Produce standalone Firebase input without
// changing source manifests or re-resolving the frontend dependency tree.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/deploy/prepare-web.mjs DESTINATION");
mkdirSync(destination, { recursive: true });
const excluded = new Set(["node_modules", ".next", "out", "build"]);
cpSync("apps/web", destination, { recursive: true, filter: file => !excluded.has(basename(file)) && !basename(file).startsWith(".env") });
const [packed] = JSON.parse(execFileSync("npm", ["pack", "--workspace", "yalies-shared", "--json", "--pack-destination", resolve(destination)], { encoding: "utf8" }));
const manifest = JSON.parse(readFileSync("apps/web/package.json", "utf8"));
manifest.dependencies["yalies-shared"] = `file:./${packed.filename}`;
delete manifest.scripts.prebuild;
delete manifest.scripts.predev;
const original = JSON.parse(readFileSync("package-lock.json", "utf8"));
const packages = {};
for (const [key, value] of Object.entries(original.packages)) {
  if (key.startsWith("node_modules/") && !value.link) packages[key] = value;
}
for (const [key, value] of Object.entries(original.packages)) {
  if (key.startsWith("apps/web/node_modules/")) packages[key.slice("apps/web/".length)] = value;
}
packages[""] = manifest;
packages["node_modules/yalies-shared"] = { version: packed.version, resolved: `file:${packed.filename}`, integrity: packed.integrity };
writeFileSync(resolve(destination, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(resolve(destination, "package-lock.json"), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages }, null, 2) + "\n");
