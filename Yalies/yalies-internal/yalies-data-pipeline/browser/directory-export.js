// Run this entire file in the DevTools Console while signed in at:
// https://directory.yale.edu/
// Choose the JSON downloaded by facebook-export.js. Progress is checkpointed
// in IndexedDB, so rerunning with the same Facebook file can resume safely.
(async () => {
  "use strict";

  const FACEBOOK_SCHEMA = "yalies.facebook.v1";
  const DIRECTORY_SCHEMA = "yalies.directory.v1";
  const DELAY_MS = 300;
  const CHECKPOINT_EVERY = 25;
  const DB_NAME = "yalies-directory-export";
  const STORE_NAME = "runs";

  if (location.hostname !== "directory.yale.edu") {
    throw new Error("Run this script on https://directory.yale.edu/");
  }

  const chooseJsonFiles = () => new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.multiple = true;
    input.onchange = () => input.files?.length ? resolve([...input.files]) : reject(new Error("No file selected"));
    input.click();
  });

  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "facebookFingerprint" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const dbOperation = async (mode, operation) => {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  };

  const loadCheckpoint = (fingerprint) => dbOperation("readonly", (store) => store.get(fingerprint));
  const saveCheckpoint = (run) => dbOperation("readwrite", (store) => store.put(run));
  const deleteCheckpoint = (fingerprint) => dbOperation("readwrite", (store) => store.delete(fingerprint));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stripAccents = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content");
  if (!csrfToken) throw new Error("No CSRF token found. Confirm you are logged in, reload the page, and retry.");

  const refreshCsrf = async () => {
    const response = await fetch("/", { credentials: "include", redirect: "follow" });
    const html = await response.text();
    if (!response.ok || response.url.includes("cas/login") || html.includes("cas/login")) {
      throw new Error("Directory session expired. Reload, sign in, and rerun to resume.");
    }
    const next = new DOMParser().parseFromString(html, "text/html")
      .querySelector("meta[name='csrf-token']")?.getAttribute("content");
    if (!next) throw new Error("Could not refresh the Directory CSRF token");
    csrfToken = next;
  };

  const searchOnce = async (firstName, lastName) => {
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetch("/api", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify({
          peoplesearch: [{ netid: "", queryType: "term", query: [{ pattern: `${firstName},${lastName}` }] }]
        })
      });
      if (response.status !== 403 || attempt === 1) break;
      await refreshCsrf();
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Directory session expired (HTTP ${response.status}). Reload, sign in, and rerun to resume.`);
    }
    if (response.status === 422) return [];
    if (!response.ok) throw new Error(`Directory API returned HTTP ${response.status}`);
    const data = await response.json();
    const records = data?.Records?.Record;
    if (!records) return [];
    return Array.isArray(records) ? records : [records];
  };

  const search = async (firstName, lastName) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await searchOnce(firstName, lastName);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/session expired/i.test(message) || attempt === 2) throw error;
        const wait = 1000 * (2 ** attempt);
        console.warn(`Yalies Directory: transient error; retrying in ${wait}ms (${message})`);
        await sleep(wait);
      }
    }
    return [];
  };

  const recordKey = (record) => String(record.UPI || record.NetId || record.EmailAddress || record.DisplayName || JSON.stringify(record));

  const queryStudent = async (student) => {
    const first = stripAccents(student.first_name.replace(/\s*\(.*?\)\s*/g, "").trim());
    const last = stripAccents(student.last_name.trim());
    const firstParts = first.split(/\s+/).filter(Boolean);
    const lastParts = last.split(/\s+/).filter(Boolean);
    const candidates = [[first, last]];

    if (lastParts.length > 1) candidates.push([first, lastParts[0]], [first, lastParts.at(-1)]);
    if (firstParts.length > 1) candidates.push([firstParts[0], last], [firstParts[1], last]);
    candidates.push(["", last]);
    if (lastParts.length > 1) candidates.push([firstParts[0] || "", lastParts[0]]);

    const uniqueQueries = [];
    const seenQueries = new Set();
    const recordsByKey = new Map();

    for (const [queryFirst, queryLast] of candidates) {
      const pattern = `${queryFirst},${queryLast}`;
      if (!queryLast || seenQueries.has(pattern)) continue;
      seenQueries.add(pattern);
      uniqueQueries.push(pattern);
      const records = await search(queryFirst, queryLast);
      records.forEach((record) => recordsByKey.set(recordKey(record), record));
      // An exact query with results is normally sufficient. Multiple records are
      // retained so the terminal importer can score college/year/name safely.
      if (records.length > 0) break;
      await sleep(DELAY_MS);
    }
    return { queries: uniqueQueries, records: [...recordsByKey.values()] };
  };

  const download = (data, filename) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  console.log("Yalies: choose the Facebook JSON and, when repairing, the existing Directory JSON in this one dialog…");
  const selectedFiles = await chooseJsonFiles();
  const selectedJson = await Promise.all(selectedFiles.map(async (file) => ({
    file,
    data: JSON.parse(await file.text())
  })));
  const facebookSelection = selectedJson.find(({ data }) => data.schemaVersion === FACEBOOK_SCHEMA);
  const directorySelection = selectedJson.find(({ data }) => data.schemaVersion === DIRECTORY_SCHEMA);
  if (!facebookSelection || !Array.isArray(facebookSelection.data.students) || !facebookSelection.data.fingerprint) {
    throw new Error("Select exactly one valid yalies.facebook.v1 JSON export");
  }
  const facebook = facebookSelection.data;

  let run = await loadCheckpoint(facebook.fingerprint);
  if (run && !confirm(`Resume the saved Directory export at ${run.entries.length}/${facebook.students.length}?`)) {
    await deleteCheckpoint(facebook.fingerprint);
    run = undefined;
  }
  if (!run && directorySelection) {
    const existing = directorySelection.data;
    if (existing.schemaVersion !== DIRECTORY_SCHEMA || existing.facebookFingerprint !== facebook.fingerprint) {
      throw new Error(`${directorySelection.file.name} does not belong to the selected Facebook export`);
    }
    run = existing;
  }
  if (!run) {
    run = {
      schemaVersion: DIRECTORY_SCHEMA,
      exportedAt: "",
      sourceUrl: location.href,
      facebookFingerprint: facebook.fingerprint,
      facebookExportedAt: facebook.exportedAt,
      entryCount: 0,
      entries: []
    };
  }

  const alreadyComplete = run.entries.filter((entry) => entry && !entry.error).length;
  console.log(`Yalies: ${alreadyComplete}/${facebook.students.length} already complete. Keep this tab open.`);
  let processedThisRun = 0;
  for (let index = 0; index < facebook.students.length; index++) {
    const student = facebook.students[index];
    if (run.entries[index] && !run.entries[index].error) continue;
    let entry;
    try {
      const result = await queryStudent(student);
      entry = { index, full_name: student.full_name, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/session expired/i.test(message)) {
        await saveCheckpoint(run);
        throw error;
      }
      entry = { index, full_name: student.full_name, queries: [], records: [], error: message };
    }
    run.entries[index] = entry;
    run.entryCount = run.entries.filter(Boolean).length;
    processedThisRun++;

    if (processedThisRun % CHECKPOINT_EVERY === 0) {
      await saveCheckpoint(run);
      await refreshCsrf();
    }
    if (processedThisRun % 10 === 0) {
      const found = run.entries.filter((item) => item?.records?.length > 0).length;
      console.log(`Yalies Directory: ${index + 1}/${facebook.students.length}; records found for ${found}`);
    }
    await sleep(DELAY_MS);
  }

  run.exportedAt = new Date().toISOString();
  run.entryCount = run.entries.length;
  await saveCheckpoint(run);
	const remainingErrors = run.entries.filter((entry) => entry?.error).length;
  const day = run.exportedAt.slice(0, 10);
  download(run, `yalies-directory-${day}.json`);
  console.log(`Yalies: downloaded ${run.entryCount} Directory entries (${remainingErrors} errors).`);
  if (remainingErrors > 0) {
    console.warn("Known errors remain. Rerun this script and choose the downloaded Directory JSON to repair them.");
  } else if (confirm("The complete Directory JSON downloaded. Remove the browser checkpoint now?")) {
    await deleteCheckpoint(facebook.fingerprint);
    console.log("Yalies: browser checkpoint removed.");
  }
})();
