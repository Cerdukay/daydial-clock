import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/react";

/**
 * Safe wrappers around Clerk hooks that gracefully degrade to guest mode
 * when ClerkProvider is not mounted (e.g. local dev without Clerk, or
 * Capacitor builds where Clerk JS fails to load).
 */
function useSafeClerkAuth() {
  try {
    return useClerkAuth();
  } catch {
    return {
      isLoaded: true,
      isSignedIn: false,
      getToken: async () => null,
      signOut: async () => {},
    } as ReturnType<typeof useClerkAuth>;
  }
}

function useSafeUser() {
  try {
    return useUser();
  } catch {
    return { user: null, isLoaded: true, isSignedIn: false } as ReturnType<typeof useUser>;
  }
}
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { neon } from "@/integrations/neon/client";
import { setNeonTokenGetter } from "@/integrations/neon/token";
import { createDemoEvents, newId } from "./demo";
import { isLanguage, resolvePreferredLanguage } from "@/lib/i18n";
import { expandDay, expandRange, parseOccurrenceId, resolveInstance } from "./recurrence";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Category,
  type EventColor,
  type EventDraft,
  type EventException,
  type ManualLane,
  type PlannerEvent,
  type RecurrenceScope,
  type RepeatRule,
} from "./types";
import { syncWidgetData } from "./widget";
import {
  isCapacitorNative,
  registerPushNotifications,
  rescheduleLocalReminders,
  rescheduleGuestReminders,
  teardownLocalReminders,
  teardownGuestReminders,
  unregisterPushToken,
} from "@/lib/notifications";

const EVENTS_KEY = "daydial.events.v2";
const EXCEPTIONS_KEY = "daydial.exceptions.v1";
const SETTINGS_KEY = "daydial.settings.v2";
const SEEDED_KEY = "daydial.seeded.v2";

const DEFAULT_CALENDAR_NAME = "Personal";
const DEFAULT_CATEGORY_NAMES = ["Personal", "Work", "Health", "Social", "Errands", "Focus"];
const accountInitializations = new Map<string, Promise<void>>();

/**
 * Clerk owns identity; the client initializes only its own RLS-protected
 * account rows after sign-in.
 */
function initializeAccount(userId: string): Promise<void> {
  const existing = accountInitializations.get(userId);
  if (existing) return existing;

  const initialization = (async () => {
    const profileResult = await neon
      .from("profiles")
      .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
    if (profileResult.error) throw profileResult.error;

    const settingsResult = await neon
      .from("user_settings")
      .upsert(
        { user_id: userId, language: readLocalSettings().language },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (settingsResult.error) throw settingsResult.error;

    const [calendarResult, categoryResult] = await Promise.all([
      neon.from("calendars").select("name").eq("user_id", userId),
      neon.from("categories").select("name").eq("user_id", userId),
    ]);
    if (calendarResult.error) throw calendarResult.error;
    if (categoryResult.error) throw categoryResult.error;

    const calendarNames = new Set((calendarResult.data ?? []).map((calendar) => calendar.name));
    if (!calendarNames.has(DEFAULT_CALENDAR_NAME)) {
      const createCalendar = await neon
        .from("calendars")
        .insert({ user_id: userId, name: DEFAULT_CALENDAR_NAME });
      if (createCalendar.error) throw createCalendar.error;
    }

    const categoryNames = new Set((categoryResult.data ?? []).map((category) => category.name));
    const missingCategories = DEFAULT_CATEGORY_NAMES.filter((name) => !categoryNames.has(name)).map(
      (name) => ({ user_id: userId, name }),
    );
    if (missingCategories.length > 0) {
      const createCategories = await neon.from("categories").insert(missingCategories);
      if (createCategories.error) throw createCategories.error;
    }
  })();

  accountInitializations.set(userId, initialization);
  void initialization.catch(() => accountInitializations.delete(userId));
  return initialization;
}

/* ---------------------------------------------------------------- local ---- */

function readLocalEvents(): PlannerEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    if (raw) {
      return (JSON.parse(raw) as PlannerEvent[]).map((event) => ({
        ...event,
        repeatUntil: event.repeatUntil ?? null,
        repeatCount: event.repeatCount ?? 0,
      }));
    }
    if (window.localStorage.getItem(SEEDED_KEY)) return [];
    const demo = createDemoEvents();
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(demo));
    window.localStorage.setItem(SEEDED_KEY, "1");
    return demo;
  } catch (err) {
    console.warn("[DayDial] Failed to read local events:", err);
    return [];
  }
}

