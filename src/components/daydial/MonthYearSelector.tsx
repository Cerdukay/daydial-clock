import { useEffect, useRef, useState } from "react";
import { format, getYear, setMonth, setYear } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface MonthYearSelectorProps {
  month: Date;
  onChange: (next: Date) => void;
}

/** Horizontal chip strip with 16px inner padding and edge fades when scrollable. */
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      setEdges({
        start: node.scrollLeft > 4,
        end: node.scrollLeft + node.clientWidth < node.scrollWidth - 4,
      });
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      node.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
      {edges.start && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {edges.end && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
        />
      )}
    </div>
  );
}

export function MonthYearSelector({ month, onChange }: MonthYearSelectorProps) {
  const { t, dateLocale } = useI18n();
  const months = Array.from({ length: 12 }, (_, index) =>
    format(setMonth(new Date(), index), "LLL", { locale: dateLocale }),
  );
  const currentYear = getYear(new Date());
  const years = Array.from({ length: 9 }, (_, i) => currentYear - 3 + i);

  return (
    <div className="-mx-4 space-y-2">
      <ChipRow label={t("calendar.selectMonth")}>
        {months.map((label, index) => {
          const active = month.getMonth() === index;
          return (
            <button
              key={label}
              type="button"
              ref={(node) => {
                if (node && active) {
                  node.scrollIntoView({ block: "nearest", inline: "center" });
                }
              }}
              aria-pressed={active}
              onClick={() => onChange(setMonth(month, index))}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </ChipRow>

      <ChipRow label={t("calendar.selectYear")}>
        {years.map((year) => {
          const active = getYear(month) === year;
          return (
            <button
              key={year}
              type="button"
              ref={(node) => {
                if (node && active) {
                  node.scrollIntoView({ block: "nearest", inline: "center" });
                }
              }}
              aria-pressed={active}
              onClick={() => onChange(setYear(month, year))}
              className={cn(
                "min-h-10 shrink-0 rounded-full px-4 text-[14px] font-medium tabular-nums transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {year}
            </button>
          );
        })}
      </ChipRow>
    </div>
  );
}
