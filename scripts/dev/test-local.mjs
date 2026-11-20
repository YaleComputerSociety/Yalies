import assert from "node:assert/strict";

// Smoke test a running dev:local stack. No production connection or fixture writes.
const api = "http://localhost:1337";
async function request(path, options = {}) {
  return fetch(api + path, { signal: AbortSignal.timeout(15000), ...options });
}
const health = await request("/v3/ping");
assert.equal(health.status, 200);
assert.equal((await health.text()).trim(), "pong");
const unauthenticated = await request("/v3/people", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
});
assert.equal(unauthenticated.status, 401, "People require a login");
const login = await request("/v3/login", { redirect: "manual" });
assert.equal(login.status, 302, "Development login should redirect");
assert.equal(login.headers.get("location"), "http://localhost:3000/");
const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie, "Login should persist a session cookie");
const filters = await request("/v3/filters");
assert.equal(filters.status, 200);
const filterValues = await filters.json();
const college = filterValues.college[0];
assert.ok(college, "Database-backed filters should be populated");
const profile = await request("/v3/profile/me/full", { headers: { cookie } });
assert.equal(profile.status, 200);
const me = (await profile.json()).person;
assert.ok(me?.netid, "Logged-in identity should exist in the directory");
const photo = await request("/v3/profile/me/photo", { method: "POST", headers: { cookie } });
assert.equal(photo.status, 503, "Local photo uploads must not use cloud storage");
async function people(body) {
  const response = await request("/v3/people", {
    method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const all = await people({});
assert.ok(all.length > 0, "Browse should return people");
const search = await people({ query: `${me.first_name} ${me.last_name}`, searchMode: "full_name" });
assert.ok(search.some(person => person.netid === me.netid), "Name search should find the logged-in person");
const filtered = await people({ filters: { college } });
assert.ok(filtered.length > 0 && filtered.every(person => person.college === college));
const checks = [];
if (filterValues.address_state?.length) {
  const state = filterValues.address_state[0];
  const matches = await people({ filters: { address_state: state } });
  assert.ok(matches.length > 0 && matches.every(person => person.address_state === state));
  checks.push("state location filter");
}
const birthday = all.find(person => person.birth_month && person.birth_day);
if (birthday) {
  const month = await people({ filters: { birth_date: String(birthday.birth_month) } });
  assert.ok(month.length > 0 && month.every(person => person.birth_month === birthday.birth_month));
  const exact = await people({ filters: { birth_date: `${birthday.birth_month}-${birthday.birth_day}` } });
  assert.ok(exact.length > 0 && exact.every(person => person.birth_month === birthday.birth_month && person.birth_day === birthday.birth_day));
  checks.push("birthday month/date filters");
}
const page = await fetch("http://localhost:3000", { signal: AbortSignal.timeout(60000) });
assert.equal(page.status, 200);
assert.match(await page.text(), /Yalies/);
console.log(`PASS: health, login/session, ${all.length} people, name search, college filter, ${checks.join(", ")}${checks.length ? ", " : ""}profile, cloud uploads disabled, frontend HTTP 200.`);
