import { colorVar, type EventColor } from "@/lib/daydial/types";
import { CX, CY } from "@/lib/daydial/geometry";
import { minutesToAngle, polarToPoint } from "@/lib/daydial/radial";
import { INSIDE_FONT } from "@/lib/daydial/labels";

interface EventLabelProps {
  /** Card centre in viewBox units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Already shortened / truncated by the label planner. */
  text: string;
  time?: string | undefined;
  color: EventColor;
  muted?: boolean;
  /** Narrow cards render their title turned 90°. */
  rotated?: boolean;
  onPointerDown?: ((e: React.PointerEvent<SVGGElement>) => void) | undefined;
}

/** Shared soft shadow for every label card — rendered once per clock. */
export function EventLabelDefs() {
  return (
    <defs>
      <filter id="dd-label-shadow" x="-40%" y="-40%" width="180%" height="200%">
        <feDropShadow
          dx="0"
          dy="3"
          stdDeviation="4"
          style={{ floodColor: "#000000", floodOpacity: "var(--label-shadow)" }}
        />
      </filter>
    </defs>
  );
}

/**
 * One compact event label card: a single <g> holding the rounded card,
 * its border, the colored dot and both text lines. It moves and hides as
 * one unit — nothing is positioned independently of the card.
 */
export function EventLabel({
  x,
  y,
  width,
  height,
  text,
  time,
  color,
  muted = false,
  rotated = false,
  onPointerDown,
}: EventLabelProps) {
  const left = x - width / 2;
  const top = y - height / 2;
  const textX = left + 10 + 7 + 6; // padding + dot + gap
  const titleY = time ? y - 6 : y;

  return (
    <g
      filter="url(#dd-label-shadow)"
      onPointerDown={onPointerDown}
      pointerEvents={onPointerDown ? "auto" : "none"}
      style={onPointerDown ? { cursor: "pointer", touchAction: "none" } : undefined}
      aria-hidden="true"
    >
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        rx={rotated ? Math.min(14, width / 2) : 12}
        fill="var(--label-card)"
        stroke="var(--label-card-border)"
        strokeWidth={1}
      />
      {rotated ? (
        <g transform={`rotate(-90 ${x} ${y})`}>
          <circle cx={x - width / 2 + 10 + 3.5} cy={y} r={3.5} fill={colorVar(color)} />
          <text
            x={x - width / 2 + 10 + 7 + 6}
            y={y}
            dominantBaseline="central"
            fontSize={12.5}
            fontWeight={600}
            fill="var(--label-title)"
            opacity={muted ? 0.7 : 1}
            style={muted ? { textDecoration: "line-through" } : undefined}
          >
            {text}
          </text>
        </g>
      ) : (
        <>
          <circle cx={left + 10 + 3.5} cy={titleY} r={3.5} fill={colorVar(color)} />
          <text
            x={textX}
            y={titleY}
            dominantBaseline="central"
            fontSize={12.5}
            fontWeight={600}
            fill="var(--label-title)"
            opacity={muted ? 0.7 : 1}
            style={muted ? { textDecoration: "line-through" } : undefined}
          >
            {text}
          </text>
          {time ? (
            <text
              x={textX}
              y={y + 9}
              dominantBaseline="central"
              fontSize={10.5}
              fontWeight={400}
              fill="var(--label-time)"
            >
              {time}
            </text>
          ) : null}
        </>
      )}
    </g>
  );
}

/* ------------------------------------------------- inside-arc label text ---- */

interface ArcInlineLabelProps {
  id: string;
  startMin: number;
  endMin: number;
  radius: number;
  text: string;
  color: EventColor;
  muted?: boolean;
}

function arcTextPath(radius: number, startAngle: number, endAngle: number, flip: boolean) {
  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += 360;
  if (sweep >= 359.9) sweep = 359.9;
  const a = flip ? startAngle + sweep : startAngle;
  const b = flip ? startAngle : startAngle + sweep;
  const start = polarToPoint(CX, CY, radius, a);
  const end = polarToPoint(CX, CY, radius, b);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${
    flip ? 0 : 1
  } ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Event title rendered along the inside of its colored arc. Text follows the
 * arc shape, flips direction on the lower half of the dial so it stays
 * upright, and uses a deep same-hue ink for contrast on the pastel arc.
 */
export function ArcInlineLabel({
  id,
  startMin,
  endMin,
  radius,
  text,
  color,
  muted = false,
}: ArcInlineLabelProps) {
  const startAngle = minutesToAngle(startMin);
  const endAngle = minutesToAngle(endMin);
  const mid = (startAngle + ((endAngle - startAngle + 360) % 360) / 2) % 360;
  const flip = mid > 90 && mid < 270;
  const pathId = `dd-arc-text-${id}`;

  return (
    <g aria-hidden="true" pointerEvents="none">
      <defs>
        <path id={pathId} d={arcTextPath(radius, startAngle, endAngle, flip)} fill="none" />
      </defs>
      <text
        fontSize={INSIDE_FONT}
        fontWeight={600}
        fill={`var(--arc-text-${color})`}
        opacity={muted ? 0.6 : 1}
        style={muted ? { textDecoration: "line-through" } : undefined}
      >
        <textPath
          href={`#${pathId}`}
          startOffset="50%"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {text}
        </textPath>
      </text>
    </g>
  );
}
