#!/usr/bin/env python3
"""Yale Facebook Directory Scraper"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
import os
import sys
import html
import sqlalchemy
from sqlalchemy import text
from dotenv import load_dotenv
from google.cloud import storage

load_dotenv()

BASE_URL = "https://students.yale.edu/facebook"
PHOTO_PAGE_URL = f"{BASE_URL}/PhotoPageNew"
PHOTO_URL = f"{BASE_URL}/Photo"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
}

DATABASE_URL = os.environ["DATABASE_URL"]

GCS_BUCKET_NAME = "yalies-photos"

BIRTHDAY_PATTERN = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$"
)
PHONE_PATTERN = re.compile(r"^\d+-\d+")
ZIP_PATTERN = re.compile(r"\d{5}")
# Addresses typically contain digits (street numbers, zips) or commas (City, ST)
ADDRESS_PATTERN = re.compile(r"\d|,")


def parse_student_card(card):
    """Parse a single student_container div into a dict."""
    data = {}

    # Name
    name_tag = card.select_one("h5.yalehead")
    if name_tag:
        full = name_tag.get_text(strip=True)
        data["full_name"] = full
        if "," in full:
            parts = full.split(",", 1)
            data["last_name"] = parts[0].strip()
            data["first_name"] = parts[1].strip()
        else:
            data["last_name"] = full
            data["first_name"] = ""

    # Year
    year_tag = card.select_one(".student_year")
    if year_tag:
        data["year"] = year_tag.get_text(strip=True)

    # Pronouns
    pronoun_tag = card.select_one(".student_info_pronoun")
    if pronoun_tag:
        data["pronouns"] = pronoun_tag.get_text(strip=True)

    # Photo ID
    img_tag = card.select_one(".student_img img")
    if img_tag and img_tag.get("src"):
        src = img_tag["src"]
        match = re.search(r"id=(\d+)", src)
        if match:
            data["photo_id"] = match.group(1)

    # College and info
    info_divs = card.select(".student_info")
    if len(info_divs) >= 1:
        data["college"] = info_divs[0].get_text(strip=True)
    if len(info_divs) >= 2:
        # The second info div has mixed content: phone / address / major / birthday
        raw = info_divs[1].decode_contents()
        # Split on <br> or <br/>
        parts = [p.strip() for p in re.split(r"<br\s*/?>", raw) if p.strip()]
        data["details_raw"] = " | ".join(parts)
        _parse_details(parts, data)

    return data


def _parse_details(parts, data):
    """Extract phone, address, major, birthday from detail parts."""
    # Clean HTML tags and entities from all parts
    filtered = []
    for p in parts:
        clean = html.unescape(re.sub(r"<[^>]+>", "", p).strip())
        if clean:
            filtered.append(clean)

    if not filtered:
        return

    idx = 0

    # Check for phone (e.g. "6-2906 /")
    if PHONE_PATTERN.match(filtered[idx]):
        data["phone"] = filtered[idx].rstrip(" /")
        idx += 1

    # Check for birthday at end
    if filtered and BIRTHDAY_PATTERN.match(filtered[-1]):
        data["birthday"] = filtered[-1]
        remaining = filtered[idx:-1]
    else:
        remaining = filtered[idx:]

    if not remaining:
        return

    # Strategy: walk backwards from the end.
    # The last non-address line is the major.
    # Address lines typically contain digits (street numbers, zips) or commas.
    # Major lines are plain text like "Economics" or "Molecular Biophysics & Biochem".
    address_lines = []
    major = None

    for i in range(len(remaining) - 1, -1, -1):
        line = remaining[i]
        if major is None and not ADDRESS_PATTERN.search(line):
            # This looks like a major (no digits, no commas)
            major = line
            address_lines = remaining[:i]
            break
    else:
        # Everything looks like address (all have digits/commas)
        address_lines = remaining

    if major:
        data["major"] = major
    if address_lines:
        data["address"] = " | ".join(address_lines)


def fetch_with_retry(session, url, params=None, max_retries=3, timeout=60):
    """Fetch a URL with retry logic."""
    for attempt in range(max_retries):
        try:
            resp = session.get(url, params=params, headers=HEADERS, timeout=timeout)
            resp.raise_for_status()
            return resp
        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout,
                requests.exceptions.HTTPError) as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  Retry {attempt+1}/{max_retries} after {wait}s: {e}")
            time.sleep(wait)


def fetch_page(session, current_index=0, number_to_get=None):
    """Fetch a single page and return list of student dicts."""
    params = {"currentIndex": current_index}
    if number_to_get is not None:
        params["numberToGet"] = number_to_get

    resp = fetch_with_retry(session, PHOTO_PAGE_URL, params=params)

    if "cas/login" in resp.url:
        print("ERROR: Session expired. Update JSESSIONID cookie and try again.")
        sys.exit(1)

    soup = BeautifulSoup(resp.text, "html.parser")
    cards = soup.select(".student_container")
    students = [parse_student_card(c) for c in cards]
    return students, soup


def get_total_pages(soup):
    """Extract total pages from pagination."""
    links = soup.select(".jump_link a")
    if links:
        last = links[-1]
        return int(last.get_text(strip=True))
    return 1


def upload_photo_to_gcs(session, photo_id, bucket):
    """Download a student photo from Yale and upload to GCS."""
    if photo_id == "0":
        return False
    url = f"{PHOTO_URL}?id={photo_id}"
    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200 and len(resp.content) > 100:
            blob = bucket.blob(f"{photo_id}.jpg")
            blob.upload_from_string(resp.content, content_type="image/jpeg")
            return True
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        pass
    return False


def validate_students(students):
    """Validate scraped data looks reasonable."""
    if len(students) < 100:
        print(f"WARNING: Only {len(students)} students scraped — expected thousands.")
        return False

    # Check that most students have required fields
    missing_name = sum(1 for s in students if not s.get("full_name"))
    missing_college = sum(1 for s in students if not s.get("college"))
    missing_year = sum(1 for s in students if not s.get("year"))

    if missing_name > len(students) * 0.05:
        print(f"WARNING: {missing_name}/{len(students)} students missing name")
    if missing_college > len(students) * 0.05:
        print(f"WARNING: {missing_college}/{len(students)} students missing college")
    if missing_year > len(students) * 0.05:
        print(f"WARNING: {missing_year}/{len(students)} students missing year")

    # Check for duplicates
    names = [s.get("full_name", "") for s in students]
    unique = len(set(names))
    dupes = len(names) - unique
    if dupes > 0:
        print(f"INFO: {dupes} duplicate names found (may be legitimate)")

    print(f"Validation passed: {len(students)} students, "
          f"{len(students) - missing_name} with names, "
          f"{len(students) - missing_college} with college")
    return True


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS newly_scraped (
    id SERIAL PRIMARY KEY,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    year TEXT,
    pronouns TEXT,
    photo_id TEXT,
    college TEXT,
    phone TEXT,
    address TEXT,
    major TEXT,
    birthday TEXT,
    details_raw TEXT,
    -- directory enrichment fields (populated by directory_scraper.py)
    netid TEXT,
    email TEXT,
    upi INTEGER,
    mailbox TEXT,
    phone_directory TEXT,
    first_name_directory TEXT,
    preferred_name TEXT,
    middle_name TEXT,
    suffix TEXT,
    school TEXT,
    school_code TEXT,
    year_directory TEXT,
    curriculum TEXT,
    college_code TEXT,
    college_directory TEXT,
    organization TEXT,
    organization_code TEXT,
    unit TEXT,
    title TEXT,
    postal_address TEXT,
    student_address TEXT,
    registered_address TEXT,
    scraped_at TIMESTAMP DEFAULT NOW()
)
"""

