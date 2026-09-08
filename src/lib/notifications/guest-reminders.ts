/**
 * Guest-mode foreground reminder scheduler.
 *
 * Authenticated users get push notifications via FCM (see push.ts), but guest
 * users have no server-side channel. Instead we schedule client-side
 * `setTimeout` reminders that fire while the app is open, using the Web
 * Notification API.
 *
 * The scheduler is re-evaluated whenever the event list changes so cancelled
 * or moved events do not trigger stale notifications.
 */

import type { NotificationSound, PlannerEvent } from "@/lib/daydial/types";
import type { ScheduledReminder } from "./types";
import {
  getLocalNotificationPermission,
  isCapacitorNative,
  openEventFromNotification,
  requestLocalNotificationPermission,
} from "./local-reminders";
import { playNotificationSound } from "./sounds";

const MAX_LOOKAHEAD_MS = 24 * 60 * 60 * 1000; // schedule at most 24h ahead
const MIN_FIRE_OFFSET_MS = 1000; // don't schedule reminders already in the past

interface PendingTimer {
  eventId: string;
  timer: ReturnType<typeof setTimeout>;
}

let pending: PendingTimer[] = [];

function clearAll() {
  for (const item of pending) clearTimeout(item.timer);
  pending = [];
}

/** Compute the concrete reminders for a set of events in the next 24h. */
export function computeReminders(events: PlannerEvent[]): ScheduledReminder[] {
  const now = Date.now();
  const horizon = now + MAX_LOOKAHEAD_MS;
  const reminders: ScheduledReminder[] = [];

  for (const event of events) {
    if (event.reminderMinutes < 0) continue;
    if (event.isCompleted) continue;
    const startMs = new Date(event.startAt).getTime();
    const fireAt = startMs - event.reminderMinutes * 60 * 1000;
    if (fireAt < now + MIN_FIRE_OFFSET_MS) continue;
    if (fireAt > horizon) continue;
    const timeLabel = new Date(event.startAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    reminders.push({
      eventId: event.id,
      fireAt,
      title: event.title || "Upcoming event",
      body: `Starts at ${timeLabel}`,
    });
  }

  return reminders;
}

function showNotification(title: string, body: string, eventId: string, sound: NotificationSound) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  // Play the user's chosen sound (no-op for "none").
  playNotificationSound(sound);
  try {
    const notification = new Notification(title, {
      body,
      tag: `reminder-${eventId}`,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      openEventFromNotification(eventId);
    };
  } catch {
    // Notification construction can throw on some browsers — ignore.
  }
}

/**
 * Re-schedule all pending reminders from the given event list.
 * Call this whenever events change (create/update/delete) or when the
 * notification permission is first granted.
 *
 * @param sound The user's notification sound preference. Defaults to "chime".
 */
export function rescheduleGuestReminders(
  events: PlannerEvent[],
  sound: NotificationSound = "chime",
): void {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined") return;
  clearAll();
  const reminders = computeReminders(events);
  const now = Date.now();
  for (const reminder of reminders) {
    const delay = reminder.fireAt - now;
    if (delay <= 0) continue;
    const timer = setTimeout(
      () => showNotification(reminder.title, reminder.body, reminder.eventId, sound),
      delay,
    );
    pending.push({ eventId: reminder.eventId, timer });
  }
}

/** Request notification permission from the user. Returns the final status. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isCapacitorNative()) return requestLocalNotificationPermission();
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Read the current notification permission for either web or native builds. */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (isCapacitorNative()) return getLocalNotificationPermission();
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

/** Tear down all pending timers (e.g. on sign-out). */
export function teardownGuestReminders(): void {
  clearAll();
}
