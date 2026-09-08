import { CX, CY, HOUR_HAND, MINUTE_HAND } from "@/lib/daydial/geometry";
import { polarToPoint } from "@/lib/daydial/radial";

interface ClockHandsProps {
  /** minutes from midnight */
  minutes: number;
}

/** Black hour and minute hands. */
export function ClockHands({ minutes }: ClockHandsProps) {
  const minuteAngle = (minutes % 60) * 6;
  const hourAngle = ((minutes % 720) / 720) * 360;
  const minuteEnd = polarToPoint(CX, CY, MINUTE_HAND, minuteAngle);
  const hourEnd = polarToPoint(CX, CY, HOUR_HAND, hourAngle);
  const minuteTail = polarToPoint(CX, CY, -13, minuteAngle);
  const hourTail = polarToPoint(CX, CY, -11, hourAngle);

  return (
    <g aria-hidden="true">
      <line
        x1={hourTail.x}
        y1={hourTail.y}
        x2={hourEnd.x}
        y2={hourEnd.y}
        stroke="var(--foreground)"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1={minuteTail.x}
        y1={minuteTail.y}
        x2={minuteEnd.x}
        y2={minuteEnd.y}
        stroke="var(--foreground)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r={4.5} fill="var(--foreground)" />
    </g>
  );
}
