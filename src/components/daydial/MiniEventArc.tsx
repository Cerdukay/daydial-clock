import { colorVar, type EventColor } from "@/lib/daydial/types";

interface MiniEventArcProps {
  index: number;
  total: number;
  color: EventColor;
  /** minutes from midnight, used to place the arc around the day number */
  startMin: number;
  endMin: number;
}

const SIZE = 40;
const CENTER = SIZE / 2;

/** Tiny arc drawn around a calendar day number. */
export function MiniEventArc({ index, color, startMin, endMin }: MiniEventArcProps) {
  const radius = 17 - index * 2.8;

  const toAngle = (m: number) => ((m % 720) / 720) * 360;
  const start = toAngle(startMin);
  let sweep = toAngle(endMin) - start;
  if (sweep <= 6) sweep = 26;
  if (sweep > 300) sweep = 300;
  const point = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
  };
  const a = point(start);
  const b = point(start + sweep);
  const largeArc = sweep > 180 ? 1 : 0;

  return (
    <path
      d={`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`}
      fill="none"
      stroke={colorVar(color)}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

export const MINI_ARC_SIZE = SIZE;
