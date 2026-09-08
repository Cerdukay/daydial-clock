/**
 * Widget bridge — pushes a snapshot of today's events to native Android
 * SharedPreferences so the home-screen widget can render them.
 *
 * On native Android, the Capacitor Preferences plugin writes to
 * SharedPreferences under the "CapacitorStorage" key. The native
 * DayDialWidgetProvider reads the "daydial:widget:events" key from that
 * same file.
 *
 * After writing, we send a broadcast via the Android Intent API (through
 * a tiny Capacitor plugin call) to trigger an immediate widget refresh.
 */

import type { PlannerEvent, EventException } from "@/lib/daydial/types";
import { expandDay } from "@/lib/daydial/recurrence";

const EVENTS_KEY = "daydial:widget:events";

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return typeof w.Capacitor !== "undefined" && w.Capacitor.isNativePlatform?.() === true;
}

interface WidgetEventSnapshot {
  title: string;
  startAt: number;
  isCompleted: boolean;
}

/**
 * Build a compact JSON snapshot of today's events for the widget.
 * We only include fields the widget actually renders.
 */
function buildSnapshot(
  events: PlannerEvent[],
  exceptions: EventException[],
  date: Date = new Date(),
): WidgetEventSnapshot[] {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const snapshots: WidgetEventSnapshot[] = [];

  for (const ev of expandDay(events, exceptions, date)) {
    const start = new Date(ev.startAt);
    if (start < startOfDay || start >= endOfDay) continue;
    snapshots.push({
      title: ev.title || "Untitled",
      startAt: start.getTime(),
      isCompleted: ev.isCompleted,
    });
  }

  // Sort by start time ascending
  snapshots.sort((a, b) => a.startAt - b.startAt);
  return snapshots;
}

/**
 * Push today's event snapshot to native storage and refresh the widget.
 * Safe to call on web (no-op) or native.
 */
export async function syncWidgetData(
  events: PlannerEvent[],
  exceptions: EventException[],
): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    const snapshot = buildSnapshot(events, exceptions);
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({
      key: EVENTS_KEY,
      value: JSON.stringify(snapshot),
    });
    // Trigger a widget refresh broadcast
    await refreshWidget();
  } catch (err) {
    // Widget is a nice-to-have; never throw
    console.warn("[DayDial] Widget sync failed:", err);
  }
}

/**
 * Send a broadcast to refresh all DayDial widgets immediately.
 * Uses the Capacitor @capacitor/android-intent or a direct plugin call.
 * Falls back gracefully if the intent plugin is not installed.
 */
async function refreshWidget(): Promise<void> {
  try {
    // Use the Android Intent plugin if available; otherwise the widget
    // will refresh on its next periodic update (max 30 min).
    const w = window as unknown as {
      Capacitor?: {
        Plugins?: Record<string, { sendBroadcast?: (opts: { action: string }) => Promise<void> }>;
      };
    };
    const plugin = w.Capacitor?.Plugins?.["DayDialWidget"];
    if (plugin?.sendBroadcast) {
      await plugin.sendBroadcast({ action: "com.daydial.app.WIDGET_UPDATE" });
    }
  } catch {
    // ignore — periodic update will catch up
  }
}
