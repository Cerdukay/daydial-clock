// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerEvent } from "@/lib/daydial/types";
import { RadialClock } from "./RadialClock";

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    language: "en",
    dateLocale: undefined,
    t: (key: string) => key,
  }),
}));

const day = new Date(2026, 7, 24);
const event: PlannerEvent = {
  id: "event-1",
  title: "Android QA",
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

describe("RadialClock interrupted gestures", () => {
  afterEach(cleanup);

  it("cancels a partial Android gesture without committing it", () => {
    Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
      configurable: true,
      value: () => null,
    });
    const onCommit = vi.fn();
    const onDraggingChange = vi.fn();
    const { container } = render(
      <RadialClock
        day={day}
        events={[event]}
        activeId={event.id}
        onCommit={onCommit}
        onDraggingChange={onDraggingChange}
      />,
    );
    const arc = container.querySelector('path[data-arc="true"]');
    expect(arc).not.toBeNull();

    fireEvent.pointerDown(arc!);
    fireEvent.pointerMove(document, { clientX: 20, clientY: 20 });
    fireEvent.pointerCancel(document);

    expect(onDraggingChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("clears a drag when Android backgrounds the WebView", () => {
    const onDraggingChange = vi.fn();
    const { container } = render(
      <RadialClock
        day={day}
        events={[event]}
        activeId={event.id}
        onDraggingChange={onDraggingChange}
      />,
    );
    const arc = container.querySelector('path[data-arc="true"]');

    fireEvent.pointerDown(arc!);
    fireEvent.blur(window);

    expect(onDraggingChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });
});
