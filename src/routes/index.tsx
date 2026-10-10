import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addDays,
  addMinutes,
  endOfMonth,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { Clock3, CloudOff, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/daydial/AppShell";
import { DateHeader } from "@/components/daydial/DateHeader";
import { MonthCalendar } from "@/components/daydial/MonthCalendar";
import { RadialClock } from "@/components/daydial/RadialClock";
import { AgendaList } from "@/components/daydial/AgendaList";
import { EmptyDayState } from "@/components/daydial/EmptyDayState";
import { OverlapEventSheet } from "@/components/daydial/OverlapEventSheet";
import { EventPreviewPopover } from "@/components/daydial/EventPreviewPopover";
import { SyncPromptCard } from "@/components/daydial/SyncPromptCard";
import { LabelStyleOnboarding } from "@/components/daydial/LabelStyleOnboarding";
import { TimeFormatOnboarding } from "@/components/daydial/TimeFormatOnboarding";
import { GestureHint } from "@/components/daydial/GestureHint";
import { RecurrenceScopeSheet } from "@/components/daydial/RecurrenceScopeSheet";

import { FocusEditMode } from "@/components/daydial/FocusEditMode";
import { ArrangeLayersSheet } from "@/components/daydial/ArrangeLayersSheet";
import { showChangeUndoToast, showUndoToast } from "@/components/daydial/UndoToast";
import { usePlanner } from "@/lib/daydial/store";
import { useI18n } from "@/lib/i18n";
import { useNow } from "@/hooks/use-now";
import { formatRange } from "@/lib/daydial/format";
import { categoryIcon } from "@/lib/daydial/categoryIcons";
import type { EventDraft, PlannerEvent, RecurrenceScope } from "@/lib/daydial/types";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arcelira — Today's dial" },
      {
        name: "description",
        content:
          "See your whole day as colorful arcs around an analog clock. Drag to move, pinch the handles to resize, and plan in seconds.",
      },
      { property: "og:title", content: "Arcelira — Today's dial" },
      {
        property: "og:description",
        content: "A calm radial daily planner. Plan your day around the clock.",
      },
    ],
  }),
  component: TodayScreen,
});

const SYNC_CARD_KEY = "daydial.syncCardDismissed";
const ONBOARDING_KEY = "daydial.labelStyleOnboarded";
const HINT_KEY = "daydial.gestureHintDismissed";
const TIME_FORMAT_ONBOARDING_KEY = "daydial.timeFormatOnboarded.v1";

