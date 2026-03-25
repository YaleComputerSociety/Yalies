#!/usr/bin/env python3
"""Test Python directory enrichment on first 100 students"""
import sys
import json
import time
sys.path.insert(0, "../..")
from directory_scraper import get_session_and_csrf, search_person, extract_record
import requests

COOKIE = sys.argv[1]
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 100

with open("output/students.json") as f:
    students = json.load(f)[:COUNT]

print(f"PY: Enriching {len(students)} students...")

session = requests.Session()
session.cookies.set("_people_search_session", COOKIE, domain="directory.yale.edu", path="/")
session.cookies.set("loggedIn", "true", domain="directory.yale.edu", path="/")
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
})

csrf_token = get_session_and_csrf(session)
print(f"PY: Got CSRF token")

mapping = {
    "netid": "NetId", "email": "EmailAddress", "upi": "UPI",
    "mailbox": "MailBox", "phone_directory": "PhoneNumber",
    "first_name_directory": "FirstName", "preferred_name": "KnownAs",
    "middle_name": "MiddleName", "suffix": "Suffix",
    "school": "PrimarySchoolName", "school_code": "PrimarySchoolCode",
    "year_directory": "StudentExpectedGraduationYear",
    "college_code": "ResidentialCollegeCode",
    "college_directory": "ResidentialCollegeName",
    "organization": "OrganizationName",
}

enriched = 0
not_found = 0

for i, s in enumerate(students):
    first = s.get("first_name", "")
    last = s.get("last_name", "")
    if not first or not last:
        not_found += 1
        continue

    try:
        result = search_person(session, csrf_token, first, last)
        records = extract_record(result)
        if records:
            rec = records[0]
            for our_field, api_field in mapping.items():
                value = rec.get(api_field)
                if value and str(value).strip():
                    students[i][our_field] = value
            enriched += 1
        else:
            not_found += 1
    except Exception as e:
        not_found += 1

    if (i + 1) % 10 == 0:
        print(f"PY: {i+1}/{len(students)}", end="\r")

    time.sleep(0.3)

print(f"\nPY: Done. enriched={enriched} notFound={not_found}")

with open("output/test_py_enriched.json", "w") as f:
    json.dump(students, f, indent=2)
print("PY: Saved output/test_py_enriched.json")
