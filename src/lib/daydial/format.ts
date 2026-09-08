import { format } from "date-fns";

export function formatTime(date: Date | string, timeFormat: "12h" | "24h" = "12h"): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return format(value, timeFormat === "24h" ? "HH:mm" : "h:mm a");
}

export function formatRange(
  start: Date | string,
  end: Date | string,
  timeFormat: "12h" | "24h" = "12h",
): string {
  return `${formatTime(start, timeFormat)} – ${formatTime(end, timeFormat)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function toLocalInput(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return format(value, "yyyy-MM-dd'T'HH:mm");
}
