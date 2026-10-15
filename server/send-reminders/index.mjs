#!/usr/bin/env node
// server/send-reminders/index.mjs
//
// Reminder dispatcher for Arcelira against the Neon Postgres database.
// GitHub Actions currently allows manual invocation only; scheduling is paused.
//
// This is a plain Node script/handler, NOT tied to any specific paid
// scheduler platform. Whoever runs it just needs to invoke
//   node server/send-reminders/index.mjs
// (or call the exported `runSendReminders()` function from a serverless
// cron handler / GitHub Actions job / any other host) once per minute.
// See README.md in this directory for the exact wiring options.
//
// Required env (server-side only -- NEVER expose these to the Vite client
// bundle or commit them to the repo):
//   DATABASE_URL              Privileged Postgres connection string for the
//                              Neon branch (a real service-level Postgres
//                              role, NOT the Data API "authenticated" role --
//                              this must bypass RLS by design because it
//                              scans reminders for ALL users every run).
//   FCM_SERVICE_ACCOUNT_JSON  Full Firebase service account JSON contents.
//
// Optional env:
//   REMINDER_WINDOW_SECONDS   Defaults to 60 (matches the old cron cadence).
//   REMINDER_LOOKAHEAD_HOURS  Defaults to 24 (matches the old Edge Function).
//
// Idempotency:
//   This script claims each due reminder by inserting into
//   `reminder_dispatch_log` (proposed table -- see
//   migration/Clock/scheduler-implementation.md for the exact SQL, NOT yet
//   applied to Neon) with a UNIQUE (reminder_id, fire_window_start)
//   constraint, using `INSERT ... ON CONFLICT DO NOTHING RETURNING id`. If
//   the insert is skipped (0 rows returned), some run already claimed that
//   reminder for that minute window and this run skips sending again. This
//   makes double-invocation (e.g. overlapping cron runs, manual retries)
//   safe by construction instead of by convention.
//
//   Until that table is applied, this script refuses to run (see
//   `ensureIdempotencyTable`) rather than silently sending reminders with no
//   duplicate-send protection.

import pg from "pg";
import { publicDeliveryError, logPublicResult, logPublicFatal } from "./public-diagnostics.mjs";

const { Pool } = pg;

const WINDOW_SECONDS = Number(process.env.REMINDER_WINDOW_SECONDS ?? 60);
const LOOKAHEAD_HOURS = Number(process.env.REMINDER_LOOKAHEAD_HOURS ?? 24);

// ---------------------------------------------------------------------------
// FCM HTTP v1 API (service-account OAuth2, ported from the Deno Edge
// Function to Node's native crypto).
// ---------------------------------------------------------------------------

let cachedToken = null;

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa) {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(sa.private_key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token error: ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

function buildFcmMessage(token, reminder) {
  const startTime = new Date(reminder.start_at);
  const timeLabel = startTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    message: {
      token,
      notification: {
        title: reminder.title || "Upcoming event",
        body: `Starts at ${timeLabel}`,
      },
      data: {
        eventId: reminder.event_id,
        startAt: reminder.start_at,
        type: "event_reminder",
      },
      android: {
        priority: "high",
        notification: {
          channel_id: "daydial_reminders",
          icon: "@drawable/ic_stat_daydial",
          color: "#06b6d4",
        },
      },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/badge-72.png",
          tag: `reminder-${reminder.event_id}`,
          requireInteraction: false,
        },
        fcm_options: {
          link: `/event/${reminder.event_id}`,
        },
      },
    },
  };
}

async function sendFcm(projectId, accessToken, message) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: text, status: res.status };
  }
  return { success: true };
}

/** Send with a couple of retries on transient (network/5xx) failures. */
async function sendFcmWithRetry(projectId, accessToken, message, maxAttempts = 3) {
  let lastError;
  let lastStatus;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await sendFcm(projectId, accessToken, message);
      if (result.success) return result;
      lastError = result.error;
      lastStatus = result.status;
      // Don't retry on 4xx (invalid/unregistered token, bad request) --
      // those won't succeed on retry. Only retry on 5xx / thrown errors.
      if (!/"code":\s*5\d\d/.test(result.error ?? "") && attempt === 1) {
        return result;
      }
    } catch (err) {
      lastError = String(err);
      lastStatus = undefined;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  return { success: false, error: lastError, status: lastStatus };
}

// ---------------------------------------------------------------------------
// Idempotency table precondition check (see header comment + proposal SQL in
// migration/Clock/scheduler-implementation.md).
// ---------------------------------------------------------------------------

async function idempotencyTableExists(client) {
  const { rows } = await client.query(
    `SELECT to_regclass('public.reminder_dispatch_log') AS reg`,
  );
  return rows[0]?.reg !== null;
}

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

/**
 * Runs one pass of the reminder dispatch job. Safe to invoke repeatedly
 * (including concurrently) for the same minute window -- see idempotency
 * notes above.
 *
 * @returns {Promise<{ok: boolean, sent: number, failed: number, skippedAlreadySent: number, due: number, window: string, errors: string[]}>}
 */
