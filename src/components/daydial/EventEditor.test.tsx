// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDraft } from "@/lib/daydial/types";
import { EventEditor } from "./EventEditor";

const { radialRender, dismissVirtualKeyboard } = vi.hoisted(() => ({
  radialRender: vi.fn(() => null),
  dismissVirtualKeyboard: vi.fn(() => Promise.resolve()),
}));

vi.mock("./RadialClock", () => ({
  RadialClock: radialRender,
}));

vi.mock("@/lib/daydial/keyboard", () => ({
  dismissVirtualKeyboard,
}));

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
});
