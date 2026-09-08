import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useState } from "react";
import { MAX_VISIBLE_LANES } from "@/lib/daydial/geometry";
import { laneOccupants } from "@/lib/daydial/radial";
import { formatRange } from "@/lib/daydial/format";
import { colorVar, type EventDraft, type ManualLane, type PlannerEvent } from "@/lib/daydial/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface ArrangeLayersSheetProps {
  open: boolean;
  day: Date;
  events: PlannerEvent[];
  timeFormat: "12h" | "24h";
  onClose: () => void;
  onMove: (id: string, patch: Partial<EventDraft>) => void;
}

const LANES: ManualLane[] = Array.from(
  { length: MAX_VISIBLE_LANES },
  (_, index) => (index + 1) as ManualLane,
);

/** Optional overview for pinning the day's events to specific rings. */
export function ArrangeLayersSheet({
  open,
  day,
  events,
  timeFormat,
  onClose,
  onMove,
}: ArrangeLayersSheetProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const lanes = laneOccupants(events, day);

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[86dvh] max-w-[430px] overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle>{t("arrange.title")}</SheetTitle>
          <SheetDescription>{t("arrange.desc")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-8">
          {LANES.map((lane) => {
            const items = lanes[lane - 1] ?? [];
            return (
              <section key={lane} aria-label={t(`layer.${lane}` as const)}>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`layer.${lane}` as const)}
                </h3>
                {items.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
                    {t("common.empty")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((event) => (
                      <li key={event.id}>
                        <button
                          type="button"
                          aria-pressed={selected === event.id}
                          onClick={() =>
                            setSelected((current) => (current === event.id ? null : event.id))
                          }
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 text-left",
                            selected === event.id ? "border-primary" : "border-border",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="h-8 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: colorVar(event.color) }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {event.title || t("common.untitled")}
                            </span>
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {formatRange(event.startAt, event.endAt, timeFormat)}
                              {event.laneMode === "manual" ? ` · ${t("common.pinned")}` : ""}
                            </span>
                          </span>
                        </button>

                        {selected === event.id ? (
                          <div className="mt-2 flex gap-1.5 pl-3">
                            <button
                              type="button"
                              aria-label={t("common.auto")}
                              onClick={() => {
                                onMove(event.id, { laneMode: "auto", manualLane: null });
                                setSelected(null);
                              }}
                              className="flex h-10 flex-1 items-center justify-center rounded-xl bg-secondary text-[13px] font-medium"
                            >
                              {t("common.auto")}
                            </button>
                            {LANES.map((target) => (
                              <button
                                key={target}
                                type="button"
                                aria-label={t("arrange.moveTo", {
                                  layer: t(`layer.${target}` as const),
                                })}
                                onClick={() => {
                                  onMove(event.id, { laneMode: "manual", manualLane: target });
                                  setSelected(null);
                                }}
                                className={cn(
                                  "flex size-10 items-center justify-center rounded-xl text-[14px] font-semibold tabular-nums",
                                  target === lane
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-foreground",
                                )}
                              >
                                {target}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
