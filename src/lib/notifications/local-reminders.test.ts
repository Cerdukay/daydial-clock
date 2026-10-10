import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeLocalReminders } from "./local-reminders";
import { makeEvent } from "@/lib/daydial/testing";
import type { EventException, PlannerEvent } from "@/lib/daydial/types";

const nativeMocks = vi.hoisted(() => ({
  ios: false,
  alarmSync: vi.fn(),
  alarmPermission: vi.fn(),
  plugin: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getPending: vi.fn(),
    cancel: vi.fn(),
    schedule: vi.fn(),
    createChannel: vi.fn(),
    addListener: vi.fn(),
    checkExactNotificationSetting: vi.fn(),
    changeExactNotificationSetting: vi.fn(),
  },
}));

vi.mock("./ios-alarms", () => ({
  isIosNative: () => nativeMocks.ios,
  syncIosAlarms: nativeMocks.alarmSync,
  requestIosAlarmPermission: nativeMocks.alarmPermission,
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: nativeMocks.plugin,
}));

const NOW = new Date("2026-03-15T08:00:00.000Z");

function futureEvent(
  id: string,
  start: string,
  reminderMinutes: number,
  overrides: Partial<PlannerEvent> = {},
): PlannerEvent {
  const startAt = new Date(start);
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
  return makeEvent(id, startAt.toISOString(), endAt.toISOString(), {
    reminderMinutes,
    ...overrides,
  });
}

describe("computeLocalReminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates a stable native notification for a future event", () => {
    const event = futureEvent("meeting", "2026-03-15T10:00:00.000Z", 15, {
      title: "Team standup",
    });
    const reminders = computeLocalReminders([event], [], NOW.getTime());

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      eventId: "meeting",
      title: "Team standup",
      fireAt: new Date("2026-03-15T09:45:00.000Z").getTime(),
    });
    expect(reminders[0]!.notificationId).toBeGreaterThan(0);
    expect(reminders[0]!.notificationId).toBeLessThanOrEqual(2_147_483_647);
    expect(computeLocalReminders([event], [], NOW.getTime())[0]!.notificationId).toBe(
      reminders[0]!.notificationId,
    );
  });

  it("marks alarm reminders for the high-priority native channel", () => {
    const event = futureEvent("alarm", "2026-03-15T10:00:00.000Z", 15, {
      reminderDelivery: "alarm",
    });

    expect(computeLocalReminders([event], [], NOW.getTime())[0]).toMatchObject({
      eventId: "alarm",
      reminderDelivery: "alarm",
    });
  });

  it("delivers a reminder saved during its current minute instead of dropping it", () => {
    const event = futureEvent("just-now", "2026-03-15T07:59:45.000Z", 0);

    expect(computeLocalReminders([event], [], NOW.getTime())[0]).toMatchObject({
      eventId: "just-now",
      fireAt: NOW.getTime() + 1000,
    });
  });

  it("expands recurring events and applies cancelled occurrences", () => {
    const event = futureEvent("daily", "2026-03-15T09:00:00.000Z", 0, {
      repeat: "daily",
      repeatUntil: "2026-03-17T00:00:00.000Z",
      title: "Daily focus",
    });
    const cancelledStart = "2026-03-16T09:00:00.000Z";
    const exception: EventException = {
      id: "exception-1",
      eventId: "daily",
      originalStartAt: cancelledStart,
      replacementStartAt: null,
      replacementEndAt: null,
      isCancelled: true,
    };

    const reminders = computeLocalReminders([event], [exception], NOW.getTime());
    expect(reminders).toHaveLength(2);
    expect(reminders.map((reminder) => reminder.fireAt)).toEqual([
      new Date("2026-03-15T09:00:00.000Z").getTime(),
      new Date("2026-03-17T09:00:00.000Z").getTime(),
    ]);
  });

  it("skips disabled, completed, past, and malformed reminders", () => {
    const disabled = futureEvent("disabled", "2026-03-15T10:00:00.000Z", -1);
    const completed = futureEvent("completed", "2026-03-15T10:00:00.000Z", 0, {
      isCompleted: true,
    });
    const past = futureEvent("past", "2026-03-15T07:00:00.000Z", 0);
    const malformed = {
      ...futureEvent("malformed", "2026-03-15T10:00:00.000Z", 0),
      startAt: "not-a-date",
    };

    expect(
      computeLocalReminders([disabled, completed, past, malformed], [], NOW.getTime()),
    ).toEqual([]);
  });
});

