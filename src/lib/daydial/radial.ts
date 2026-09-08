import { addDays, differenceInMinutes, endOfDay, isSameDay, startOfDay } from "date-fns";
import { MAX_VISIBLE_LANES } from "./geometry";
import type { PlannerEvent } from "./types";

export const MINUTES_PER_TURN = 720; // 12 hours = one full revolution

/** Convert minutes-from-12-o'clock into an SVG angle (0deg = 12 o'clock, clockwise). */
export function minutesToAngle(minutes: number): number {
  return ((minutes % MINUTES_PER_TURN) / MINUTES_PER_TURN) * 360;
}

/** Convert an SVG angle back to minutes within a single 12h turn. */
export function angleToMinutes(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  return (normalized / 360) * MINUTES_PER_TURN;
}

export function polarToPoint(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  // Rounded so server and client render byte-identical SVG (no hydration drift).
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { x: round(cx + radius * Math.cos(rad)), y: round(cy + radius * Math.sin(rad)) };
}

export function pointToAngle(cx: number, cy: number, x: number, y: number): number {
  const deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
  return ((deg % 360) + 360) % 360;
}

/** Rounded arc path drawn as a stroked path (use stroke-linecap="round"). */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += 360;
  if (sweep >= 359.9) sweep = 359.9;
  const start = polarToPoint(cx, cy, radius, startAngle);
  const end = polarToPoint(cx, cy, radius, startAngle + sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function snapMinutes(value: number, snap: number): number {
  if (snap <= 0) return Math.round(value);
  return Math.round(value / snap) * snap;
}

export function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** One drawable arc piece: never crosses a 12 o'clock boundary or a day boundary. */
export interface EventSegment {
  event: PlannerEvent;
  /** minutes from midnight of the displayed day */
  startMin: number;
  endMin: number;
  /** 0 = AM half (00:00-12:00), 1 = PM half */
  half: 0 | 1;
  /** true when the event continues before/after this segment */
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
  /** 0 or 1 — which half of a split lane band this arc uses */
  subTrack: 0 | 1;
  /** true when this lane band is drawn as two thinner sub-tracks */
  split: boolean;
  key: string;
}

/** Clip an event to the given day and split it on the 12:00 boundary. */
export function segmentsForDay(
  event: PlannerEvent,
  day: Date,
): Omit<EventSegment, "lane" | "subTrack" | "split">[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (end <= dayStart || start > dayEnd) return [];

  const clippedStart = start < dayStart ? dayStart : start;
  const clippedEnd = end > addDays(dayStart, 1) ? addDays(dayStart, 1) : end;

  const startMin = differenceInMinutes(clippedStart, dayStart);
  let endMin = differenceInMinutes(clippedEnd, dayStart);
  if (endMin <= startMin) endMin = startMin + 1;

  const pieces: Omit<EventSegment, "lane" | "subTrack" | "split">[] = [];
  const boundaries = [0, 720, 1440];
  for (let i = 0; i < 2; i += 1) {
    const lo = Math.max(startMin, boundaries[i]!);
    const hi = Math.min(endMin, boundaries[i + 1]!);
    if (hi - lo < 1) continue;
    pieces.push({
      event,
      startMin: lo,
      endMin: hi,
      half: i as 0 | 1,
      continuesBefore: lo > startMin || !isSameDay(start, day),
      continuesAfter: hi < endMin || !isSameDay(end, day) ? true : false,
      key: `${event.id}-${i}`,
    });
  }
  return pieces;
}

export const MAX_LANES = MAX_VISIBLE_LANES;

export interface LaneResult {
  segments: EventSegment[];
  /** one final lane per event id */
  placement: Map<string, { lane: number; subTrack: 0 | 1 }>;
  /** overlap groups that could not fit in the visible lanes */
  overflow: { half: 0 | 1; startMin: number; endMin: number; events: PlannerEvent[] }[];
}

interface Interval {
  startMin: number;
  endMin: number;
  id: string;
}

interface DayItem {
  event: PlannerEvent;
  startMin: number;
  endMin: number;
  pieces: Omit<EventSegment, "lane" | "subTrack" | "split">[];
}

/** Clip every event to the day and sort by start time. */
export function dayItems(events: PlannerEvent[], day: Date): DayItem[] {
  return events
    .map((event) => {
      const pieces = segmentsForDay(event, day);
      if (pieces.length === 0) return null;
      const startMin = Math.min(...pieces.map((p) => p.startMin));
      const endMin = Math.max(...pieces.map((p) => p.endMin));
      return { event, startMin, endMin, pieces };
    })
    .filter((item): item is DayItem => item !== null)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

function overlaps(a: Interval, startMin: number, endMin: number): boolean {
  return a.startMin < endMin && startMin < a.endMin;
}

/**
 * Assign exactly ONE lane (and sub-track) per event — never per segment.
 *
 * 1. Manually pinned events claim their chosen lane first. If the band is
 *    already busy at that time, they take the lane's second sub-track
 *    ("keep both"); a lane never holds more than two sub-tracks.
 * 2. Remaining events use interval partitioning: sorted by start time, each
 *    goes into the first lane that is free for its whole interval.
 * 3. Anything that still doesn't fit joins a "+N" overflow group.
 *
 * Every segment of an event renders in that one final lane, so an event can
 * never appear in two lanes at once.
 */
export function assignLanes(events: PlannerEvent[], day: Date): LaneResult {
  const items = dayItems(events, day);

  // tracks[lane][subTrack] -> occupied intervals
  const tracks: Interval[][][] = Array.from({ length: MAX_LANES }, () => [[], []]);
  const laneSplit = Array.from({ length: MAX_LANES }, () => false);
  const placement = new Map<string, { lane: number; subTrack: 0 | 1 }>();
  const overflowEvents: {
    half: 0 | 1;
    startMin: number;
    endMin: number;
    events: PlannerEvent[];
  }[] = [];

  const isFree = (lane: number, subTrack: 0 | 1, item: DayItem) =>
    !tracks[lane]![subTrack]!.some((interval) => overlaps(interval, item.startMin, item.endMin));

  const claim = (lane: number, subTrack: 0 | 1, item: DayItem) => {
    tracks[lane]![subTrack]!.push({
      startMin: item.startMin,
      endMin: item.endMin,
      id: item.event.id,
    });
    if (subTrack === 1) laneSplit[lane] = true;
    placement.set(item.event.id, { lane, subTrack });
  };

  const pushOverflow = (item: DayItem) => {
    const bucket = overflowEvents.find(
      (group) => group.startMin <= item.endMin && group.endMin >= item.startMin,
    );
    if (bucket) {
      if (!bucket.events.includes(item.event)) bucket.events.push(item.event);
      bucket.startMin = Math.min(bucket.startMin, item.startMin);
      bucket.endMin = Math.max(bucket.endMin, item.endMin);
      return;
    }
    overflowEvents.push({
      half: item.pieces[0]!.half,
      startMin: item.startMin,
      endMin: item.endMin,
      events: [item.event],
    });
  };

  const manual = items.filter(
    (item) => item.event.laneMode === "manual" && item.event.manualLane != null,
  );
  const auto = items.filter(
    (item) => !(item.event.laneMode === "manual" && item.event.manualLane != null),
  );

  for (const item of manual) {
    const lane = Math.min(MAX_LANES - 1, Math.max(0, (item.event.manualLane ?? 1) - 1));
    if (isFree(lane, 0, item)) claim(lane, 0, item);
    else if (isFree(lane, 1, item)) claim(lane, 1, item);
    else pushOverflow(item);
  }

  for (const item of auto) {
    let lane = -1;
    for (let i = 0; i < MAX_LANES; i += 1) {
      if (isFree(i, 0, item)) {
        lane = i;
        break;
      }
    }
    if (lane === -1) pushOverflow(item);
    else claim(lane, 0, item);
  }

  const segments: EventSegment[] = [];
  for (const item of items) {
    const spot = placement.get(item.event.id);
    if (!spot) continue;
    for (const piece of item.pieces) {
      segments.push({ ...piece, lane: spot.lane, subTrack: spot.subTrack, split: false });
    }
  }
  // Split flags depend on the finished lane map.
  for (const segment of segments) segment.split = laneSplit[segment.lane]!;

  return { segments, placement, overflow: overflowEvents };
}

/**
 * Events already sitting in `lane` that overlap the given interval —
 * used to raise the manual-lane conflict sheet.
 */
export function laneConflicts(
  events: PlannerEvent[],
  day: Date,
  lane: number,
  startMin: number,
  endMin: number,
  excludeId?: string | null,
): PlannerEvent[] {
  const { placement } = assignLanes(
    events.filter((event) => event.id !== excludeId),
    day,
  );
  return dayItems(events, day)
    .filter((item) => item.event.id !== excludeId)
    .filter((item) => placement.get(item.event.id)?.lane === lane)
    .filter((item) => item.startMin < endMin && startMin < item.endMin)
    .map((item) => item.event);
}

/** First lane (0-based) with room for the interval, or null when all are busy. */
export function firstFreeLane(
  events: PlannerEvent[],
  day: Date,
  startMin: number,
  endMin: number,
  excludeId?: string | null,
): number | null {
  // Compute the lane assignment ONCE instead of calling laneConflicts (which
  // runs assignLanes internally) for every lane. This reduces the work from
  // MAX_LANES full assignments to a single assignment + a cheap scan.
  const { placement } = assignLanes(
    events.filter((event) => event.id !== excludeId),
    day,
  );
  const items = dayItems(events, day).filter((item) => item.event.id !== excludeId);
  for (let lane = 0; lane < MAX_LANES; lane += 1) {
    const hasConflict = items.some(
      (item) =>
        placement.get(item.event.id)?.lane === lane &&
        item.startMin < endMin &&
        startMin < item.endMin,
    );
    if (!hasConflict) return lane;
  }
  return null;
}

/** Grouped view of the day used by the "Arrange layers" sheet. */
export function laneOccupants(events: PlannerEvent[], day: Date): PlannerEvent[][] {
  const { placement } = assignLanes(events, day);
  const lanes: PlannerEvent[][] = Array.from({ length: MAX_LANES }, () => []);
  for (const item of dayItems(events, day)) {
    const spot = placement.get(item.event.id);
    if (!spot) continue;
    lanes[spot.lane]!.push(item.event);
  }
  return lanes;
}
