import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalScheduledReminder } from "./local-reminders";
import { requestIosAlarmPermission, syncIosAlarms } from "./ios-alarms";

const mocks = vi.hoisted(() => ({
  platform: "ios",
  native: true,
  plugin: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), sync: vi.fn() },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => mocks.platform },
  registerPlugin: () => mocks.plugin,
}));

describe("iOS alarm bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform = "ios";
    mocks.native = true;
    mocks.plugin.checkPermissions.mockResolvedValue({ supported: true, alarm: "prompt" });
    mocks.plugin.requestPermissions.mockResolvedValue({ supported: true, alarm: "granted" });
    mocks.plugin.sync.mockResolvedValue({ scheduled: 0 });
  });

  it("requests authorization only after an explicit alarm selection", async () => {
    await expect(requestIosAlarmPermission()).resolves.toBe(true);
    expect(mocks.plugin.requestPermissions).toHaveBeenCalledOnce();
  });

  it.each([
    { supported: false, alarm: "denied" },
    { supported: true, alarm: "denied" },
  ])("does not repeatedly prompt for denied or unsupported alarms", async (permission) => {
    mocks.plugin.checkPermissions.mockResolvedValue(permission);
    await expect(requestIosAlarmPermission()).resolves.toBe(false);
    expect(mocks.plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it("does not call the native bridge from Android or web", async () => {
    mocks.platform = "android";
    await expect(requestIosAlarmPermission()).resolves.toBe(false);
    await syncIosAlarms([]);
    mocks.platform = "ios";
    mocks.native = false;
    await expect(requestIosAlarmPermission()).resolves.toBe(false);
    await syncIosAlarms([]);
    expect(mocks.plugin.checkPermissions).not.toHaveBeenCalled();
    expect(mocks.plugin.sync).not.toHaveBeenCalled();
  });

  it("passes the nearest 64 real alarms with stable original timestamps and no permission prompt", async () => {
    const reminders: LocalScheduledReminder[] = Array.from({ length: 80 }, (_, index) => ({
      eventId: `event-${index}`,
      title: "Alarm",
      body: "",
      notificationId: index + 1,
      requestedFireAt: 10_000 + index,
      fireAt: 20_000 + index,
      reminderDelivery: "alarm",
    }));
    reminders.reverse();
    reminders.push({ ...reminders[0]!, reminderDelivery: "notification" });
    await syncIosAlarms(reminders);
    const desired = mocks.plugin.sync.mock.calls[0]![0].alarms;
    expect(desired).toHaveLength(64);
    expect(desired[0]).toEqual({ key: "1", eventId: "event-0", title: "Alarm", fireAt: 10_000 });
    expect(desired[63].eventId).toBe("event-63");
    expect(mocks.plugin.checkPermissions).not.toHaveBeenCalled();
    expect(mocks.plugin.requestPermissions).not.toHaveBeenCalled();
    expect(reminders[0]!.eventId).toBe("event-79");
  });

  it("clears owned alarms through an empty reconciliation", async () => {
    await syncIosAlarms([]);
    expect(mocks.plugin.sync).toHaveBeenCalledWith({ alarms: [] });
  });
});
