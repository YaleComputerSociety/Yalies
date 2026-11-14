# User notifications

The `notification` table stores `id`, recipient NetID (`to`), `subject`, optional message text (`message`, empty when absent), `timestamp`, `color`, and nullable `viewed_at`. Times are PostgreSQL `TIMESTAMPTZ`; the dashboard displays America/New_York time including EST/EDT.

The public API and admin service both initialize the same shared schema from `packages/shared/notifications.ts`. Deploy the API/schema first, then the admin service (pipeline and dashboard), then the public frontend. No backfill or historical approval messages are generated. Include the new source files when staging a release; the tracked-only deployment scripts will omit untracked files. Local credentials and seed records must remain excluded.

## Recipient API

- `GET /v3/notifications`: session-only, returns this NetID's undismissed messages.
- `PATCH /v3/notifications/:id/viewed`: session-only and recipient-scoped. Records the first dismissal timestamp idempotently; fetching or displaying a message does not mark it viewed.

The frontend uses real API data only. Dismissal fades/collapses immediately; a failed save restores the notification. Messages refresh on page mount and window focus, rather than via push or polling.

## Admin history

`GET /api/messages?search=...&status=all|viewed|unviewed&page=1` is protected by the existing database-backed admin gate. It searches recipient, subject and body, returns newest first, and paginates at 50 rows. The dashboard's Messages page is served at `/admin/messages` on the production API host. Its viewed column denotes dismissal, not proof the text was read.

## Photo approvals

Approving a pending photo creates one green notification in the same transaction as the person/photo and request-status updates. A repeated resolution is rejected by the existing request lock/status check. The subject uses the approver's recorded first name (`person.first_name`), e.g. `Yavin approved your new picture`. If the first name is unavailable, the label falls back to the approver's NetID. Notes are optional and are sent verbatim apart from trimming surrounding whitespace; the review UI labels them as a user-facing message on approval. Without notes, the notification shows only the subject. Denials and non-photo changes do not generate messages.

## Admin compose

The Messages page includes a Send a message form: recipient NetID, required subject and body, and a limited green/grey/blue selector. `POST /api/messages` uses the same database-backed admin gate and origin checks as photo approval. Recipient NetIDs are normalized and must exist in the directory. Subject/body limits are 200/4000 characters. New messages have a server-generated timestamp and null `viewed_at`, and appear in searchable history after sending. Existing amber/red rows remain supported; new manually composed messages use only green, grey, or blue. Shared schema initialization upgrades the existing color constraint to accept grey.

No email, push delivery or historical backfill is included.
