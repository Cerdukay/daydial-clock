import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { computeReminders } from "./guest-reminders";
import { makeEvent } from "@/lib/daydial/testing";
import type { PlannerEvent } from "@/lib/daydial/types";

// Use a fixed "now" so the 24h lookahead window is deterministic.
const NOW = new Date("2026-03-15T08:00:00");

function eventInFuture(
  id: string,
  minutesFromNow: number,
  reminderMinutes: number,
  overrides: Partial<PlannerEvent> = {},
): PlannerEvent {
  const start = new Date(NOW.getTime() + minutesFromNow * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return makeEvent(id, start.toISOString(), end.toISOString(), {
    reminderMinutes,
    ...overrides,
  });
}

describe("computeReminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a reminder for an event with a positive reminder offset", () => {
    const event = eventInFuture("a", 120, 15); // starts in 2h, remind 15min before
    const reminders = computeReminders([event]);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.eventId).toBe("a");
    // Fire time = start - 15min = now + 120min - 15min = now + 105min
    expect(reminders[0]!.fireAt).toBe(NOW.getTime() + 105 * 60 * 1000);
  });

  it("schedules a reminder at start time when minutesBefore is 0", () => {
    const event = eventInFuture("a", 60, 0);
    const reminders = computeReminders([event]);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.fireAt).toBe(NOW.getTime() + 60 * 60 * 1000);
  });

  it("skips events with no reminder (reminderMinutes = -1)", () => {
    const event = eventInFuture("a", 60, -1);
    expect(computeReminders([event])).toHaveLength(0);
  });

  it("skips completed events", () => {
    const event = eventInFuture("a", 60, 15, { isCompleted: true });
    expect(computeReminders([event])).toHaveLength(0);
  });

  it("skips reminders that are already in the past", () => {
    // Event starts in 10 min, reminder was 15 min before → fire time is 5 min ago
    const event = eventInFuture("a", 10, 15);
    expect(computeReminders([event])).toHaveLength(0);
  });

  it("skips reminders beyond the 24h lookahead window", () => {
    // Event starts in 25h, reminder 15min before → fire time is ~24h45m ahead
    const event = eventInFuture("a", 25 * 60, 15);
    expect(computeReminders([event])).toHaveLength(0);
  });

  it("handles multiple events with different reminder offsets", () => {
    const events = [
      eventInFuture("a", 30, 5), // fire at now+25min
      eventInFuture("b", 120, 15), // fire at now+105min
      eventInFuture("c", 60, -1), // no reminder
    ];
    const reminders = computeReminders(events);
    expect(reminders).toHaveLength(2);
    expect(reminders.map((r) => r.eventId).sort()).toEqual(["a", "b"]);
  });

  it("includes the event title in the reminder", () => {
    const event = eventInFuture("a", 60, 10, { title: "Team standup" });
    const [reminder] = computeReminders([event]);
    expect(reminder!.title).toBe("Team standup");
  });

  it("falls back to a default title for untitled events", () => {
    const event = eventInFuture("a", 60, 10, { title: "" });
    const [reminder] = computeReminders([event]);
    expect(reminder!.title).toBe("Upcoming event");
  });
});
