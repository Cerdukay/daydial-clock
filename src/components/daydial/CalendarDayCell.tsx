import { format, isSameDay, isSameMonth } from "date-fns";
import { colorVar, type PlannerEvent } from "@/lib/daydial/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface CalendarDayCellProps {
  day: Date;
  month: Date;
  selected: boolean;
  today: boolean;
  events: PlannerEvent[];
  onSelect: (day: Date) => void;
}

export function CalendarDayCell({
  day,
  month,
  selected,
  today,
  events,
  onSelect,
}: CalendarDayCellProps) {
  const { t, dateLocale } = useI18n();
  const visible = events.slice(0, 3);
  const extra = events.length - visible.length;
  const outside = !isSameMonth(day, month);

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-label={`${format(day, "EEEE d MMMM yyyy", { locale: dateLocale })}, ${
        events.length === 1
          ? t("home.countOne", { count: events.length })
          : t("home.countOther", { count: events.length })
      }${today ? `, ${t("common.today")}` : ""}`}
      aria-current={selected ? "date" : undefined}
      className="relative flex h-14 w-full touch-target flex-col items-center justify-center gap-1 rounded-xl"
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full text-[15px] tabular-nums",
          outside ? "text-muted-foreground/60" : "text-foreground",
          today && !selected && "border border-now font-semibold text-now",
          selected && "bg-primary font-semibold text-primary-foreground",
        )}
      >
        {format(day, "d")}
      </span>

      <span className="flex h-2 items-center justify-center gap-[3px]" aria-hidden="true">
        {visible.map((event) => (
          <span
            key={event.id}
            className="size-1.5 rounded-full"
            style={{ backgroundColor: colorVar(event.color) }}
          />
        ))}
        {extra > 0 && (
          <span className="text-[10px] font-medium leading-none text-muted-foreground">
            +{extra}
          </span>
        )}
      </span>
    </button>
  );
}

export function isSelectedDay(a: Date, b: Date) {
  return isSameDay(a, b);
}
