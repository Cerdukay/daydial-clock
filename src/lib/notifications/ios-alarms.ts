import { Capacitor, registerPlugin } from "@capacitor/core";
import type { LocalScheduledReminder } from "./local-reminders";

interface AlarmPermission {
  supported: boolean;
  alarm: "granted" | "denied" | "prompt";
}

interface IosAlarmBridge {
  checkPermissions(): Promise<AlarmPermission>;
  requestPermissions(): Promise<AlarmPermission>;
  sync(options: {
    alarms: { key: string; eventId: string; title: string; fireAt: number }[];
  }): Promise<{ scheduled: number }>;
}

const alarms = registerPlugin<IosAlarmBridge>("ArceliraAlarm");

export function isIosNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function requestIosAlarmPermission(): Promise<boolean> {
  if (!isIosNative()) return false;
  try {
    let permission = await alarms.checkPermissions();
    if (!permission.supported) return false;
    if (permission.alarm === "prompt") permission = await alarms.requestPermissions();
    return permission.alarm === "granted";
  } catch {
    return false;
  }
}

/** The native bridge reconciles existing alarms; unchanged alarms retain IDs. */
export async function syncIosAlarms(reminders: LocalScheduledReminder[]): Promise<void> {
  if (!isIosNative()) return;
  // A bounded nearest-first queue avoids filling the OS with 90 days of alarms.
  const desired = reminders
    .filter((reminder) => reminder.reminderDelivery === "alarm")
    .sort((left, right) => left.fireAt - right.fireAt)
    .slice(0, 64);
  await alarms.sync({
    alarms: desired.map((reminder) => ({
      key: String(reminder.notificationId),
      eventId: reminder.eventId,
      title: reminder.title,
      // Keep the original timestamp stable when a just-saved reminder is late.
      // Native code clamps it once and does not replay a dismissed alarm.
      fireAt: reminder.requestedFireAt,
    })),
  });
}
