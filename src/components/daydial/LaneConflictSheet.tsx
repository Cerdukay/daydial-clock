import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatRange } from "@/lib/daydial/format";
import { colorVar, type ManualLane, type PlannerEvent } from "@/lib/daydial/types";
import { useI18n } from "@/lib/i18n";

export type ConflictChoice = "move" | "swap" | "both" | "cancel";

interface LaneConflictSheetProps {
  open: boolean;
  lane: ManualLane | null;
  conflicts: PlannerEvent[];
  /** Lane the event would move into when choosing "Move". */
  freeLane: ManualLane | null;
  /** False when the lane already holds two sub-tracks. */
  canKeepBoth: boolean;
  timeFormat: "12h" | "24h";
  onChoose: (choice: ConflictChoice) => void;
}

/** Asked when a manually chosen layer is already busy at that time. */
export function LaneConflictSheet({
  open,
  lane,
  conflicts,
  freeLane,
  canKeepBoth,
  timeFormat,
  onChoose,
}: LaneConflictSheetProps) {
  const { t } = useI18n();
  const laneLabel = lane ? t(`layer.${lane}` as const) : t("conflict.thisLayer");
  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onChoose("cancel") : undefined)}>
      <SheetContent side="bottom" className="mx-auto max-w-[430px] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{t("conflict.title", { layer: laneLabel })}</SheetTitle>
          <SheetDescription>{t("conflict.desc")}</SheetDescription>
        </SheetHeader>

        <ul className="space-y-2 px-4">
          {conflicts.map((event) => (
            <li
              key={event.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorVar(event.color) }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {event.title || t("common.untitled")}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatRange(event.startAt, event.endAt, timeFormat)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 px-4 pb-6 pt-3">
          <Action
            label={
              freeLane
                ? t("conflict.move", { layer: t(`layer.${freeLane}` as const) })
                : t("conflict.moveFree")
            }
            hint={t("conflict.moveHint")}
            disabled={!freeLane}
            primary
            onClick={() => onChoose("move")}
          />
          <Action
            label={t("conflict.swap")}
            hint={t("conflict.swapHint")}
            onClick={() => onChoose("swap")}
          />
          <Action
            label={t("conflict.both")}
            hint={canKeepBoth ? t("conflict.bothHint") : t("conflict.bothHintFull")}
            disabled={!canKeepBoth}
            onClick={() => onChoose("both")}
          />
          <Action
            label={t("common.cancel")}
            hint={t("conflict.cancelHint")}
            onClick={() => onChoose("cancel")}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Action({
  label,
  hint,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex min-h-[52px] w-full flex-col items-start justify-center rounded-2xl px-4 py-2 text-left disabled:opacity-50 " +
        (primary
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-card text-foreground")
      }
    >
      <span className="text-[15px] font-medium">{label}</span>
      <span
        className={"text-xs " + (primary ? "text-primary-foreground/80" : "text-muted-foreground")}
      >
        {hint}
      </span>
    </button>
  );
}