FACEBOOK_COLUMNS = [
    "full_name", "first_name", "last_name", "year", "pronouns",
    "photo_id", "college", "phone", "address", "major", "birthday", "details_raw",
]


def save_to_database(engine, students):
    """Save scraped students to the newly_scraped table, replacing previous data."""
    with engine.begin() as conn:
        conn.execute(text(CREATE_TABLE_SQL))
        conn.execute(text("TRUNCATE newly_scraped RESTART IDENTITY"))

        for student in students:
            values = {col: student.get(col) for col in FACEBOOK_COLUMNS}
            cols = ", ".join(FACEBOOK_COLUMNS)
            placeholders = ", ".join(f":{col}" for col in FACEBOOK_COLUMNS)
            conn.execute(text(f"INSERT INTO newly_scraped ({cols}) VALUES ({placeholders})"), values)

    print(f"Saved {len(students)} students to newly_scraped table")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Yale Facebook Scraper")
    parser.add_argument("--all-at-once", action="store_true",
                        help="Try to fetch all students in one request")
    parser.add_argument("--download-photos", action="store_true",
                        help="Download student photos")
    parser.add_argument("--start-page", type=int, default=0,
                        help="Page index to start from (for resuming)")
    parser.add_argument("--cookie", type=str, required=True,
                        help="JSESSIONID cookie value")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Delay between page requests (seconds)")
    parser.add_argument("--database-url", type=str, default=DATABASE_URL,
                        help="PostgreSQL connection URL")
    args = parser.parse_args()

    engine = sqlalchemy.create_engine(args.database_url)

    session = requests.Session()
    session.cookies.set("JSESSIONID", args.cookie,
                        domain="students.yale.edu", path="/facebook")

    all_students = []

    if args.all_at_once:
        print("Attempting to fetch all students in one request...")
        students, soup = fetch_page(session, current_index=-1, number_to_get=-1)
        print(f"Got {len(students)} students")
        all_students = students
    else:
        print("Fetching first page to determine total...")
        students, soup = fetch_page(session, current_index=0)
        total_pages = get_total_pages(soup)
        print(f"Total pages: {total_pages}, ~{total_pages * 12} students")

        if args.start_page == 0:
            all_students.extend(students)
            print(f"Page 1/{total_pages} - got {len(students)} students")
            start_idx = 12
        else:
            start_idx = args.start_page * 12

        for idx in range(start_idx, total_pages * 12, 12):
            page_num = idx // 12 + 1
            students, _ = fetch_page(session, current_index=idx)
            all_students.extend(students)
            print(f"Page {page_num}/{total_pages} - got {len(students)} students (total: {len(all_students)})")
            time.sleep(args.delay)

    print(f"\nTotal students scraped: {len(all_students)}")
    validate_students(all_students)

    # Save to database
    save_to_database(engine, all_students)

    # Upload photos to GCS
    if args.download_photos:
        gcs_client = storage.Client()
        bucket = gcs_client.bucket(GCS_BUCKET_NAME)
        # Check which photos already exist in the bucket
        existing_blobs = set(blob.name for blob in bucket.list_blobs())
        print(f"\nUploading photos to gs://{GCS_BUCKET_NAME}/ ({len(existing_blobs)} already exist)...")
        count = 0
        for i, s in enumerate(all_students):
            pid = s.get("photo_id", "0")
            if pid and pid != "0":
                if f"{pid}.jpg" not in existing_blobs:
                    if upload_photo_to_gcs(session, pid, bucket):
                        count += 1
                    time.sleep(0.1)
            if (i + 1) % 100 == 0:
                print(f"  Progress: {i+1}/{len(all_students)} checked, {count} uploaded")
        print(f"Uploaded {count} photos to GCS")



if __name__ == "__main__":
    main()

