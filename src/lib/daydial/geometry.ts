/** Shared SVG geometry for the radial clock. All values are in viewBox units. */
export const VIEW = 400;
export const CX = 200;
export const CY = 200;

/** Clock face — sized so event labels have a clear ring of their own. */
export const FACE_RADIUS = 122;
export const NUMBER_RADIUS = 100;
export const TICK_OUTER = 117;

/** Hand lengths (kept proportional to the face). */
export const MINUTE_HAND = 96;
export const HOUR_HAND = 67;

/**
 * Fixed concentric event lane bands, innermost first, derived from one formula
 * so lanes can never share a radius or overlap each other's stroke:
 *   laneRadius = BASE_LANE_RADIUS + laneIndex * (LANE_STROKE + LANE_GAP)
 */
export const MAX_VISIBLE_LANES = 4;
export const LANE_STROKE = 12;
export const LANE_GAP = 7;
export const BASE_LANE_RADIUS = 134;

export const LANE_RADII = Array.from(
  { length: MAX_VISIBLE_LANES },
  (_, index) => BASE_LANE_RADIUS + index * (LANE_STROKE + LANE_GAP),
);

/** Outer edge of the outermost lane — nothing may be drawn past this. */
export const OUTER_EDGE = LANE_RADII[LANE_RADII.length - 1]! + LANE_STROKE / 2;

export const TRACK_RADIUS = LANE_RADII[0]!;
export const HANDLE_RADIUS = 8;

/**
 * "Keep both" splits one lane band into at most two thinner sub-tracks that
 * still live entirely inside the parent band.
 */
export const SUB_TRACK_GAP = 1.5;
export const SUB_TRACK_STROKE = (LANE_STROKE - SUB_TRACK_GAP) / 2;

/** Radius used to place an event label just inside its arc. */
export function labelRadius(lane: number): number {
  return laneRadius(lane);
}

export function laneRadius(lane: number): number {
  return LANE_RADII[Math.min(Math.max(lane, 0), LANE_RADII.length - 1)]!;
}

/** Stroke thickness for an arc, thinner when its lane is split in two. */
export function trackThickness(split: boolean): number {
  return split ? SUB_TRACK_STROKE : LANE_STROKE;
}

/** Radius of a (possibly split) track inside a lane band. */
export function trackRadius(lane: number, subTrack: number, split: boolean): number {
  const base = laneRadius(lane);
  if (!split) return base;
  const offset = (SUB_TRACK_STROKE + SUB_TRACK_GAP) / 2;
  return subTrack === 0 ? base - offset : base + offset;
}
