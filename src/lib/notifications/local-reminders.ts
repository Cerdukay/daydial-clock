/**
 * Native reminder scheduling for Capacitor builds.
 *
 * The Web Notification API only works while a page is alive. Android users
 * need AlarmManager-backed notifications so reminders continue to fire when
 * Arcelira is in the background or the process has been stopped. This module
 * deliberately keeps the web path out of the native plugin import so the SSR
 * and PWA builds remain safe.
 */

import type {
  EventException,
  NotificationSound,
  PlannerEvent,
  ReminderDelivery,
} from "@/lib/daydial/types";
import { expandRange } from "@/lib/daydial/recurrence";
import { Capacitor } from "@capacitor/core";
import type { LocalNotificationsPlugin } from "@capacitor/local-notifications";
import { isIosNative, requestIosAlarmPermission, syncIosAlarms } from "./ios-alarms";

const MAX_LOOKAHEAD_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_FIRE_OFFSET_MS = 1000;
const RECENT_REMINDER_GRACE_MS = 60 * 1000;
const MAX_NOTIFICATION_ID = 2_147_483_647;
const REMINDER_CHANNEL_ID = "daydial-reminders";
const SILENT_CHANNEL_ID = "daydial-reminders-silent";
// Android notification-channel sound settings are immutable after the first
// creation. v2 is backed by a native channel that uses the system alarm sound;
// keeping a new id upgrades devices whose old alarm channel was silent.
const ALARM_CHANNEL_ID = "daydial-alarms-v2";
const REMINDER_SOURCE = "daydial-reminder";

export interface LocalScheduledReminder {
  eventId: string;
  fireAt: number;
  requestedFireAt: number;
  title: string;
  body: string;
  notificationId: number;
  reminderDelivery: ReminderDelivery;
}

// Capacitor's plugin proxy exposes a `then` member for unsupported methods.
// Never resolve a Promise directly with that proxy: Promise assimilation would
// call `LocalNotifications.then()` and fail on Android. Keep it inside a plain
// wrapper instead.
type LocalNotificationsHandle = { plugin: LocalNotificationsPlugin };
let pluginPromise: Promise<LocalNotificationsHandle | null> | null = null;
let scheduleQueue: Promise<void> = Promise.resolve();
let actionListenerPromise: Promise<void> | null = null;

/** Returns true when the page is running inside a Capacitor native shell. */
export function isCapacitorNative(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  // Keep compatibility with older test harnesses/embedded shells that only
  // expose the Capacitor bridge on window. The imported API remains the
  // authoritative check for current Capacitor WebViews.
  if (typeof window === "undefined") return false;
  const bridge = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return bridge?.isNativePlatform?.() === true;
}

/** Navigate to an event from a notification without reloading the SPA. */
export function openEventFromNotification(eventId: string): void {
  if (typeof window === "undefined") return;
  const path = `/event/${encodeURIComponent(eventId)}`;
  if (window.location.pathname === path) return;
  try {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    // Older WebViews may not expose history/popstate; keep a best-effort URL
    // fallback so the app can still resolve the route on the next load.
    window.location.hash = `#/event/${encodeURIComponent(eventId)}`;
  }
}

async function getLocalNotifications(): Promise<LocalNotificationsHandle | null> {
  if (!isCapacitorNative()) return null;
  if (!pluginPromise) {
    pluginPromise = import("@capacitor/local-notifications")
      .then(({ LocalNotifications }) => ({ plugin: LocalNotifications }))
      .catch(() => null);
  }
  return pluginPromise;
}

function mapPermission(display: string): NotificationPermission {
  if (display === "granted") return "granted";
  if (display === "prompt" || display === "prompt-with-rationale") return "default";
  return "denied";
}

/** Read native notification permission without opening a system prompt. */
export async function getLocalNotificationPermission(): Promise<NotificationPermission> {
  const handle = await getLocalNotifications();
  if (!handle) return "denied";
  const plugin = handle.plugin;
  try {
    const status = await plugin.checkPermissions();
    return mapPermission(status.display);
  } catch {
    return "denied";
  }
}

/** Request native notification permission (including Android 13's prompt). */
export async function requestLocalNotificationPermission(): Promise<NotificationPermission> {
  const handle = await getLocalNotifications();
  if (!handle) return "denied";
  const plugin = handle.plugin;
  try {
    let status = await plugin.checkPermissions();
    // Android may report a previously-dismissed request as `denied` while
    // still allowing a subsequent request (and iOS simply returns denied
    // without showing a second prompt). Always give an explicit user action
    // another chance instead of silently leaving reminders disabled forever.
    if (status.display !== "granted") {
      status = await plugin.requestPermissions();
    }
    return mapPermission(status.display);
  } catch {
    return "denied";
  }
}

