import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMinutes, startOfDay } from "date-fns";
import {
  CX,
  CY,
  LANE_RADII,
  LANE_STROKE,
  VIEW,
  laneRadius,
  trackRadius,
} from "@/lib/daydial/geometry";
import {
  angleToMinutes,
  assignLanes,
  minutesFromMidnight,
  minutesToAngle,
  pointToAngle,
  polarToPoint,
  snapMinutes,
  type EventSegment,
} from "@/lib/daydial/radial";
import { formatRange, formatTime } from "@/lib/daydial/format";
import {
  planInsideLabels,
  planLabels,
  type InsideLabelPlan,
  type LabelPlan,
} from "@/lib/daydial/labels";
import { LANE_LABELS, type ManualLane, type PlannerEvent } from "@/lib/daydial/types";
import { ClockFace } from "./ClockFace";
import { ClockHands } from "./ClockHands";
import { CurrentTimeHand } from "./CurrentTimeHand";
import { EventArc } from "./EventArc";
import { EventArcHandle } from "./EventArcHandle";
import { RadialEventLanes } from "./RadialEventLanes";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type DragKind = "move" | "start" | "end" | "create";

/**
 * Swallow the compatibility `click` the browser fires a few milliseconds after
 * `touchend`.
 *
 * A tap on an arc opens its preview on `pointerup`, directly under the finger.
 * The click that follows then lands on the overlay that was just mounted — its
 * full-screen dismiss backdrop — and closes it again within ~20ms, so tapping an
 * event looked like it did nothing at all. Only the single click belonging to
 * this gesture is dropped; the listener removes itself either way.
 */
function swallowNextClick(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const onClick = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    cleanup();
  };
  const cleanup = () => {
    document.removeEventListener("click", onClick, true);
    window.clearTimeout(timer);
  };
  const timer = window.setTimeout(cleanup, 400);
  document.addEventListener("click", onClick, true);
}

interface DragState {
  kind: DragKind;
  id: string | null;
  originStart: number;
  originEnd: number;
  pointerOrigin: number;
  startMin: number;
  endMin: number;
  /** 0-based lane the pointer is currently hovering (move gesture only) */
  lane: number | null;
  moved: boolean;
}

export interface RadialClockProps {
  day: Date;
  events: PlannerEvent[];
  now?: Date | undefined;
  timeFormat?: "12h" | "24h" | undefined;
  /** Restrict a 12-hour dial to AM (0) or PM (1). */
  visibleHalf?: 0 | 1 | undefined;
  snap?: number | undefined;
  activeId?: string | null | undefined;
  /** Focus editing mode: only this event responds to gestures. */
  focusId?: string | null | undefined;
  showGuides?: boolean | undefined;
  showHands?: boolean | undefined;
  showNow?: boolean | undefined;
  showLabels?: boolean | undefined;
  labelStyle?: "inside" | "outside" | undefined;
  /** When false the dial is view-only: tap to preview, long-press to focus. */
  interactive?: boolean | undefined;
  /** Allow dragging inward/outward to change the lane (focus mode). */
  laneGestures?: boolean | undefined;
  haptics?: boolean | undefined;
  /** Scales up the drag grips for thumb-sized editing. */
  handleScale?: number | undefined;
  minDurationMinutes?: number | undefined;
  className?: string | undefined;
  onSelect?: ((event: PlannerEvent) => void) | undefined;
  onPreview?: ((event: PlannerEvent) => void) | undefined;
  onLongPressEvent?: ((event: PlannerEvent) => void) | undefined;
  onCommit?: ((id: string, startMin: number, endMin: number, lane?: number) => void) | undefined;
  onCreate?: ((startMin: number, endMin: number) => void) | undefined;
  onOverflow?: ((events: PlannerEvent[]) => void) | undefined;
  onDraggingChange?: ((dragging: boolean) => void) | undefined;
}

/**
 * The radial timeline. Events are rounded arcs around an analog clock. In view
 * mode a tap previews an event and a long press opens focus editing; in focus
 * mode the selected arc can be dragged, resized and moved between lanes.
 */
