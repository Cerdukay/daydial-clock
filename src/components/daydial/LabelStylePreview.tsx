import type { EventLabelStyle } from "@/lib/daydial/types";

/** Point on a clock-style dial: angle 0 = 12 o'clock, growing clockwise. */
function point(radius: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

function arcPath(radius: number, from: number, to: number) {
  const a = point(radius, from);
  const b = point(radius, to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * Compact radial-clock thumbnail showing where an event title sits for a given
 * label style. Purely illustrative — no real event data involved.
 */
export function LabelStylePreview({ style }: { style: EventLabelStyle }) {
  const inside = style === "inside";
  const arcId = `dd-preview-arc-${style}`;

  return (
    <svg
      viewBox="0 0 100 100"
      className="size-[92px] shrink-0"
      role="img"
      aria-label={
        inside ? "Preview: title inside the event block" : "Preview: title beside the event block"
      }
    >
      <circle cx={50} cy={50} r={26} fill="var(--card)" stroke="var(--border)" strokeWidth={1.2} />
      <line x1={50} y1={50} x2={50} y2={32} stroke="var(--foreground)" strokeWidth={1.8} />
      <line x1={50} y1={50} x2={63} y2={55} stroke="var(--foreground)" strokeWidth={1.5} />
      <circle cx={50} cy={50} r={1.8} fill="var(--foreground)" />

      <path
        id={arcId}
        d={arcPath(38, inside ? -62 : -40, inside ? 62 : 40)}
        fill="none"
        stroke="var(--ev-cyan)"
        strokeWidth={inside ? 14 : 11}
        strokeLinecap="round"
      />

      {inside ? (
        <text fontSize={9} fontWeight={700} fill="var(--arc-text-cyan)">
          <textPath
            href={`#${arcId}`}
            startOffset="50%"
            textAnchor="middle"
            dominantBaseline="central"
          >
            Lunch
          </textPath>
        </text>
      ) : (
        <g>
          <line x1={50} y1={12} x2={50} y2={6} stroke="var(--label-card-border)" strokeWidth={1} />
          <rect
            x={26}
            y={-1}
            width={48}
            height={15}
            rx={6}
            fill="var(--label-card)"
            stroke="var(--label-card-border)"
            strokeWidth={1}
          />
          <circle cx={34} cy={6.5} r={2.4} fill="var(--ev-cyan)" />
          <text
            x={40}
            y={6.5}
            fontSize={9}
            fontWeight={700}
            dominantBaseline="central"
            fill="var(--label-title)"
          >
            Lunch
          </text>
        </g>
      )}
    </svg>
  );
}
