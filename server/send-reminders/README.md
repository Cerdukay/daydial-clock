# send-reminders (GitHub Actions)

Replaces the Supabase `pg_cron` job (`* * * * *`) that called the
`send-reminders` Edge Function.

> **Current status:** automatic scheduling is paused because the required
> server credentials have not been configured in GitHub. The workflow can only
> be started manually and validates both secrets before installing dependencies.
> This prevents repeated failed runs and failure-notification emails.

## What this is

A standalone Node script (`index.mjs`) exporting `runSendReminders()`. It is
invoked by the GitHub Actions workflow with `DATABASE_URL` and
`FCM_SERVICE_ACCOUNT_JSON` injected from repository secrets.

## Local test run

```bash
cd server/send-reminders
npm install
cp .env.example .env   # fill in DATABASE_URL and FCM_SERVICE_ACCOUNT_JSON
node --env-file=.env index.mjs
```

Prints a JSON summary to stdout, e.g.:

```json
{"ok":true,"sent":2,"failed":0,"skippedAlreadySent":0,"due":2,"window":"2026-08-08T12:34:00.000Z","errors":[]}
```

Exits non-zero and logs to stderr on any FCM send failure or on
misconfiguration (missing env, missing idempotency table).

## GitHub Actions setup and re-enabling the schedule

Configure these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `CLOCK_DATABASE_URL` | Neon pooled connection string (`postgresql://...@c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require`) |
| `CLOCK_FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (full file contents) |

Do not use `VITE_NEON_DATA_API_URL` as `CLOCK_DATABASE_URL`: the browser-facing
Data API URL is not a privileged PostgreSQL connection string.

After adding both secrets, run the workflow manually once and confirm it
passes. Then restore this trigger under `on:` in
`.github/workflows/send-reminders.yml`:

```yaml
  schedule:
    - cron: "*/5 * * * *"
```

Five minutes is GitHub Actions' shortest supported schedule interval, and
scheduled runs can be delayed during periods of high load. If tighter timing
is needed, use a scheduler designed for minute-level delivery instead.
