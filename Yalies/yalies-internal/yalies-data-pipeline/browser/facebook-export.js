// Run this entire file in the DevTools Console while signed in at:
// https://students.yale.edu/facebook/
// It downloads a versioned, normalized JSON export. It does not transmit data
// anywhere except Yale's own site.
(async () => {
  "use strict";

  const SCHEMA_VERSION = "yalies.facebook.v1";
  const MIN_STUDENTS = 5000;
  const MIN_COLLEGES = 14;
  const BASE_PATH = "/facebook";

  if (location.hostname !== "students.yale.edu") {
    throw new Error("Run this script on https://students.yale.edu/facebook/");
  }

  const decodeHtml = (value) => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  };

  const knownLocations = new Set([
    "romania", "brazil", "indonesia", "japan", "mongolia", "morocco", "ukraine",
    "china", "india", "south korea", "taiwan", "hong kong", "singapore", "malaysia",
    "vietnam", "thailand", "philippines", "canada", "mexico", "germany", "france",
    "italy", "spain", "portugal", "netherlands", "belgium", "austria", "switzerland",
    "sweden", "norway", "denmark", "finland", "ireland", "poland", "greece", "russia",
    "australia", "new zealand", "united states", "united kingdom", "nigeria", "ghana",
    "kenya", "south africa", "ethiopia", "egypt", "israel", "turkey", "pakistan",
    "bangladesh", "colombia", "argentina", "peru", "chile", "ecuador", "venezuela"
  ]);

  const isLocationLine = (line) =>
    /[\d,]/.test(line) || knownLocations.has(line.toLowerCase()) ||
    /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}$/.test(line);

  const parseDetails = (parts, student) => {
    const filtered = parts
      .map((part) => decodeHtml(part.replace(/<[^>]+>/g, "").trim()))
      .filter(Boolean);
    if (!filtered.length) return;

    let start = 0;
    if (/^\d+-\d+/.test(filtered[0])) {
      student.phone = filtered[0].replace(/\s*\/\s*$/, "");
      start++;
    }

    let remaining;
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/.test(filtered.at(-1))) {
      student.birthday = filtered.at(-1);
      remaining = filtered.slice(start, -1);
    } else {
      remaining = filtered.slice(start);
    }

    let major;
    let addressLines = [];
    for (let index = remaining.length - 1; index >= 0; index--) {
      if (!isLocationLine(remaining[index])) {
        major = remaining[index];
        addressLines = remaining.slice(0, index);
        break;
      }
    }
    if (!major) addressLines = remaining;
    if (major) student.major = major;
    if (addressLines.length) student.address = addressLines.join(" | ");
  };

  const parsePage = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectedOrganization = doc.querySelector("select[name=orgSelect] option:checked")?.value || "";
    const students = [...doc.querySelectorAll(".student_container")].map((card) => {
      const fullName = card.querySelector("h5.yalehead")?.textContent?.trim() || "";
      const comma = fullName.indexOf(",");
      const lastName = comma >= 0 ? fullName.slice(0, comma).trim() : fullName;
      const firstName = comma >= 0 ? fullName.slice(comma + 1).trim() : "";
      const info = [...card.querySelectorAll(".student_info")];
      const student = {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        year: card.querySelector(".student_year")?.textContent?.trim() || "",
        pronouns: card.querySelector(".student_info_pronoun")?.textContent?.trim() || "",
        college: info[0]?.textContent?.trim() || "",
        photo_id: card.querySelector(".student_img img")?.getAttribute("src")?.match(/id=(\d+)/)?.[1] || "",
        details_raw: ""
      };

      let detailsNode = info[1];
      if (!detailsNode && info.length === 1) {
        if (selectedOrganization && selectedOrganization !== "Yale College") student.college = selectedOrganization;
        detailsNode = info[0];
      }
      if (detailsNode) {
        const parts = detailsNode.innerHTML.split(/<br\s*\/?>/i).map((part) => part.trim()).filter(Boolean);
        student.details_raw = parts.join(" | ");
        parseDetails(parts, student);
      }
      return student;
    });
    return { students, selectedOrganization };
  };

  const sha256 = async (students) => {
    const canonical = students.map((student) => [
      student.full_name, student.year, student.college, student.photo_id
    ].join("\u001f")).join("\n");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const download = (data, filename) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  console.log("Yalies: requesting the complete Yale Face Book roster…");
  const url = `${location.origin}${BASE_PATH}/PhotoPageNew?currentIndex=-1&numberToGet=-1`;
  const response = await fetch(url, { credentials: "include", redirect: "follow" });
  const html = await response.text();
  if (!response.ok || response.url.includes("cas/login") || html.includes("cas/login")) {
    throw new Error("The Yale Face Book session is not authenticated. Log in and run the script again.");
  }

  const { students, selectedOrganization } = parsePage(html);
  const colleges = new Set(students.map((student) => student.college).filter(Boolean));
  const missingNames = students.filter((student) => !student.full_name).length;
  const missingPhotos = students.filter((student) => !student.photo_id).length;

  console.table({
    students: students.length,
    colleges: colleges.size,
    missingNames,
    missingPhotos,
    selectedOrganization
  });

  if (students.length < MIN_STUDENTS || colleges.size < MIN_COLLEGES || missingNames > 0) {
    throw new Error(
      `Refusing to download an incomplete roster (${students.length} students, ${colleges.size} colleges, ` +
      `${missingNames} missing names). Select “Yale” in the Face Book organization dropdown, reload, and retry.`
    );
  }

  const fingerprint = await sha256(students);
  const exportedAt = new Date().toISOString();
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    sourceUrl: response.url,
    selectedOrganization,
    fingerprint,
    students
  };
  const day = exportedAt.slice(0, 10);
  download(payload, `yalies-facebook-${day}.json`);
  console.log(`Yalies: downloaded ${students.length} students. Fingerprint: ${fingerprint}`);
})();
