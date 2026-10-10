import type { Language } from "@/lib/i18n";

export const EVENT_COLORS = ["yellow", "pink", "cyan", "green", "violet", "orange"] as const;

export type EventColor = (typeof EVENT_COLORS)[number];

export const COLOR_LABELS: Record<EventColor, string> = {
  yellow: "Yellow",
  pink: "Pink",
  cyan: "Cyan",
  green: "Green",
  violet: "Violet",
  orange: "Orange",
};

export function colorVar(color: EventColor): string {
  return `var(--ev-${color})`;
}

export const CATEGORIES = ["Personal", "Work", "Health", "Social", "Errands", "Focus"] as const;

export type Category = (typeof CATEGORIES)[number];

export const REPEAT_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "annually", label: "Every year" },
] as const;

export type RepeatRule = (typeof REPEAT_OPTIONS)[number]["value"];

export const REMINDER_OPTIONS = [
  { value: -1, label: "No reminder" },
  { value: 0, label: "At start time" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
] as const;

/** The delivery experience selected for a scheduled event reminder. */
export type ReminderDelivery = "notification" | "alarm";

/** How an event is placed on the concentric radial lanes. */
export type LaneMode = "auto" | "manual";

/** 1-based manual lane number (1 = innermost). */
export type ManualLane = 1 | 2 | 3 | 4;

export const LANE_LABELS: Record<ManualLane, string> = {
  1: "Layer 1",
  2: "Layer 2",
  3: "Layer 3",
  4: "Layer 4",
};

/** A planner event. Times are ISO strings in the user's local zone. */
export interface PlannerEvent {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: EventColor;
  category: Category;
  calendarName: string;
  location: string;
  notes: string;
  reminderMinutes: number;
  /** Standard notification, or a high-priority alarm on supported native devices. */
  reminderDelivery: ReminderDelivery;
  repeat: RepeatRule;
  /** Last day the series repeats (inclusive), or null for "forever". */
  repeatUntil: string | null;
  /** End after N occurrences (alternative to repeatUntil). 0 = unlimited. */
  repeatCount: number;
  isCompleted: boolean;
  /** "auto" lets the planner pick a lane; "manual" pins it to manualLane. */
  laneMode: LaneMode;
  manualLane: ManualLane | null;
  /** Set on expanded instances of a repeating event. */
  seriesId?: string;
  /** Original (unmodified) start of an expanded instance. */
  occurrenceStartAt?: string;
}

export type EventDraft = Omit<PlannerEvent, "id" | "seriesId" | "occurrenceStartAt">;

/** A per-occurrence override or cancellation of a repeating event. */
export interface EventException {
  id: string;
  eventId: string;
  originalStartAt: string;
  replacementStartAt: string | null;
  replacementEndAt: string | null;
  isCancelled: boolean;
}

/** Which instances an edit or delete applies to. */
export type RecurrenceScope = "single" | "series";

export type EventLabelStyle = "inside" | "outside";

/** Where a newly created event prefers to sit on the dial. */
export type LanePlacement = "auto" | "innermost" | "outermost";

/** Which editing affordances the radial clock offers. */
export type EditingMethod = "controls" | "gestures" | "both";

/** Built-in notification sounds. `none` silences reminders. */
export const NOTIFICATION_SOUNDS = [
  { value: "none", label: "Silent" },
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "digital", label: "Digital" },
  { value: "gentle", label: "Gentle" },
] as const;

export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number]["value"];

export interface AppSettings {
  language: Language;
  theme: "light" | "dark" | "system";
  reduceMotion: boolean;
  hapticsEnabled: boolean;
  defaultView: "clock" | "agenda";
  showCompletedEvents: boolean;
  snapMinutes: number;
  defaultDurationMinutes: number;
  timeFormat: "12h" | "24h";
  eventLabelStyle: EventLabelStyle;
  defaultLanePlacement: LanePlacement;
  editingMethod: EditingMethod;
  notificationSound: NotificationSound;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  theme: "system",
  reduceMotion: false,
  hapticsEnabled: true,
  defaultView: "clock",
  showCompletedEvents: true,
  snapMinutes: 15,
  defaultDurationMinutes: 60,
  timeFormat: "12h",
  eventLabelStyle: "inside",
  defaultLanePlacement: "auto",
  editingMethod: "both",
  notificationSound: "chime",
};
