/**
 * Unified notifications entry point.
 *
 * Exports:
 *  - requestNotificationPermission  — ask the user for notification access
 *  - getNotificationPermission      — read the current web/native status
 *  - registerPushNotifications      — authenticated users: FCM token sync
 *  - rescheduleGuestReminders       — guest users: foreground setTimeout
 *  - rescheduleLocalReminders       — Capacitor users: OS-backed alarms
 *  - teardownGuestReminders         — clear guest timers (on sign-out)
 *  - unregisterPushToken            — deactivate push token (on sign-out)
 */

export {
  getNotificationPermission,
  requestNotificationPermission,
  rescheduleGuestReminders,
  teardownGuestReminders,
  computeReminders,
} from "./guest-reminders";

export {
  computeLocalReminders,
  ensureNativeNotificationPermission,
  isCapacitorNative,
  openEventFromNotification,
  requestExactNotificationPermission,
  rescheduleLocalReminders,
  teardownLocalReminders,
} from "./local-reminders";

export { registerPushNotifications, unregisterPushToken } from "./push";

export type {
  NotificationPermissionStatus,
  PushPlatform,
  ScheduledReminder,
  RegisterTokenResult,
} from "./types";
