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

  // Exact copy of src/allowedMajors.ts; the parity test prevents drift.
  const allowedMajors = new Set([
    "African American Studies",
    "American Studies",
    "American Studies (Int.)",
    "Anthropology",
    "Applied Mathematics",
    "Applied Physics",
    "Archaeological Studies",
    "Architecture",
    "Art",
    "Astronomy",
    "Astrophysics",
    "Biomedical Engineering",
    "Chemical Engineering",
    "Chemistry",
    "Chemistry (Int.)",
    "Classical Civilization",
    "Classics",
    "Cognitive Science",
    "Comparative Literature",
    "Computer Science",
    "Computer Science & Econ",
    "Computer Science & Mathematics",
    "Computer Science & Psychology",
    "Computing and the Arts",
    "Computing & Linguistics",
    "Earth and Planetary Sciences",
    "East Asian Languages & Lits",
    "East Asian Studies",
    "Ecology & Evolutionary Biology",
    "Economics",
    "Economics & Mathematics",
    "Elec Engineering & Comp Sci",
    "Electrical Engineering",
    "Engineering Science-Chemical",
    "Engineering Science-Electrical",
    "Engineering Science-Mechanical",
    "Engineering Sci-Environmental",
    "English",
    "Environmental Engineering",
    "Environmental Studies",
    "Ethics,Politics & Economics",
    "Ethnicity, Race & Migration",
    "Film and Media Studies",
    "Film and Media Studies (Int.)",
    "French",
    "German Studies",
    "Global Affairs",
    "History",
    "History of Art",
    "History Science, Medicine & PH",
    "Humanities",
    "Italian Studies",
    "Latin American Studies",
    "Linguistics",
    "Mathematics",
    "Mathematics (Int.)",
    "Mathematics & Philosophy",
    "Mathematics & Physics",
    "Mechanical Engineering",
    "Molecular Biophysics & Biochem",
    "Molecular,Cellular,DevBio(Int)",
    "Molecular,Cellular,Dev Biology",
    "Music",
    "Music (Int.)",
    "Near Eastern Languages & Civs",
    "Neuroscience",
    "Philosophy",
    "Physics",
    "Physics & Geosciences",
    "Physics (Int.)",
    "Physics & Philosophy",
    "Political Science",
    "Political Science (Int.)",
    "Psychology",
    "Religious Studies",
    "Russ, E Eur & Eurasian Studies",
    "Sociology",
    "Sociology (Int.)",
    "Spanish",
    "Spanish (Int.)",
    "Statistics and Data Science",
    "TheaterDancePerformanceStudies",
    "Theater & Performance Studies",
    "Undeclared",
    "Urban Studies",
    "Women'sGender&SexualityStudies",
  ]);

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

  const usStates = new Set([
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
    "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
    "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok",
    "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
    "wi", "wy", "dc", "pr", "gu", "vi", "as", "mp",
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois",
    "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland",
    "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana",
    "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york",
    "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
    "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah",
    "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
    "district of columbia", "puerto rico", "guam", "us virgin islands",
    "american samoa", "northern mariana islands"
  ]);

  const isLocationLine = (line) =>
    /\d/.test(line) || usStates.has(line.trim().toLowerCase()) ||
    knownLocations.has(line.toLowerCase()) ||
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
    // Preserve the existing address boundary even when the major is rejected.
    // The original candidate remains available in details_raw for review.
    const allowedMajor = major === undefined ? undefined : decodeHtml(major.trim()).trim();
    if (allowedMajors.has(allowedMajor)) student.major = allowedMajor;
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

  // The legacy Face Book endpoint can return Windows-1252 bytes while its HTML
  // advertises UTF-8. response.text() always decodes as UTF-8 and silently
  // turns accented letters into U+FFFD (�), which then also breaks Directory
  // matching. Prefer strict UTF-8 and use Windows-1252 only for invalid UTF-8.
  const decodeResponse = async (response) => {
    const bytes = await response.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  };

  console.log("Yalies: requesting the complete Yale Face Book roster…");
  const url = `${location.origin}${BASE_PATH}/PhotoPageNew?currentIndex=-1&numberToGet=-1`;
  const response = await fetch(url, { credentials: "include", redirect: "follow" });
  const html = await decodeResponse(response);
  if (!response.ok || response.url.includes("cas/login") || html.includes("cas/login")) {
    throw new Error("The Yale Face Book session is not authenticated. Log in and run the script again.");
  }

  const { students, selectedOrganization } = parsePage(html);
  const colleges = new Set(students.map((student) => student.college).filter(Boolean));
  const missingNames = students.filter((student) => !student.full_name).length;
  const missingPhotos = students.filter((student) => !student.photo_id).length;
  const invalidMajors = students.filter((student) =>
    student.major && !allowedMajors.has(student.major)
  );
  const replacementCharacters = students.filter((student) =>
    Object.values(student).some((value) => typeof value === "string" && value.includes("�"))
  );

  console.table({
    students: students.length,
    colleges: colleges.size,
      missingNames,
      missingPhotos,
      invalidMajors: invalidMajors.length,
      replacementCharacters: replacementCharacters.length,
      selectedOrganization
    });

  if (students.length < MIN_STUDENTS || colleges.size < MIN_COLLEGES ||
      missingNames > 0 || invalidMajors.length > 0 || replacementCharacters.length > 0) {
    throw new Error(
      `Refusing to download an incomplete roster (${students.length} students, ${colleges.size} colleges, ` +
      `${missingNames} missing names, ${invalidMajors.length} unapproved majors, ` +
      `${replacementCharacters.length} records with Unicode replacement characters). ` +
      `Select “Yale” in the Face Book organization dropdown, reload, and retry.`
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
