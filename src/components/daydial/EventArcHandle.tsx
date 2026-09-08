import { CX, CY, HANDLE_RADIUS } from "@/lib/daydial/geometry";
import { minutesToAngle, polarToPoint } from "@/lib/daydial/radial";

interface EventArcHandleProps {
  minutes: number;
  radius: number;
  label: string;
  active?: boolean | undefined;
  /** Grows the visible grip in focus editing mode. */
  scale?: number | undefined;
  /** Invisible touch target radius (>= 44px on device). */
  hitRadius?: number | undefined;
  onPointerDown?: ((e: React.PointerEvent<SVGGElement>) => void) | undefined;
}

/** Draggable start / end grip on an event arc. */
export function EventArcHandle({
  minutes,
  radius,
  label,
  active = false,
  scale = 1,
  hitRadius = 24,
  onPointerDown,
}: EventArcHandleProps) {
  const point = polarToPoint(CX, CY, radius, minutesToAngle(minutes));
  const grip = HANDLE_RADIUS * scale;
  return (
    <g
      onPointerDown={onPointerDown}
      style={{ cursor: "grab", touchAction: "none" }}
      role="presentation"
      aria-label={label}
    >
      {/* generous invisible hit area */}
      <circle cx={point.x} cy={point.y} r={hitRadius} fill="transparent" />
      {active && (
        <circle
          cx={point.x}
          cy={point.y}
          r={grip + 6}
          fill="var(--foreground)"
          fillOpacity={0.12}
        />
      )}
      <circle
        cx={point.x}
        cy={point.y}
        r={active ? grip + 1.5 : grip}
        fill="var(--card)"
        stroke="var(--foreground)"
        strokeWidth={2}
      />
      <title>{label}</title>
    </g>
  );
}
