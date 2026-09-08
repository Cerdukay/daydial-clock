import { Check, MapPin } from "lucide-react";
import { formatRange } from "@/lib/daydial/format";
import { categoryIcon } from "@/lib/daydial/categoryIcons";
import { colorVar, type PlannerEvent } from "@/lib/daydial/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface AgendaItemProps {
  event: PlannerEvent;
  timeFormat: "12h" | "24h";
  onOpen: (event: PlannerEvent) => void;
  onToggleComplete: (event: PlannerEvent) => void;
}

export function AgendaItem({ event, timeFormat, onOpen, onToggleComplete }: AgendaItemProps) {
  const { t } = useI18n();
  const Icon = categoryIcon(event.category);

  return (
    <li className="relative flex min-h-[76px] w-full items-stretch overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.035)]">
      <span
        aria-hidden="true"
        className="my-3 ml-2 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: colorVar(event.color) }}
      />
      <button
        type="button"
        onClick={() => onOpen(event)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 px-3 py-3.5 pr-14 text-left",
          event.isCompleted && "opacity-70",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `color-mix(in oklab, ${colorVar(event.color)} 45%, var(--card))`,
          }}
        >
          <Icon className="size-[18px] text-foreground/70" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[16px] font-medium leading-snug",
              event.isCompleted && "text-muted-foreground line-through",
            )}
          >
            {event.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
            <span className="tabular-nums">
              {formatRange(event.startAt, event.endAt, timeFormat)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t(`category.${event.category}` as const)}</span>
            {event.location ? (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{event.location}</span>
              </span>
            ) : null}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onToggleComplete(event)}
        aria-pressed={event.isCompleted}
        aria-label={
          event.isCompleted
            ? t("agenda.markNotDone", { title: event.title })
            : t("agenda.markDone", { title: event.title })
        }
        className="absolute right-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full"
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full border transition-colors",
            event.isCompleted
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-secondary text-muted-foreground",
          )}
        >
          <Check className="size-4" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}
