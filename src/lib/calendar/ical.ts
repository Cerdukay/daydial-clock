/**
 * RFC 5545 iCalendar (.ics) export for DayDial events.
 *
 * Converts PlannerEvent[] + EventException[] into a VCALENDAR with VEVENT
 * entries, including RRULE for repeating events and EXDATE for cancelled
 * occurrences.
 */

import type { EventException, PlannerEvent, RepeatRule } from "@/lib/daydial/types";

/** Format a Date as an iCal UTC timestamp: 20260315T093000Z */
function formatICalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

/** Escape text per RFC 5545 §3.3.11. */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Map DayDial repeat rule to iCal RRULE. */
function repeatToRRule(
  repeat: RepeatRule,
  repeatUntil: string | null,
  repeatCount: number,
): string | null {
  switch (repeat) {
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly":
      return "FREQ=WEEKLY";
    case "biweekly":
      return "FREQ=WEEKLY;INTERVAL=2";
    case "monthly":
      return "FREQ=MONTHLY";
    case "annually":
      return "FREQ=YEARLY";
    case "none":
    default:
      return null;
  }
}

/** Fold long lines per RFC 5545 §3.1 (max 75 octets per line). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(" " + remaining.slice(0, 73));
    remaining = remaining.slice(73);
  }
  return chunks.join("\r\n");
}

/** Build a single VEVENT block. */
function buildVEvent(event: PlannerEvent, exceptions: EventException[]): string[] {
  const lines: string[] = [];
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${event.id}@daydial.app`);
  lines.push(`DTSTAMP:${formatICalDate(new Date())}`);
  lines.push(`DTSTART:${formatICalDate(start)}`);
  lines.push(`DTEND:${formatICalDate(end)}`);
  lines.push(`SUMMARY:${escapeICalText(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  // Color — non-standard property
  lines.push(`X-DAYDIAL-COLOR:${event.color}`);
  lines.push(`X-DAYDIAL-CATEGORY:${event.category}`);

  // Completion status
  if (event.isCompleted) {
    lines.push("STATUS:COMPLETED");
  }

  // Recurrence rule
  const rrule = repeatToRRule(event.repeat, event.repeatUntil, event.repeatCount);
  if (rrule) {
    let ruleLine = `RRULE:${rrule}`;
    if (event.repeatUntil) {
      ruleLine += `;UNTIL=${formatICalDate(new Date(event.repeatUntil))}`;
    } else if (event.repeatCount > 0) {
      ruleLine += `;COUNT=${event.repeatCount}`;
    }
    lines.push(ruleLine);
  }

  // Cancelled occurrences → EXDATE
  const cancelledDates = exceptions
    .filter((ex) => ex.eventId === event.id && ex.isCancelled)
    .map((ex) => formatICalDate(new Date(ex.originalStartAt)));
  if (cancelledDates.length > 0) {
    lines.push(`EXDATE:${cancelledDates.join(",")}`);
  }

  // Moved occurrences → separate VEVENTs with RECURRENCE-ID would be ideal,
  // but for a simple export we include them as EXDATE + new VEVENTs.
  const movedExceptions = exceptions.filter(
    (ex) => ex.eventId === event.id && !ex.isCancelled && ex.replacementStartAt,
  );
  for (const ex of movedExceptions) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}-${formatICalDate(new Date(ex.originalStartAt))}@daydial.app`);
    lines.push(`RECURRENCE-ID:${formatICalDate(new Date(ex.originalStartAt))}`);
    lines.push(`DTSTART:${formatICalDate(new Date(ex.replacementStartAt!))}`);
    lines.push(`DTEND:${formatICalDate(new Date(ex.replacementEndAt ?? ex.replacementStartAt!))}`);
    lines.push(`SUMMARY:${escapeICalText(event.title)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Generate a complete .ics file string from DayDial events.
 *
 * @param events    The planner events to export.
 * @param exceptions Per-occurrence overrides/cancellations for repeating events.
 * @returns         A valid iCalendar string.
 */
export function exportToICal(events: PlannerEvent[], exceptions: EventException[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DayDial//Radial Daily Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    lines.push(...buildVEvent(event, exceptions));
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n");
}

/**
 * Trigger a browser download of the .ics file.
 * In Capacitor, use the Share plugin instead.
 */
export function downloadICal(filename: string, icsContent: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
