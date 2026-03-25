#!/usr/bin/env python3
"""Yale Directory API Scraper - enriches facebook data with netid, email, UPI, etc."""

import requests
from bs4 import BeautifulSoup
import os
import time
import sys
import sqlalchemy
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DIRECTORY_URL = "https://directory.yale.edu"
API_URL = f"{DIRECTORY_URL}/api"
DATABASE_URL = os.environ["DATABASE_URL"]

MAX_RETRIES = 3
CSRF_REFRESH_INTERVAL = 500  # Re-fetch CSRF token every N requests to avoid expiry


def get_session_and_csrf(session):
    """Fetch the directory page to get CSRF token and session cookie."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(DIRECTORY_URL, timeout=30)
            resp.raise_for_status()

            if "cas/login" in resp.url:
                print("ERROR: Not authenticated. You need to provide session cookies.")
                print("Log into directory.yale.edu in your browser, then provide cookies.")
                sys.exit(1)

            soup = BeautifulSoup(resp.text, "html.parser")
            csrf_meta = soup.select_one('meta[name="csrf-token"]')
            if csrf_meta:
                return csrf_meta["content"]

            print("ERROR: Could not find CSRF token in page")
            sys.exit(1)
        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** attempt
            print(f"  Retry fetching CSRF ({attempt+1}/{MAX_RETRIES}) after {wait}s: {e}")
            time.sleep(wait)


def search_person(session, csrf_token, first_name, last_name):
    """Search for a person by name via the directory API with retries."""
    pattern = f"{first_name},{last_name}"

    payload = {
        "peoplesearch": [{
            "netid": "",
            "queryType": "term",
            "query": [{"pattern": pattern}]
        }]
    }

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-CSRF-Token": csrf_token,
        "X-Requested-With": "XMLHttpRequest",
        "Origin": DIRECTORY_URL,
        "Referer": f"{DIRECTORY_URL}/",
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = session.post(API_URL, json=payload, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** attempt
            print(f"  Retry for {first_name} {last_name} ({attempt+1}/{MAX_RETRIES}) after {wait}s: {e}")
            time.sleep(wait)


def extract_record(api_response):
    """Extract person record(s) from API response."""
    records = api_response.get("Records", {})
    total = records.get("TotalRecords", 0)

    if total == 0:
        return []

    record_data = records.get("Record", {})

    # Single record comes as dict, multiple as list
    if isinstance(record_data, dict):
        return [record_data]
    elif isinstance(record_data, list):
        return record_data
    return []


def enrich_student(student, directory_record):
    """Merge directory API data into the facebook-scraped student dict."""
    mapping = {
        "netid": "NetId",
        "email": "EmailAddress",
        "upi": "UPI",
        "mailbox": "MailBox",
        "phone_directory": "PhoneNumber",
        "first_name_directory": "FirstName",
        "preferred_name": "KnownAs",
        "middle_name": "MiddleName",
        "suffix": "Suffix",
        "school": "PrimarySchoolName",
        "school_code": "PrimarySchoolCode",
        "year_directory": "StudentExpectedGraduationYear",
        "curriculum": "StudentCurriculum",
        "college_code": "ResidentialCollegeCode",
        "college_directory": "ResidentialCollegeName",
        "organization": "OrganizationName",
        "organization_code": "PrimaryOrganizationCode",
        "unit": "OrganizationUnitName",
        "title": "DirectoryTitle",
        "postal_address": "PostalAddress",
        "student_address": "StudentAddress",
        "registered_address": "RegisteredAddress",
    }

    for our_field, api_field in mapping.items():
        value = directory_record.get(api_field)
        if value and str(value).strip():
            student[our_field] = value

    return student


def match_record(student, records):
    """Find the best matching record from multiple results.

    Matches on college + year, then college alone, then year alone,
    then falls back to first result.
    """
    student_college = student.get("college", "").lower()
    student_year = student.get("year", "")
    # Convert "'27" to 2027 for comparison
    student_year_int = None
    if student_year and student_year.startswith("'"):
        try:
            student_year_int = 2000 + int(student_year[1:])
        except ValueError:
            pass

    # Score each record
    best_record = None
    best_score = -1

    for rec in records:
        score = 0
        rec_college = rec.get("ResidentialCollegeName", "").lower()
        rec_year = rec.get("StudentExpectedGraduationYear")

        if rec_college and rec_college == student_college:
            score += 2
        if student_year_int and rec_year and int(rec_year) == student_year_int:
            score += 1
        # Prefer Yale College students over staff/grad
        if rec.get("PrimarySchoolCode") == "YC":
            score += 1

        if score > best_score:
            best_score = score
            best_record = rec

    return best_record


ENRICHMENT_COLUMNS = [
    "netid", "email", "upi", "mailbox", "phone_directory",
    "first_name_directory", "preferred_name", "middle_name", "suffix",
    "school", "school_code", "year_directory", "curriculum",
    "college_code", "college_directory", "organization", "organization_code",
    "unit", "title", "postal_address", "student_address", "registered_address",
]


def load_students_from_db(engine):
    """Load students from newly_scraped table."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, full_name, first_name, last_name, year, pronouns, "
            "photo_id, college, phone, address, major, birthday, details_raw, "
            "netid FROM newly_scraped ORDER BY id"
        )).fetchall()
    return [dict(row._mapping) for row in rows]


