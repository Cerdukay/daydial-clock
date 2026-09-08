import { describe, expect, it } from "vitest";
import { parseICal } from "./ical-import";
import { exportToICal } from "./ical";
import { makeEvent } from "@/lib/daydial/testing";

/** Join lines with CRLF (RFC 5545 line delimiter). */
function icsLines(...lines: string[]): string {
  return lines.join("\r\n");
}

describe("parseICal", () => {
  // ---------------------------------------------------------------------------
  // 1. Basic VEVENT parsing
  // ---------------------------------------------------------------------------
  describe("basic VEVENT parsing", () => {
    it("parses a single event with SUMMARY, DTSTART, DTEND", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Test//EN",
        "BEGIN:VEVENT",
        "UID:evt-1@daydial.app",
        "DTSTART:20260315T093000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Morning standup",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      const [draft] = drafts;
      expect(draft!.title).toBe("Morning standup");
      expect(draft!.startAt).toBe("2026-03-15T09:30:00.000Z");
      expect(draft!.endAt).toBe("2026-03-15T10:00:00.000Z");
    });

    it("uses 'Untitled event' when SUMMARY is missing", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:evt-2@daydial.app",
        "DTSTART:20260315T093000Z",
        "DTEND:20260315T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("Untitled event");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Multiple events
  // ---------------------------------------------------------------------------
  describe("multiple events", () => {
    it("parses a calendar with 3 events", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Test//EN",
        "BEGIN:VEVENT",
        "UID:e1@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:First",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:e2@daydial.app",
        "DTSTART:20260315T100000Z",
        "DTEND:20260315T110000Z",
        "SUMMARY:Second",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:e3@daydial.app",
        "DTSTART:20260315T140000Z",
        "DTEND:20260315T150000Z",
        "SUMMARY:Third",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(3);
      expect(drafts.map((d) => d.title)).toEqual(["First", "Second", "Third"]);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. VCALENDAR envelope
  // ---------------------------------------------------------------------------
  describe("VCALENDAR envelope", () => {
    it("handles proper BEGIN/END VCALENDAR wrapping", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Test//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Test",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("Test");
    });

    it("parses VEVENTs even without a VCALENDAR wrapper (lenient)", () => {
      const content = icsLines(
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:No wrapper",
        "END:VEVENT",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("No wrapper");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Line folding
  // ---------------------------------------------------------------------------
  describe("line folding", () => {
    it("unfolds lines folded with CRLF + space", () => {
      // RFC 5545 §3.1: continuation lines start with a single whitespace
      // character that is removed during unfolding.
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:This is a very long title that exceeds the seventy five octet limit and gets",
        " foldedacrossmultiplelines",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      // The leading space on the continuation line is the fold marker and
      // is stripped during unfolding.
      expect(drafts[0]!.title).toBe(
        "This is a very long title that exceeds the seventy five octet limit and getsfoldedacrossmultiplelines",
      );
    });

    it("unfolds lines folded with CRLF + tab", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Tab folded",
        "\tcontinuation",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.title).toBe("Tab foldedcontinuation");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. DTSTART with timezone (TZID)
  // ---------------------------------------------------------------------------
  describe("DTSTART with timezone", () => {
    it("strips TZID prefix and treats time as UTC", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART;TZID=America/New_York:20260315T093000",
        "DTEND;TZID=America/New_York:20260315T100000",
        "SUMMARY:TZID event",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.startAt).toBe("2026-03-15T09:30:00.000Z");
      expect(drafts[0]!.endAt).toBe("2026-03-15T10:00:00.000Z");
    });

    it("handles TZID=UTC prefix", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART;TZID=UTC:20260315T093000",
        "DTEND;TZID=UTC:20260315T100000",
        "SUMMARY:UTC TZID",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.startAt).toBe("2026-03-15T09:30:00.000Z");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. DTSTART UTC (Z suffix)
  // ---------------------------------------------------------------------------
  describe("DTSTART UTC (Z suffix)", () => {
    it("parses Z-suffix timestamps as UTC", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T093000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:UTC event",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.startAt).toBe("2026-03-15T09:30:00.000Z");
      expect(drafts[0]!.endAt).toBe("2026-03-15T10:00:00.000Z");
    });

    it("treats non-Z (floating) timestamps as UTC", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T093000",
        "DTEND:20260315T100000",
        "SUMMARY:Floating",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.startAt).toBe("2026-03-15T09:30:00.000Z");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. All-day events (VALUE=DATE)
  // ---------------------------------------------------------------------------
  describe("all-day events (VALUE=DATE)", () => {
    it("skips all-day events with date-only values (not supported by lightweight parser)", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:allday@daydial.app",
        "DTSTART;VALUE=DATE:20260315",
        "DTEND;VALUE=DATE:20260316",
        "SUMMARY:All day event",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      // The parser only handles date-time values (YYYYMMDDTHHMMSS[Z]),
      // not date-only values (YYYYMMDD), so the event is dropped.
      expect(drafts).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. RRULE parsing
  // ---------------------------------------------------------------------------
  describe("RRULE parsing", () => {
    it("maps FREQ=DAILY to repeat=daily", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Daily",
        "RRULE:FREQ=DAILY",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("daily");
      expect(drafts[0]!.repeatUntil).toBeNull();
    });

    it("maps FREQ=WEEKLY to repeat=weekly", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Weekly",
        "RRULE:FREQ=WEEKLY",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("weekly");
    });

    it("maps FREQ=MONTHLY to repeat=monthly", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Monthly",
        "RRULE:FREQ=MONTHLY",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("monthly");
    });

    it("maps FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR to repeat=weekdays", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Weekdays",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("weekdays");
    });

    it("maps FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR to repeat=weekdays", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Daily weekdays",
        "RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("weekdays");
    });

    it("extracts UNTIL date from RRULE", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Daily until",
        "RRULE:FREQ=DAILY;UNTIL=20260320T090000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("daily");
      expect(drafts[0]!.repeatUntil).toBe("2026-03-20T09:00:00.000Z");
    });

    it("returns repeat=none for unrecognized FREQ", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Unknown",
        "RRULE:FREQ=HOURLY",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("none");
      expect(drafts[0]!.repeatUntil).toBeNull();
    });

    it("maps FREQ=YEARLY to repeat=annually", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Yearly",
        "RRULE:FREQ=YEARLY",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("annually");
    });

    it("maps FREQ=WEEKLY;INTERVAL=2 to repeat=biweekly", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Biweekly",
        "RRULE:FREQ=WEEKLY;INTERVAL=2",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("biweekly");
    });

    it("extracts COUNT from RRULE", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Counted",
        "RRULE:FREQ=DAILY;COUNT=5",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.repeat).toBe("daily");
      expect(drafts[0]!.repeatCount).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. EXDATE parsing
  // ---------------------------------------------------------------------------
  describe("EXDATE parsing", () => {
    it("parses an event with EXDATE without crashing", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:With exceptions",
        "RRULE:FREQ=DAILY",
        "EXDATE:20260316T090000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("With exceptions");
      expect(drafts[0]!.repeat).toBe("daily");
    });

    it("handles multiple comma-separated EXDATE values", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Multiple exceptions",
        "RRULE:FREQ=DAILY",
        "EXDATE:20260316T090000Z,20260317T090000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("Multiple exceptions");
    });

    it("handles multiple EXDATE lines", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T093000Z",
        "SUMMARY:Multi-line exceptions",
        "RRULE:FREQ=DAILY",
        "EXDATE:20260316T090000Z",
        "EXDATE:20260318T090000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. DESCRIPTION and LOCATION
  // ---------------------------------------------------------------------------
  describe("DESCRIPTION and LOCATION", () => {
    it("parses DESCRIPTION and LOCATION fields", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Meeting",
        "DESCRIPTION:Quarterly review meeting",
        "LOCATION:Conference Room A",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.description).toBe("Quarterly review meeting");
      expect(drafts[0]!.location).toBe("Conference Room A");
    });

    it("unescapes \\n in DESCRIPTION to newlines", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Meeting",
        "DESCRIPTION:Line one\\nLine two",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.description).toBe("Line one\nLine two");
    });

    it("unescapes \\, and \\; in text fields", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:A\\, B\\; C",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.title).toBe("A, B; C");
    });

    it("unescapes \\\\ (double backslash) to a single backslash", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Path\\\\to\\folder",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.title).toBe("Path\\to\\folder");
    });

    it("defaults description and location to empty strings", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:No extras",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.description).toBe("");
      expect(drafts[0]!.location).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // X-DAYDIAL custom properties
  // ---------------------------------------------------------------------------
  describe("X-DAYDIAL properties", () => {
    it("parses X-DAYDIAL-COLOR and X-DAYDIAL-CATEGORY", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Colored",
        "X-DAYDIAL-COLOR:pink",
        "X-DAYDIAL-CATEGORY:Work",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.color).toBe("pink");
      expect(drafts[0]!.category).toBe("Work");
    });

    it("defaults color to cyan and category to Personal", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Default colors",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.color).toBe("cyan");
      expect(drafts[0]!.category).toBe("Personal");
    });
  });

  // ---------------------------------------------------------------------------
  // STATUS / completion
  // ---------------------------------------------------------------------------
  describe("STATUS / completion", () => {
    it("marks event as completed when STATUS:COMPLETED", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Done",
        "STATUS:COMPLETED",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.isCompleted).toBe(true);
    });

    it("defaults isCompleted to false", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Not done",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts[0]!.isCompleted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Empty / malformed input
  // ---------------------------------------------------------------------------
  describe("empty / malformed input", () => {
    it("returns empty array for empty string", () => {
      expect(parseICal("")).toEqual([]);
    });

    it("returns empty array for random text with no VEVENTs", () => {
      expect(parseICal("just some random text")).toEqual([]);
    });

    it("returns empty array for VCALENDAR with no VEVENTs", () => {
      const content = icsLines("BEGIN:VCALENDAR", "VERSION:2.0", "END:VCALENDAR");
      expect(parseICal(content)).toEqual([]);
    });

    it("skips VEVENT without DTSTART and DTEND", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "SUMMARY:No dates",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      expect(parseICal(content)).toEqual([]);
    });

    it("skips VEVENT with only DTSTART (no DTEND)", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "SUMMARY:Only start",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      expect(parseICal(content)).toEqual([]);
    });

    it("ignores malformed lines without a colon inside VEVENT", () => {
      const content = icsLines(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:Malformed",
        "this line has no colon",
        "END:VEVENT",
        "END:VCALENDAR",
      );
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("Malformed");
    });

    it("handles LF-only line endings", () => {
      const content = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:LF only",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n");
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("LF only");
    });

    it("handles CR-only line endings", () => {
      const content = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:e@daydial.app",
        "DTSTART:20260315T090000Z",
        "DTEND:20260315T100000Z",
        "SUMMARY:CR only",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r");
      const drafts = parseICal(content);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe("CR only");
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Import → Export round-trip
  // ---------------------------------------------------------------------------
  describe("import → export round-trip", () => {
    it("preserves key fields through export then re-import", () => {
      const event = makeEvent("rt-1", "2026-03-15T09:30:00Z", "2026-03-15T10:00:00Z", {
        title: "Round trip",
        description: "Test description",
        location: "Test location",
        color: "green",
        category: "Work",
        repeat: "weekly",
      });
      const exported = exportToICal([event], []);
      const drafts = parseICal(exported);
      expect(drafts).toHaveLength(1);
      const [draft] = drafts;
      expect(draft!.title).toBe("Round trip");
      expect(draft!.description).toBe("Test description");
      expect(draft!.location).toBe("Test location");
      expect(draft!.color).toBe("green");
      expect(draft!.category).toBe("Work");
      expect(draft!.repeat).toBe("weekly");
      expect(draft!.startAt).toBe("2026-03-15T09:30:00.000Z");
      expect(draft!.endAt).toBe("2026-03-15T10:00:00.000Z");
    });

    it("preserves repeat=daily through round-trip", () => {
      const event = makeEvent("rt-2", "2026-03-15T09:00:00Z", "2026-03-15T09:30:00Z", {
        repeat: "daily",
      });
      const drafts = parseICal(exportToICal([event], []));
      expect(drafts[0]!.repeat).toBe("daily");
    });

    it("preserves repeat=weekdays through round-trip", () => {
      const event = makeEvent("rt-3", "2026-03-15T09:00:00Z", "2026-03-15T09:30:00Z", {
        repeat: "weekdays",
      });
      const drafts = parseICal(exportToICal([event], []));
      expect(drafts[0]!.repeat).toBe("weekdays");
    });

    it("preserves repeat=monthly through round-trip", () => {
      const event = makeEvent("rt-4", "2026-03-15T09:00:00Z", "2026-03-15T09:30:00Z", {
        repeat: "monthly",
      });
      const drafts = parseICal(exportToICal([event], []));
      expect(drafts[0]!.repeat).toBe("monthly");
    });

    it("preserves isCompleted through round-trip", () => {
      const event = makeEvent("rt-5", "2026-03-15T09:00:00Z", "2026-03-15T10:00:00Z", {
        isCompleted: true,
      });
      const drafts = parseICal(exportToICal([event], []));
      expect(drafts[0]!.isCompleted).toBe(true);
    });

    it("preserves escaped special characters through round-trip", () => {
      const event = makeEvent("rt-6", "2026-03-15T09:00:00Z", "2026-03-15T10:00:00Z", {
        title: "A, B; C\\D",
        description: "Line1\nLine2",
      });
      const drafts = parseICal(exportToICal([event], []));
      expect(drafts[0]!.title).toBe("A, B; C\\D");
      expect(drafts[0]!.description).toBe("Line1\nLine2");
    });

    it("preserves multiple events through round-trip", () => {
      const events = [
        makeEvent("rt-a", "2026-03-15T09:00:00Z", "2026-03-15T10:00:00Z", { title: "A" }),
        makeEvent("rt-b", "2026-03-15T11:00:00Z", "2026-03-15T12:00:00Z", { title: "B" }),
        makeEvent("rt-c", "2026-03-15T14:00:00Z", "2026-03-15T15:00:00Z", { title: "C" }),
      ];
      const drafts = parseICal(exportToICal(events, []));
      expect(drafts).toHaveLength(3);
      expect(drafts.map((d) => d.title)).toEqual(["A", "B", "C"]);
    });
  });
});
