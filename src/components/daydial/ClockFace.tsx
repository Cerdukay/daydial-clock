import { useMemo } from "react";
import { CX, CY, TICK_OUTER, NUMBER_RADIUS, FACE_RADIUS } from "@/lib/daydial/geometry";
import { polarToPoint } from "@/lib/daydial/radial";

/** Static clock face: rim, minute ticks and the numbers 1-12 (12h) or 0-23 (24h). */
export function ClockFace({
  showGuides = false,
  timeFormat = "12h",
}: {
  showGuides?: boolean;
  timeFormat?: "12h" | "24h";
}) {
  // These arrays never change after mount (ticks) or only when timeFormat
  // changes (numbers). Memoize to avoid re-allocating on every parent render.
  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const numbers = useMemo(
    () =>
      timeFormat === "24h"
        ? Array.from({ length: 24 }, (_, i) => i)
        : Array.from({ length: 12 }, (_, i) => i + 1),
    [timeFormat],
  );
  const angleStep = timeFormat === "24h" ? 15 : 30;
  const fontSize = timeFormat === "24h" ? 13 : 19;

  return (
    <g aria-hidden="true">
      <circle
        cx={CX}
        cy={CY}
        r={FACE_RADIUS}
        fill="var(--card)"
        stroke="var(--dial-line)"
        strokeWidth={1}
      />
      {showGuides &&
        [FACE_RADIUS - 24, FACE_RADIUS - 48, FACE_RADIUS - 72].map((r) => (
          <circle
            key={r}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke="var(--dial-line)"
            strokeWidth={1}
            strokeDasharray="1 5"
            strokeLinecap="round"
          />
        ))}

      {ticks.map((i) => {
        const major = i % 5 === 0;
        const angle = i * 6;
        const outer = polarToPoint(CX, CY, TICK_OUTER, angle);
        const inner = polarToPoint(CX, CY, TICK_OUTER - (major ? 9 : 4.5), angle);
        return (
          <line
            key={i}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={major ? "var(--foreground)" : "var(--dial-line)"}
            strokeOpacity={major ? 0.55 : 1}
            strokeWidth={major ? 1.8 : 1}
            strokeLinecap="round"
          />
        );
      })}
      {numbers.map((n) => {
        const point = polarToPoint(CX, CY, NUMBER_RADIUS, n * angleStep);
        return (
          <text
            key={n}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontWeight={500}
            fill="var(--foreground)"
          >
            {n}
          </text>
        );
      })}

      {/* Center pivot */}
      <circle cx={CX} cy={CY} r={4.5} fill="var(--foreground)" />
      <circle cx={CX} cy={CY} r={1.6} fill="var(--card)" />
    </g>
  );
}
