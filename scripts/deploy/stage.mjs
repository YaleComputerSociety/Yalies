// Copy only tracked deployment inputs. Local credentials and build caches stay out.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/deploy/stage.mjs DESTINATION");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of files) {
  if (!/^(apps\/|packages\/|scripts\/|deploy\/|package(?:-lock)?\.json$)/.test(file)) continue;
  if (/(^|\/)\.env[^/]*$/.test(file)) continue;
  if (/(^|\/)(node_modules|build|dist|\.next|\.config|venv|output)(\/|$)|\.tsbuildinfo$/.test(file)) continue;
  const target = resolve(destination, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(root, file), target);
}
