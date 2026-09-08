import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatRange } from "@/lib/daydial/format";
import { colorVar, type PlannerEvent } from "@/lib/daydial/types";
import { useI18n } from "@/lib/i18n";

interface OverlapEventSheetProps {
  events: PlannerEvent[] | null;
  timeFormat: "12h" | "24h";
  onClose: () => void;
  onSelect: (event: PlannerEvent) => void;
}

/** Compact picker shown when tapping a "+N" overlap indicator. */
export function OverlapEventSheet({
  events,
  timeFormat,
  onClose,
  onSelect,
}: OverlapEventSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet open={Boolean(events)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="bottom" className="mx-auto max-w-[430px] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{t("overlap.title")}</SheetTitle>
        </SheetHeader>
        <ul className="mt-2 space-y-2 px-4 pb-6">
          {(events ?? []).map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect(event)}
                aria-label={event.title}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left"
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full"
                  style={{ backgroundColor: colorVar(event.color) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{event.title}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatRange(event.startAt, event.endAt, timeFormat)} ·{" "}
                    {t(`category.${event.category}` as const)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
