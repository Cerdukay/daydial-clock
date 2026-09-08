import { useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
  format,
} from "date-fns";
import type { PlannerEvent } from "@/lib/daydial/types";
import { CalendarDayCell } from "./CalendarDayCell";
import { MonthYearSelector } from "./MonthYearSelector";
import { useI18n } from "@/lib/i18n";

interface MonthCalendarProps {
  selectedDate: Date;
  events: PlannerEvent[];
  onSelectDay: (day: Date) => void;
}

/** Seven-column month grid with mini event arcs per day. */
export function MonthCalendar({ selectedDate, events, onSelectDay }: MonthCalendarProps) {
  const { t, dateLocale } = useI18n();
  const [month, setMonth] = useState(() => startOfMonth(selectedDate));

  const weekdays = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) =>
      format(addDays(weekStart, index), "EEEEE", { locale: dateLocale }),
    );
  }, [dateLocale]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfMonth(month);
    const totalDays = Math.ceil((end.getTime() - gridStart.getTime()) / 86400000) + 1;
    const weeks = Math.ceil(totalDays / 7);
    return eachDayOfInterval({ start: gridStart, end: addDays(gridStart, weeks * 7 - 1) });
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    for (const event of events) {
      const key = new Date(event.startAt).toDateString();
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  return (
    <section aria-label={t("calendar.aria")} className="space-y-3 pb-2">
      <MonthYearSelector month={month} onChange={setMonth} />

      <div className="grid grid-cols-7 gap-y-1">
        {weekdays.map((label, index) => (
          <span
            key={`${label}-${index}`}
            aria-hidden="true"
            className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {days.map((day) => (
          <CalendarDayCell
            key={day.toISOString()}
            day={day}
            month={month}
            selected={isSameDay(day, selectedDate)}
            today={isToday(day)}
            events={byDay.get(day.toDateString()) ?? []}
            onSelect={onSelectDay}
          />
        ))}
      </div>
    </section>
  );
}
