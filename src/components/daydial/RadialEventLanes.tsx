import { CX, CY, laneRadius, trackRadius, trackThickness } from "@/lib/daydial/geometry";
import {
  minutesToAngle,
  polarToPoint,
  type EventSegment,
  type LaneResult,
} from "@/lib/daydial/radial";
import type { InsideLabelPlan, LabelPlan } from "@/lib/daydial/labels";
import type { PlannerEvent } from "@/lib/daydial/types";
import { EventArc } from "./EventArc";
import { ArcInlineLabel, EventLabel, EventLabelDefs } from "./EventLabel";

interface RadialEventLanesProps {
  lanes: LaneResult;
  labels?: LabelPlan[] | undefined;
  insideLabels?: InsideLabelPlan[] | undefined;
  labelStyle?: "inside" | "outside";
  activeId?: string | null | undefined;
  /** In focus editing mode every other arc is pushed back visually. */
  focusId?: string | null | undefined;
  showLabels?: boolean;
  interactive?: boolean;
  onArcPointerDown?:
    ((segment: EventSegment, e: React.PointerEvent<SVGPathElement>) => void) | undefined;
  onLabelPointerDown?: ((eventId: string) => void) | undefined;
  onOverflow?: ((events: PlannerEvent[]) => void) | undefined;

  describe: (event: PlannerEvent) => string;
}

/** Draws every event arc in its concentric lane plus non-colliding labels. */
export function RadialEventLanes({
  lanes,
  labels = [],
  insideLabels = [],
  labelStyle = "outside",
  activeId,
  focusId = null,
  showLabels = true,
  interactive = false,
  onArcPointerDown,
  onLabelPointerDown,
  onOverflow,

  describe,
}: RadialEventLanesProps) {
  const highlightId = focusId ?? activeId ?? null;

  return (
    <g>
      <EventLabelDefs />
      {lanes.segments.map((segment) => (
        <EventArc
          key={segment.key}
          startMin={segment.startMin}
          endMin={segment.endMin}
          radius={trackRadius(segment.lane, segment.subTrack, segment.split)}
          thickness={trackThickness(segment.split)}
          color={segment.event.color}
          completed={segment.event.isCompleted}
          active={highlightId === segment.event.id}
          dimmed={Boolean(highlightId) && highlightId !== segment.event.id}
          interactive={interactive && (!focusId || focusId === segment.event.id)}
          label={describe(segment.event)}
          onPointerDown={onArcPointerDown ? (e) => onArcPointerDown(segment, e) : undefined}
        />
      ))}

      {showLabels &&
        labelStyle === "inside" &&
        insideLabels.map((label) => (
          <ArcInlineLabel
            key={`inside-${label.key}`}
            id={label.key.replace(/[^a-zA-Z0-9_-]/g, "")}
            startMin={label.startMin}
            endMin={label.endMin}
            radius={label.radius}
            text={label.text}
            color={label.color}
            muted={label.muted}
          />
        ))}

      {showLabels &&
        labelStyle === "outside" &&
        labels.map((label) => (
          <EventLabel
            key={`label-${label.key}`}
            x={label.x}
            y={label.y}
            width={label.width}
            height={label.height}
            text={label.text}
            time={label.time}
            color={label.color}
            muted={label.muted}
            rotated={label.rotated}
            onPointerDown={
              onLabelPointerDown
                ? (e) => {
                    e.stopPropagation();
                    onLabelPointerDown(label.eventId);
                  }
                : undefined
            }
          />
        ))}

      {lanes.overflow.map((group) => {
        const point = polarToPoint(
          CX,
          CY,
          laneRadius(3),
          minutesToAngle((group.startMin + group.endMin) / 2),
        );
        return (
          <g
            key={`overflow-${group.half}-${group.startMin}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onOverflow?.(group.events);
            }}
            style={{ cursor: "pointer" }}
            role="button"
            aria-label={`${group.events.length} more overlapping events`}
            tabIndex={0}
          >
            <circle cx={point.x} cy={point.y} r={20} fill="transparent" />
            <circle
              cx={point.x}
              cy={point.y}
              r={10}
              fill="var(--secondary)"
              stroke="var(--border)"
            />
            <text
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight={600}
              fill="var(--foreground)"
            >
              +{group.events.length}
            </text>
          </g>
        );
      })}
    </g>
  );
}