export async function runSendReminders() {
  const databaseUrl = process.env.DATABASE_URL;
  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;

  if (!databaseUrl) {
    throw new Error(
      "BLOCKER: DATABASE_URL is not set. This must be a privileged/server-side " +
        "Postgres connection string for the Neon branch (bypasses RLS by design), " +
        "never the Data API 'authenticated' role and never shipped to the client.",
    );
  }
  if (!saJson) {
    throw new Error(
      "BLOCKER: FCM_SERVICE_ACCOUNT_JSON is not set. Set it as a GitHub " +
        "Actions repository secret (CLOCK_FCM_SERVICE_ACCOUNT_JSON).",
    );
  }

  let sa;
  try {
    sa = JSON.parse(saJson);
  } catch {
    throw new Error("BLOCKER: FCM_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true },
    max: 1,
  });

  const errors = [];
  let sent = 0;
  let failed = 0;
  let skippedAlreadySent = 0;

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setSeconds(0, 0);
  const windowEnd = new Date(windowStart.getTime() + WINDOW_SECONDS * 1000);
  const lookAhead = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const client = await pool.connect();
  try {
    const hasIdempotencyTable = await idempotencyTableExists(client);
    if (!hasIdempotencyTable) {
      throw new Error(
        "BLOCKER: public.reminder_dispatch_log does not exist on this Neon branch. " +
          "Refusing to send reminders without duplicate-send protection. Apply the " +
          "proposed migration in migration/Clock/scheduler-implementation.md first " +
          "(schema change requires separate review -- this script deliberately does " +
          "not apply DDL itself).",
      );
    }

    // Find reminders whose fire time (start_at - minutes_before) falls in
    // the current minute window. Mirrors the filtering logic of the old
    // Edge Function, but computed in SQL instead of pulled-then-filtered
    // in JS.
    const { rows: due } = await client.query(
      `
      SELECT
        er.id            AS reminder_id,
        er.event_id      AS event_id,
        er.user_id       AS user_id,
        er.minutes_before AS minutes_before,
        e.title          AS title,
        e.start_at       AS start_at,
        e.end_at         AS end_at,
        e.timezone       AS timezone
      FROM public.event_reminders er
      JOIN public.events e ON e.id = er.event_id
      WHERE er.is_enabled = true
        AND e.deleted_at IS NULL
        AND e.start_at >= $1
        AND e.start_at <= $2
        AND (e.start_at - (er.minutes_before || ' minutes')::interval) >= $3
        AND (e.start_at - (er.minutes_before || ' minutes')::interval) <  $4
      `,
      [now.toISOString(), lookAhead.toISOString(), windowStart.toISOString(), windowEnd.toISOString()],
    );

    if (due.length === 0) {
      return {
        ok: true,
        sent: 0,
        failed: 0,
        skippedAlreadySent: 0,
        due: 0,
        window: windowStart.toISOString(),
        errors: [],
      };
    }

    const userIds = [...new Set(due.map((r) => r.user_id))];
    const { rows: tokens } = await client.query(
      `SELECT token, platform, user_id FROM public.push_tokens
       WHERE user_id = ANY($1::text[]) AND is_active = true`,
      [userIds],
    );
    const tokensByUser = new Map();
    for (const t of tokens) {
      const list = tokensByUser.get(t.user_id) ?? [];
      list.push(t);
      tokensByUser.set(t.user_id, list);
    }

    let accessToken;
    try {
      accessToken = await getAccessToken(sa);
    } catch (err) {
      throw new Error(`FCM auth failed: ${err.message ?? err}`);
    }

    for (const reminder of due) {
      // Atomically claim this reminder for this minute window. ON CONFLICT
      // DO NOTHING + RETURNING is the idempotency guard: if another run
      // already claimed it, `claim.rows.length === 0` and we skip.
      const claim = await client.query(
        `INSERT INTO public.reminder_dispatch_log (reminder_id, fire_window_start)
         VALUES ($1, $2)
         ON CONFLICT (reminder_id, fire_window_start) DO NOTHING
         RETURNING id`,
        [reminder.reminder_id, windowStart.toISOString()],
      );
      if (claim.rows.length === 0) {
        skippedAlreadySent += 1;
        continue;
      }

      const userTokens = tokensByUser.get(reminder.user_id) ?? [];
      if (userTokens.length === 0) {
        // Not an error -- user just has no registered device. Still
        // counted as "claimed" so we don't re-attempt every minute.
        continue;
      }

      let anySucceeded = false;
      for (const { token } of userTokens) {
        const message = buildFcmMessage(token, reminder);
        const result = await sendFcmWithRetry(sa.project_id, accessToken, message);
        if (result.success) {
          sent += 1;
          anySucceeded = true;
        } else {
          failed += 1;
          // Actions logs may be public: never include record IDs, token fragments
          // or provider text. Keep only an allowlisted, non-identifying code.
          const detail = publicDeliveryError(result);
          errors.push(detail);
          // eslint-disable-next-line no-console
          console.error(`[send-reminders] FCM send failed: ${detail}`);
        }
      }

      if (!anySucceeded) {
        // Every token failed (after sendFcmWithRetry's internal retries) --
        // release the claim so this reminder is NOT permanently marked
        // dispatched. A subsequent invocation for the same window (a manual
        // retry / backfill run) can then pick it up again instead of the
        // failure being silently lost. Claiming-then-releasing-on-failure
        // still prevents two *concurrent* invocations from double-sending,
        // since the ON CONFLICT insert above is atomic and only one of them
        // wins the claim at a time.
        await client.query(
          `DELETE FROM public.reminder_dispatch_log WHERE id = $1`,
          [claim.rows[0].id],
        );
      }
    }

    return {
      ok: failed === 0,
      sent,
      failed,
      skippedAlreadySent,
      due: due.length,
      window: windowStart.toISOString(),
      errors: errors.slice(0, 20),
    };
  } finally {
    client.release();
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint -- lets any scheduler invoke this as `node index.mjs`.
// ---------------------------------------------------------------------------

const isDirectRun = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  runSendReminders()
    .then((result) => {
      logPublicResult(result);
      if (!result.ok) {
        process.exitCode = 1;
      }
    })
    .catch(() => {
      logPublicFatal();
      process.exitCode = 1;
    });
}
