#!/usr/bin/env python3
"""Fix person.image for photos that don't exist in the GCS bucket.

Sets image to NULL for any row where the GCS URL returns 404,
so the frontend shows the placeholder instead of a broken image.
Also re-uploads missing photos from Yale if a session cookie is provided.
"""

import os
import sys
import requests
import sqlalchemy
from sqlalchemy import text
from dotenv import load_dotenv
from google.cloud import storage

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
GCS_BUCKET_NAME = "yalies-photos"
PHOTO_URL = "https://students.yale.edu/facebook/Photo"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
}


def get_missing_photo_ids(engine):
    """Find photo_ids referenced in DB but missing from GCS bucket."""
    gcs_client = storage.Client()
    bucket = gcs_client.bucket(GCS_BUCKET_NAME)

    # Get all blobs in the bucket
    existing = set(blob.name for blob in bucket.list_blobs())
    print(f"Found {len(existing)} photos in GCS bucket")

    # Get all GCS image URLs from the DB
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, image FROM person "
            "WHERE image LIKE 'https://storage.googleapis.com/yalies-photos/%'"
        )).fetchall()

    print(f"Found {len(rows)} DB rows with GCS image URLs")

    missing = []
    for row in rows:
        # Extract filename from URL
        filename = row.image.split("/")[-1]  # e.g. "541197.jpg"
        if filename not in existing:
            photo_id = filename.replace(".jpg", "")
            missing.append((row.id, photo_id))

    print(f"Found {len(missing)} rows pointing to missing photos")
    return missing, bucket


def null_out_missing(engine, missing_ids):
    """Set image=NULL for rows with missing photos."""
    if not missing_ids:
        print("No missing photos to fix")
        return

    person_ids = [m[0] for m in missing_ids]
    with engine.begin() as conn:
        # Batch update in chunks
        chunk_size = 500
        updated = 0
        for i in range(0, len(person_ids), chunk_size):
            chunk = person_ids[i:i + chunk_size]
            placeholders = ", ".join(str(pid) for pid in chunk)
            result = conn.execute(text(
                f"UPDATE person SET image = NULL WHERE id IN ({placeholders})"
            ))
            updated += result.rowcount

    print(f"Set image=NULL for {updated} rows")


def reupload_missing(session, missing, bucket):
    """Try to re-download and upload missing photos from Yale."""
    uploaded = 0
    failed = 0
    for i, (person_id, photo_id) in enumerate(missing):
        url = f"{PHOTO_URL}?id={photo_id}"
        try:
            resp = session.get(url, headers=HEADERS, timeout=30)
            if resp.status_code == 200 and len(resp.content) > 100:
                blob = bucket.blob(f"{photo_id}.jpg")
                blob.upload_from_string(resp.content, content_type="image/jpeg")
                uploaded += 1
            else:
                failed += 1
        except Exception:
            failed += 1

        if (i + 1) % 50 == 0:
            print(f"  Progress: {i+1}/{len(missing)} — {uploaded} uploaded, {failed} failed")

    print(f"Re-uploaded {uploaded} photos, {failed} failed")
    return uploaded


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fix missing GCS photos")
    parser.add_argument("--cookie", type=str,
                        help="JSESSIONID cookie to re-download photos from Yale")
    parser.add_argument("--null-only", action="store_true",
                        help="Only NULL out missing images, don't try to re-upload")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would happen without modifying anything")
    parser.add_argument("--database-url", type=str, default=DATABASE_URL)
    args = parser.parse_args()

    os.environ.setdefault(
        "GOOGLE_APPLICATION_CREDENTIALS",
        os.path.join(os.path.dirname(__file__), "..", ".config", "gcloud", "service-key.json"),
    )

    db_url = args.database_url.replace("postgres://", "postgresql://", 1)
    engine = sqlalchemy.create_engine(db_url)
    missing, bucket = get_missing_photo_ids(engine)

    if not missing:
        print("All GCS image URLs in the DB have matching photos. Nothing to do.")
        return

    if args.dry_run:
        print(f"DRY RUN: Would fix {len(missing)} rows")
        for pid, photo_id in missing[:10]:
            print(f"  person.id={pid}, photo_id={photo_id}")
        if len(missing) > 10:
            print(f"  ... and {len(missing) - 10} more")
        return

    # Try to re-upload if we have a cookie
    if args.cookie and not args.null_only:
        print("\nAttempting to re-upload missing photos from Yale...")
        session = requests.Session()
        session.cookies.set("JSESSIONID", args.cookie,
                            domain="students.yale.edu", path="/facebook")
        uploaded = reupload_missing(session, missing, bucket)

        if uploaded > 0:
            # Re-check what's still missing after uploads
            print("\nRe-checking after uploads...")
            missing, bucket = get_missing_photo_ids(engine)

    # NULL out any still-missing
    if missing:
        print(f"\nNULLing out {len(missing)} remaining missing image URLs...")
        null_out_missing(engine, missing)


if __name__ == "__main__":
    main()
