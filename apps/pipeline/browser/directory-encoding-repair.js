// One-off September 2026 repair collector. Run in the DevTools Console while
// signed in at https://directory.yale.edu/. Select the original corrupt Face
// Book JSON and the newly exported corrected Face Book JSON together.
(async () => {
  "use strict";

  const FACEBOOK_SCHEMA = "yalies.facebook.v1";
  const REPAIR_SCHEMA = "yalies.directory-encoding-repair.v1";
  const EXPECTED_ROWS = 49;
  const DELAY_MS = 300;

  if (location.hostname !== "directory.yale.edu") {
    throw new Error("Run this script on https://directory.yale.edu/");
  }

  const chooseFiles = () => new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.multiple = true;
    input.onchange = () => input.files?.length ? resolve([...input.files]) : reject(new Error("No files selected"));
    input.click();
  });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stripAccents = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const isCorrupt = (student) =>
    [student.full_name, student.first_name, student.last_name].some((value) => value.includes("�"));
  const recordKey = (record) =>
    String(record.UPI || record.NetId || record.EmailAddress || record.DisplayName || JSON.stringify(record));

  let csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content");
  if (!csrfToken) throw new Error("No CSRF token found. Reload the Directory page and try again.");

  const refreshCsrf = async () => {
    const response = await fetch("/", { credentials: "include", redirect: "follow" });
    const html = await response.text();
    if (!response.ok || response.url.includes("cas/login") || html.includes("cas/login")) {
      throw new Error("Directory session expired. Sign in again and rerun this script.");
    }
    csrfToken = new DOMParser().parseFromString(html, "text/html")
      .querySelector("meta[name='csrf-token']")?.getAttribute("content");
    if (!csrfToken) throw new Error("Could not refresh the Directory CSRF token");
  };

  const searchOnce = async (firstName, lastName) => {
    const response = await fetch("/api", {
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
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Directory session expired (HTTP ${response.status})`);
    }
    if (response.status === 422) return [];
    if (!response.ok) throw new Error(`Directory API returned HTTP ${response.status}`);
    const data = await response.json();
    const records = data?.Records?.Record;
    return records ? (Array.isArray(records) ? records : [records]) : [];
  };

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

    const queries = [];
    const seenQueries = new Set();
    const records = new Map();
    for (const [queryFirst, queryLast] of candidates) {
      const pattern = `${queryFirst},${queryLast}`;
      if (!queryLast || seenQueries.has(pattern)) continue;
      seenQueries.add(pattern);
      queries.push(pattern);
      const found = await searchOnce(queryFirst, queryLast);
      found.forEach((record) => records.set(recordKey(record), record));
      if (found.length > 0) break;
      await sleep(DELAY_MS);
    }
    return { queries, records: [...records.values()] };
  };

  const selected = await Promise.all((await chooseFiles()).map(async (file) => ({
    file,
    data: JSON.parse(await file.text())
  })));
  const facebookFiles = selected.filter(({ data }) => data.schemaVersion === FACEBOOK_SCHEMA);
  if (facebookFiles.length !== 2) throw new Error("Select exactly two Face Book JSON exports");
  const corruptSelection = facebookFiles.find(({ data }) => data.students?.filter(isCorrupt).length === EXPECTED_ROWS);
  const correctedSelection = facebookFiles.find(({ data }) => data.students?.filter(isCorrupt).length === 0);
  if (!corruptSelection || !correctedSelection) {
    throw new Error(`Expected one export with ${EXPECTED_ROWS} corrupt names and one with zero`);
  }

  if (corruptSelection.data.students.length !== correctedSelection.data.students.length) {
    throw new Error("The two Face Book exports have different roster sizes");
  }
  const corruptStudents = corruptSelection.data.students
    .map((student, rosterIndex) => ({ student, rosterIndex }))
    .filter(({ student }) => isCorrupt(student));
  const entries = [];
  console.log(`Yalies: looking up only the ${EXPECTED_ROWS} affected students…`);
  for (let index = 0; index < corruptStudents.length; index++) {
    const { student: corrupt, rosterIndex } = corruptStudents[index];
    const corrected = correctedSelection.data.students[rosterIndex];
    if (!corrected || isCorrupt(corrected) || corrected.year !== corrupt.year || corrected.college !== corrupt.college ||
        (corrupt.photo_id !== "0" && corrected.photo_id !== corrupt.photo_id)) {
      throw new Error(`Corrected export does not align at roster index ${rosterIndex}`);
    }
    let entry;
    try {
      const result = await queryStudent(corrected);
      entry = {
        photo_id: corrupt.photo_id,
        roster_index: rosterIndex,
        corrupt_full_name: corrupt.full_name,
        corrected_full_name: corrected.full_name,
        ...result
      };
    } catch (error) {
      entry = {
        photo_id: corrupt.photo_id,
        roster_index: rosterIndex,
        corrupt_full_name: corrupt.full_name,
        corrected_full_name: corrected.full_name,
        queries: [],
        records: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
    entries.push(entry);
    console.log(`${index + 1}/${EXPECTED_ROWS}: ${corrupt.full_name} -> ${corrected.full_name} (${entry.records.length} records)`);
    if ((index + 1) % 25 === 0) await refreshCsrf();
    await sleep(DELAY_MS);
  }

  const payload = {
    schemaVersion: REPAIR_SCHEMA,
    exportedAt: new Date().toISOString(),
    sourceUrl: location.href,
    corruptFacebookFingerprint: corruptSelection.data.fingerprint,
    correctedFacebookFingerprint: correctedSelection.data.fingerprint,
    entryCount: entries.length,
    entries
  };
  const day = payload.exportedAt.slice(0, 10);
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `yalies-directory-encoding-repair-${day}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const errors = entries.filter((entry) => entry.error).length;
  console.log(`Yalies: repair export downloaded (${entries.length} entries, ${errors} errors).`);
  if (errors) console.warn("Rerun after signing in again; the database repair refuses exports with lookup errors.");
})();
