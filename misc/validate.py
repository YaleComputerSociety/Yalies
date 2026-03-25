#!/usr/bin/env python3
"""Validation suite for scraped data. Run after each scraper step to catch issues."""

import json
import re
import sys
import os
import html as html_lib
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

OUTPUT_DIR = "output"
FACEBOOK_FILE = os.path.join(OUTPUT_DIR, "students.json")
ENRICHED_FILE = os.path.join(OUTPUT_DIR, "students_enriched.json")

# --- Thresholds (adjust if Yale enrollment changes significantly) ---
MIN_TOTAL_STUDENTS = 6000
MAX_TOTAL_STUDENTS = 8000
MIN_ENRICHMENT_RATE = 0.90
MIN_COLLEGES = 14  # Yale has 14 residential colleges
EXPECTED_YEARS = {2026, 2027, 2028, 2029}  # Update each academic year
MIN_STUDENTS_PER_YEAR = 500
MIN_STUDENTS_PER_COLLEGE = 200

VALID_COLLEGES = {
    "Benjamin Franklin College", "Berkeley College", "Branford College",
    "Davenport College", "Ezra Stiles College", "Grace Hopper College",
    "Jonathan Edwards College", "Morse College", "Pauli Murray College",
    "Pierson College", "Saybrook College", "Silliman College",
    "Timothy Dwight College", "Trumbull College",
}