function writeLocalEvents(events: PlannerEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

function readLocalExceptions(): EventException[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXCEPTIONS_KEY);
    return raw ? (JSON.parse(raw) as EventException[]) : [];
  } catch (err) {
    console.warn("[DayDial] Failed to read local exceptions:", err);
    return [];
  }
}

function writeLocalExceptions(exceptions: EventException[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXCEPTIONS_KEY, JSON.stringify(exceptions));
}

export function readLocalSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const fallback: AppSettings = {
      ...DEFAULT_SETTINGS,
      language: resolvePreferredLanguage([
        ...window.navigator.languages,
        window.navigator.language,
      ]),
    };
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;

    const stored = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...fallback,
      ...stored,
      // A language chosen in Settings is preserved. Invalid legacy values do
      // not prevent device-language detection on later launches.
      language: isLanguage(stored.language) ? stored.language : fallback.language,
    };
  } catch (err) {
    console.warn("[DayDial] Failed to read local settings:", err);
    return {
      ...DEFAULT_SETTINGS,
      language: resolvePreferredLanguage([
        ...window.navigator.languages,
        window.navigator.language,
      ]),
    };
  }
}

/* ------------------------------------------------------------- mapping ---- */

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  color: string;
  category_name: string | null;
  location: string | null;
  notes: string | null;
  recurrence_rule: string;
  recurrence_end_at: string | null;
  is_completed: boolean;
  lane_mode?: string | null;
  manual_lane?: number | null;
  event_reminders?: { minutes_before: number; is_enabled: boolean }[] | null;
}

interface ExceptionRow {
  id: string;
  event_id: string;
  original_start_at: string;
  replacement_start_at: string | null;
  replacement_end_at: string | null;
  is_cancelled: boolean;
}

interface PlannerSession {
  user: {
    id: string;
    email: string;
  };
}

const EVENT_SELECT =
  "id,title,description,start_at,end_at,color,category_name,location,notes,recurrence_rule,recurrence_end_at,is_completed,lane_mode,manual_lane,event_reminders(minutes_before,is_enabled)";

/**
 * Decode the `recurrence_end_at` column into either a date (repeatUntil) or
 * a count (repeatCount). We encode counts as `count:N` so the column stays a
 * string for the DB while the app sees a structured value.
 */
function decodeRecurrenceEnd(raw: string | null): {
  repeatUntil: string | null;
  repeatCount: number;
} {
  if (!raw) return { repeatUntil: null, repeatCount: 0 };
  if (raw.startsWith("count:")) {
    const n = parseInt(raw.slice(6), 10);
    return { repeatUntil: null, repeatCount: isNaN(n) ? 0 : n };
  }
  return { repeatUntil: new Date(raw).toISOString(), repeatCount: 0 };
}

/** Encode repeatUntil/repeatCount back into a single string for the DB column. */
function encodeRecurrenceEnd(
  event: Pick<EventDraft, "repeat" | "repeatUntil" | "repeatCount">,
): string | null {
  if (event.repeat === "none") return null;
  if (event.repeatCount > 0) return `count:${event.repeatCount}`;
  return event.repeatUntil ?? null;
}

function rowToEvent(row: EventRow): PlannerEvent {
  const reminder = row.event_reminders?.find((item) => item.is_enabled);
  const manualLane =
    row.manual_lane && row.manual_lane >= 1 && row.manual_lane <= 4
      ? (row.manual_lane as ManualLane)
      : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    color: (row.color as EventColor) ?? "cyan",
    category: (row.category_name as Category) ?? "Personal",
    calendarName: "Personal",
    location: row.location ?? "",
    notes: row.notes ?? "",
    reminderMinutes: reminder ? reminder.minutes_before : -1,
    repeat: (row.recurrence_rule as RepeatRule) ?? "none",
    ...decodeRecurrenceEnd(row.recurrence_end_at),
    isCompleted: row.is_completed,
    laneMode: row.lane_mode === "manual" && manualLane ? "manual" : "auto",
    manualLane,
  };
}

function rowToException(row: ExceptionRow): EventException {
  return {
    id: row.id,
    eventId: row.event_id,
    originalStartAt: new Date(row.original_start_at).toISOString(),
    replacementStartAt: row.replacement_start_at
      ? new Date(row.replacement_start_at).toISOString()
      : null,
    replacementEndAt: row.replacement_end_at
      ? new Date(row.replacement_end_at).toISOString()
      : null,
    isCancelled: row.is_cancelled,
  };
}

