# send-reminders (GitHub Actions cron)

Replaces the Supabase `pg_cron` job (`* * * * *`) that called the
`send-reminders` Edge Function. Now runs via GitHub Actions scheduled
workflow (`.github/workflows/send-reminders.yml`) every minute.

## What this is

A standalone Node script (`index.mjs`) exporting `runSendReminders()`. It is
invoked by the GitHub Actions workflow every minute with `DATABASE_URL` and
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

## GitHub Actions setup

The workflow at `.github/workflows/send-reminders.yml` runs every minute.
Configure these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `CLOCK_DATABASE_URL` | Neon pooled connection string (`postgresql://...@c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require`) |
| `CLOCK_FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (full file contents) |

Note: GitHub Actions schedule has a real-world granularity closer to ~5
minutes and is not guaranteed to run exactly on the minute. If tighter
timing is needed, switch to Vercel Cron or an always-on host's OS cron.
