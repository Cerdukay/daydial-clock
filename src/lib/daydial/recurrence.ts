import { addDays, addMinutes, differenceInMinutes, endOfDay, isBefore, startOfDay } from "date-fns";
import type { EventException, PlannerEvent, RepeatRule } from "./types";

/** Separator between a series id and the ISO start of one occurrence. */
export const OCCURRENCE_SEPARATOR = "::";

export function makeOccurrenceId(eventId: string, originalStartAt: string): string {
  return `${eventId}${OCCURRENCE_SEPARATOR}${originalStartAt}`;
}

/** Splits an occurrence id back into its series id and original start. */
export function parseOccurrenceId(id: string): {
  baseId: string;
  originalStartAt: string | null;
} {
  const index = id.indexOf(OCCURRENCE_SEPARATOR);
  if (index === -1) return { baseId: id, originalStartAt: null };
  return {
    baseId: id.slice(0, index),
    originalStartAt: id.slice(index + OCCURRENCE_SEPARATOR.length),
  };
}

export function isOccurrenceId(id: string): boolean {
  return id.includes(OCCURRENCE_SEPARATOR);
}

function exceptionKey(eventId: string, originalStartAt: string): string {
  return `${eventId}|${new Date(originalStartAt).toISOString()}`;
}

/** Index exceptions for O(1) lookup while expanding. */
export function indexExceptions(exceptions: EventException[]): Map<string, EventException> {
  const map = new Map<string, EventException>();
  for (const exception of exceptions) {
    map.set(exceptionKey(exception.eventId, exception.originalStartAt), exception);
  }
  return map;
}

/** Does the rule place an occurrence on `day` (calendar day, local time)? */
export function ruleMatchesDay(rule: RepeatRule, seriesStart: Date, day: Date): boolean {
  const target = startOfDay(day);
  const first = startOfDay(seriesStart);
  if (isBefore(target, first)) return false;
  switch (rule) {
    case "daily":
      return true;
    case "weekdays": {
      const weekday = target.getDay();
      return weekday >= 1 && weekday <= 5;
    }
    case "weekly":
      return target.getDay() === first.getDay();
    case "biweekly": {
      // Every 2 weeks: same weekday, and an even number of weeks since start.
      if (target.getDay() !== first.getDay()) return false;
      const diffDays = Math.round((target.getTime() - first.getTime()) / 86400000);
      return diffDays % 14 === 0;
    }
    case "monthly":
      return target.getDate() === first.getDate();
    case "annually":
      return target.getDate() === first.getDate() && target.getMonth() === first.getMonth();
    case "none":
    default:
      return target.getTime() === first.getTime();
  }
}

/** Builds the concrete occurrence of `base` that starts on `day`. */
function buildOccurrence(base: PlannerEvent, day: Date): PlannerEvent {
  const seriesStart = new Date(base.startAt);
  const duration = Math.max(1, differenceInMinutes(new Date(base.endAt), seriesStart));
  const minutesIntoDay = seriesStart.getHours() * 60 + seriesStart.getMinutes();
  const start = addMinutes(startOfDay(day), minutesIntoDay);
  const originalStartAt = start.toISOString();
  return {
    ...base,
    id: makeOccurrenceId(base.id, originalStartAt),
    seriesId: base.id,
    occurrenceStartAt: originalStartAt,
    startAt: originalStartAt,
    endAt: addMinutes(start, duration).toISOString(),
  };
}

/** Applies a stored exception, returning null when the occurrence is cancelled. */
function applyException(
  occurrence: PlannerEvent,
  exceptions: Map<string, EventException>,
): PlannerEvent | null {
  const exception = exceptions.get(
    exceptionKey(
      occurrence.seriesId ?? occurrence.id,
      occurrence.occurrenceStartAt ?? occurrence.startAt,
    ),
  );
  if (!exception) return occurrence;
  if (exception.isCancelled) return null;
  if (!exception.replacementStartAt) return occurrence;
  const start = new Date(exception.replacementStartAt);
  const duration = exception.replacementEndAt
    ? differenceInMinutes(new Date(exception.replacementEndAt), start)
    : differenceInMinutes(new Date(occurrence.endAt), new Date(occurrence.startAt));
  return {
    ...occurrence,
    startAt: start.toISOString(),
    endAt: addMinutes(start, Math.max(1, duration)).toISOString(),
  };
}

function withinSeriesEnd(base: PlannerEvent, day: Date): boolean {
  // End-by-date: stop after the repeatUntil day.
  if (base.repeatUntil) {
    return startOfDay(day).getTime() <= startOfDay(new Date(base.repeatUntil)).getTime();
  }
  // End-by-count: stop after N occurrences from the series start.
  if (base.repeatCount > 0) {
    const first = startOfDay(new Date(base.startAt));
    const target = startOfDay(day);
    if (isBefore(target, first)) return false;
    let count = 0;
    for (let d = new Date(first); d <= target; d = addDays(d, 1)) {
      if (ruleMatchesDay(base.repeat, new Date(base.startAt), d)) count++;
    }
    return count <= base.repeatCount;
  }
  return true;
}

/**
 * Expands recurring events into concrete instances that overlap the given
 * calendar day. Non-repeating events pass through unchanged.
 */
export function expandDay(
  events: PlannerEvent[],
  exceptions: EventException[],
  day: Date,
): PlannerEvent[] {
  return expandDayWithIndex(events, indexExceptions(exceptions), day);
}

/** Expands every day in an inclusive range (used for month dots). */
export function expandRange(
  events: PlannerEvent[],
  exceptions: EventException[],
  from: Date,
  to: Date,
): PlannerEvent[] {
  // Build the exception index ONCE for the entire range, instead of
  // rebuilding it for every day inside expandDay.
  const index = indexExceptions(exceptions);
  const seen = new Set<string>();
  const result: PlannerEvent[] = [];
  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    for (const item of expandDayWithIndex(events, index, day)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

/** Internal: expandDay with a pre-built exception index. */
function expandDayWithIndex(
  events: PlannerEvent[],
  index: Map<string, EventException>,
  day: Date,
): PlannerEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const result: PlannerEvent[] = [];

  for (const base of events) {
    if (base.repeat === "none") {
      if (new Date(base.endAt) > dayStart && new Date(base.startAt) <= dayEnd) {
        result.push(base);
      }
      continue;
    }
    const seriesStart = new Date(base.startAt);
    for (const candidate of [addDays(dayStart, -1), dayStart]) {
      if (!withinSeriesEnd(base, candidate)) continue;
      if (!ruleMatchesDay(base.repeat, seriesStart, candidate)) continue;
      const occurrence = applyException(buildOccurrence(base, candidate), index);
      if (!occurrence) continue;
      if (new Date(occurrence.endAt) <= dayStart) continue;
      if (new Date(occurrence.startAt) > dayEnd) continue;
      result.push(occurrence);
    }
  }

  return result.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

/** Materializes a single instance (or plain event) from an id. */
export function resolveInstance(
  id: string,
  events: PlannerEvent[],
  exceptions: EventException[],
): PlannerEvent | undefined {
  const { baseId, originalStartAt } = parseOccurrenceId(id);
  const base = events.find((event) => event.id === baseId);
  if (!base) return undefined;
  if (!originalStartAt) return base;
  const occurrence = buildOccurrence(base, new Date(originalStartAt));
  return applyException(occurrence, indexExceptions(exceptions)) ?? undefined;
}
