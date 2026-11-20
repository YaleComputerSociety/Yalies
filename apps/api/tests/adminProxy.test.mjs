import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import http from "node:http";
import { createAdminProxy } from "../build/helpers/adminProxy.js";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("admin proxy preserves sessions, uploads, redirects, and streams without intercepting public API routes", async () => {
  const received = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ url: req.url, cookie: req.headers.cookie, body: Buffer.concat(chunks), forwardedHost: req.headers["x-forwarded-host"] });
    if (req.url === "/api/auth") {
      res.writeHead(302, { location: "https://secure.its.yale.edu/cas/login?service=https://api.yalies.io/api/auth", "set-cookie": ["yalies.pipeline.sid=example; Path=/; HttpOnly; Secure; SameSite=Lax"] });
      return res.end();
    }
    res.writeHead(401, { "content-type": "text/plain" });
    res.write("Unauthorized");
    res.end();
  });
  const origin = await listen(upstream);
  const app = express();
  app.use(createAdminProxy(origin));
  app.get("/v3/ping", (_req, res) => res.send("pong"));
  app.get("/api-keys", (_req, res) => res.send("public route"));
  const server = http.createServer(app);
  const base = await listen(server);
  try {
    const login = await fetch(`${base}/api/auth`, { redirect: "manual" });
    assert.equal(login.status, 302);
    assert.match(login.headers.get("location"), /^https:\/\/secure\.its\.yale\.edu\/cas\/login/);
    assert.match(login.headers.get("set-cookie"), /yalies\.pipeline\.sid=example.*HttpOnly.*Secure.*SameSite=Lax/);
    const bytes = Buffer.from([0, 255, 13, 10, 128, 42]);
    const upload = await fetch(`${base}/api/database/students/1/photo?test=1`, {
      method: "POST", headers: { cookie: "yalies.pipeline.sid=example", "Content-Type": "application/octet-stream" }, body: bytes,
    });
    assert.equal(upload.status, 401);
    assert.equal(await upload.text(), "Unauthorized");
    assert.deepEqual(received[1].body, bytes);
    assert.equal(received[1].url, "/api/database/students/1/photo?test=1");
    assert.equal(received[1].cookie, "yalies.pipeline.sid=example");
    assert.equal(received[1].forwardedHost, new URL(base).host);
    assert.equal((await fetch(`${base}/admin/access/`)).status, 401);
    assert.equal(await (await fetch(`${base}/v3/ping`)).text(), "pong");
    assert.equal(await (await fetch(`${base}/api-keys`)).text(), "public route");
    assert.equal(received.length, 3);
  } finally {
    await Promise.all([server, upstream].map((target) => new Promise((resolve, reject) => target.close((error) => error ? reject(error) : resolve()))));
  }
});