def update_student_in_db(engine, row_id, enrichment_data):
    """Update a single student row with directory enrichment data."""
    sets = []
    values = {"row_id": row_id}
    for col in ENRICHMENT_COLUMNS:
        if col in enrichment_data and enrichment_data[col] is not None:
            sets.append(f"{col} = :{col}")
            values[col] = enrichment_data[col]
    if not sets:
        return
    sql = f"UPDATE newly_scraped SET {', '.join(sets)} WHERE id = :row_id"
    with engine.begin() as conn:
        conn.execute(text(sql), values)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Yale Directory Enrichment Scraper")
    parser.add_argument("--session-cookie", type=str, required=True,
                        help="_people_search_session cookie value (URL-decoded or encoded)")
    parser.add_argument("--delay", type=float, default=0.3,
                        help="Delay between API requests (seconds)")
    parser.add_argument("--start-from", type=int, default=0,
                        help="Index to start from (for resuming)")
    parser.add_argument("--database-url", type=str, default=DATABASE_URL,
                        help="PostgreSQL connection URL")
    args = parser.parse_args()

    engine = sqlalchemy.create_engine(args.database_url)

    # Load students from database
    students = load_students_from_db(engine)
    print(f"Loaded {len(students)} students from newly_scraped table")

    # Set up session
    session = requests.Session()
    session.cookies.set("_people_search_session", args.session_cookie,
                        domain="directory.yale.edu", path="/")
    session.cookies.set("loggedIn", "true",
                        domain="directory.yale.edu", path="/")
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    })

    # Get CSRF token
    print("Fetching CSRF token...")
    csrf_token = get_session_and_csrf(session)
    print(f"Got CSRF token: {csrf_token[:20]}...")

    # Enrich each student
    not_found = 0
    multi_match = 0
    errors = 0
    enriched = 0
    requests_since_csrf = 0

    for i in range(args.start_from, len(students)):
        student = students[i]
        row_id = student["id"]
        first = student.get("first_name", "")
        last = student.get("last_name", "")

        if not first or not last:
            not_found += 1
            continue

        # Skip if already enriched (for safe re-runs)
        if student.get("netid") and args.start_from == 0:
            enriched += 1
            continue

        # Periodically refresh CSRF token to prevent expiry
        requests_since_csrf += 1
        if requests_since_csrf >= CSRF_REFRESH_INTERVAL:
            try:
                csrf_token = get_session_and_csrf(session)
                requests_since_csrf = 0
            except Exception as e:
                print(f"  Warning: CSRF refresh failed: {e}")

        try:
            result = search_person(session, csrf_token, first, last)
            records = extract_record(result)

            if len(records) == 0:
                not_found += 1
            elif len(records) == 1:
                enrichment = {}
                enrich_student(enrichment, records[0])
                update_student_in_db(engine, row_id, enrichment)
                enriched += 1
            else:
                best = match_record(student, records)
                if best:
                    enrichment = {}
                    enrich_student(enrichment, best)
                    update_student_in_db(engine, row_id, enrichment)
                    enriched += 1
                    multi_match += 1
                else:
                    not_found += 1

        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 422:
                not_found += 1
            elif e.response is not None and e.response.status_code in (401, 403):
                errors += 1
                print(f"  Auth error for {first} {last} — refreshing CSRF token...")
                try:
                    csrf_token = get_session_and_csrf(session)
                    requests_since_csrf = 0
                except Exception:
                    print("  FATAL: Could not refresh session. Update cookies and resume with:")
                    print(f"    --start-from {i}")
                    sys.exit(1)
            else:
                errors += 1
                print(f"  HTTP error for {first} {last}: {e}")
        except Exception as e:
            errors += 1
            print(f"  Error for {first} {last}: {e}")

        # Progress
        if (i + 1) % 10 == 0:
            print(f"Progress: {i+1}/{len(students)} | "
                  f"enriched={enriched} not_found={not_found} "
                  f"multi={multi_match} errors={errors}")

        time.sleep(args.delay)

    print(f"\nDone! Results saved to newly_scraped table")
    print(f"  Enriched: {enriched}")
    print(f"  Not found: {not_found}")
    print(f"  Multiple matches: {multi_match}")
    print(f"  Errors: {errors}")


if __name__ == "__main__":
    main()
