import { useCallback, useMemo, useState } from "react";
import { addMinutes, differenceInMinutes, startOfDay } from "date-fns";
import { Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { MAX_VISIBLE_LANES } from "@/lib/daydial/geometry";
import { firstFreeLane, laneConflicts, laneOccupants } from "@/lib/daydial/radial";
import {
  type AppSettings,
  type EventDraft,
  type LaneMode,
  type ManualLane,
  type PlannerEvent,
} from "@/lib/daydial/types";
import { RadialClock } from "./RadialClock";
import { TimeRangeDisplay } from "./TimeRangeDisplay";
import { LaneSelector } from "./LaneSelector";
import { LaneConflictSheet, type ConflictChoice } from "./LaneConflictSheet";
import { ColorPicker } from "./ColorPicker";
import { CategoryPicker } from "./CategoryPicker";
import { ReminderPicker } from "./ReminderPicker";
import { useI18n, type TFunction } from "@/lib/i18n";

interface FocusEditModeProps {
  event: PlannerEvent;
  /** Every event on the visible day, used for lane conflict checks. */
  dayEvents: PlannerEvent[];
  day: Date;
  settings: AppSettings;
  onClose: () => void;
  onApply: (patch: Partial<EventDraft>) => void;
  /** Used by "Swap layers" to move the conflicting event out of the way. */
  onApplyOther: (id: string, patch: Partial<EventDraft>) => void;
  onDelete: () => void;
  onOpenFullEditor: () => void;
}

const STEP = 15;
const MIN_DURATION = 15;

/**
 * Mobile-first focus editing: a larger dial with only the selected event live,
 * plus big thumb-sized controls for time, duration and layer.
 */
export function FocusEditMode({
  event,
  dayEvents,
  day,
  settings,
  onClose,
  onApply,
  onApplyOther,
  onDelete,
  onOpenFullEditor,
}: FocusEditModeProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<PlannerEvent>(event);
  const [conflict, setConflict] = useState<{
    lane: ManualLane;
    conflicts: PlannerEvent[];
  } | null>(null);

  const dayStart = startOfDay(day);
  const start = new Date(draft.startAt);
  const end = new Date(draft.endAt);
  const duration = Math.max(MIN_DURATION, differenceInMinutes(end, start));
  const gesturesOn = settings.editingMethod !== "controls";
  const controlsOn = settings.editingMethod !== "gestures";

  const previewEvents = useMemo(
    () => dayEvents.map((item) => (item.id === draft.id ? draft : item)),
    [dayEvents, draft],
  );

  const occupancy = useMemo(
    () =>
      laneOccupants(
        dayEvents.filter((item) => item.id !== draft.id),
        day,
      ).map((items) => items.length),
    [dayEvents, day, draft.id],
  );

  const patch = useCallback(
    (next: Partial<PlannerEvent>) => setDraft((current) => ({ ...current, ...next })),
    [],
  );

  const shiftStart = (delta: number) => {
    const nextStart = addMinutes(start, delta);
    const minutes = differenceInMinutes(nextStart, dayStart);
    if (minutes < 0 || minutes + duration > 1440) return;
    patch({
      startAt: nextStart.toISOString(),
      endAt: addMinutes(nextStart, duration).toISOString(),
    });
  };

  const shiftDuration = (delta: number) => {
    const next = Math.max(MIN_DURATION, duration + delta);
    const minutes = differenceInMinutes(start, dayStart);
    if (minutes + next > 1440) return;
    patch({ endAt: addMinutes(start, next).toISOString() });
  };

  const applyLane = (mode: LaneMode, lane: ManualLane | null) => {
    if (mode === "auto" || !lane) {
      patch({ laneMode: "auto", manualLane: null });
      return;
    }
    const startMin = differenceInMinutes(start, dayStart);
    const endMin = startMin + duration;
    const conflicts = laneConflicts(dayEvents, day, lane - 1, startMin, endMin, draft.id);
    if (conflicts.length === 0) {
      patch({ laneMode: "manual", manualLane: lane });
      return;
    }
    setConflict({ lane, conflicts });
  };

  const resolveConflict = (choice: ConflictChoice) => {
    const pending = conflict;
    setConflict(null);
    if (!pending || choice === "cancel") return;
    const startMin = differenceInMinutes(start, dayStart);
    const endMin = startMin + duration;

    if (choice === "both") {
      patch({ laneMode: "manual", manualLane: pending.lane });
      return;
    }
    if (choice === "move") {
      const free = firstFreeLane(dayEvents, day, startMin, endMin, draft.id);
      if (free === null) return;
      patch({ laneMode: "manual", manualLane: (free + 1) as ManualLane });
      return;
    }
    // Swap: the other events move to the first ring that is free for them.
    for (const other of pending.conflicts) {
      const otherStart = differenceInMinutes(new Date(other.startAt), dayStart);
      const otherEnd = differenceInMinutes(new Date(other.endAt), dayStart);
      const free = firstFreeLane(
        dayEvents.filter((item) => item.id !== other.id),
        day,
        Math.max(0, otherStart),
        Math.min(1440, otherEnd),
        draft.id,
      );
      onApplyOther(other.id, {
        laneMode: free === null ? "auto" : "manual",
        manualLane: free === null ? null : ((free + 1) as ManualLane),
      });
    }
    patch({ laneMode: "manual", manualLane: pending.lane });
  };

  const commitFromDial = (_id: string, startMin: number, endMin: number, lane?: number) => {
    const nextStart = addMinutes(dayStart, startMin);
    const nextEnd = addMinutes(dayStart, Math.max(endMin, startMin + MIN_DURATION));
    const next: Partial<PlannerEvent> = {
      startAt: nextStart.toISOString(),
      endAt: nextEnd.toISOString(),
    };
    if (lane !== undefined) {
      const target = (Math.min(MAX_VISIBLE_LANES - 1, Math.max(0, lane)) + 1) as ManualLane;
      const conflicts = laneConflicts(dayEvents, day, target - 1, startMin, endMin, draft.id);
      if (conflicts.length === 0) {
        next.laneMode = "manual";
        next.manualLane = target;
      } else {
        setConflict({ lane: target, conflicts });
      }
    }
    patch(next);
  };

  const save = () => {
    const { id: _id, ...rest } = draft;
    onApply(rest);
  };

  const canKeepBoth = conflict
    ? laneOccupants(dayEvents, day)[conflict.lane - 1]!.length < 2 || conflict.conflicts.length < 2
    : false;
  const freeLane = (() => {
    const startMin = differenceInMinutes(start, dayStart);
    const free = firstFreeLane(dayEvents, day, startMin, startMin + duration, draft.id);
    return free === null ? null : ((free + 1) as ManualLane);
  })();

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-safe">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("focus.closeAria")}
            className="flex size-11 items-center justify-center rounded-full bg-secondary"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <p className="truncate text-center text-[15px] font-medium">
            {draft.title || t("common.untitled")}
          </p>
          <button
            type="button"
            onClick={save}
            className="flex h-11 items-center rounded-full bg-primary px-4 text-[15px] font-medium text-primary-foreground"
          >
            {t("common.done")}
          </button>
        </header>

        <TimeRangeDisplay start={start} end={end} timeFormat={settings.timeFormat} />

        {/* The dial grows in focus mode but stays fully inside the viewport. */}
        <div className="mx-auto w-[min(100%,420px)] px-1">
          <RadialClock
            day={day}
            events={previewEvents}
            timeFormat={settings.timeFormat}
            labelStyle={settings.eventLabelStyle}
            snap={settings.snapMinutes}
            focusId={draft.id}
            interactive={gesturesOn}
            laneGestures={gesturesOn}
            haptics={settings.hapticsEnabled}
            handleScale={1.6}
            showNow={false}
            showGuides
            onCommit={commitFromDial}
            minDurationMinutes={MIN_DURATION}
          />
        </div>

        {gesturesOn ? (
          <p className="pb-2 text-center text-[13px] text-muted-foreground">
            {t("focus.dragHint")}
          </p>
        ) : null}

        <section className="mt-auto space-y-3 rounded-t-3xl border border-border bg-card p-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {controlsOn ? (
            <>
              <Stepper
                label={t("focus.startTime")}
                t={t}
                onDown={() => shiftStart(-STEP)}
                onUp={() => shiftStart(STEP)}
              />
              <Stepper
                label={t("focus.duration")}
                t={t}
                onDown={() => shiftDuration(-STEP)}
                onUp={() => shiftDuration(STEP)}
              />
            </>
          ) : null}

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("focus.layer")}
            </p>
            <LaneSelector
              mode={draft.laneMode}
              lane={draft.manualLane}
              occupancy={occupancy}
              onChange={applyLane}
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("focus.color")}
            </p>
            <ColorPicker value={draft.color} onChange={(color) => patch({ color })} />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("focus.category")}
            </p>
            <CategoryPicker value={draft.category} onChange={(category) => patch({ category })} />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("focus.reminder")}
            </p>
            <ReminderPicker
              value={draft.reminderMinutes}
              onChange={(minutes) => patch({ reminderMinutes: minutes })}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenFullEditor}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary text-[15px] font-medium"
            >
              <Pencil className="size-[18px]" aria-hidden="true" />
              {t("focus.allDetails")}
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("editor.deleteAria")}
              className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-destructive"
            >
              <Trash2 className="size-[18px]" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>

      <LaneConflictSheet
        open={Boolean(conflict)}
        lane={conflict?.lane ?? null}
        conflicts={conflict?.conflicts ?? []}
        freeLane={freeLane}
        canKeepBoth={canKeepBoth}
        timeFormat={settings.timeFormat}
        onChoose={resolveConflict}
      />
    </div>
  );
}

function Stepper({
  label,
  t,
  onDown,
  onUp,
}: {
  label: string;
  t: TFunction;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-3 py-2">
      <span className="text-[15px] font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDown}
          aria-label={t("focus.stepMinus", { label })}
          className="flex size-11 items-center justify-center rounded-xl bg-card text-foreground shadow-sm"
        >
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <span className="w-12 text-center text-[13px] text-muted-foreground">
          {t("focus.step")}
        </span>
        <button
          type="button"
          onClick={onUp}
          aria-label={t("focus.stepPlus", { label })}
          className="flex size-11 items-center justify-center rounded-xl bg-card text-foreground shadow-sm"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
