#!/usr/bin/env python3
"""Load enriched student data from newly_scraped table into person table."""

import os
import re
import html as html_lib
import sqlalchemy
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def parse_birthday(bday_str):
    """Parse 'Dec 29' into (month_int, day_int)."""
    if not bday_str:
        return None, None
    match = re.match(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})", bday_str)
    if match:
        return MONTH_MAP[match.group(1)], int(match.group(2))
    return None, None


def parse_year(year_str, year_dir):
    """Convert year to int. Prefer directory year, fallback to facebook year."""
    if year_dir:
        return int(year_dir)
    if year_str:
        match = re.match(r"'(\d{2})", year_str)
        if match:
            return 2000 + int(match.group(1))
    return None


def clean_str(value):
    """Clean a string value: decode HTML entities, strip whitespace."""
    if not value or not str(value).strip():
        return None
    return html_lib.unescape(str(value).strip())


def to_db_row(student):
    """Convert enriched student dict to a database row dict matching person table."""
    birth_month, birth_day = parse_birthday(student.get("birthday"))
    year = parse_year(student.get("year"), student.get("year_directory"))

    upi = student.get("upi")
    photo_id = student.get("photo_id")

    # Build image URL from photo_id (served from GCS bucket)
    image = None
    if photo_id and photo_id != "0":
        image = f"https://storage.googleapis.com/yalies-photos/{photo_id}.jpg"

    # Build address: prefer directory student_address, fallback to scraped
    address = student.get("student_address") or student.get("address", "")
    if address:
        address = address.replace(" | ", "\n")

    return {
        "id": upi if upi else None,
        "netid": clean_str(student.get("netid")),
        "upi": upi,
        "email": clean_str(student.get("email")),
        "mailbox": clean_str(student.get("mailbox")),
        "phone": clean_str(student.get("phone_directory") or student.get("phone")),
        "first_name": clean_str(student.get("first_name_directory") or student.get("first_name")) or "",
        "preferred_name": clean_str(student.get("preferred_name")),
        "middle_name": clean_str(student.get("middle_name")),
        "last_name": clean_str(student.get("last_name")) or "",
        "suffix": clean_str(student.get("suffix")),
        "pronouns": clean_str(student.get("pronouns")),
        "school": clean_str(student.get("school")) or "Yale College",
        "school_code": clean_str(student.get("school_code")) or "YC",
        "year": year,
        "curriculum": clean_str(student.get("curriculum")),
        "college": clean_str(student.get("college_directory") or student.get("college")),
        "college_code": clean_str(student.get("college_code")),
        "image": image,
        "birth_month": birth_month,
        "birth_day": birth_day,
        "major": clean_str(student.get("major")),
        "address": clean_str(address),
        "organization": clean_str(student.get("organization")),
        "organization_code": clean_str(student.get("organization_code")),
        "unit": clean_str(student.get("unit")),
        "postal_address": clean_str(student.get("postal_address")),
    }


def load_from_newly_scraped(engine):
    """Load all rows from newly_scraped table as dicts."""
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM newly_scraped ORDER BY id")).fetchall()
    return [dict(row._mapping) for row in rows]


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Load students into database")
    parser.add_argument("--database-url", type=str, default=DATABASE_URL,
                        help="PostgreSQL connection URL")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would happen without modifying the database")
    args = parser.parse_args()

    engine = sqlalchemy.create_engine(args.database_url)

    students = load_from_newly_scraped(engine)
    print(f"Loaded {len(students)} students from newly_scraped table")

    with engine.begin() as conn:
        # Pre-check: count existing Yale College rows
        result = conn.execute(text(
            "SELECT COUNT(*) FROM person WHERE school = 'Yale College' OR school_code = 'YC'"
        ))
        existing_count = result.scalar()
        print(f"Existing Yale College rows: {existing_count}")

        if args.dry_run:
            print(f"DRY RUN: Would delete {existing_count} rows and insert ~{len(students)}")
            return

        # Step 1: Delete all existing Yale College rows
        result = conn.execute(text(
            "DELETE FROM person WHERE school = 'Yale College' OR school_code = 'YC'"
        ))
        print(f"Deleted {result.rowcount} existing Yale College rows")

        # Step 2: Insert all new students
        inserted = 0
        skipped = 0
        seen_ids = set()
        id_conflicts = []

        for student in students:
            row = to_db_row(student)

            # Generate a stable ID for students without UPI
            if not row["id"]:
                # Use a deterministic hash based on name + year to avoid collisions
                name_key = f"YC_{row['first_name']}_{row['last_name']}_{row.get('year', '')}_{row.get('college', '')}"
                row["id"] = abs(hash(name_key)) % (2**31 - 1)

            # Handle duplicate IDs
            if row["id"] in seen_ids:
                # Append a counter to make unique
                base_id = row["id"]
                counter = 1
                while row["id"] in seen_ids:
                    row["id"] = (base_id + counter) % (2**31 - 1)
                    counter += 1
                id_conflicts.append(f"{row['first_name']} {row['last_name']}")

            seen_ids.add(row["id"])

            # Filter out None values for the insert
            columns = [k for k, v in row.items() if v is not None]
            values = {k: v for k, v in row.items() if v is not None}
            placeholders = ", ".join(f":{k}" for k in columns)
            col_names = ", ".join(columns)

            conn.execute(
                text(f"INSERT INTO person ({col_names}) VALUES ({placeholders})"),
                values
            )
            inserted += 1

        print(f"Inserted {inserted} students")
        if id_conflicts:
            print(f"Resolved {len(id_conflicts)} ID conflicts: {id_conflicts[:5]}...")

        # Step 3: Verify
        result = conn.execute(text("SELECT COUNT(*) FROM person"))
        total = result.scalar()
        result = conn.execute(text("SELECT COUNT(*) FROM person WHERE school = 'Yale College'"))
        yc = result.scalar()
        result = conn.execute(text("SELECT COUNT(*) FROM person WHERE school = 'Yale College' AND netid IS NOT NULL"))
        with_netid = result.scalar()

        print(f"\nDatabase summary:")
        print(f"  Total rows: {total}")
        print(f"  Yale College rows: {yc}")
        print(f"  Yale College with netid: {with_netid}")
        print(f"  Non-Yale College rows: {total - yc}")


if __name__ == "__main__":
    main()
