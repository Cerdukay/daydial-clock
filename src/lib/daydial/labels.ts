import { CX, CY, NUMBER_RADIUS, VIEW, trackRadius, trackThickness } from "./geometry";

import { formatTime } from "./format";
import { minutesToAngle, polarToPoint, type LaneResult } from "./radial";
import type { EventColor } from "./types";

export interface LabelPlan {
  key: string;
  eventId: string;
  text: string;
  time?: string | undefined;
  /** Pill centre in viewBox units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Narrow cards carry their title rotated 90° so it still fits. */
  rotated: boolean;
  color: EventColor;
  muted: boolean;
}

/** 30-minute and shorter events show their arc only — no label card. */
export const MIN_LABEL_MINUTES = 31;
/** Events at or above this always get a card attempt (title + time). */
export const FULL_LABEL_MINUTES = 45;

/** Card metrics (viewBox units ~= px on a 390px screen). */
const CARD_MAX_WIDTH = 158;
const CARD_HEIGHT = 46;
const CARD_MIN_WIDTH = 96;
/** Rotated (vertical) card used for short events — same generous tap area. */
const ROTATED_WIDTH = 34;
const ROTATED_MIN_HEIGHT = 62;
const TITLE_CHAR = 6.7;
const TIME_CHAR = 5.4;
/** padding-x * 2 + dot + gap */
const TEXT_INSET = 10 * 2 + 7 + 6;

/**
 * Normalise a raw event title before it is measured or drawn: collapse
 * whitespace, fall back to a readable placeholder and tame machine-generated
 * blobs like "15752000h4f2..." that would otherwise render as garbage.
 */
export function sanitizeTitle(raw: string | null | undefined): string {
  const clean = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "Untitled event";
  const tokens = clean.split(" ");
  if (tokens.length === 1 && clean.length > 24) return `${clean.slice(0, 12)}…`;
  return clean;
}

/**
 * Shorten on word boundaries first; fall back to an ellipsis when a single
 * long word must fit. Returns null when nothing readable fits.
 */
export function shortenTitle(title: string, max: number): string | null {
  const clean = sanitizeTitle(title);
  if (clean.length <= max) return clean;

  const words = clean.split(" ");
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  if (out.length >= 4) return out;
  if (max >= 6) return `${clean.slice(0, max - 1).trimEnd()}…`;
  return null;
}

/** Screen positions of the 1-12 hour numbers, used to keep labels clear of them. */
const HOUR_NUMBER_POINTS = Array.from({ length: 12 }, (_, i) =>
  polarToPoint(CX, CY, NUMBER_RADIUS, (i + 1) * 30),
);

const PAD = 3;

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 6,
) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
  );
}

/**
 * Label priority: 60m+ events rank above 30-59m ones, and within a tier the
 * longer event wins. The lower-priority label is repositioned outward and,
 * failing that, dropped — never drawn on top of another card.
 */
function labelPriority(duration: number): number {
  if (duration >= 120) return 3;
  if (duration >= FULL_LABEL_MINUTES + 15) return 2;
  if (duration >= FULL_LABEL_MINUTES) return 1;
  return 0;
}

/**
 * Floating pill labels placed just outside the arc they belong to. Events of
 * 45 minutes or more get title + time; 30-44 minute events are attempted with
 * a title only and dropped when space is tight; shorter events get no label.
 * Pills that would collide with another pill or an hour number are dropped.
 */
export function planLabels(
  lanes: LaneResult,
  dayStart?: Date,
  timeFormat: "12h" | "24h" = "12h",
): {
  labels: LabelPlan[];
  labeledIds: Set<string>;
} {
  const placed: { x: number; y: number; width: number; height: number }[] = [];
  const labels: LabelPlan[] = [];
  const labeledIds = new Set<string>();

  const ordered = [...lanes.segments].sort((a, b) => {
    const da = a.endMin - a.startMin;
    const db = b.endMin - b.startMin;
    return labelPriority(db) - labelPriority(da) || db - da;
  });

  for (const segment of ordered) {
    const duration = segment.endMin - segment.startMin;
    if (duration < MIN_LABEL_MINUTES) continue;
    if (labeledIds.has(segment.event.id)) continue;

    const withTime = duration >= FULL_LABEL_MINUTES;

    const time =
      withTime && dayStart
        ? `${formatTime(new Date(dayStart.getTime() + segment.startMin * 60000), timeFormat)} – ${formatTime(
            new Date(dayStart.getTime() + segment.endMin * 60000),
            timeFormat,
          )}`
        : undefined;

    // Title space left once the dot, padding and the time line are accounted for.
    const timeWidth = time ? time.length * TIME_CHAR + TEXT_INSET : 0;
    const maxChars = Math.floor((CARD_MAX_WIDTH - TEXT_INSET) / TITLE_CHAR);
    const text = shortenTitle(segment.event.title, Math.min(maxChars, withTime ? 16 : 12));
    if (!text) continue;

    // Short events get a narrow, vertical card whose title is rotated 90°.
    const rotated = !withTime;
    const width = rotated
      ? ROTATED_WIDTH
      : Math.min(
          CARD_MAX_WIDTH,
          Math.max(text.length * TITLE_CHAR + TEXT_INSET, timeWidth, CARD_MIN_WIDTH),
        );
    const height = rotated
      ? Math.max(ROTATED_MIN_HEIGHT, text.length * TITLE_CHAR + 26)
      : CARD_HEIGHT;

    // Sit just outside the arc; crowded cards are pushed farther outward.
    const angle = minutesToAngle((segment.startMin + segment.endMin) / 2);
    const baseRadius =
      trackRadius(segment.lane, segment.subTrack, segment.split) +
      trackThickness(segment.split) / 2 +
      Math.max(width, height) / 2 +
      4;

    let box: { x: number; y: number; width: number; height: number } | null = null;
    // Try straight out first, then small angular nudges along the ring, so a
    // lower-priority card only gets dropped when no free slot exists at all.
    const candidates: { push: number; spin: number }[] = [];
    for (const push of [0, 14, 28, 42]) {
      for (const spin of [0, -7, 7, -14, 14]) candidates.push({ push, spin });
    }
    for (const { push, spin } of candidates) {
      const raw = polarToPoint(CX, CY, baseRadius + push, angle + spin);
      const x = Math.min(VIEW - PAD - width / 2, Math.max(PAD + width / 2, raw.x));
      const y = Math.min(VIEW - PAD - height / 2, Math.max(PAD + height / 2, raw.y));
      const candidate = { x, y, width, height };
      if (placed.some((p) => overlaps(candidate, p))) continue;
      if (
        HOUR_NUMBER_POINTS.some((p) =>
          overlaps(candidate, { x: p.x, y: p.y, width: 26, height: 22 }, 2),
        )
      )
        continue;
      box = candidate;
      break;
    }
    if (!box) continue;

    const { x, y } = box;
    placed.push(box);

    labels.push({
      key: segment.key,
      eventId: segment.event.id,
      text,
      time,
      x,
      y,
      width,
      height,
      rotated,
      color: segment.event.color,
      muted: segment.event.isCompleted,
    });

    labeledIds.add(segment.event.id);
  }

  return { labels, labeledIds };
}

