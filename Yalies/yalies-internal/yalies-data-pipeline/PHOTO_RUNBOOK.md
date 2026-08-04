# Yale Face Book Photo Runbook

Use this after importing a new Face Book roster. The JSON/database workflow
stores each student's public image URL, but it does not copy the corresponding
image bytes into `gs://yalies-photos`. The `photos` command fills missing
objects and repairs objects that are not real images.

No database load or public-site deployment is required after a successful photo
run. Existing `person.image` values already point to
`https://storage.googleapis.com/yalies-photos/<photo_id>.jpg`.

## Prerequisites

- Run from `yalies-internal/yalies-data-pipeline` with Node 20 (`nvm use`).
- Complete `browser-import` first so `output/students.json` is current.
- Ensure the GCP service account in `../../../.config/gcloud/service-key.json`
  can list, read, and write `gs://yalies-photos`.
- Log into `https://students.yale.edu/facebook` in a browser.

## 1. Capture a cookie that is proven to work for photos

Do not copy an arbitrary `JSESSIONID` from the browser cookie table. Yale apps
can have multiple same-named/path-scoped sessions, and a bare session ID may
redirect the photo endpoint to CAS.

1. Open browser DevTools and select **Network**.
2. While authenticated, open a Face Book image URL such as:

   ```text
   https://students.yale.edu/facebook/Photo?id=XXXXXX
   ```

3. Confirm that the response preview is a portrait, the status is `200`, and
   the response `Content-Type` is `image/...` rather than HTML.
4. Right-click that exact successful request and choose **Copy → Copy as cURL**.
5. In the copied command, locate `-b '...'` or the `Cookie:` request header.
   Copy the complete value inside it, including every `name=value` pair and
   semicolon. Do not reduce it to `JSESSIONID` unless that exact reduced value
   has independently returned the image.

Cookies are short-lived credentials. Do not commit them, paste them into issue
trackers/chat, or leave them in shell history.

## 2. Put the cookie in a temporary private file

Create a file outside the repository containing only the complete Cookie header
value—no `Cookie:` prefix, quotes, cURL flags, or surrounding explanation. Make
it readable only by your user:

```bash
chmod 600 /tmp/yalies-facebook-cookie.txt
```

The legacy inline form still works, but the file form avoids printing the
credential in npm's command echo and avoids placing it in process arguments.

## 3. Run the photo sync/repair

```bash
npm start -- photos \
  --facebook-cookie-file /tmp/yalies-facebook-cookie.txt
```

The command:

1. Loads photo IDs from `output/students.json`.
2. Lists the GCS bucket and byte-checks every existing roster photo.
3. Treats HTML, CAS pages, unreadable files, and unsupported image signatures as
   corrupt instead of trusting the `.jpg` extension or GCS metadata.
4. Downloads and validates one real photo before changing any GCS object.
5. Replaces corrupt objects and uploads missing objects at a rate-limited pace.
6. Stops loudly if the session expires or begins returning CAS/HTML.

A repair run looks like:

```text
Verifying XXXX existing roster photos...
Found XXX corrupt existing photo objects; they will be replaced.
  Progress: XXXX/XXXX checked, XXX uploaded
Uploaded XXX photos to GCS (0 failed)
Done. XXX new photos uploaded.
```

If preflight fails, the command prints `No photo objects were changed`. If a
session expires later, successfully replaced objects remain valid; capture a
new successful Photo request and rerun. The next run skips those completed
objects.

## 4. Prove the bucket is clean

Immediately rerun the same command:

```bash
npm start -- photos \
  --facebook-cookie-file /tmp/yalies-facebook-cookie.txt
```

The clean second pass must not report corrupt objects and should end with:

```text
Uploaded 0 photos to GCS (0 failed)
Done. 0 new photos uploaded.
```

Finally, check several records on the public site, including the new class. A
hard refresh may be necessary because GCS images are cached for up to one hour.

Delete the temporary cookie file when verification is complete and log out of
the Yale Face Book session if it is no longer needed.

## Troubleshooting

- **Redirected to Yale CAS during preflight:** the captured session is wrong or
  expired. Capture the full Cookie header from an exact Photo request that shows
  a portrait in the browser.
- **`Found XXX corrupt existing photo objects`:** continue with a valid session.
  The command will overwrite those objects. Older pipeline versions could save
  a CAS HTML page as `.jpg`; the current byte validation detects this.
- **Photos still appear missing after a clean second pass:** hard-refresh or
  wait for the previous cached object response to expire. No database reload or
  backend/frontend deployment is normally needed.
- **Interrupted run:** rerun it. Valid completed objects are detected and
  skipped, so repair is restart-safe.