export function RadialClock({
  day,
  events,
  now,
  timeFormat = "12h",
  visibleHalf,
  snap = 15,
  activeId = null,
  focusId = null,
  showGuides = false,
  showHands = true,
  showNow = true,
  showLabels = true,
  labelStyle = "inside",
  interactive = true,
  laneGestures = false,
  haptics = true,
  handleScale = 1,
  minDurationMinutes = 15,
  className,
  onSelect,
  onPreview,
  onLongPressEvent,
  onCommit,
  onCreate,
  onOverflow,
  onDraggingChange,
}: RadialClockProps) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTap = useRef<PlannerEvent | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastLane = useRef<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Ref to the latest drag state for use in document-level event listeners. */
  const dragRef = useRef<DragState | null>(null);
  /** Ref to the latest events array so document listeners don't need it as a dependency. */
  const eventsRef = useRef(events);

  // Keep refs in sync so document-level listeners always read the latest state.
  dragRef.current = drag;
  eventsRef.current = events;

  const dayStart = startOfDay(day);
  const nowMinutes = now ? minutesFromMidnight(now) : null;
  const minutesPerTurn = timeFormat === "24h" ? 1440 : 720;

  const previewEvents = useMemo(() => {
    if (!drag || drag.kind === "create" || !drag.id) return events;
    return events.map((event) =>
      event.id === drag.id
        ? {
            ...event,
            startAt: addMinutes(dayStart, drag.startMin).toISOString(),
            endAt: addMinutes(dayStart, drag.endMin).toISOString(),
            ...(drag.lane !== null
              ? {
                  laneMode: "manual" as const,
                  manualLane: (drag.lane + 1) as ManualLane,
                }
              : null),
          }
        : event,
    );
  }, [drag, events, dayStart]);

  const lanes = useMemo(() => assignLanes(previewEvents, day), [previewEvents, day]);

  const displayLanes = useMemo(() => {
    if (timeFormat !== "12h" || visibleHalf === undefined) return lanes;
    return {
      ...lanes,
      segments: lanes.segments.filter((segment) => segment.half === visibleHalf),
      overflow: lanes.overflow.filter((group) => group.half === visibleHalf),
    };
  }, [lanes, timeFormat, visibleHalf]);

  const labelPlan = useMemo(
    () =>
      labelStyle === "inside"
        ? (() => {
            const plan = planInsideLabels(displayLanes, minutesPerTurn);
            return {
              labels: [] as LabelPlan[],
              insideLabels: plan.labels,
              labeledIds: plan.labeledIds,
            };
          })()
        : (() => {
            const plan = planLabels(displayLanes, dayStart, timeFormat, minutesPerTurn);
            return {
              labels: plan.labels,
              insideLabels: [] as InsideLabelPlan[],
              labeledIds: plan.labeledIds,
            };
          })(),
    [labelStyle, displayLanes, dayStart, timeFormat, minutesPerTurn],
  );

  const editableId = focusId ?? activeId;

  const activeEvent = useMemo(
    () => previewEvents.find((event) => event.id === editableId) ?? null,
    [previewEvents, editableId],
  );

  const activeBounds = useMemo(() => {
    if (!activeEvent) return null;
    const pieces = displayLanes.segments.filter((segment) => segment.event.id === activeEvent.id);
    if (pieces.length === 0) return null;
    const first = pieces[0]!;
    return {
      startMin: Math.min(...pieces.map((p) => p.startMin)),
      endMin: Math.max(...pieces.map((p) => p.endMin)),
      lane: first.lane,
      radius: trackRadius(first.lane, first.subTrack, first.split),
    };
  }, [activeEvent, displayLanes]);

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(ctm.inverse());
  }, []);

  const pointerMinutes = useCallback(
    (clientX: number, clientY: number, reference: number) => {
      const local = toLocal(clientX, clientY);
      if (!local) return reference;
      const angle = pointToAngle(CX, CY, local.x, local.y);
      const base = angleToMinutes(angle, minutesPerTurn);
      const candidates = [base, base + minutesPerTurn];
      let best = candidates[0]!;
      for (const candidate of candidates) {
        if (Math.abs(candidate - reference) < Math.abs(best - reference)) best = candidate;
      }
      return Math.min(1440, Math.max(0, best));
    },
    [minutesPerTurn, toLocal],
  );

  /** Nearest lane band for the pointer's distance from the center. */
  const pointerLane = useCallback(
    (clientX: number, clientY: number) => {
      const local = toLocal(clientX, clientY);
      if (!local) return null;
      const distance = Math.hypot(local.x - CX, local.y - CY);
      let best = 0;
      LANE_RADII.forEach((radius, index) => {
        if (Math.abs(distance - radius) < Math.abs(distance - LANE_RADII[best]!)) best = index;
      });
      return best;
    },
    [toLocal],
  );

  const buzz = useCallback(() => {
    if (!haptics) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        /* ignore */
      }
    }
  }, [haptics]);

  const beginDrag = (state: DragState) => {
    setDrag(state);
    onDraggingChange?.(true);
    buzz();
  };

  const clearLongPress = useCallback(() => {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  }, []);

  const eventBounds = (segment: EventSegment) => {
    const pieces = displayLanes.segments.filter((item) => item.event.id === segment.event.id);
    return {
      startMin: Math.min(...pieces.map((p) => p.startMin)),
      endMin: Math.max(...pieces.map((p) => p.endMin)),
      lane: pieces[0]!.lane,
    };
  };

  // --- Document-level pointer listeners for drag tracking ---
  // Instead of setPointerCapture (which can freeze the UI in Capacitor WebView
  // if pointerup/pointercancel don't fire), we attach pointermove/pointerup
  // listeners to the document when a drag starts and remove them when it ends.
  const docMoveHandler = useRef<((e: PointerEvent) => void) | null>(null);
  const docUpHandler = useRef<((e: PointerEvent) => void) | null>(null);
  const docCancelHandler = useRef<((e: PointerEvent) => void) | null>(null);
  const onDraggingChangeRef = useRef(onDraggingChange);
  onDraggingChangeRef.current = onDraggingChange;

  const detachDocListeners = useCallback(() => {
    if (docMoveHandler.current) {
      document.removeEventListener("pointermove", docMoveHandler.current);
      docMoveHandler.current = null;
    }
    if (docUpHandler.current) {
      document.removeEventListener("pointerup", docUpHandler.current);
      docUpHandler.current = null;
    }
    if (docCancelHandler.current) {
      document.removeEventListener("pointercancel", docCancelHandler.current);
      docCancelHandler.current = null;
    }
  }, []);

  const cancelInteraction = useCallback(() => {
    const wasDragging = dragRef.current !== null;
    clearLongPress();
    detachDocListeners();
    pendingTap.current = null;
    pressOrigin.current = null;
    dragRef.current = null;
    lastLane.current = null;
    setDrag(null);
    if (wasDragging) onDraggingChangeRef.current?.(false);
  }, [clearLongPress, detachDocListeners]);

  const attachDocListeners = useCallback(() => {
    // Remove any stale listeners from a previous drag/tap.
    detachDocListeners();

    const onMove = (e: PointerEvent) => {
      const origin = pressOrigin.current;
      if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) {
        clearLongPress();
        pendingTap.current = null;
        pressOrigin.current = null;
      }
      const current = dragRef.current;
      if (!current) return;
      const reference = current.kind === "end" ? current.endMin : current.startMin;
      const pointer = pointerMinutes(e.clientX, e.clientY, reference);
      const hoveredLane =
        laneGestures && current.kind === "move" ? pointerLane(e.clientX, e.clientY) : null;
      if (hoveredLane !== null && hoveredLane !== lastLane.current) {
        lastLane.current = hoveredLane;
        buzz();
      }
      setDrag((prev) => {
        if (!prev) return prev;
        const lane = hoveredLane !== null ? hoveredLane : prev.lane;
        const duration = prev.originEnd - prev.originStart;
        if (prev.kind === "move") {
          const delta = snapMinutes(pointer - prev.pointerOrigin, snap);
          let start = prev.originStart + delta;
          start = Math.max(0, Math.min(1440 - duration, start));
          return { ...prev, startMin: start, endMin: start + duration, lane, moved: true };
        }
        if (prev.kind === "start") {
          const start = Math.min(snapMinutes(pointer, snap), prev.endMin - minDurationMinutes);
          return { ...prev, startMin: Math.max(0, start), moved: true };
        }
        const end = Math.max(snapMinutes(pointer, snap), prev.startMin + minDurationMinutes);
        return { ...prev, endMin: Math.min(1440, end), moved: true };
      });
    };

    const onUp = () => {
      clearLongPress();
      pressOrigin.current = null;
      // Remove document listeners immediately.
      detachDocListeners();

      // Simple tap on an arc while in view-only mode.
      if (pendingTap.current) {
        const event = pendingTap.current;
        pendingTap.current = null;
        if (onPreview || onSelect) {
          swallowNextClick();
          if (onPreview) onPreview(event);
          else onSelect?.(event);
        }
        return;
      }

      const finished = dragRef.current;
      if (!finished) return;
      setDrag(null);
      dragRef.current = null;
      lastLane.current = null;
      onDraggingChange?.(false);
      if (finished.kind === "create") {
        onCreate?.(
          finished.startMin,
          Math.max(finished.endMin, finished.startMin + minDurationMinutes),
        );
        return;
      }
      if (!finished.id) return;
      if (!finished.moved) {
        const event = eventsRef.current.find((item) => item.id === finished.id);
        if (event && (onPreview || onSelect)) {
          swallowNextClick();
          if (onPreview) onPreview(event);
          else onSelect?.(event);
        }
        return;
      }
      onCommit?.(
        finished.id,
        finished.startMin,
        finished.endMin,
        finished.lane === null ? undefined : finished.lane,
      );
    };

    // Android WebView emits pointercancel when a gesture is interrupted by the
    // OS, navigation, or app backgrounding. Cancellation must never commit a
    // half-finished edit or leave the clock in a permanent dragging state.
    const onCancel = () => cancelInteraction();

    docMoveHandler.current = onMove;
    docUpHandler.current = onUp;
    docCancelHandler.current = onCancel;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }, [
    cancelInteraction,
    clearLongPress,
    detachDocListeners,
    pointerMinutes,
    pointerLane,
    laneGestures,
    snap,
    minDurationMinutes,
    buzz,
    onPreview,
    onSelect,
    onCreate,
    onCommit,
    onDraggingChange,
  ]);

  // Android may background the WebView without delivering pointerup. End any
  // interaction on lifecycle loss so a stale drag cannot block later input.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") cancelInteraction();
    };
    window.addEventListener("blur", cancelInteraction);
    window.addEventListener("pagehide", cancelInteraction);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearLongPress();
      detachDocListeners();
      pendingTap.current = null;
      pressOrigin.current = null;
      dragRef.current = null;
      lastLane.current = null;
      window.removeEventListener("blur", cancelInteraction);
      window.removeEventListener("pagehide", cancelInteraction);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [cancelInteraction, clearLongPress, detachDocListeners]);

  const handleArcPointerDown = (segment: EventSegment, e: React.PointerEvent<SVGElement>) => {
    // View-only mode: a tap previews, a long press opens focus editing.
    if (!interactive || (focusId && segment.event.id !== focusId)) {
      e.stopPropagation();
      const event = segment.event;
      pressOrigin.current = { x: e.clientX, y: e.clientY };
      pendingTap.current = event;
      clearLongPress();
      if (onLongPressEvent) {
        longPress.current = setTimeout(() => {
          longPress.current = null;
          pendingTap.current = null;
          buzz();
          onLongPressEvent(event);
        }, 420);
      }
      // Attach document listeners so pointerup resolves the pending tap.
      attachDocListeners();
      return;
    }
    e.stopPropagation();
    // No setPointerCapture — use document-level listeners instead.
    const bounds = eventBounds(segment);
    const pointer = pointerMinutes(e.clientX, e.clientY, bounds.startMin);
    lastLane.current = bounds.lane;
    beginDrag({
      kind: "move",
      id: segment.event.id,
      originStart: bounds.startMin,
      originEnd: bounds.endMin,
      pointerOrigin: pointer,
      startMin: bounds.startMin,
      endMin: bounds.endMin,
      lane: null,
      moved: false,
    });
    attachDocListeners();
  };

  const handleHandlePointerDown =
    (kind: "start" | "end") => (e: React.PointerEvent<SVGGElement>) => {
      if (!interactive || !activeBounds || !activeEvent) return;
      e.stopPropagation();
      // No setPointerCapture — use document-level listeners instead.
      const reference = kind === "start" ? activeBounds.startMin : activeBounds.endMin;
      beginDrag({
        kind,
        id: activeEvent.id,
        originStart: activeBounds.startMin,
        originEnd: activeBounds.endMin,
        pointerOrigin: pointerMinutes(e.clientX, e.clientY, reference),
        startMin: activeBounds.startMin,
        endMin: activeBounds.endMin,
        lane: null,
        moved: false,
      });
      attachDocListeners();
    };

  const handleSurfacePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onCreate) return;
    const target = e.target as Element;
    if (target.closest("[data-arc]")) return;
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    const baseReference = nowMinutes ?? 9 * 60;
    const startRef =
      timeFormat === "12h" && visibleHalf !== undefined
        ? (baseReference % 720) + visibleHalf * 720
        : baseReference;
    const pointer = pointerMinutes(e.clientX, e.clientY, startRef);
    // No setPointerCapture — use document-level listeners instead.
    longPress.current = setTimeout(() => {
      const start = snapMinutes(pointer, snap);
      beginDrag({
        kind: "create",
        id: null,
        originStart: start,
        originEnd: start + minDurationMinutes,
        pointerOrigin: pointer,
        startMin: start,
        endMin: start + minDurationMinutes,
        lane: null,
        moved: false,
      });
      attachDocListeners();
    }, 380);
  };

  const handleSurfacePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const origin = pressOrigin.current;
    if (!origin || Math.hypot(e.clientX - origin.x, e.clientY - origin.y) <= 10) return;
    clearLongPress();
    pendingTap.current = null;
    pressOrigin.current = null;
  };

  const finishSurfacePress = () => {
    clearLongPress();
    pressOrigin.current = null;
  };

  const describe = (event: PlannerEvent) =>
    `${event.title}, ${formatRange(event.startAt, event.endAt, timeFormat)}${
      event.isCompleted ? ", completed" : ""
    }`;

  const previewRange =
    drag &&
    formatRange(addMinutes(dayStart, drag.startMin), addMinutes(dayStart, drag.endMin), timeFormat);

  const handleGripRadius = 24 * handleScale;

  return (
    <div className={cn("relative w-full", className)} data-no-swipe={drag ? "true" : undefined}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full select-none"
        style={{ touchAction: interactive || drag ? "none" : "pan-y" }}
        role="group"
        aria-label={t("clock.aria")}
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={finishSurfacePress}
        onPointerLeave={finishSurfacePress}
      >
        {/* Fixed lane bands */}
        {LANE_RADII.map((radius, index) => (
          <circle
            key={radius}
            cx={CX}
            cy={CY}
            r={radius}
            fill="none"
            stroke={
              laneGestures && drag?.kind === "move" && drag.lane === index
                ? "var(--primary)"
                : "var(--track)"
            }
            strokeWidth={index === 0 || (laneGestures && drag?.lane === index) ? LANE_STROKE : 1}
            strokeOpacity={
              laneGestures && drag?.kind === "move" && drag.lane === index
                ? 0.28
                : index === 0
                  ? 1
                  : 0.55
            }
          />
        ))}

        <ClockFace showGuides={showGuides} timeFormat={timeFormat} />

        {showHands &&
          nowMinutes !== null &&
          (timeFormat === "24h" ||
            visibleHalf === undefined ||
            Math.floor(nowMinutes / 720) === visibleHalf) && (
            <ClockHands minutes={nowMinutes} minutesPerTurn={minutesPerTurn} />
          )}
        {/* Behind the arcs and labels so it can never cover a title. */}
        {showNow &&
          nowMinutes !== null &&
          (timeFormat === "24h" ||
            visibleHalf === undefined ||
            Math.floor(nowMinutes / 720) === visibleHalf) && (
            <CurrentTimeHand minutes={nowMinutes} minutesPerTurn={minutesPerTurn} />
          )}

        <RadialEventLanes
          lanes={displayLanes}
          labels={labelPlan.labels}
          insideLabels={labelPlan.insideLabels}
          labelStyle={labelStyle}
          activeId={activeId}
          focusId={focusId}
          showLabels={showLabels}
          interactive={interactive}
          minutesPerTurn={minutesPerTurn}
          allowPageScroll={!interactive}
          onArcPointerDown={handleArcPointerDown}
          onLabelPointerDown={(eventId, event) => {
            const segment = displayLanes.segments.find((item) => item.event.id === eventId);
            if (segment) handleArcPointerDown(segment, event);
          }}

          onOverflow={onOverflow}
          describe={describe}
        />

        {drag?.kind === "create" && (
          <EventArc
            startMin={drag.startMin}
            endMin={drag.endMin}
            radius={laneRadius(0)}
            color="cyan"
            active
            thickness={LANE_STROKE}
            minutesPerTurn={minutesPerTurn}
          />
        )}

        {activeBounds && activeEvent && interactive && (
          <>
            <EventArcHandle
              minutes={activeBounds.startMin}
              radius={activeBounds.radius}
              scale={handleScale}
              hitRadius={handleGripRadius}
              label={t("clock.dragStart")}
              active={drag?.kind === "start"}
              minutesPerTurn={minutesPerTurn}
              onPointerDown={handleHandlePointerDown("start")}
            />
            <EventArcHandle
              minutes={activeBounds.endMin}
              radius={activeBounds.radius}
              scale={handleScale}
              hitRadius={handleGripRadius}
              label={t("clock.dragEnd")}
              active={drag?.kind === "end"}
              minutesPerTurn={minutesPerTurn}
              onPointerDown={handleHandlePointerDown("end")}
            />
          </>
        )}

        {/* Live time readout that follows the handle being dragged. */}
        {drag &&
          (drag.kind === "start" || drag.kind === "end") &&
          (() => {
            const minutes = drag.kind === "start" ? drag.startMin : drag.endMin;
            const point = polarToPoint(
              CX,
              CY,
              (activeBounds?.radius ?? laneRadius(0)) + 22,
              minutesToAngle(minutes, minutesPerTurn),
            );
            const text = formatTime(addMinutes(dayStart, minutes), timeFormat);
            const width = text.length * 7 + 16;
            const x = Math.min(VIEW - width / 2 - 2, Math.max(width / 2 + 2, point.x));
            const y = Math.min(VIEW - 14, Math.max(14, point.y));
            return (
              <g aria-hidden="true" pointerEvents="none">
                <rect
                  x={x - width / 2}
                  y={y - 12}
                  width={width}
                  height={24}
                  rx={12}
                  fill="var(--primary)"
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--primary-foreground)"
                >
                  {text}
                </text>
              </g>
            );
          })()}
      </svg>

      {previewRange && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
          aria-live="polite"
        >
          <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground tabular-nums">
            {previewRange}
            {drag?.kind === "move" && drag.lane !== null
              ? ` · ${LANE_LABELS[(drag.lane + 1) as ManualLane]}`
              : ""}
          </span>
        </div>
      )}
    </div>
  );
}
