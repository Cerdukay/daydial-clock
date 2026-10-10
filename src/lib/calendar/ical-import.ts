/**
 * Minimal RFC 5545 iCalendar (.ics) parser for Arcelira import.
 *
 * Extracts VEVENT entries and maps them to EventDraft objects. Handles
 * DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION, RRULE, and EXDATE.
 *
 * This is a lightweight parser — it covers the common cases produced by
 * Google Calendar, Apple Calendar, and Arcelira's own export. It is not a
 * full RFC 5545 implementation.
 */

import type { Category, EventColor, EventDraft, RepeatRule } from "@/lib/daydial/types";

interface ParsedVEvent {
  uid?: string;
  dtstart?: string;
  dtend?: string;
  summary?: string;
  description?: string;
  location?: string;
  rrule?: string;
  exdate?: string[];
  "x-daydial-color"?: string;
  "x-daydial-category"?: string;
  status?: string;
}

/** Parse an iCal date-time value (20260315T093000Z or 20260315T093000). */
function parseICalDate(value: string): string | undefined {
  // Strip any timezone prefix (e.g., TZID=America/New_York:)
  const cleaned = value.includes(":") ? value.split(":").pop()! : value;
  // Format: YYYYMMDDTHHMMSS[Z]
  const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
  );
  return date.toISOString();
}

/** Map iCal RRULE FREQ to Arcelira RepeatRule. */
function rruleToRepeat(rrule: string): {
  repeat: RepeatRule;
  repeatUntil: string | null;
  repeatCount: number;
} {
  const upper = rrule.toUpperCase();
  const until = extractUntil(upper);
  const count = extractCount(upper);
  if (upper.includes("FREQ=DAILY")) {
    if (upper.includes("BYDAY=MO,TU,WE,TH,FR")) {
      return { repeat: "weekdays", repeatUntil: until, repeatCount: count };
    }
    return { repeat: "daily", repeatUntil: until, repeatCount: count };
  }
  if (upper.includes("FREQ=WEEKLY")) {
    if (upper.includes("BYDAY=MO,TU,WE,TH,FR")) {
      return { repeat: "weekdays", repeatUntil: until, repeatCount: count };
    }
    if (upper.includes("INTERVAL=2")) {
      return { repeat: "biweekly", repeatUntil: until, repeatCount: count };
    }
    return { repeat: "weekly", repeatUntil: until, repeatCount: count };
  }
  if (upper.includes("FREQ=MONTHLY")) {
    return { repeat: "monthly", repeatUntil: until, repeatCount: count };
  }
  if (upper.includes("FREQ=YEARLY")) {
    return { repeat: "annually", repeatUntil: until, repeatCount: count };
  }
  return { repeat: "none", repeatUntil: null, repeatCount: 0 };
}

function extractUntil(rrule: string): string | null {
  const match = rrule.match(/UNTIL=(\d{8}T\d{6}Z?)/);
  if (!match) return null;
  return parseICalDate(match[1]!) ?? null;
}

function extractCount(rrule: string): number {
  const match = rrule.match(/COUNT=(\d+)/);
  if (!match) return 0;
  return parseInt(match[1]!, 10) || 0;
}

/** Unfold iCal lines (RFC 5545 §3.1: continuation lines start with space/tab). */
function unfoldLines(content: string): string[] {
  const rawLines = content.split(/\r\n|\n|\r/);
  const unfolded: string[] = [];
  for (const line of rawLines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (unfolded.length > 0) {
        unfolded[unfolded.length - 1] += line.slice(1);
      }
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

/** Parse a property line into { key, params, value }. */
function parsePropertyLine(line: string): { key: string; value: string } {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return { key: "", value: "" };
  const before = line.slice(0, colonIdx).toUpperCase();
  const value = line.slice(colonIdx + 1);
  // Strip parameters (e.g., DTSTART;TZID=UTC:20260315T...)
  const semiIdx = before.indexOf(";");
  const key = semiIdx === -1 ? before : before.slice(0, semiIdx);
  return { key, value };
}

/** Parse .ics content into EventDraft[] for import. */
export function parseICal(content: string): EventDraft[] {
  const lines = unfoldLines(content);
  const drafts: EventDraft[] = [];
  let inVEvent = false;
  let current: ParsedVEvent = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inVEvent = true;
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (inVEvent && current.dtstart && current.dtend) {
        const { repeat, repeatUntil, repeatCount } = current.rrule
          ? rruleToRepeat(current.rrule)
          : { repeat: "none" as RepeatRule, repeatUntil: null, repeatCount: 0 };

        const color = (current["x-daydial-color"] as EventColor) ?? "cyan";
        const category = (current["x-daydial-category"] as Category) ?? "Personal";

        drafts.push({
          title: current.summary ?? "Untitled event",
          description: current.description ?? "",
          startAt: current.dtstart,
          endAt: current.dtend,
          color,
          category,
          calendarName: "Personal",
          location: current.location ?? "",
          notes: "",
          reminderMinutes: -1,
          reminderDelivery: "notification",
          repeat,
          repeatUntil,
          repeatCount,
          isCompleted: current.status === "COMPLETED",
          laneMode: "auto",
          manualLane: null,
        });
      }
      inVEvent = false;
      current = {};
      continue;
    }
    if (!inVEvent) continue;

    const { key, value } = parsePropertyLine(line);
    if (!key) continue;

    // Unescape text per RFC 5545 §3.3.11
    const unescaped = value
      .replace(/\\n/g, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");

    switch (key) {
      case "UID":
        current.uid = unescaped;
        break;
      case "DTSTART":
        current.dtstart = parseICalDate(value);
        break;
      case "DTEND":
        current.dtend = parseICalDate(value);
        break;
      case "SUMMARY":
        current.summary = unescaped;
        break;
      case "DESCRIPTION":
        current.description = unescaped;
        break;
      case "LOCATION":
        current.location = unescaped;
        break;
      case "RRULE":
        current.rrule = value;
        break;
      case "EXDATE":
        current.exdate = (current.exdate ?? []).concat(value.split(","));
        break;
      case "STATUS":
        current.status = value;
        break;
      case "X-DAYDIAL-COLOR":
        current["x-daydial-color"] = value.toLowerCase();
        break;
      case "X-DAYDIAL-CATEGORY":
        current["x-daydial-category"] = value;
        break;
    }
  }

  return drafts;
}