function eventToRow(event: EventDraft, userId: string) {
  return {
    user_id: userId,
    title: event.title,
    description: event.description,
    start_at: event.startAt,
    end_at: event.endAt,
    color: event.color,
    category_name: event.category,
    location: event.location,
    notes: event.notes,
    recurrence_rule: event.repeat,
    recurrence_end_at: encodeRecurrenceEnd(event),
    is_completed: event.isCompleted,
    lane_mode: event.laneMode ?? "auto",
    manual_lane: event.laneMode === "manual" ? (event.manualLane ?? null) : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Only time changes can be stored as a per-occurrence override. */
function isTimeOnlyPatch(patch: Partial<EventDraft>): boolean {
  return Object.keys(patch).every((key) => key === "startAt" || key === "endAt");
}

/* --------------------------------------------------------------- context --- */

interface PlannerContextValue {
  events: PlannerEvent[];
  exceptions: EventException[];
  isLoading: boolean;
  isError: boolean;
  session: PlannerSession | null;
  isGuest: boolean;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  /** Concrete instances (recurrence expanded) overlapping one calendar day. */
  eventsForDay: (day: Date) => PlannerEvent[];
  /** Concrete instances across an inclusive date range. */
  eventsForRange: (from: Date, to: Date) => PlannerEvent[];
  getEvent: (id: string) => PlannerEvent | undefined;
  createEvent: (draft: EventDraft) => Promise<PlannerEvent>;
  updateEvent: (id: string, patch: Partial<EventDraft>, scope?: RecurrenceScope) => Promise<void>;
  deleteEvent: (id: string, scope?: RecurrenceScope) => Promise<PlannerEvent | undefined>;
  restoreEvent: (event: PlannerEvent) => Promise<void>;
  migrateGuestData: () => Promise<number>;
  guestEventCount: number;
  signOut: () => Promise<void>;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useSafeClerkAuth();
  const { user: clerkUser } = useSafeUser();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [localEvents, setLocalEvents] = useState<PlannerEvent[]>([]);
  const [localExceptions, setLocalExceptions] = useState<EventException[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [initializedUserId, setInitializedUserId] = useState<string | null>(null);
  const [accountInitializationError, setAccountInitializationError] = useState<Error | null>(null);

  useEffect(() => {
    setSettings(readLocalSettings());
    setLocalEvents(readLocalEvents());
    setLocalExceptions(readLocalExceptions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    setNeonTokenGetter(async () => (isSignedIn ? getToken() : null));
    return () => setNeonTokenGetter(null);
  }, [getToken, isSignedIn]);

  const userId = isSignedIn ? (clerkUser?.id ?? null) : null;
  // Memoize session so it keeps a stable reference across renders that don't
  // actually change the user. Without this, every render creates a new object,
  // which cascades into the big context useMemo and forces all consumers to
  // re-render unnecessarily.
  const session = useMemo(
    () =>
      userId
        ? {
            user: {
              id: userId,
              email: clerkUser?.primaryEmailAddress?.emailAddress ?? "",
            },
          }
        : null,
    [userId, clerkUser?.primaryEmailAddress?.emailAddress],
  );
  const authReady = isLoaded;
  const accountReady = !userId || initializedUserId === userId;

  useEffect(() => {
    if (!userId) {
      setInitializedUserId(null);
      setAccountInitializationError(null);
      return;
    }

    let active = true;
    setInitializedUserId(null);
    setAccountInitializationError(null);
    void initializeAccount(userId)
      .then(() => {
        if (active) setInitializedUserId(userId);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const normalized = error instanceof Error ? error : new Error(String(error));
        console.error("[DayDial] Unable to initialize account:", normalized);
        setAccountInitializationError(normalized);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  // Pull the signed-in user's stored preferences once the session is known.
  useEffect(() => {
    if (!userId || !accountReady) return;
    let active = true;
    void neon
      .from("user_settings")
      .select("event_label_style,default_lane_placement,editing_method,snap_minutes,language")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (!data?.event_label_style) {
          // Guest picked preferences before signing in — carry them to the account.
          setSettings((current) => {
            void neon.from("user_settings").upsert({
              user_id: userId,
              event_label_style: current.eventLabelStyle,
              default_lane_placement: current.defaultLanePlacement,
              editing_method: current.editingMethod,
              snap_minutes: current.snapMinutes,
              language: current.language,
            });
            return current;
          });
          return;
        }
        const style = data.event_label_style === "outside" ? "outside" : "inside";
        const placement = (["auto", "innermost", "outermost"] as const).includes(
          data.default_lane_placement as AppSettings["defaultLanePlacement"],
        )
          ? (data.default_lane_placement as AppSettings["defaultLanePlacement"])
          : "auto";
        const method = (["controls", "gestures", "both"] as const).includes(
          data.editing_method as AppSettings["editingMethod"],
        )
          ? (data.editing_method as AppSettings["editingMethod"])
          : "both";
        setSettings((current) => {
          const next: AppSettings = {
            ...current,
            eventLabelStyle: style as AppSettings["eventLabelStyle"],
            defaultLanePlacement: placement,
            editingMethod: method,
            snapMinutes: data.snap_minutes ?? current.snapMinutes,
            language: isLanguage(data.language) ? data.language : current.language,
          };
          if (typeof window !== "undefined") {
            window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
          }
          return next;
        });
      });
    return () => {
      active = false;
    };
  }, [userId, accountReady]);

  const remote = useQuery({
    queryKey: ["events", userId],
    enabled: Boolean(userId) && accountReady,
    queryFn: async (): Promise<{ events: PlannerEvent[]; exceptions: EventException[] }> => {
      const [eventsResult, exceptionsResult] = await Promise.all([
        neon
          .from("events")
          .select(EVENT_SELECT)
          .is("deleted_at", null)
          .order("start_at", { ascending: true }),
        neon
          .from("event_exceptions")
          .select(
            "id,event_id,original_start_at,replacement_start_at,replacement_end_at,is_cancelled",
          ),
      ]);
      if (eventsResult.error) throw eventsResult.error;
      if (exceptionsResult.error) throw exceptionsResult.error;
      return {
        events: (eventsResult.data as unknown as EventRow[]).map(rowToEvent),
        exceptions: (exceptionsResult.data as unknown as ExceptionRow[]).map(rowToException),
      };
    },
  });

  // Memoize events/exceptions so they keep a stable reference across renders
  // that don't actually change the underlying data. Without this, every render
  // produces a new array reference, which cascades into every useEffect and
  // useMemo that depends on them — causing unnecessary re-renders and
  // re-scheduling on Capacitor WebView.
  const events = useMemo(
    () => (userId ? (remote.data?.events ?? []) : localEvents),
    [userId, remote.data?.events, localEvents],
  );
  const exceptions = useMemo(
    () => (userId ? (remote.data?.exceptions ?? []) : localExceptions),
    [userId, remote.data?.exceptions, localExceptions],
  );

  // Native builds use OS-backed alarms so reminders survive a backgrounded or
  // stopped WebView. Web guests keep the foreground scheduler as a fallback.
  useEffect(() => {
    if (!hydrated) return;
    if (isCapacitorNative()) {
      void rescheduleLocalReminders(events, exceptions, settings.notificationSound);
      return () => {
        void teardownLocalReminders();
      };
    }
    if (userId) {
      teardownGuestReminders();
      return;
    }
    rescheduleGuestReminders(localEvents, settings.notificationSound);
    return () => teardownGuestReminders();
  }, [userId, hydrated, events, exceptions, localEvents, settings.notificationSound]);

  // Push today's event snapshot to the native home-screen widget (Android).
  // No-op on web. Debounced with a 500ms timer to avoid excessive calls.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void syncWidgetData(events, exceptions);
    }, 500);
    return () => clearTimeout(timer);
  }, [hydrated, events, exceptions]);

  // Authenticated users: register for FCM push notifications once the session
  // is established. Failures are non-fatal — reminders simply won't fire while
  // the app is closed, but the in-app experience is unaffected.
  useEffect(() => {
    if (!userId || !accountReady) return;
    let active = true;
    void (async () => {
      const result = await registerPushNotifications(userId);
      if (!active || result.success) return;
      // Soft-fail: log but don't throw. The user can retry from Settings.
      if (result.error && !result.error.includes("Firebase config missing")) {
        console.warn("[notifications] push registration failed:", result.error);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, accountReady]);

  const persistLocal = useCallback((next: PlannerEvent[]) => {
    setLocalEvents(next);
    writeLocalEvents(next);
  }, []);

  const persistLocalExceptions = useCallback((next: EventException[]) => {
    setLocalExceptions(next);
    writeLocalExceptions(next);
  }, []);

  const upsertReminder = useCallback(async (eventId: string, minutes: number, uid: string) => {
    await neon.from("event_reminders").delete().eq("event_id", eventId);
    if (minutes >= 0) {
      await neon
        .from("event_reminders")
        .insert({ event_id: eventId, user_id: uid, minutes_before: minutes });
    }
  }, []);

  /** Writes (or replaces) one per-occurrence override or cancellation. */
  const writeException = useCallback(
    async (entry: Omit<EventException, "id">) => {
      if (!userId) {
        const rest = localExceptions.filter(
          (item) =>
            !(
              item.eventId === entry.eventId &&
              new Date(item.originalStartAt).getTime() === new Date(entry.originalStartAt).getTime()
            ),
        );
        persistLocalExceptions([...rest, { ...entry, id: newId() }]);
        return;
      }
      await neon
        .from("event_exceptions")
        .delete()
        .eq("event_id", entry.eventId)
        .eq("original_start_at", entry.originalStartAt);
      const { error } = await neon.from("event_exceptions").insert({
        event_id: entry.eventId,
        user_id: userId,
        original_start_at: entry.originalStartAt,
        replacement_start_at: entry.replacementStartAt,
        replacement_end_at: entry.replacementEndAt,
        is_cancelled: entry.isCancelled,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["events", userId] });
    },
    [userId, localExceptions, persistLocalExceptions, queryClient],
  );

  const clearException = useCallback(
    async (eventId: string, originalStartAt: string) => {
      if (!userId) {
        persistLocalExceptions(
          localExceptions.filter(
            (item) =>
              !(
                item.eventId === eventId &&
                new Date(item.originalStartAt).getTime() === new Date(originalStartAt).getTime()
              ),
          ),
        );
        return;
      }
      await neon
        .from("event_exceptions")
        .delete()
        .eq("event_id", eventId)
        .eq("original_start_at", originalStartAt);
      await queryClient.invalidateQueries({ queryKey: ["events", userId] });
    },
    [userId, localExceptions, persistLocalExceptions, queryClient],
  );

  const createMutation = useMutation({
    mutationFn: async (draft: EventDraft): Promise<PlannerEvent> => {
      if (!userId) {
        const created: PlannerEvent = { ...draft, id: newId() };
        persistLocal([...localEvents, created]);
        return created;
      }
      const { data, error } = await neon
        .from("events")
        .insert(eventToRow(draft, userId))
        .select("id")
        .single();
      if (error) throw error;
      await upsertReminder(data.id, draft.reminderMinutes, userId);
      await queryClient.invalidateQueries({ queryKey: ["events", userId] });
      return { ...draft, id: data.id };
    },
  });

  const updateSeriesMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<EventDraft> }) => {
      if (!userId) {
        persistLocal(localEvents.map((item) => (item.id === id ? { ...item, ...patch } : item)));
        return;
      }
      const current = events.find((item) => item.id === id);
      if (!current) return;
      const next = { ...current, ...patch };
      const { id: _ignored, seriesId: _s, occurrenceStartAt: _o, ...draft } = next;
      const { error } = await neon.from("events").update(eventToRow(draft, userId)).eq("id", id);
      if (error) throw error;
      if (patch.reminderMinutes !== undefined) {
        await upsertReminder(id, patch.reminderMinutes, userId);
      }
      await queryClient.invalidateQueries({ queryKey: ["events", userId] });
    },
  });

  const deleteSeriesMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!userId) {
        persistLocal(localEvents.filter((item) => item.id !== id));
        persistLocalExceptions(localExceptions.filter((item) => item.eventId !== id));
        return;
      }
      const { error } = await neon.from("events").delete().eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["events", userId] });
    },
  });

  // Stable callbacks for day/range expansion — avoid recreating these
  // functions on every render, which would cascade re-renders into consumers.
  const eventsForDay = useCallback(
    (day: Date) => expandDay(events, exceptions, day),
    [events, exceptions],
  );
  const eventsForRange = useCallback(
    (from: Date, to: Date) => expandRange(events, exceptions, from, to),
    [events, exceptions],
  );

  const value = useMemo<PlannerContextValue>(() => {
    const findInstance = (id: string) => resolveInstance(id, events, exceptions);

    const updateEvent = async (
      id: string,
      patch: Partial<EventDraft>,
      scope: RecurrenceScope = "series",
    ) => {
      const { baseId, originalStartAt } = parseOccurrenceId(id);
      if (!originalStartAt || scope === "series") {
        await updateSeriesMutation.mutateAsync({ id: baseId, patch });
        return;
      }
      const instance = findInstance(id);
      if (!instance) return;
      if (isTimeOnlyPatch(patch)) {
        await writeException({
          eventId: baseId,
          originalStartAt,
          replacementStartAt: patch.startAt ?? instance.startAt,
          replacementEndAt: patch.endAt ?? instance.endAt,
          isCancelled: false,
        });
        return;
      }
      // Richer single-occurrence edits detach into a standalone event.
      const { id: _id, seriesId: _s, occurrenceStartAt: _o, ...base } = instance;
      await writeException({
        eventId: baseId,
        originalStartAt,
        replacementStartAt: null,
        replacementEndAt: null,
        isCancelled: true,
      });
      await createMutation.mutateAsync({
        ...base,
        ...patch,
        repeat: "none",
        repeatUntil: null,
        repeatCount: 0,
      });
    };

    return {
      events,
      exceptions,
      isLoading:
        !hydrated || !authReady || (Boolean(userId) && (!accountReady || remote.isLoading)),
      isError: Boolean(accountInitializationError) || remote.isError,
      session,
      isGuest: !session,
      settings,
      updateSettings: (patch) => {
        setSettings((current) => {
          const next = { ...current, ...patch };
          if (typeof window !== "undefined") {
            window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
          }
          if (userId) {
            void neon.from("user_settings").upsert({
              user_id: userId,
              theme: next.theme,
              reduce_motion: next.reduceMotion,
              haptics_enabled: next.hapticsEnabled,
              default_view: next.defaultView,
              show_completed_events: next.showCompletedEvents,
              event_label_style: next.eventLabelStyle,
              default_lane_placement: next.defaultLanePlacement,
              editing_method: next.editingMethod,
              snap_minutes: next.snapMinutes,
              language: next.language,
            });
          }
          return next;
        });
      },
      eventsForDay,
      eventsForRange,
      getEvent: findInstance,
      createEvent: (draft) => createMutation.mutateAsync(draft),
      updateEvent,
      deleteEvent: async (id, scope = "series") => {
        const removed = findInstance(id);
        const { baseId, originalStartAt } = parseOccurrenceId(id);
        if (originalStartAt && scope === "single") {
          await writeException({
            eventId: baseId,
            originalStartAt,
            replacementStartAt: null,
            replacementEndAt: null,
            isCancelled: true,
          });
          return removed;
        }
        await deleteSeriesMutation.mutateAsync(baseId);
        return removed;
      },
      restoreEvent: async (event) => {
        // A cancelled occurrence comes back by dropping its exception row.
        if (event.seriesId && event.occurrenceStartAt) {
          await clearException(event.seriesId, event.occurrenceStartAt);
          return;
        }
        const { id: _id, seriesId: _s, occurrenceStartAt: _o, ...draft } = event;
        await createMutation.mutateAsync(draft);
      },
      guestEventCount: localEvents.length,
      migrateGuestData: async () => {
        if (!userId || localEvents.length === 0) return 0;
        const rows = localEvents.map((event) => {
          const { id: _id, seriesId: _s, occurrenceStartAt: _o, ...draft } = event;
          return eventToRow(draft, userId);
        });
        const { error } = await neon.from("events").insert(rows);
        if (error) throw error;
        persistLocal([]);
        persistLocalExceptions([]);
        await queryClient.invalidateQueries({ queryKey: ["events", userId] });
        return rows.length;
      },
      signOut: async () => {
        teardownGuestReminders();
        await teardownLocalReminders();
        if (userId) await unregisterPushToken(userId);
        await queryClient.cancelQueries();
        queryClient.clear();
        await clerkSignOut();
      },
    };
  }, [
    events,
    exceptions,
    eventsForDay,
    eventsForRange,
    hydrated,
    authReady,
    userId,
    accountReady,
    accountInitializationError,
    remote.isLoading,
    remote.isError,
    session,
    settings,
    localEvents,
    createMutation,
    updateSeriesMutation,
    deleteSeriesMutation,
    persistLocal,
    persistLocalExceptions,
    writeException,
    clearException,
    queryClient,
    clerkSignOut,
  ]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerContextValue {
  const context = useContext(PlannerContext);
  if (!context) throw new Error("usePlanner must be used inside PlannerProvider");
  return context;
}
