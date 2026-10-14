import { test } from "node:test";
import assert from "node:assert/strict";
import { publicDeliveryError, logPublicResult, logPublicFatal } from "./public-diagnostics.mjs";

test("delivery errors expose only validated HTTP status codes", () => {
  assert.equal(
    publicDeliveryError({ status: 404, error: "private user/event/token details" }),
    "FCM_HTTP_404",
  );
  for (const status of [undefined, "404", "404 user=private", 399, 600, NaN]) {
    assert.equal(publicDeliveryError({ status, error: "private" }), "FCM_SEND_FAILED");
  }
});

test("stdout is a strict public projection even for sensitive error objects", () => {
  const lines = [];
  logPublicResult(
    {
      ok: false,
      sent: 1,
      failed: 2,
      due: 3,
      skippedAlreadySent: 0,
      user_id: "private-user",
      event_id: "private-event",
      token: "private-token",
      window: "private-window",
      errors: ["FCM_HTTP_503", "private-provider-token", { secret: "private-key" }],
    },
    { log: (line) => lines.push(line) },
  );
  assert.deepEqual(JSON.parse(lines[0]), {
    ok: false,
    sent: 1,
    failed: 2,
    due: 3,
    skippedAlreadySent: 0,
    errors: ["FCM_HTTP_503", "FCM_SEND_FAILED", "FCM_SEND_FAILED"],
  });
  assert.doesNotMatch(lines[0], /private/);
});

test("fatal stderr contains no exception text and summary errors are bounded", () => {
  const lines = [];
  logPublicFatal({ error: (line) => lines.push(line) });
  assert.match(lines[0], /REMINDER_JOB_FAILED/);
  assert.doesNotMatch(lines[0], /password|postgres:\/\/|user=/);
  logPublicResult(
    { ok: true, sent: "secret", errors: Array(30).fill("FCM_SEND_FAILED") },
    { log: (line) => lines.push(line) },
  );
  assert.equal(JSON.parse(lines[1]).sent, 0);
  assert.equal(JSON.parse(lines[1]).errors.length, 20);
});