describe("native reminder scheduling", () => {
  beforeEach(() => {
    nativeMocks.ios = false;
    nativeMocks.alarmSync.mockResolvedValue(undefined);
    nativeMocks.alarmPermission.mockResolvedValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { Capacitor: { isNativePlatform: () => true } },
    });
    nativeMocks.plugin.checkPermissions.mockResolvedValue({ display: "granted" });
    nativeMocks.plugin.getPending.mockResolvedValue({ notifications: [] });
    nativeMocks.plugin.cancel.mockResolvedValue(undefined);
    nativeMocks.plugin.schedule.mockResolvedValue({ notifications: [] });
    nativeMocks.plugin.createChannel.mockResolvedValue(undefined);
    nativeMocks.plugin.addListener.mockResolvedValue({ remove: vi.fn() });
    nativeMocks.plugin.checkExactNotificationSetting.mockResolvedValue({
      exact_alarm: "granted",
    });
    nativeMocks.plugin.changeExactNotificationSetting.mockResolvedValue({
      exact_alarm: "granted",
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("schedules OS-backed notifications and replaces the previous set", async () => {
    const event = futureEvent("native", "2026-03-15T10:00:00.000Z", 15);
    const { rescheduleLocalReminders, teardownLocalReminders } = await import("./local-reminders");
    nativeMocks.plugin.getPending.mockResolvedValueOnce({ notifications: [] }).mockResolvedValue({
      notifications: [{ id: 123, extra: { source: "daydial-reminder" } }],
    });

    await rescheduleLocalReminders([event], [], "chime");
    await rescheduleLocalReminders([event], [], "none");

    expect(nativeMocks.plugin.createChannel).toHaveBeenCalled();
    expect(nativeMocks.plugin.cancel).toHaveBeenCalled();
    expect(nativeMocks.plugin.schedule).toHaveBeenCalledTimes(2);
    const secondSchedule = nativeMocks.plugin.schedule.mock.calls[1]![0];
    expect(secondSchedule.notifications[0]).toMatchObject({
      title: "Event native",
      channelId: "daydial-reminders-silent",
      extra: { source: "daydial-reminder", eventId: "native" },
    });
    expect(secondSchedule.notifications[0].schedule.at).toBeInstanceOf(Date);

    await teardownLocalReminders();
  });

  it("uses the alarm channel and keeps an alarm visible until it is opened", async () => {
    const event = futureEvent("alarm", "2026-03-15T10:00:00.000Z", 15, {
      reminderDelivery: "alarm",
    });
    const { rescheduleLocalReminders, teardownLocalReminders } = await import("./local-reminders");

    await rescheduleLocalReminders([event], [], "none");

    const schedule = nativeMocks.plugin.schedule.mock.calls[0]![0];
    expect(schedule.notifications[0]).toMatchObject({
      channelId: "daydial-alarms-v2",
      ongoing: true,
      autoCancel: true,
      extra: { reminderDelivery: "alarm" },
    });
    expect(nativeMocks.plugin.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "daydial-alarms-v2", importance: 5, vibration: true }),
    );

    await teardownLocalReminders();
  });

  it("requests Android notification access when the native permission is still promptable", async () => {
    nativeMocks.plugin.checkPermissions.mockResolvedValue({ display: "prompt" });
    nativeMocks.plugin.requestPermissions.mockResolvedValue({ display: "granted" });

    const { ensureNativeNotificationPermission } = await import("./local-reminders");

    await expect(ensureNativeNotificationPermission()).resolves.toBe("granted");
    expect(nativeMocks.plugin.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("retries a previously denied permission when the user explicitly enables reminders", async () => {
    nativeMocks.plugin.checkPermissions.mockResolvedValue({ display: "denied" });
    nativeMocks.plugin.requestPermissions.mockResolvedValue({ display: "granted" });

    const { requestLocalNotificationPermission } = await import("./local-reminders");

    await expect(requestLocalNotificationPermission()).resolves.toBe("granted");
    expect(nativeMocks.plugin.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("opens Android exact-alarm settings when exact delivery is disabled", async () => {
    nativeMocks.plugin.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: "denied" });
    nativeMocks.plugin.changeExactNotificationSetting.mockResolvedValue({ exact_alarm: "granted" });

    const { requestExactNotificationPermission } = await import("./local-reminders");

    await expect(requestExactNotificationPermission()).resolves.toBe(true);
    expect(nativeMocks.plugin.changeExactNotificationSetting).toHaveBeenCalledTimes(1);
  });

  it("routes iOS alarm permission separately from Android exact-alarm settings", async () => {
    nativeMocks.ios = true;
    const { requestExactNotificationPermission } = await import("./local-reminders");
    await expect(requestExactNotificationPermission()).resolves.toBe(true);
    expect(nativeMocks.alarmPermission).toHaveBeenCalledOnce();
    expect(nativeMocks.plugin.checkExactNotificationSetting).not.toHaveBeenCalled();
  });

  it("separates real iOS alarms from normal notifications and uses a default sound", async () => {
    nativeMocks.ios = true;
    const alarm = futureEvent("alarm", "2026-03-15T10:00:00.000Z", 0, {
      reminderDelivery: "alarm",
    });
    const notification = futureEvent("notification", "2026-03-15T11:00:00.000Z", 0);
    const { rescheduleLocalReminders } = await import("./local-reminders");
    await expect(rescheduleLocalReminders([alarm, notification])).resolves.toBe(true);
    expect(nativeMocks.alarmSync).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ eventId: "alarm", reminderDelivery: "alarm" }),
      ]),
    );
    const scheduled = nativeMocks.plugin.schedule.mock.calls[0]![0].notifications;
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ sound: "default", extra: { eventId: "notification" } });
    expect(scheduled[0].channelId).toBeUndefined();
    expect(nativeMocks.plugin.createChannel).not.toHaveBeenCalled();
  });

  it("keeps authorized iOS alarms when normal notification permission is denied", async () => {
    nativeMocks.ios = true;
    nativeMocks.plugin.checkPermissions.mockResolvedValue({ display: "denied" });
    const alarm = futureEvent("alarm", "2026-03-15T10:00:00.000Z", 0, {
      reminderDelivery: "alarm",
    });
    const { rescheduleLocalReminders } = await import("./local-reminders");
    await expect(rescheduleLocalReminders([alarm])).resolves.toBe(true);
    expect(nativeMocks.alarmSync).toHaveBeenCalledOnce();
    expect(nativeMocks.plugin.schedule).not.toHaveBeenCalled();
  });

  it("limits iOS notifications to the nearest 64 and respects silent preference", async () => {
    nativeMocks.ios = true;
    const events = Array.from({ length: 80 }, (_, index) =>
      futureEvent(
        `event-${index}`,
        new Date(NOW.getTime() + (index + 1) * 60_000).toISOString(),
        0,
      ),
    ).reverse();
    const { rescheduleLocalReminders } = await import("./local-reminders");
    await rescheduleLocalReminders(events, [], "none");
    const scheduled = nativeMocks.plugin.schedule.mock.calls[0]![0].notifications;
    expect(scheduled).toHaveLength(64);
    expect(scheduled[0].extra.eventId).toBe("event-0");
    expect(scheduled[63].extra.eventId).toBe("event-63");
    expect(scheduled[0].sound).toBeUndefined();
  });

  it("reports alarm failures without preventing regular notification delivery", async () => {
    nativeMocks.ios = true;
    nativeMocks.alarmSync.mockRejectedValueOnce(new Error("Permission revoked"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const notification = futureEvent("notification", "2026-03-15T11:00:00.000Z", 0);
    const { rescheduleLocalReminders, teardownLocalReminders } = await import("./local-reminders");
    await expect(rescheduleLocalReminders([notification])).resolves.toBe(false);
    expect(nativeMocks.plugin.schedule).toHaveBeenCalledOnce();
    await teardownLocalReminders();
    expect(nativeMocks.alarmSync).toHaveBeenLastCalledWith([]);
    warning.mockRestore();
  });
});
