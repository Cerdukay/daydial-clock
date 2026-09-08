import { CX, CY, LANE_STROKE } from "@/lib/daydial/geometry";
import { arcPath, minutesToAngle } from "@/lib/daydial/radial";
import { colorVar, type EventColor } from "@/lib/daydial/types";

interface EventArcProps {
  startMin: number;
  endMin: number;
  radius: number;
  color: EventColor;
  active?: boolean;
  dimmed?: boolean;
  completed?: boolean;
  thickness?: number;
  interactive?: boolean;
  label?: string | undefined;
  onPointerDown?: ((e: React.PointerEvent<SVGPathElement>) => void) | undefined;
}

/**
 * A single rounded colored arc representing (part of) an event. A soft
 * translucent under-stroke gives the arc gently graded edges.
 */
export function EventArc({
  startMin,
  endMin,
  radius,
  color,
  active = false,
  dimmed = false,
  completed = false,
  thickness = LANE_STROKE,
  interactive = false,
  label,
  onPointerDown,
}: EventArcProps) {
  const startAngle = minutesToAngle(startMin);
  const endAngle = minutesToAngle(endMin);
  const d = arcPath(CX, CY, radius, startAngle, endAngle);

  return (
    <g>
      {active && (
        <path
          d={d}
          fill="none"
          stroke={colorVar(color)}
          strokeOpacity={0.28}
          strokeWidth={thickness + 10}
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={colorVar(color)}
        strokeOpacity={dimmed ? 0.12 : 0.3}
        strokeWidth={thickness + 5}
        strokeLinecap="round"
        pointerEvents="none"
      />
      <path
        d={d}
        fill="none"
        stroke={colorVar(color)}
        strokeOpacity={dimmed ? 0.35 : completed ? 0.55 : 1}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={completed ? "2 6" : undefined}
        data-arc="true"
        onPointerDown={onPointerDown}
        style={{ cursor: interactive ? "grab" : "default", touchAction: "none" }}
      >
        {label ? <title>{label}</title> : null}
      </path>
    </g>
  );
}
