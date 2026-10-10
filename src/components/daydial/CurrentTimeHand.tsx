import { CX, CY, LANE_RADII } from "@/lib/daydial/geometry";
import { polarToPoint } from "@/lib/daydial/radial";

/**
 * Thin red hand marking the real current time. It stops at the outer event
 * ring so it stays visually secondary to the event arcs and can't be mistaken
 * for a drag handle.
 */
export function CurrentTimeHand({
  minutes,
  minutesPerTurn = 720,
}: {
  minutes: number;
  minutesPerTurn?: number;
}) {
  const angle = ((minutes % minutesPerTurn) / minutesPerTurn) * 360;
  const outer = LANE_RADII[LANE_RADII.length - 1]!;
  const end = polarToPoint(CX, CY, outer, angle);
  const tail = polarToPoint(CX, CY, -8, angle);

  return (
    <g aria-hidden="true" pointerEvents="none">
      <line
        x1={tail.x}
        y1={tail.y}
        x2={end.x}
        y2={end.y}
        stroke="var(--now)"
        strokeWidth={1.2}
        strokeOpacity={0.8}
        strokeLinecap="round"
      />
      <circle cx={end.x} cy={end.y} r={1.9} fill="var(--now)" />
      <circle cx={CX} cy={CY} r={1.6} fill="var(--now)" />
    </g>
  );
}
