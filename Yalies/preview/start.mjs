import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const processes = [];
let stopping = false;
function stop(code) {
    if (stopping) return;
    stopping = true;
    for (const child of processes) child.kill("SIGTERM");
    setTimeout(() => process.exit(code), 500).unref();
}
function start(args, cwd, env) {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
    processes.push(child);
    child.on("error", error => { console.error(error); stop(1); });
    child.on("exit", code => stop(code || 1));
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

start(["build/index.js"], "/workspace/yalies-external/yalies-backend", { PORT: "3001" });
let apiReady = false;
for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try {
        const response = await fetch("http://127.0.0.1:3001/v3/ping", { signal: AbortSignal.timeout(1000) });
        if (response.ok) { apiReady = true; break; }
    } catch {}
    await delay(500);
}
if (!apiReady || stopping) {
    console.error("Preview API did not become ready; refusing frontend traffic.");
    stop(1);
} else {
    start(["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"], "/workspace/yalies-external/yalies-web", {
        PORT: process.env.PORT || "8080",
    });
}