/**
 * Request Android notification access once when the native app starts.
 *
 * A previously denied permission is never re-prompted here; the user can use
 * the reminder settings action to open the appropriate system settings.
 */
export async function ensureNativeNotificationPermission(): Promise<NotificationPermission> {
  const current = await getLocalNotificationPermission();
  return current === "default" ? requestLocalNotificationPermission() : current;
}

/**
 * Ask Android for exact-alarm access when it is not already available.
 *
 * Android 12+ can silently downgrade an alarm to an inexact delivery when the
 * special access is disabled. The native plugin returns to the app after the
 * system settings screen, so callers can immediately reschedule with the
 * newest permission state. If the user declines, scheduling still proceeds
 * with Android's safe inexact fallback.
 */
export async function requestExactNotificationPermission(): Promise<boolean> {
  if (isIosNative()) return requestIosAlarmPermission();
  const handle = await getLocalNotifications();
  if (!handle) return false;
  const plugin = handle.plugin;
  try {
    let status = await plugin.checkExactNotificationSetting();
    if (status.exact_alarm !== "granted") {
      status = await plugin.changeExactNotificationSetting();
    }
    return status.exact_alarm === "granted";
  } catch {
    // iOS and older plugin versions do not expose Android exact-alarm access.
    return false;
  }
}

function hashNotificationKey(key: string): number {
  // FNV-1a gives stable, inexpensive IDs while keeping them in Android's
  // signed 32-bit range. The occurrence start is part of the key, so a
  // recurring event gets a separate notification for each occurrence.
  let hash = 2_166_136_261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const id = (hash >>> 0) & MAX_NOTIFICATION_ID;
  return id === 0 ? 1 : id;
}

function uniqueNotificationId(key: string, used: Set<number>): number {
  let id = hashNotificationKey(key);
  while (used.has(id)) {
    id = id >= MAX_NOTIFICATION_ID ? 1 : id + 1;
  }
  used.add(id);
  return id;
}

/**
 * Expand events and calculate native notifications for the next 90 days.
 * Exceptions are applied before calculating the fire time, so moved or
 * cancelled recurring instances never leave stale alarms behind.
 */
export function computeLocalReminders(
  events: PlannerEvent[],
  exceptions: EventException[] = [],
  now = Date.now(),
): LocalScheduledReminder[] {
  const horizon = now + MAX_LOOKAHEAD_MS;
  const occurrences = expandRange(events, exceptions, new Date(now), new Date(horizon));
  const usedIds = new Set<number>();
  const reminders: LocalScheduledReminder[] = [];

  for (const event of occurrences) {
    if (!Number.isFinite(event.reminderMinutes) || event.reminderMinutes < 0 || event.isCompleted) {
      continue;
    }
    const startMs = new Date(event.startAt).getTime();
    if (!Number.isFinite(startMs)) continue;
    const requestedFireAt = startMs - event.reminderMinutes * 60 * 1000;
    if (requestedFireAt < now - RECENT_REMINDER_GRACE_MS || requestedFireAt > horizon) continue;
    // Saving an event at the exact reminder minute often takes a few seconds.
    // Deliver that fresh reminder immediately instead of silently dropping it.
    const fireAt = Math.max(requestedFireAt, now + MIN_FIRE_OFFSET_MS);

    const timeLabel = new Date(event.startAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const occurrenceKey = `${event.id}|${event.startAt}|${event.reminderMinutes}`;
    reminders.push({
      eventId: event.id,
      fireAt,
      requestedFireAt,
      title: typeof event.title === "string" ? event.title.trim() || "Arcelira" : "Arcelira",
      body: `Starts at ${timeLabel}`,
      notificationId: uniqueNotificationId(occurrenceKey, usedIds),
      reminderDelivery: event.reminderDelivery === "alarm" ? "alarm" : "notification",
    });
  }

  return reminders.sort((left, right) => left.fireAt - right.fireAt);
}

async function ensureChannels(plugin: LocalNotificationsPlugin): Promise<void> {
  try {
    await Promise.all([
      plugin.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: "Arcelira reminders",
        description: "Scheduled reminders for Arcelira events",
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: "#06b6d4",
      }),
      plugin.createChannel({
        id: SILENT_CHANNEL_ID,
        name: "Arcelira silent reminders",
        description: "Scheduled reminders without sound or vibration",
        importance: 2,
        visibility: 1,
        vibration: false,
        lights: false,
      }),
      plugin.createChannel({
        id: ALARM_CHANNEL_ID,
        name: "Arcelira alarms",
        description: "High-priority alarms for Arcelira events",
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: "#ef4444",
      }),
    ]);
  } catch {
    // Older Android versions do not expose channels; the default channel is
    // still used by the plugin in that case.
  }
}