function TodayScreen() {
  const navigate = useNavigate();
  const { t, dateLocale } = useI18n();
  const now = useNow(30_000);
  const {
    settings,
    updateSettings,
    isLoading,
    isError,
    isGuest,
    updateEvent,
    deleteEvent,
    restoreEvent,
    eventsForDay,
    eventsForRange,
  } = usePlanner();

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [view, setView] = useState<"clock" | "agenda">(settings.defaultView);
  const [overflow, setOverflow] = useState<PlannerEvent[] | null>(null);
  const [preview, setPreview] = useState<PlannerEvent | null>(null);
  const [showSyncCard, setShowSyncCard] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showTimeFormatOnboarding, setShowTimeFormatOnboarding] = useState(false);
  const [clockUsed, setClockUsed] = useState(false);
  const [dayPeriod, setDayPeriod] = useState<0 | 1>(() => (new Date().getHours() < 12 ? 0 : 1));

  const [focusId, setFocusId] = useState<string | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const dragging = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // Recurring events are expanded into concrete instances for the visible day.
  const dayEvents = useMemo(
    () =>
      eventsForDay(selectedDate).filter(
        (event) => settings.showCompletedEvents || !event.isCompleted,
      ),
    [eventsForDay, selectedDate, settings.showCompletedEvents],
  );

  const monthEvents = useMemo(
    () =>
      calendarOpen ? eventsForRange(startOfMonth(selectedDate), endOfMonth(selectedDate)) : [],
    [calendarOpen, eventsForRange, selectedDate],
  );

  const focusEvent = focusId ? (dayEvents.find((event) => event.id === focusId) ?? null) : null;

  useEffect(() => {
    if (!isGuest) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(SYNC_CARD_KEY) === "1") return;
    // Shown once per install: mark it seen immediately so later launches and
    // other screens only get the small "Saved locally" chip.
    window.localStorage.setItem(SYNC_CARD_KEY, "1");
    setShowSyncCard(true);
  }, [isGuest]);

  // The label-style choice only makes sense once the clock has been used, so we
  // wait for the first real interaction instead of blocking first launch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(HINT_KEY) !== "1") setShowHint(true);
  }, []);

  useEffect(() => {
    if (isLoading || typeof window === "undefined") return;
    if (window.localStorage.getItem(TIME_FORMAT_ONBOARDING_KEY) !== "1") {
      setShowTimeFormatOnboarding(true);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!clockUsed) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(ONBOARDING_KEY) === "1") return;
    const timer = setTimeout(() => setShowOnboarding(true), 900);
    return () => clearTimeout(timer);
  }, [clockUsed]);

  const markClockUsed = () => setClockUsed(true);

  const finishOnboarding = () => {
    if (typeof window !== "undefined") window.localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  };

  const dismissHint = () => {
    setShowHint(false);
    if (typeof window !== "undefined") window.localStorage.setItem(HINT_KEY, "1");
  };

  const dismissSyncCard = () => {
    setShowSyncCard(false);
    if (typeof window !== "undefined") window.localStorage.setItem(SYNC_CARD_KEY, "1");
  };

  const goToDay = useCallback((next: Date) => setSelectedDate(startOfDay(next)), []);

  const openEvent = (event: PlannerEvent) => {
    void navigate({ to: "/event/$eventId", params: { eventId: event.id } });
  };

  const createAt = (startMin?: number, endMin?: number) => {
    const base = startOfDay(selectedDate);
    const start = addMinutes(base, startMin ?? Math.max(0, now.getHours() * 60));
    const end = addMinutes(
      base,
      endMin ?? (startMin ?? now.getHours() * 60) + settings.defaultDurationMinutes,
    );
    void navigate({
      to: "/event/new",
      search: { start: start.toISOString(), end: end.toISOString() },
    });
  };

  const updateWithFeedback = useCallback(
    async (id: string, patch: Partial<EventDraft>, scope: RecurrenceScope = "series") => {
      try {
        await updateEvent(id, patch, scope);
        return true;
      } catch {
        toast.error(t("toast.updateFailed"));
        return false;
      }
    },
    [t, updateEvent],
  );

  const handleCommit = (id: string, startMin: number, endMin: number) => {
    const base = startOfDay(selectedDate);
    const previous = dayEvents.find((event) => event.id === id);
    // Dragging an occurrence of a series only moves that one instance.
    const scope: RecurrenceScope = previous?.seriesId ? "single" : "series";
    void updateWithFeedback(
      id,
      {
        startAt: addMinutes(base, startMin).toISOString(),
        endAt: addMinutes(base, endMin).toISOString(),
      },
      scope,
    ).then((saved) => {
      if (!saved || !previous) return;
      showChangeUndoToast(
        t("home.timeUpdated"),
        t("common.undo"),
        () =>
          void updateWithFeedback(id, { startAt: previous.startAt, endAt: previous.endAt }, scope),
      );
    });
  };

  const applyFocusPatch = (id: string, patch: Partial<EventDraft>) => {
    const previous = dayEvents.find((event) => event.id === id);
    const scope: RecurrenceScope = previous?.seriesId ? "single" : "series";
    void updateWithFeedback(id, patch, scope).then((saved) => {
      if (!saved || !previous) return;
      const revert: Partial<EventDraft> = {
        startAt: previous.startAt,
        endAt: previous.endAt,
        laneMode: previous.laneMode,
        manualLane: previous.manualLane,
      };
      showChangeUndoToast(
        t("home.eventUpdated"),
        t("common.undo"),
        () => void updateWithFeedback(id, revert, scope),
      );
    });
  };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (dragging.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    swipe.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const origin = swipe.current;
      swipe.current = null;
      if (!origin || dragging.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) < 64 || Math.abs(dy) > 56) return;
      goToDay(addDays(selectedDate, dx < 0 ? 1 : -1));
    },
    [goToDay, selectedDate],
  );

  return (
    <AppShell>
      <DateHeader
        date={selectedDate}
        calendarOpen={calendarOpen}
        onToggleCalendar={() => setCalendarOpen((open) => !open)}
        onGoToToday={() => {
          goToDay(new Date());
          setCalendarOpen(false);
        }}
        onOpenSettings={() => void navigate({ to: "/settings" })}
        onOpenAgenda={() => setView("agenda")}
        onNewEvent={() => createAt()}
        onArrangeLayers={dayEvents.length > 0 ? () => setArrangeOpen(true) : undefined}
      />

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-300",
          calendarOpen ? "max-h-[560px] opacity-100" : "max-h-0 opacity-0",
        )}
        aria-hidden={!calendarOpen}
      >
        {calendarOpen && (
          <MonthCalendar
            selectedDate={selectedDate}
            events={monthEvents}
            onSelectDay={(day) => {
              goToDay(day);
              setCalendarOpen(false);
            }}
          />
        )}
      </div>

      <div className="space-y-2 py-2.5">
        <div
          role="tablist"
          aria-label={t("nav.viewAria")}
          className="flex w-full rounded-full bg-secondary p-1.5 text-[15px] font-medium"
        >
          {(
            [
              { key: "clock", label: t("nav.clock"), Icon: Clock3 },
              { key: "agenda", label: t("nav.agenda"), Icon: ListChecks },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full transition-colors",
                view === key
                  ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-center text-[13px] text-muted-foreground">
          {isToday(selectedDate)
            ? t("common.today")
            : format(selectedDate, "d MMM yyyy", { locale: dateLocale })}{" "}
          ·{" "}
          {dayEvents.length === 1
            ? t("home.countOne", { count: dayEvents.length })
            : t("home.countOther", { count: dayEvents.length })}
        </p>
      </div>

      {showSyncCard ? (
        <SyncPromptCard
          onDismiss={dismissSyncCard}
          onSignIn={() => {
            dismissSyncCard();
            void navigate({ to: "/auth" });
          }}
        />
      ) : isGuest ? (
        <div className="pb-1">
          <button
            type="button"
            onClick={() => void navigate({ to: "/settings" })}
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium text-muted-foreground"
          >
            <CloudOff className="size-3.5" aria-hidden="true" />
            {t("home.savedLocally")}
          </button>
        </div>
      ) : null}

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {isError ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {t("home.loadError")}
          </p>
        ) : isLoading ? (
          <div className="space-y-4 py-4" aria-busy="true">
            <div className="mx-auto aspect-square w-full max-w-[420px] animate-pulse rounded-full bg-secondary" />
            <div className="h-4 w-32 animate-pulse rounded-full bg-secondary" />
          </div>
        ) : view === "clock" ? (
          <div className={cn("transition-transform duration-300", calendarOpen && "scale-[0.94]")}>
            {settings.timeFormat === "12h" ? (
              <div
                className="mx-auto mb-1.5 flex w-full max-w-[360px] rounded-full bg-secondary p-1"
                role="tablist"
                aria-label={settings.language === "tr" ? "Günün yarısı" : "Part of day"}
              >
                {(
                  [
                    {
                      value: 0 as const,
                      label: settings.language === "tr" ? "Sabah (Öğleden Önce)" : "Morning (AM)",
                    },
                    {
                      value: 1 as const,
                      label: settings.language === "tr" ? "Akşam (Öğleden Sonra)" : "Evening (PM)",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={dayPeriod === option.value}
                    onClick={() => setDayPeriod(option.value)}
                    className={cn(
                      "min-h-10 flex-1 rounded-full px-2 text-[12px] font-medium leading-tight transition-colors",
                      dayPeriod === option.value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <RadialClock
              day={selectedDate}
              events={dayEvents}
              now={isSameDay(selectedDate, now) ? now : undefined}
              timeFormat={settings.timeFormat}
              visibleHalf={settings.timeFormat === "12h" ? dayPeriod : undefined}
              labelStyle={settings.eventLabelStyle}
              snap={settings.snapMinutes}
              interactive={false}
              haptics={settings.hapticsEnabled}
              onSelect={(event) => {
                markClockUsed();
                openEvent(event);
              }}
              onLongPressEvent={(event) => {
                markClockUsed();
                setFocusId(event.id);
              }}
              onCommit={handleCommit}
              onCreate={(startMin, endMin) => createAt(startMin, endMin)}
              onOverflow={(items) => setOverflow(items)}
              onPreview={(event) => {
                markClockUsed();
                setPreview(event);
              }}
              onDraggingChange={(value) => {
                dragging.current = value;
              }}
              className="-mx-2 w-[calc(100%+16px)] max-w-none self-center"
            />

            {showHint && dayEvents.length > 0 ? (
              <div className="pt-1">
                <GestureHint onDismiss={dismissHint} />
              </div>
            ) : null}

            {dayEvents.length === 0 ? (
              <div className="pt-3 pb-[calc(96px+env(safe-area-inset-bottom))]">
                <EmptyDayState onCreate={() => createAt()} />
              </div>
            ) : (
              <section className="pt-4" aria-label={t("home.upcomingAria")}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-2">
                  <h2 className="truncate text-[15px] font-semibold">{t("home.upcoming")}</h2>
                  {dayEvents.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setView("agenda")}
                      className="shrink-0 text-[14px] font-medium text-muted-foreground"
                    >
                      {t("home.viewAll")}
                    </button>
                  )}
                </div>

                <ul className="space-y-2.5 pb-[calc(96px+env(safe-area-inset-bottom))]">
                  {dayEvents.slice(0, 3).map((event) => {
                    const Icon = categoryIcon(event.category);
                    return (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => openEvent(event)}
                          className="flex min-h-[68px] w-full items-center gap-3 overflow-hidden rounded-[17px] border border-border bg-card py-3 pl-2 pr-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
                        >
                          <span
                            aria-hidden="true"
                            className="h-10 w-[3px] shrink-0 rounded-full"
                            style={{ backgroundColor: `var(--ev-${event.color})` }}
                          />
                          <span
                            aria-hidden="true"
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: `color-mix(in oklab, var(--ev-${event.color}) 45%, var(--card))`,
                            }}
                          >
                            <Icon className="size-[18px] text-foreground/70" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] font-medium leading-snug">
                              {event.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                              {t(`category.${event.category}` as const)}
                            </span>
                          </span>
                          <span className="w-[84px] shrink-0 text-right text-[12.5px] leading-tight tabular-nums whitespace-normal text-muted-foreground">
                            {formatRange(event.startAt, event.endAt, settings.timeFormat)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div className="pb-[calc(96px+env(safe-area-inset-bottom))]">
            <AgendaList
              events={dayEvents}
              timeFormat={settings.timeFormat}
              onOpen={openEvent}
              onToggleComplete={(event) =>
                void updateWithFeedback(event.id, { isCompleted: !event.isCompleted })
              }
              onCreate={() => createAt()}
            />
          </div>
        )}
      </div>

      {!preview && !overflow ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center">
          <div className="w-full max-w-[440px] px-safe">
            <div className="flex justify-end pb-[calc(20px+env(safe-area-inset-bottom))] pr-[2px]">
              <button
                type="button"
                onClick={() => createAt()}
                aria-label={t("menu.newEvent")}
                className="pointer-events-auto flex size-[58px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_24px_-6px_color-mix(in_oklab,var(--primary)_65%,transparent)] transition-transform active:scale-95"
              >
                <Plus className="size-7" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <EventPreviewPopover
        event={preview}
        timeFormat={settings.timeFormat}
        onClose={() => setPreview(null)}
        onEdit={(event) => {
          setPreview(null);
          setFocusId(event.id);
        }}
      />

      {focusEvent ? (
        <FocusEditMode
          event={focusEvent}
          dayEvents={dayEvents}
          day={selectedDate}
          settings={settings}
          onClose={() => setFocusId(null)}
          onApply={(patch) => {
            applyFocusPatch(focusEvent.id, patch);
            setFocusId(null);
          }}
          onApplyOther={(id, patch) => void updateWithFeedback(id, patch)}
          onDelete={() => {
            const target = focusEvent;
            setFocusId(null);
            if (target.seriesId) {
              setPendingDelete(target.id);
              return;
            }
            void deleteEvent(target.id)
              .then((removed) => {
                if (removed)
                  showUndoToast(
                    t("toast.deleted", { title: removed.title }),
                    t("common.undo"),
                    () =>
                      void restoreEvent(removed).catch(() => toast.error(t("toast.updateFailed"))),
                  );
              })
              .catch(() => toast.error(t("toast.deleteFailed")));
          }}
          onOpenFullEditor={() => {
            setFocusId(null);
            openEvent(focusEvent);
          }}
        />
      ) : null}

      <ArrangeLayersSheet
        open={arrangeOpen}
        day={selectedDate}
        events={dayEvents}
        timeFormat={settings.timeFormat}
        onClose={() => setArrangeOpen(false)}
        onMove={(id, patch) => applyFocusPatch(id, patch)}
      />

      <OverlapEventSheet
        events={overflow}
        timeFormat={settings.timeFormat}
        onClose={() => setOverflow(null)}
        onSelect={(event) => {
          setOverflow(null);
          openEvent(event);
        }}
      />

      <RecurrenceScopeSheet
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onChoose={(scope) => {
          const id = pendingDelete;
          setPendingDelete(null);
          if (!id) return;
          void deleteEvent(id, scope)
            .then((removed) => {
              if (removed)
                showUndoToast(
                  t("toast.deleted", { title: removed.title }),
                  t("common.undo"),
                  () =>
                    void restoreEvent(removed).catch(() => toast.error(t("toast.updateFailed"))),
                );
            })
            .catch(() => toast.error(t("toast.deleteFailed")));
        }}
      />

      {showOnboarding && !focusEvent && !preview ? (
        <LabelStyleOnboarding
          initial={settings.eventLabelStyle}
          onContinue={(style) => {
            updateSettings({ eventLabelStyle: style });
            finishOnboarding();
          }}
          onDismiss={finishOnboarding}
        />
      ) : null}

      {showTimeFormatOnboarding ? (
        <TimeFormatOnboarding
          initial={settings.timeFormat}
          onContinue={(timeFormat) => {
            updateSettings({ timeFormat });
            window.localStorage.setItem(TIME_FORMAT_ONBOARDING_KEY, "1");
            setShowTimeFormatOnboarding(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}
