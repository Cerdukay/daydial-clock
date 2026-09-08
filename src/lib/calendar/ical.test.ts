import { describe, expect, it } from "vitest";
import { exportToICal } from "./ical";
import { parseICal } from "./ical-import";
import { makeEvent } from "@/lib/daydial/testing";
import type { EventException, PlannerEvent } from "@/lib/daydial/types";

// Use explicit UTC timestamps so tests are timezone-independent.
const SAMPLE_EVENT: PlannerEvent = {
  ...makeEvent("evt-1", "2026-03-15T09:30:00Z", "2026-03-15T10:00:00Z"),
  title: "Team standup",
  description: "Weekly sync",
  location: "Zoom",
  color: "cyan",
  category: "Work",
  calendarName: "Work",
  reminderMinutes: 10,
  repeat: "weekly",
};

const SAMPLE_EXCEPTIONS: EventException[] = [
  {
    id: "exc-1",
    eventId: "evt-1",
    originalStartAt: "2026-03-22T09:30:00.000Z",
    isCancelled: true,
    replacementStartAt: null,
    replacementEndAt: null,
  },
];

describe("exportToICal", () => {
  it("produces a valid VCALENDAR envelope", () => {
    const ics = exportToICal([SAMPLE_EVENT], []);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//DayDial//Radial Daily Planner//EN");
  });

  it("emits a VEVENT with the correct UID and timestamps", () => {
    const ics = exportToICal([SAMPLE_EVENT], []);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:evt-1@daydial.app");
    expect(ics).toContain("DTSTART:20260315T093000Z");
    expect(ics).toContain("DTEND:20260315T100000Z");
    expect(ics).toContain("END:VEVENT");
  });

  it("escapes special characters in text fields", () => {
    const event = makeEvent("e", "2026-03-15T09:00", "2026-03-15T10:00", {
      title: "A, B; C\\D\nNewline",
    });
    const ics = exportToICal([event], []);
    expect(ics).toContain("SUMMARY:A\\, B\\; C\\\\D\\nNewline");
  });

  it("maps repeat rules to RRULE", () => {
    const daily = makeEvent("d", "2026-03-15T09:00", "2026-03-15T09:30", {
      repeat: "daily",
    });
    expect(exportToICal([daily], [])).toContain("RRULE:FREQ=DAILY");

    const weekdays = makeEvent("w", "2026-03-15T09:00", "2026-03-15T09:30", {
      repeat: "weekdays",
    });
    expect(exportToICal([weekdays], [])).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");

    const monthly = makeEvent("m", "2026-03-15T09:00", "2026-03-15T09:30", {
      repeat: "monthly",
    });
    expect(exportToICal([monthly], [])).toContain("RRULE:FREQ=MONTHLY");
  });

  it("includes EXDATE for cancelled exceptions", () => {
    const ics = exportToICal([SAMPLE_EVENT], SAMPLE_EXCEPTIONS);
    expect(ics).toContain("EXDATE:20260322T093000Z");
  });

  it("marks completed events with STATUS:COMPLETED", () => {
    const event = makeEvent("c", "2026-03-15T09:00", "2026-03-15T10:00", {
      isCompleted: true,
    });
    expect(exportToICal([event], [])).toContain("STATUS:COMPLETED");
  });

  it("emits X-DAYDIAL-COLOR and X-DAYDIAL-CATEGORY", () => {
    const ics = exportToICal([SAMPLE_EVENT], []);
    expect(ics).toContain("X-DAYDIAL-COLOR:cyan");
    expect(ics).toContain("X-DAYDIAL-CATEGORY:Work");
  });

  it("produces no VEVENT blocks for an empty event list", () => {
    const ics = exportToICal([], []);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("parseICal (round-trip)", () => {
  it("parses an exported calendar back into EventDrafts", () => {
    const ics = exportToICal([SAMPLE_EVENT], []);
    const drafts = parseICal(ics);
    expect(drafts).toHaveLength(1);
    const [draft] = drafts;
    expect(draft!.title).toBe("Team standup");
    expect(draft!.description).toBe("Weekly sync");
    expect(draft!.location).toBe("Zoom");
    expect(draft!.color).toBe("cyan");
    expect(draft!.category).toBe("Work");
    expect(draft!.repeat).toBe("weekly");
  });

  it("unfolds multi-line property values", () => {
    const longTitle = "A".repeat(100);
    const event = makeEvent("e", "2026-03-15T09:00", "2026-03-15T10:00", {
      title: longTitle,
    });
    const ics = exportToICal([event], []);
    const drafts = parseICal(ics);
    expect(drafts[0]!.title).toBe(longTitle);
  });

  it("maps RRULE FREQ=DAILY back to repeat=daily", () => {
    const ics = exportToICal(
      [makeEvent("d", "2026-03-15T09:00", "2026-03-15T09:30", { repeat: "daily" })],
      [],
    );
    const drafts = parseICal(ics);
    expect(drafts[0]!.repeat).toBe("daily");
  });

  it("maps RRULE FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR back to repeat=weekdays", () => {
    const ics = exportToICal(
      [makeEvent("w", "2026-03-15T09:00", "2026-03-15T09:30", { repeat: "weekdays" })],
      [],
    );
    const drafts = parseICal(ics);
    expect(drafts[0]!.repeat).toBe("weekdays");
  });

  it("parses a minimal hand-written .ics", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      "BEGIN:VEVENT",
      "UID:test-1@daydial.app",
      "DTSTART:20260315T093000Z",
      "DTEND:20260315T100000Z",
      "SUMMARY:Hand-written event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const drafts = parseICal(ics);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.title).toBe("Hand-written event");
  });

  it("returns an empty array for content with no VEVENTs", () => {
    const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
    expect(parseICal(ics)).toEqual([]);
  });
});