MONTH_NAMES = {"Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}


class ValidationResult:
    def __init__(self):
        self.passes = []
        self.warnings = []
        self.failures = []

    def ok(self, msg):
        self.passes.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def fail(self, msg):
        self.failures.append(msg)

    def report(self, title):
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")
        for msg in self.passes:
            print(f"  PASS  {msg}")
        for msg in self.warnings:
            print(f"  WARN  {msg}")
        for msg in self.failures:
            print(f"  FAIL  {msg}")
        print(f"\n  Total: {len(self.passes)} passed, {len(self.warnings)} warnings, {len(self.failures)} failures")
        return len(self.failures) == 0


def load_json(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


# --- Facebook Scraper Validation ---

def validate_facebook(data, result):
    """Validate output of scraper.py (students.json)."""

    # 1. Total count
    n = len(data)
    if MIN_TOTAL_STUDENTS <= n <= MAX_TOTAL_STUDENTS:
        result.ok(f"Student count: {n} (expected {MIN_TOTAL_STUDENTS}-{MAX_TOTAL_STUDENTS})")
    else:
        result.fail(f"Student count: {n} (expected {MIN_TOTAL_STUDENTS}-{MAX_TOTAL_STUDENTS})")

    # 2. Required fields present
    for field, label in [("full_name", "Name"), ("year", "Year"),
                         ("college", "College"), ("photo_id", "Photo ID")]:
        missing = sum(1 for s in data if not s.get(field))
        pct = missing / n * 100
        if pct == 0:
            result.ok(f"{label}: 100% populated")
        elif pct < 2:
            result.warn(f"{label}: {missing}/{n} missing ({pct:.1f}%)")
        else:
            result.fail(f"{label}: {missing}/{n} missing ({pct:.1f}%)")

    # 3. Optional fields coverage
    for field, label, min_pct in [("major", "Major", 80), ("birthday", "Birthday", 80),
                                   ("address", "Address", 70), ("phone", "Phone", 20)]:
        present = sum(1 for s in data if s.get(field))
        pct = present / n * 100
        if pct >= min_pct:
            result.ok(f"{label}: {present}/{n} ({pct:.1f}%) — above {min_pct}% threshold")
        else:
            result.warn(f"{label}: {present}/{n} ({pct:.1f}%) — below {min_pct}% threshold")

    # 4. College distribution
    colleges = {}
    for s in data:
        c = s.get("college", "MISSING")
        colleges[c] = colleges.get(c, 0) + 1

    known = {c for c in colleges if c in VALID_COLLEGES}
    unknown = {c for c in colleges if c not in VALID_COLLEGES and c != "MISSING"}

    if len(known) >= MIN_COLLEGES:
        result.ok(f"Colleges: {len(known)}/{MIN_COLLEGES} known residential colleges found")
    else:
        missing_colleges = VALID_COLLEGES - known
        result.fail(f"Colleges: only {len(known)}/{MIN_COLLEGES} — missing: {missing_colleges}")

    if unknown:
        result.warn(f"Unknown colleges found: {unknown}")

    for college, count in sorted(colleges.items()):
        if college in VALID_COLLEGES and count < MIN_STUDENTS_PER_COLLEGE:
            result.warn(f"  {college}: only {count} students (expected >={MIN_STUDENTS_PER_COLLEGE})")

    # 5. Year distribution
    years = {}
    for s in data:
        y = s.get("year", "")
        if y:
            match = re.match(r"'(\d{2})", y)
            if match:
                years[2000 + int(match.group(1))] = years.get(2000 + int(match.group(1)), 0) + 1

    for y in EXPECTED_YEARS:
        count = years.get(y, 0)
        if count >= MIN_STUDENTS_PER_YEAR:
            result.ok(f"Year {y}: {count} students")
        elif count > 0:
            result.warn(f"Year {y}: only {count} students (expected >={MIN_STUDENTS_PER_YEAR})")
        else:
            result.fail(f"Year {y}: 0 students found")

    unexpected_years = set(years.keys()) - EXPECTED_YEARS
    if unexpected_years:
        for y in sorted(unexpected_years):
            result.warn(f"Unexpected year {y}: {years[y]} students")

    # 6. Duplicate detection
    names = [s.get("full_name", "") for s in data]
    name_counts = {}
    for name in names:
        name_counts[name] = name_counts.get(name, 0) + 1
    dupes = {name: count for name, count in name_counts.items() if count > 1}
    if len(dupes) <= 20:
        result.ok(f"Duplicates: {len(dupes)} duplicate names (likely legitimate)")
    else:
        result.warn(f"Duplicates: {len(dupes)} duplicate names — top: {list(dupes.items())[:5]}")

    # 7. Data quality checks
    html_entities = sum(1 for s in data if "&amp;" in s.get("major", "") or "&lt;" in s.get("major", ""))
    if html_entities == 0:
        result.ok("HTML entities: none found in major field")
    else:
        result.fail(f"HTML entities: {html_entities} students have unescaped HTML in major")

    empty_first = sum(1 for s in data if not s.get("first_name"))
    if empty_first == 0:
        result.ok("First names: all populated")
    else:
        result.warn(f"First names: {empty_first} students have empty first_name")

    # 8. Photo IDs
    no_photo = sum(1 for s in data if s.get("photo_id") == "0")
    result.ok(f"Photos: {n - no_photo}/{n} have photos ({no_photo} with id=0)")


# --- Directory Enrichment Validation ---

def validate_enriched(data, result):
    """Validate output of directory_scraper.py (students_enriched.json)."""
    n = len(data)

    # 1. Enrichment rate
    with_netid = sum(1 for s in data if s.get("netid"))
    rate = with_netid / n
    if rate >= MIN_ENRICHMENT_RATE:
        result.ok(f"Enrichment rate: {with_netid}/{n} ({rate*100:.1f}%) — above {MIN_ENRICHMENT_RATE*100}% threshold")
    else:
        result.fail(f"Enrichment rate: {with_netid}/{n} ({rate*100:.1f}%) — below {MIN_ENRICHMENT_RATE*100}% threshold")

    # 2. Key enriched fields
    for field, label in [("netid", "NetID"), ("email", "Email"), ("upi", "UPI"),
                         ("school_code", "School Code"), ("college_code", "College Code"),
                         ("year_directory", "Grad Year"), ("mailbox", "Mailbox")]:
        present = sum(1 for s in data if s.get(field))
        pct = present / n * 100
        if pct >= MIN_ENRICHMENT_RATE * 100:
            result.ok(f"{label}: {present}/{n} ({pct:.1f}%)")
        elif pct >= 80:
            result.warn(f"{label}: {present}/{n} ({pct:.1f}%)")
        else:
            result.fail(f"{label}: {present}/{n} ({pct:.1f}%)")

    # 3. Email format validation
    bad_emails = []
    for s in data:
        email = s.get("email", "")
        if email and not re.match(r"^[^@]+@(.*\.)?yale\.edu$", email):
            bad_emails.append(email)
    if not bad_emails:
        result.ok("Email format: all emails match *@*.yale.edu")
    else:
        result.fail(f"Email format: {len(bad_emails)} invalid emails — e.g. {bad_emails[:3]}")

    # 4. NetID format validation
    bad_netids = []
    for s in data:
        netid = s.get("netid", "")
        if netid and not re.match(r"^[a-z]{2,4}\d{1,4}$", netid):
            bad_netids.append(netid)
    if not bad_netids:
        result.ok("NetID format: all netids match expected pattern")
    else:
        result.warn(f"NetID format: {len(bad_netids)} unusual netids — e.g. {bad_netids[:5]}")

    # 5. UPI format validation
    bad_upis = sum(1 for s in data if s.get("upi") and not isinstance(s["upi"], int))
    if bad_upis == 0:
        result.ok("UPI format: all UPIs are integers")
    else:
        result.fail(f"UPI format: {bad_upis} non-integer UPIs")

    # 6. Cross-field consistency
    mismatched_college = 0
    for s in data:
        fb_college = s.get("college", "").lower()
        dir_college = s.get("college_directory", "").lower()
        if fb_college and dir_college and fb_college != dir_college:
            mismatched_college += 1
    if mismatched_college == 0:
        result.ok("College consistency: facebook and directory colleges match")
    elif mismatched_college < 20:
        result.warn(f"College consistency: {mismatched_college} mismatches between facebook and directory")
    else:
        result.fail(f"College consistency: {mismatched_college} mismatches")

    # 7. Students not found
    not_enriched = [s for s in data if not s.get("netid")]
    if len(not_enriched) < n * 0.10:
        result.ok(f"Not found: {len(not_enriched)} students ({len(not_enriched)/n*100:.1f}%)")
    else:
        result.fail(f"Not found: {len(not_enriched)} students ({len(not_enriched)/n*100:.1f}%)")

    # Show some examples of not-found students
    if not_enriched:
        examples = [s.get("full_name", "?") for s in not_enriched[:5]]
        result.warn(f"Not-found examples: {examples}")


# --- Database Validation ---

def validate_database(database_url):
    """Validate the database state after loading."""
    try:
        import sqlalchemy
        from sqlalchemy import text as sql_text
    except ImportError:
        print("  SKIP  Database validation (sqlalchemy not installed)")
        return True

    result = ValidationResult()
    engine = sqlalchemy.create_engine(database_url)

    with engine.connect() as conn:
        # 1. Total counts
        total = conn.execute(sql_text("SELECT COUNT(*) FROM person")).scalar()
        yc = conn.execute(sql_text(
            "SELECT COUNT(*) FROM person WHERE school = 'Yale College'"
        )).scalar()
        result.ok(f"Total rows: {total}, Yale College: {yc}")

        # 2. Yale College count in range
        if MIN_TOTAL_STUDENTS <= yc <= MAX_TOTAL_STUDENTS:
            result.ok(f"YC count {yc} in expected range")
        else:
            result.fail(f"YC count {yc} outside expected range {MIN_TOTAL_STUDENTS}-{MAX_TOTAL_STUDENTS}")

        # 3. Null checks on required fields
        for col in ["first_name", "last_name"]:
            nulls = conn.execute(sql_text(
                f"SELECT COUNT(*) FROM person WHERE school = 'Yale College' AND {col} IS NULL"
            )).scalar()
            if nulls == 0:
                result.ok(f"DB {col}: no nulls")
            else:
                result.fail(f"DB {col}: {nulls} null values")

        # 4. NetID coverage
        with_netid = conn.execute(sql_text(
            "SELECT COUNT(*) FROM person WHERE school = 'Yale College' AND netid IS NOT NULL"
        )).scalar()
        rate = with_netid / yc if yc > 0 else 0
        if rate >= MIN_ENRICHMENT_RATE:
            result.ok(f"DB netid coverage: {with_netid}/{yc} ({rate*100:.1f}%)")
        else:
            result.fail(f"DB netid coverage: {with_netid}/{yc} ({rate*100:.1f}%)")

        # 5. Duplicate netids
        dup_netids = conn.execute(sql_text(
            "SELECT netid, COUNT(*) FROM person WHERE netid IS NOT NULL "
            "GROUP BY netid HAVING COUNT(*) > 1"
        )).fetchall()
        if not dup_netids:
            result.ok("DB netid uniqueness: no duplicates")
        else:
            result.fail(f"DB duplicate netids: {len(dup_netids)} — e.g. {dup_netids[:3]}")

        # 6. Duplicate IDs
        dup_ids = conn.execute(sql_text(
            "SELECT id, COUNT(*) FROM person GROUP BY id HAVING COUNT(*) > 1"
        )).fetchall()
        if not dup_ids:
            result.ok("DB id uniqueness: no duplicates")
        else:
            result.fail(f"DB duplicate ids: {len(dup_ids)}")

        # 7. College distribution
        colleges = conn.execute(sql_text(
            "SELECT college, COUNT(*) FROM person WHERE school = 'Yale College' "
            "GROUP BY college ORDER BY count DESC"
        )).fetchall()
        if len(colleges) >= MIN_COLLEGES:
            result.ok(f"DB colleges: {len(colleges)} distinct colleges")
        else:
            result.fail(f"DB colleges: only {len(colleges)}")

        # 8. Year distribution
        years = conn.execute(sql_text(
            "SELECT year, COUNT(*) FROM person WHERE school = 'Yale College' "
            "AND year IS NOT NULL GROUP BY year ORDER BY year"
        )).fetchall()
        for y, count in years:
            if y in EXPECTED_YEARS:
                result.ok(f"DB year {y}: {count} students")

        # 9. No orphaned data
        no_school = conn.execute(sql_text(
            "SELECT COUNT(*) FROM person WHERE school IS NULL AND school_code IS NULL "
            "AND organization IS NULL"
        )).scalar()
        if no_school == 0:
            result.ok("DB orphans: no records without school or organization")
        else:
            result.warn(f"DB orphans: {no_school} records with no school/org")

    return result.report("Database Validation")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Validate scraped data")
    parser.add_argument("--step", choices=["facebook", "enriched", "database", "all"],
                        default="all", help="Which step to validate")
    parser.add_argument("--database-url", type=str,
                        default=DATABASE_URL,
                        help="PostgreSQL connection URL for database validation")
    args = parser.parse_args()

    all_passed = True

    if args.step in ("facebook", "all"):
        data = load_json(FACEBOOK_FILE)
        if data:
            result = ValidationResult()
            validate_facebook(data, result)
            if not result.report("Facebook Scraper Validation (students.json)"):
                all_passed = False
        else:
            print(f"\n  SKIP  {FACEBOOK_FILE} not found")

    if args.step in ("enriched", "all"):
        data = load_json(ENRICHED_FILE)
        if data:
            result = ValidationResult()
            validate_facebook(data, result)  # Run base checks too
            if not result.report("Enriched Data — Base Checks (students_enriched.json)"):
                all_passed = False

            result2 = ValidationResult()
            validate_enriched(data, result2)
            if not result2.report("Enriched Data — Directory Checks (students_enriched.json)"):
                all_passed = False
        else:
            print(f"\n  SKIP  {ENRICHED_FILE} not found")

    if args.step in ("database", "all"):
        if not validate_database(args.database_url):
            all_passed = False

    print(f"\n{'='*60}")
    if all_passed:
        print("  ALL VALIDATIONS PASSED")
    else:
        print("  SOME VALIDATIONS FAILED — review above")
    print(f"{'='*60}")

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
