// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PlannerProvider, readLocalSettings, usePlanner } from "./store";
import { DEFAULT_SETTINGS, type EventDraft, type PlannerEvent } from "./types";
import { makeEvent } from "./testing";

/* ------------------------------------------------------------------ mocks --- */

vi.mock("@clerk/react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    getToken: vi.fn().mockResolvedValue(null),
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
  useUser: () => ({ user: null }),
}));

vi.mock("@/integrations/neon/client", () => ({
  neon: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: { id: "remote-1" }, error: null }),
    }),
  },
}));

vi.mock("@/lib/notifications", () => ({
  getNotificationPermission: vi.fn().mockResolvedValue("default"),
  isCapacitorNative: vi.fn().mockReturnValue(false),
  registerPushNotifications: vi.fn().mockResolvedValue({ success: true }),
  unregisterPushToken: vi.fn().mockResolvedValue(undefined),
  rescheduleGuestReminders: vi.fn(),
  rescheduleLocalReminders: vi.fn().mockResolvedValue(undefined),
  teardownGuestReminders: vi.fn(),
  teardownLocalReminders: vi.fn().mockResolvedValue(undefined),
  requestNotificationPermission: vi.fn(),
  computeReminders: vi.fn().mockReturnValue([]),
}));

/* --------------------------------------------------------------- helpers --- */

const SETTINGS_KEY = "daydial.settings.v2";
const EVENTS_KEY = "daydial.events.v2";
const EXCEPTIONS_KEY = "daydial.exceptions.v1";
const SEEDED_KEY = "daydial.seeded.v2";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <PlannerProvider>{children}</PlannerProvider>
      </QueryClientProvider>
    );
  };
}

/** A minimal EventDraft derived from a PlannerEvent. */
function toDraft(event: PlannerEvent): EventDraft {
  const { id: _id, seriesId: _s, occurrenceStartAt: _o, ...draft } = event;
  return draft;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ============================================================ pure tests === */

describe("readLocalSettings", () => {
  it("returns DEFAULT_SETTINGS when nothing is stored", () => {
    const result = readLocalSettings();
    expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.snapMinutes).toBe(DEFAULT_SETTINGS.snapMinutes);
    expect(result.timeFormat).toBe(DEFAULT_SETTINGS.timeFormat);
  });

  it("merges stored partial settings over the browser-language fallback", () => {
    const stored = { theme: "dark", timeFormat: "24h" } as const;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));

    const result = readLocalSettings();
    expect(result.theme).toBe("dark");
    expect(result.timeFormat).toBe("24h");
    // Untouched keys keep their defaults.
    expect(result.snapMinutes).toBe(DEFAULT_SETTINGS.snapMinutes);
    expect(result.defaultView).toBe(DEFAULT_SETTINGS.defaultView);
  });

  it("uses the first supported device language when the primary locale is unsupported", () => {
    const languages = Object.getOwnPropertyDescriptor(window.navigator, "languages");
    const language = Object.getOwnPropertyDescriptor(window.navigator, "language");
    try {
      Object.defineProperty(window.navigator, "languages", {
        configurable: true,
        value: ["nl-NL", "tr-TR"],
      });
      Object.defineProperty(window.navigator, "language", {
        configurable: true,
        value: "nl-NL",
      });

      expect(readLocalSettings().language).toBe("tr");
    } finally {
      if (languages) Object.defineProperty(window.navigator, "languages", languages);
      else Reflect.deleteProperty(window.navigator, "languages");
      if (language) Object.defineProperty(window.navigator, "language", language);
      else Reflect.deleteProperty(window.navigator, "language");
    }
  });

  it("keeps a manually stored language over the device language", () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language: "ja" }));

    expect(readLocalSettings().language).toBe("ja");
  });

  it("falls back to DEFAULT_SETTINGS when localStorage contains invalid JSON", () => {
    window.localStorage.setItem(SETTINGS_KEY, "{not valid json");

    const result = readLocalSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("respects a fully-stored settings object", () => {
    const full = {
      ...DEFAULT_SETTINGS,
      language: "es",
      theme: "dark",
      reduceMotion: true,
      hapticsEnabled: false,
      defaultView: "agenda",
      showCompletedEvents: false,
      snapMinutes: 5,
      defaultDurationMinutes: 30,
      timeFormat: "24h",
      eventLabelStyle: "outside",
      defaultLanePlacement: "innermost",
      editingMethod: "gestures",
    };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(full));

    const result = readLocalSettings();
    expect(result).toEqual(full);
  });
});