/* ---------------------------------------------------- inside-arc labels ---- */

export interface InsideLabelPlan {
  key: string;
  eventId: string;
  text: string;
  startMin: number;
  endMin: number;
  radius: number;
  color: EventColor;
  muted: boolean;
}

/** Text metrics for arc-inline labels (font-size 11.5, semibold — never below 11). */
const INSIDE_FONT = 11.5;
const INSIDE_CHAR = 6.2;
const INSIDE_PAD = 10;
/** Events at or above this may show their full title inside the arc. */
const INSIDE_FULL_MINUTES = 60;
/** Below this sweep the text curves too steeply to stay readable. */
const MIN_INSIDE_SWEEP = 12;

/** Angular band a piece of text occupies on its lane, centred on the arc. */
function textBand(startMin: number, endMin: number, radius: number, textWidth: number) {
  const startAngle = minutesToAngle(startMin);
  const sweep = (minutesToAngle(endMin) - startAngle + 360) % 360;
  const mid = (startAngle + sweep / 2 + 360) % 360;
  const half = ((textWidth / 2) * 180) / (Math.PI * radius);
  return { mid, half };
}

function bandsOverlap(
  a: { mid: number; half: number },
  b: { mid: number; half: number },
  pad = 1.5,
) {
  const delta = Math.abs(((a.mid - b.mid + 540) % 360) - 180);
  return delta < a.half + b.half + pad;
}

/**
 * Titles drawn along the inside of each colored arc. Events of 60 minutes or
 * more may show the full title; 30–59 minute events get a shortened title when
 * it fits; shorter events stay arc-only. Times are never rendered inside an
 * arc — they live in the event preview and Upcoming cards.
 */
export function planInsideLabels(lanes: LaneResult): {
  labels: InsideLabelPlan[];
  labeledIds: Set<string>;
} {
  const labels: InsideLabelPlan[] = [];
  const labeledIds = new Set<string>();
  const placed: { lane: number; band: { mid: number; half: number } }[] = [];

  // Higher-priority (longer) events win placement; lower-priority labels are
  // dropped rather than drawn over another title.
  const ordered = [...lanes.segments].sort((a, b) => {
    const da = a.endMin - a.startMin;
    const db = b.endMin - b.startMin;
    return labelPriority(db) - labelPriority(da) || db - da;
  });

  for (const segment of ordered) {
    const duration = segment.endMin - segment.startMin;
    if (duration < MIN_LABEL_MINUTES) continue;
    if (labeledIds.has(segment.event.id)) continue;
    // A split lane band is too thin to carry readable text inside the arc.
    if (segment.split) continue;

    const radius = trackRadius(segment.lane, segment.subTrack, segment.split);

    const sweep = (minutesToAngle(segment.endMin) - minutesToAngle(segment.startMin) + 360) % 360;
    // Very narrow wedges rotate the text near-vertically — arc only.
    if (sweep < MIN_INSIDE_SWEEP) continue;
    const arcLength = (sweep * Math.PI * radius) / 180;
    const available = arcLength - INSIDE_PAD * 2;
    const maxChars = Math.floor(available / INSIDE_CHAR);
    if (maxChars < 4) continue;

    // Long events may show the whole title; medium ones only a short form.
    const cap = duration >= INSIDE_FULL_MINUTES ? 22 : 10;
    const text = shortenTitle(segment.event.title, Math.min(maxChars, cap));
    if (!text) continue;
    const textWidth = text.length * INSIDE_CHAR;
    // Never let the text spill past the ends of its colored shape.
    if (textWidth > available) continue;

    // Titles on the same lane, or on adjacent lanes where the rings are close
    // enough to read as one band, may never share angular space.
    const band = textBand(segment.startMin, segment.endMin, radius, textWidth);
    const collides = placed.some(
      (item) => Math.abs(item.lane - segment.lane) === 0 && bandsOverlap(item.band, band),
    );
    if (collides) continue;

    placed.push({ lane: segment.lane, band });
    labels.push({
      key: segment.key,
      eventId: segment.event.id,
      text,
      startMin: segment.startMin,
      endMin: segment.endMin,
      radius,
      color: segment.event.color,
      muted: segment.event.isCompleted,
    });
    labeledIds.add(segment.event.id);
  }

  return { labels, labeledIds };
}

export { INSIDE_FONT };
