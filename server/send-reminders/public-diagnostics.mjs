// Public CI output is a separate boundary from privileged server diagnostics.
export function publicDeliveryError(result) {
  const status = result?.status;
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? `FCM_HTTP_${status}`
    : "FCM_SEND_FAILED";
}

const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
const publicCode = (value) =>
  typeof value === "string" && /^(FCM_HTTP_[45]\d{2}|FCM_SEND_FAILED)$/.test(value)
    ? value
    : "FCM_SEND_FAILED";

export function logPublicResult(result, logger = console) {
  // Explicit projection, not serialization of an arbitrary privileged object.
  logger.log(
    JSON.stringify({
      ok: result.ok === true,
      sent: count(result.sent),
      failed: count(result.failed),
      skippedAlreadySent: count(result.skippedAlreadySent),
      due: count(result.due),
      errors: Array.isArray(result.errors) ? result.errors.slice(0, 20).map(publicCode) : [],
    }),
  );
}

export function logPublicFatal(logger = console) {
  // DB, OAuth, network and parser exceptions may echo credentials or user data.
  logger.error(
    "[send-reminders] FATAL: REMINDER_JOB_FAILED. Check private server configuration and required secrets.",
  );
}