async function registerActionListener(plugin: LocalNotificationsPlugin): Promise<void> {
  if (actionListenerPromise) return actionListenerPromise;
  actionListenerPromise = plugin
    .addListener("localNotificationActionPerformed", ({ notification }) => {
      const eventId = notification.extra?.eventId;
      if (typeof eventId !== "string" || typeof window === "undefined") return;
      window.focus();
      openEventFromNotification(eventId);
    })
    .then(() => undefined)
    .catch(() => {
      // Opening an event is best effort; delivery itself must not fail if the
      // listener cannot be registered on an older plugin version.
      actionListenerPromise = null;
    });
  return actionListenerPromise;
}

async function cancelExisting(plugin: LocalNotificationsPlugin): Promise<void> {
  try {
    const pending = await plugin.getPending();
    const ours = pending.notifications
      .filter((notification) => notification.extra?.source === REMINDER_SOURCE)
      .map(({ id }) => ({ id }));
    if (ours.length > 0) await plugin.cancel({ notifications: ours });
  } catch {
    // A permission transition can make getPending unavailable briefly. The
    // next successful reschedule will still replace all alarms we own.
  }
}

async function scheduleNativeReminders(
  events: PlannerEvent[],
  exceptions: EventException[],
  sound: NotificationSound,
): Promise<void> {
  const handle = await getLocalNotifications();
  if (!handle) return;
  const plugin = handle.plugin;
  const ios = isIosNative();
  const reminders = computeLocalReminders(events, exceptions);
  // AlarmKit has separate authorization. Denying notification access must not
  // block an authorized alarm, and alarm failures must not block notifications.
  let alarmFailure: unknown;
  if (ios) {
    try {
      await syncIosAlarms(reminders);
    } catch (error) {
      alarmFailure = error;
    }
  }
  const permission = await getLocalNotificationPermission();
  if (permission !== "granted") {
    await cancelExisting(plugin);
    if (alarmFailure) throw alarmFailure;
    return;
  }

  if (!ios) await ensureChannels(plugin);
  await cancelExisting(plugin);
  const notifications = ios
    ? reminders.filter((reminder) => reminder.reminderDelivery === "notification").slice(0, 64)
    : reminders;
  if (notifications.length === 0) {
    if (alarmFailure) throw alarmFailure;
    return;
  }

  await plugin.schedule({
    notifications: notifications.map((reminder) => ({
      id: reminder.notificationId,
      title: reminder.title,
      body: reminder.body,
      schedule: {
        at: new Date(reminder.fireAt),
        allowWhileIdle: true,
      },
      // iOS plays no sound when omitted. An unknown sound filename uses the
      // documented system-default fallback; custom Android channels stay intact.
      ...(ios
        ? { sound: sound === "none" ? undefined : "default" }
        : {
            channelId:
              reminder.reminderDelivery === "alarm"
                ? ALARM_CHANNEL_ID
                : sound === "none"
                  ? SILENT_CHANNEL_ID
                  : REMINDER_CHANNEL_ID,
            smallIcon: "ic_stat_daydial",
            iconColor: "#06b6d4",
            autoCancel: true,
            ongoing: reminder.reminderDelivery === "alarm",
          }),
      extra: {
        source: REMINDER_SOURCE,
        eventId: reminder.eventId,
        reminderDelivery: reminder.reminderDelivery,
      },
    })),
  });
  void registerActionListener(plugin);
  if (alarmFailure) throw alarmFailure;
}

/** Replace all Arcelira alarms after an event/settings change. */
export function rescheduleLocalReminders(
  events: PlannerEvent[],
  exceptions: EventException[] = [],
  sound: NotificationSound = "chime",
): Promise<boolean> {
  const result = scheduleQueue
    .catch(() => undefined)
    .then(() => scheduleNativeReminders(events, exceptions, sound))
    .then(() => true)
    .catch((error: unknown) => {
      // Scheduling must never surface as an unhandled rejection from a React
      // effect. A later event/settings change retries the complete schedule.
      console.warn("[notifications] local reminder scheduling failed:", error);
      return false;
    });
  scheduleQueue = result.then(() => undefined);
  return result;
}

/** Cancel alarms owned by Arcelira, e.g. during sign-out or native teardown. */
export function teardownLocalReminders(): Promise<void> {
  scheduleQueue = scheduleQueue
    .catch(() => undefined)
    .then(async () => {
      const handle = await getLocalNotifications();
      if (handle) await cancelExisting(handle.plugin);
      if (isIosNative()) await syncIosAlarms([]);
    })
    .catch((error: unknown) =>
      console.warn("[notifications] reminder cancellation failed:", error),
    );
  return scheduleQueue;
}
