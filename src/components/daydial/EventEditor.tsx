import { memo, useCallback, useMemo, useRef, useState } from "react";
import { addMinutes, differenceInMinutes, startOfDay } from "date-fns";
import { AlarmClock, ArrowLeft, BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { format as formatDate } from "date-fns";
import type { EventDraft, PlannerEvent, ReminderDelivery } from "@/lib/daydial/types";
import { RadialClock } from "./RadialClock";
import { TimeRangeDisplay } from "./TimeRangeDisplay";
import { EventBottomSheet } from "./EventBottomSheet";
import { CategoryPicker } from "./CategoryPicker";
import { ReminderPicker } from "./ReminderPicker";
import { RepeatRulePicker } from "./RepeatRulePicker";
import { LaneSelector } from "./LaneSelector";
import { useI18n } from "@/lib/i18n";
import { dismissVirtualKeyboard } from "@/lib/daydial/keyboard";
import {
  isCapacitorNative,
  requestExactNotificationPermission,
  requestNotificationPermission,
} from "@/lib/notifications";
import { isIosNative } from "@/lib/notifications/ios-alarms";

interface EventEditorProps {
  mode: "create" | "edit";
  initial: EventDraft;
  timeFormat: "12h" | "24h";
  snapMinutes: number;
  onSave: (draft: EventDraft) => Promise<void> | void;
  onDelete?: (() => Promise<void> | void) | undefined;
  onCancel: () => void;
}

const MIN_DURATION = 15;
const MemoizedRadialClock = memo(RadialClock);

/** Full-screen focused editor: big clock, draggable arc, bottom toolbar. */
export function EventEditor({
  mode,
  initial,
  timeFormat,
  snapMinutes,
  onSave,
  onDelete,
  onCancel,
}: EventEditorProps) {
  const { language, t } = useI18n();
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const saveAttemptRef = useRef(false);
  const leavingRef = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deliveryPromptOpen, setDeliveryPromptOpen] = useState(false);
  const [errors, setErrors] = useState<{ title?: string | undefined; time?: string | undefined }>(
    {},
  );

  const start = useMemo(() => new Date(draft.startAt), [draft.startAt]);
  const end = useMemo(() => new Date(draft.endAt), [draft.endAt]);
  const day = useMemo(() => startOfDay(start), [start]);
  // Stable "now" value — avoids re-creating a Date on every keystroke.
  const now = useMemo(() => new Date(), []);

  const patch = useCallback(
    (next: Partial<EventDraft>) => setDraft((current) => ({ ...current, ...next })),
    [],
  );

  // Text fields update on every keystroke. Keep the SVG clock props independent
  // from title/description/notes so Android WebView does not redraw it while typing.
  const clockEvents = useMemo<PlannerEvent[]>(
    () => [
      {
        id: "draft",
        title: "",
        description: "",
        startAt: draft.startAt,
        endAt: draft.endAt,
        color: draft.color,
        category: "Personal",
        calendarName: "",
        location: "",
        notes: "",
        reminderMinutes: -1,
        reminderDelivery: "notification",
        repeat: "none",
        repeatUntil: null,
        repeatCount: 0,
        isCompleted: draft.isCompleted,
        laneMode: draft.laneMode,
        manualLane: draft.manualLane,
      },
    ],
    [draft.startAt, draft.endAt, draft.color, draft.isCompleted, draft.laneMode, draft.manualLane],
  );

  const handleCommit = useCallback(
    (_id: string, startMin: number, endMin: number) => {
      const nextStart = addMinutes(day, startMin);
      const nextEnd = addMinutes(day, Math.max(endMin, startMin + MIN_DURATION));
      patch({ startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() });
      setErrors((current) => ({ ...current, time: undefined }));
    },
    [day, patch],
  );

  const alarmPermissionCopy =
    language === "tr"
      ? {
          notification: "Alarm için Android bildirim iznini etkinleştirin.",
          exact:
            "Alarmın tam saatinde çalması için Alarmlar ve hatırlatıcılar iznini etkinleştirin.",
          ios: "Alarm için iOS 26 veya üzeri ve Ayarlar'da Arcelira alarm izni gerekir.",
        }
      : {
          notification: "Enable Android notifications to use event alarms.",
          exact: "Enable Alarms & reminders so the event alarm can ring at the exact time.",
          ios: "Event alarms require iOS 26 or later and Arcelira alarm access in Settings.",
        };

  const saveDraft = async (reminderDelivery: ReminderDelivery) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (reminderDelivery === "alarm" && draft.reminderMinutes >= 0 && isCapacitorNative()) {
        if (!isIosNative()) {
          const notificationPermission = await requestNotificationPermission();
          if (notificationPermission !== "granted") {
            toast.error(alarmPermissionCopy.notification);
            return;
          }
        }
        const exactAlarmPermission = await requestExactNotificationPermission();
        if (!exactAlarmPermission) {
          toast.error(isIosNative() ? alarmPermissionCopy.ios : alarmPermissionCopy.exact);
          return;
        }
      }
      await onSave({ ...draft, title: draft.title.trim(), reminderDelivery });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (savingRef.current || saveAttemptRef.current) return;
    const nextErrors: { title?: string | undefined; time?: string | undefined } = {};
    if (draft.title.trim().length === 0) nextErrors.title = t("editor.titleRequired");
    if (differenceInMinutes(end, start) < MIN_DURATION) {
      nextErrors.time = t("editor.minDuration", { min: MIN_DURATION });
    }
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.time) {
      if (nextErrors.title) setExpanded(false);
      return;
    }
    saveAttemptRef.current = true;
    await dismissVirtualKeyboard();
    if (mode === "create" && draft.reminderMinutes >= 0) {
      setDeliveryPromptOpen(true);
      return;
    }
    try {
      await saveDraft(draft.reminderDelivery);
    } finally {
      saveAttemptRef.current = false;
    }
  };

  const deliveryCopy =
    language === "tr"
      ? {
          title: "Hatırlatıcı nasıl gelsin?",
          body: "Etkinlik için normal bildirim veya yüksek öncelikli alarm seçin.",
          notification: "Bildirim",
          notificationHint: "Sessiz ya da seçtiğiniz bildirim sesiyle gösterilir.",
          alarm: "Alarm",
          alarmHint: isIosNative()
            ? "iOS 26+ üzerinde alarm izniyle sessiz modda da çalar."
            : "Android'de yüksek öncelikli sesli ve titreşimli olarak çalar.",
        }
      : {
          title: "How should this reminder arrive?",
          body: "Choose a standard notification or a high-priority alarm for this event.",
          notification: "Notification",
          notificationHint: "Shown with your selected notification sound.",
          alarm: "Alarm",
          alarmHint: isIosNative()
            ? "On iOS 26+, authorized alarms also ring in silent mode."
            : "Rings with high priority and vibration on Android.",
        };

  const handleCancel = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    await dismissVirtualKeyboard();
    onCancel();
  };

  return (
    <div
      data-event-editor-scroll
      className="flex min-h-dvh flex-col gap-4 overflow-y-auto landscape:gap-1"
    >
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 bg-background py-2 landscape:py-0">
        <button
          type="button"
          data-app-back
          onClick={() => void handleCancel()}
          aria-label={t("common.back")}
          className="flex touch-target items-center justify-center rounded-full text-foreground"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <h1 className="truncate text-[17px] font-semibold">
          {mode === "create" ? t("editor.new") : t("editor.edit")}
        </h1>
      </header>

      <TimeRangeDisplay start={start} end={end} timeFormat={timeFormat} />
      {errors.time ? (
        <p className="text-center text-xs text-destructive" role="alert">
          {errors.time}
        </p>
      ) : null}

      <div className="pb-4 landscape:pb-2">
        <EventBottomSheet
          title={draft.title}
          onTitleChange={(value) => patch({ title: value })}
          color={draft.color}
          onColorChange={(color) => patch({ color })}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((value) => !value)}
          onSave={handleSave}
          onDelete={onDelete ? () => setConfirmDelete(true) : undefined}
          saving={saving}
          titleError={errors.title}
        >
          <Field label={t("editor.description")}>
            <textarea
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
              className="w-full rounded-xl bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <Field label={t("editor.date")}>
            <input
              type="date"
              value={formatDate(start, "yyyy-MM-dd")}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split("-").map(Number);
                if (!y || !m || !d) return;
                const nextStart = new Date(start);
                nextStart.setFullYear(y, m - 1, d);
                const nextEnd = addMinutes(nextStart, differenceInMinutes(end, start));
                patch({ startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() });
              }}
              className="h-11 w-full rounded-xl bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("editor.startTime")}>
              <input
                type="time"
                value={formatDate(start, "HH:mm")}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m))
                    return;
                  const nextStart = addMinutes(day, h * 60 + m);
                  patch({ startAt: nextStart.toISOString() });
                }}
                className="h-11 w-full rounded-xl bg-secondary px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <Field label={t("editor.endTime")}>
              <input
                type="time"
                value={formatDate(end, "HH:mm")}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m))
                    return;
                  const nextEnd = addMinutes(day, h * 60 + m);
                  patch({ endAt: nextEnd.toISOString() });
                }}
                className="h-11 w-full rounded-xl bg-secondary px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
          </div>

          <Field label={t("editor.layer")}>
            <LaneSelector
              mode={draft.laneMode}
              lane={draft.manualLane}
              onChange={(laneMode, manualLane) => patch({ laneMode, manualLane })}
            />
          </Field>

          <Field label={t("editor.category")}>
            <CategoryPicker value={draft.category} onChange={(category) => patch({ category })} />
          </Field>

          <Field label={t("editor.calendar")}>
            <input
              value={draft.calendarName}
              onChange={(e) => patch({ calendarName: e.target.value })}
              className="h-11 w-full rounded-xl bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <Field label={t("editor.reminder")}>
            <ReminderPicker
              value={draft.reminderMinutes}
              onChange={(minutes) => patch({ reminderMinutes: minutes })}
            />
          </Field>

          <Field label={t("editor.repeat")}>
            <RepeatRulePicker
              value={draft.repeat}
              onChange={(repeat) =>
                patch({
                  repeat,
                  repeatUntil: repeat === "none" ? null : draft.repeatUntil,
                  repeatCount: repeat === "none" ? 0 : draft.repeatCount,
                })
              }
            />
          </Field>

          {draft.repeat !== "none" ? (
            <>
              <Field label={t("editor.repeatEndMode")}>
                <NativeSelect
                  value={draft.repeatCount > 0 ? "count" : draft.repeatUntil ? "date" : "forever"}
                  onValueChange={(mode) => {
                    if (mode === "forever") {
                      patch({ repeatUntil: null, repeatCount: 0 });
                    } else if (mode === "date") {
                      patch({ repeatUntil: draft.repeatUntil ?? null, repeatCount: 0 });
                    } else {
                      patch({ repeatUntil: null, repeatCount: draft.repeatCount || 10 });
                    }
                  }}
                  aria-label={t("editor.repeatEndMode")}
                  options={[
                    { value: "forever", label: t("editor.repeatForever") },
                    { value: "date", label: t("editor.repeatUntil") },
                    { value: "count", label: t("editor.repeatEndAfter") },
                  ]}
                />
              </Field>

              {draft.repeatCount > 0 ? (
                <Field label={t("editor.repeatEndAfter")}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={draft.repeatCount}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        patch({ repeatCount: isNaN(n) || n < 1 ? 1 : Math.min(n, 365) });
                      }}
                      className="h-11 w-20 rounded-xl bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("editor.repeatOccurrences")}
                    </span>
                  </div>
                </Field>
              ) : (
                <Field label={t("editor.repeatUntil")}>
                  <input
                    type="date"
                    value={
                      draft.repeatUntil ? formatDate(new Date(draft.repeatUntil), "yyyy-MM-dd") : ""
                    }
                    min={formatDate(start, "yyyy-MM-dd")}
                    onChange={(e) => {
                      if (!e.target.value) {
                        patch({ repeatUntil: null });
                        return;
                      }
                      const [y, m, d] = e.target.value.split("-").map(Number);
                      if (!y || !m || !d) return;
                      const until = new Date(start);
                      until.setFullYear(y, m - 1, d);
                      patch({ repeatUntil: until.toISOString() });
                    }}
                    className="h-11 w-full rounded-xl bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {!draft.repeatUntil ? (
                    <span className="text-xs text-muted-foreground">
                      {t("editor.repeatForever")}
                    </span>
                  ) : null}
                </Field>
              )}
            </>
          ) : null}

          <Field label={t("editor.location")}>
            <input
              value={draft.location}
              onChange={(e) => patch({ location: e.target.value })}
              className="h-11 w-full rounded-xl bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <Field label={t("editor.notes")}>
            <textarea
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={2}
              className="w-full rounded-xl bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5">
            <span className="text-sm">{t("editor.completed")}</span>
            <Switch
              checked={draft.isCompleted}
              onCheckedChange={(checked) => patch({ isCompleted: checked })}
              aria-label={t("editor.completed")}
            />
          </div>
        </EventBottomSheet>
      </div>

      <MemoizedRadialClock
        day={day}
        events={clockEvents}
        now={now}
        showNow={false}
        timeFormat={timeFormat}
        snap={snapMinutes}
        activeId="draft"
        showGuides
        showLabels={false}
        onCommit={handleCommit}
        minDurationMinutes={MIN_DURATION}
        className="mx-auto w-full max-w-[400px] landscape:max-w-[170px]"
      />

      <p className="pb-1 text-center text-[13px] text-muted-foreground landscape:hidden">
        {t("editor.dragHint")}
      </p>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-[340px] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("editor.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">{t("common.keep")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                setConfirmDelete(false);
                void onDelete?.();
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deliveryPromptOpen}
        onOpenChange={(open) => {
          setDeliveryPromptOpen(open);
          if (!open) saveAttemptRef.current = false;
        }}
      >
        <AlertDialogContent className="max-w-[360px] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{deliveryCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{deliveryCopy.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setDeliveryPromptOpen(false);
                saveAttemptRef.current = false;
                void saveDraft("notification");
              }}
            >
              <BellRing className="size-5 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{deliveryCopy.notification}</span>
                <span className="block text-xs text-muted-foreground">
                  {deliveryCopy.notificationHint}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setDeliveryPromptOpen(false);
                saveAttemptRef.current = false;
                void saveDraft("alarm");
              }}
            >
              <AlarmClock className="size-5 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{deliveryCopy.alarm}</span>
                <span className="block text-xs text-muted-foreground">
                  {deliveryCopy.alarmHint}
                </span>
              </span>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">{t("common.back")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
