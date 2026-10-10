import type { PlannerEvent } from "./types";

/** Minimal PlannerEvent factory for algorithm tests. */
export function makeEvent(
  id: string,
  start: string,
  end: string,
  overrides: Partial<PlannerEvent> = {},
): PlannerEvent {
  return {
    id,
    title: overrides.title ?? `Event ${id}`,
    description: "",
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    color: "cyan",
    category: "Personal",
    calendarName: "Personal",
    location: "",
    notes: "",
    reminderMinutes: 0,
    reminderDelivery: "notification",
    repeat: "none",

    isCompleted: false,
    laneMode: "auto",
    manualLane: null,
    ...overrides,
    repeatUntil: overrides.repeatUntil ?? null,
    repeatCount: overrides.repeatCount ?? 0,
  };
}

export const DAY = new Date("2026-03-15T00:00:00");

/** `2026-03-15T09:30` style local timestamp for the shared test day. */
export function at(time: string): string {
  return `2026-03-15T${time}:00`;
}
