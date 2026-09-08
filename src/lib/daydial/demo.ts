import { addMinutes, startOfDay } from "date-fns";
import type { EventColor, PlannerEvent } from "./types";

interface Seed {
  title: string;
  start: number;
  end: number;
  color: EventColor;
  category: PlannerEvent["category"];
  location?: string;
}

const SEEDS: Seed[] = [
  {
    title: "Arena",
    start: 9 * 60,
    end: 9 * 60 + 30,
    color: "cyan",
    category: "Health",
    location: "City Arena",
  },
  { title: "Standup", start: 9 * 60 + 15, end: 9 * 60 + 45, color: "violet", category: "Work" },
  { title: "Lunch", start: 12 * 60 + 30, end: 13 * 60 + 30, color: "yellow", category: "Personal" },
  { title: "Project Work", start: 15 * 60, end: 17 * 60, color: "green", category: "Focus" },
  { title: "Design review", start: 16 * 60, end: 16 * 60 + 45, color: "violet", category: "Work" },
  {
    title: "Beach",
    start: 17 * 60 + 30,
    end: 19 * 60,
    color: "orange",
    category: "Social",
    location: "Coast road",
  },
  { title: "Dinner", start: 19 * 60 + 30, end: 20 * 60 + 30, color: "pink", category: "Social" },
];

let counter = 0;
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  counter += 1;
  return `ev-${Date.now()}-${counter}`;
}

export function createDemoEvents(reference: Date = new Date()): PlannerEvent[] {
  const base = startOfDay(reference);
  return SEEDS.map((seed) => ({
    id: newId(),
    title: seed.title,
    description: "",
    startAt: addMinutes(base, seed.start).toISOString(),
    endAt: addMinutes(base, seed.end).toISOString(),
    color: seed.color,
    category: seed.category,
    calendarName: "Personal",
    location: seed.location ?? "",
    notes: "",
    reminderMinutes: seed.title === "Arena" ? 15 : -1,
    repeat: "none",
    repeatUntil: null,
    repeatCount: 0,
    isCompleted: seed.title === "Arena",
    laneMode: "auto",
    manualLane: null,
  }));
}
