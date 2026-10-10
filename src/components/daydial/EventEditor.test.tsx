// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDraft } from "@/lib/daydial/types";
import { EventEditor } from "./EventEditor";

const {
  radialRender,
  dismissVirtualKeyboard,
  isCapacitorNative,
  requestNotificationPermission,
  requestExactNotificationPermission,
  isIosNative,
} = vi.hoisted(() => ({
  radialRender: vi.fn(() => null),
  dismissVirtualKeyboard: vi.fn(() => Promise.resolve()),
  isCapacitorNative: vi.fn(() => false),
  requestNotificationPermission: vi.fn(() => Promise.resolve("granted" as const)),
  requestExactNotificationPermission: vi.fn(() => Promise.resolve(true)),
  isIosNative: vi.fn(() => false),
}));

vi.mock("./RadialClock", () => ({
  RadialClock: radialRender,
}));

vi.mock("@/lib/daydial/keyboard", () => ({
  dismissVirtualKeyboard,
}));

vi.mock("@/lib/notifications", () => ({
  isCapacitorNative,
  requestNotificationPermission,
  requestExactNotificationPermission,
}));

vi.mock("@/lib/notifications/ios-alarms", () => ({ isIosNative }));

vi.mock("@/lib/i18n", () => ({
  durationText: (_t: unknown, minutes: number) => `${minutes} min`,
  useI18n: () => ({
    language: "en",
    dateLocale: undefined,
    t: (key: string) => key,
  }),
}));

const initial: EventDraft = {
  title: "Initial",
  description: "",
  startAt: new Date(2026, 7, 24, 9, 0).toISOString(),
  endAt: new Date(2026, 7, 24, 10, 0).toISOString(),
  color: "cyan",
  category: "Personal",
  calendarName: "Personal",
  location: "",
  notes: "",
  reminderMinutes: -1,
  reminderDelivery: "notification",
  repeat: "none",
  repeatUntil: null,
  repeatCount: 0,
  isCompleted: false,
  laneMode: "auto",
  manualLane: null,
};

describe("EventEditor Android input performance", () => {
  beforeEach(() => {
    radialRender.mockClear();
    dismissVirtualKeyboard.mockClear();
    isCapacitorNative.mockReset();
    isCapacitorNative.mockReturnValue(false);
    isIosNative.mockReturnValue(false);
    requestNotificationPermission.mockReset();
    requestNotificationPermission.mockResolvedValue("granted");
    requestExactNotificationPermission.mockReset();
    requestExactNotificationPermission.mockResolvedValue(true);
  });
  afterEach(cleanup);

  it("does not redraw the radial SVG while the user types", () => {
    render(
      <EventEditor
        mode="create"
        initial={initial}
        timeFormat="12h"
        snapMinutes={15}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(radialRender).toHaveBeenCalledTimes(1);
    const title = screen.getByLabelText("editor.titleLabel");
    fireEvent.focus(title);
    expect(title.getBoundingClientRect().top).toBeLessThan(300);
    fireEvent.change(screen.getByLabelText("editor.titleLabel"), {
      target: { value: "Initial title typed on Android" },
    });
    expect(radialRender).toHaveBeenCalledTimes(1);

    fireEvent.blur(title);
    expect(radialRender).toHaveBeenCalledTimes(1);
  });

  it("dismisses the keyboard and coalesces rapid repeated save taps into one write", async () => {
    const onSave = vi.fn(() => new Promise<void>(() => undefined));
    render(
      <EventEditor
        mode="create"
        initial={initial}
        timeFormat="12h"
        snapMinutes={15}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const save = screen.getByLabelText("editor.saveAria");
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(dismissVirtualKeyboard).toHaveBeenCalledTimes(1);
  });

  it("asks how a new reminder should arrive before saving the event", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventEditor
        mode="create"
        initial={{ ...initial, reminderMinutes: 0 }}
        timeFormat="12h"
        snapMinutes={15}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("editor.saveAria"));
    expect(await screen.findByText("How should this reminder arrive?")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /alarm/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ reminderDelivery: "alarm" })),
    );
  });

  it("obtains Android notification and exact-alarm access before saving an alarm", async () => {
    isCapacitorNative.mockReturnValue(true);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventEditor
        mode="create"
        initial={{ ...initial, reminderMinutes: 0 }}
        timeFormat="12h"
        snapMinutes={15}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("editor.saveAria"));
    fireEvent.click(await screen.findByRole("button", { name: /alarm/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(requestExactNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it("dismisses the keyboard before leaving with the back button", async () => {
    const onCancel = vi.fn();
    render(
      <EventEditor
        mode="create"
        initial={initial}
        timeFormat="12h"
        snapMinutes={15}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByLabelText("common.back"));

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(dismissVirtualKeyboard).toHaveBeenCalledTimes(1);
  });

  it("asks only for AlarmKit access when the user selects a real iOS alarm", async () => {
    isCapacitorNative.mockReturnValue(true);
    isIosNative.mockReturnValue(true);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventEditor
        mode="create"
        initial={{ ...initial, reminderMinutes: 0 }}
        timeFormat="12h"
        snapMinutes={15}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("editor.saveAria"));
    fireEvent.click(await screen.findByRole("button", { name: /alarm/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(requestExactNotificationPermission).toHaveBeenCalledOnce();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("does not save an iOS alarm when AlarmKit is unavailable or unauthorized", async () => {
    isCapacitorNative.mockReturnValue(true);
    isIosNative.mockReturnValue(true);
    requestExactNotificationPermission.mockResolvedValue(false);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventEditor
        mode="create"
        initial={{ ...initial, reminderMinutes: 0 }}
        timeFormat="12h"
        snapMinutes={15}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("editor.saveAria"));
    fireEvent.click(await screen.findByRole("button", { name: /alarm/i }));
    await waitFor(() => expect(requestExactNotificationPermission).toHaveBeenCalledOnce());
    expect(onSave).not.toHaveBeenCalled();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });
});
