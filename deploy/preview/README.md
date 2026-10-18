# Search development preview

This preview runs the frontend and backend together in the separate Cloud Run
service `yalies-search-preview`. It uses `yalies-sql-dev`, retains Yale CAS login,
and rejects profile/data mutations. Production hosting, backend traffic, and the
production database are not updated.

Create a private JSON file outside the repository containing `DATABASE_URL` for
the development database's private IP. Optionally include `SESSION_SECRET` to
preserve preview login sessions between deployments. Never commit this file.

From the repository root:

```sh
PREVIEW_ENV_FILE=/absolute/path/to/private-preview.json npm run preview -w yalies-web
```

The script validates the database host against `yalies-sql-dev`, uploads only the
application sources, builds both applications, and updates only the preview
service. It does not run either production deployment script or push Git commits.

To remove the preview when finished:

```sh
gcloud run services delete yalies-search-preview --project yalies --region us-central1
```