/* ====================================================== react hook tests === */

describe("PlannerProvider / usePlanner", () => {
  it("initializes with default settings in guest mode", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePlanner(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isGuest).toBe(true);
    expect(result.current.session).toBeNull();
    expect(result.current.settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.current.settings.snapMinutes).toBe(DEFAULT_SETTINGS.snapMinutes);
    expect(result.current.settings.timeFormat).toBe(DEFAULT_SETTINGS.timeFormat);
  });

  it("seeds demo events on first guest load", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePlanner(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // createDemoEvents produces 7 seed events.
    expect(result.current.events).toHaveLength(7);
    expect(result.current.guestEventCount).toBe(7);
  });

  it("createEvent adds a new event to state", async () => {
    // Start with no seeded events so the count is deterministic.
    window.localStorage.setItem(SEEDED_KEY, "1");
    window.localStorage.setItem(EVENTS_KEY, "[]");

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePlanner(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.events).toHaveLength(0);

    const draft = toDraft(
      makeEvent("ignored", "2026-03-15T10:00:00", "2026-03-15T11:00:00", {
        title: "Test Meeting",
      }),
    );

    await act(async () => {
      const created = await result.current.createEvent(draft);
      expect(created.title).toBe("Test Meeting");
      expect(created.id).toBeTruthy();
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]!.title).toBe("Test Meeting");
  });

  it("deleteEvent removes the event from state in guest mode", async () => {
    window.localStorage.setItem(SEEDED_KEY, "1");
    const existing = makeEvent("ev-1", "2026-03-15T10:00:00", "2026-03-15T11:00:00", {
      title: "To Delete",
    });
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify([existing]));

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePlanner(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.events).toHaveLength(1);

    await act(async () => {
      const removed = await result.current.deleteEvent("ev-1");
      expect(removed?.id).toBe("ev-1");
    });

    expect(result.current.events).toHaveLength(0);
  });

  it("updateSettings updates state and persists to localStorage", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePlanner(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.updateSettings({ theme: "dark", timeFormat: "24h" });
    });

    expect(result.current.settings.theme).toBe("dark");
    expect(result.current.settings.timeFormat).toBe("24h");

    const stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!);
    expect(stored.theme).toBe("dark");
    expect(stored.timeFormat).toBe("24h");
  });

  it("getEvent returns an event by id", async () => {
    window.localStorage.setItem(SEEDED_KEY, "1");
    const existing = makeEvent("ev-lookup", "2026-03-15T10:00:00", "2026-03-15T11:00:00");
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify([existing]));

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePlanner(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const found = result.current.getEvent("ev-lookup");
    expect(found).toBeDefined();
    expect(found?.id).toBe("ev-lookup");

    expect(result.current.getEvent("nonexistent")).toBeUndefined();
  });

  it("eventsForDay returns events overlapping the given day", async () => {
    window.localStorage.setItem(SEEDED_KEY, "1");
    const existing = makeEvent("ev-day", "2026-03-15T10:00:00", "2026-03-15T11:00:00");
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify([existing]));

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePlanner(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const dayEvents = result.current.eventsForDay(new Date("2026-03-15T00:00:00"));
    expect(dayEvents).toHaveLength(1);
    expect(dayEvents[0]!.id).toBe("ev-day");

    const emptyDay = result.current.eventsForDay(new Date("2026-04-01T00:00:00"));
    expect(emptyDay).toHaveLength(0);
  });

  it("throws when usePlanner is used outside PlannerProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => usePlanner())).toThrow(
      "usePlanner must be used inside PlannerProvider",
    );
    spy.mockRestore();
  });
});
