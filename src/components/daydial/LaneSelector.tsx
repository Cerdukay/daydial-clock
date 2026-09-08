import { MAX_VISIBLE_LANES } from "@/lib/daydial/geometry";
import { type LaneMode, type ManualLane } from "@/lib/daydial/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LaneSelectorProps {
  mode: LaneMode;
  lane: ManualLane | null;
  /** How many events already sit in each lane (0-based index). */
  occupancy?: number[] | undefined;
  onChange: (mode: LaneMode, lane: ManualLane | null) => void;
}

const LANES: ManualLane[] = Array.from(
  { length: MAX_VISIBLE_LANES },
  (_, index) => (index + 1) as ManualLane,
);

/** Auto / Layer 1-4 chooser with the brand violet marking the active choice. */
export function LaneSelector({ mode, lane, occupancy, onChange }: LaneSelectorProps) {
  const { t } = useI18n();
  const selected = mode === "manual" ? lane : null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" role="radiogroup" aria-label={t("lane.groupAria")}>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "auto"}
          onClick={() => onChange("auto", null)}
          className={cn(
            "flex h-11 min-w-[74px] flex-1 items-center justify-center rounded-xl text-[14px] font-medium transition-colors",
            mode === "auto"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {t("common.auto")}
        </button>
        {LANES.map((value) => {
          const active = selected === value;
          const count = occupancy?.[value - 1] ?? 0;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={
                count
                  ? t("lane.occupancy", { layer: t(`layer.${value}` as const), count })
                  : t("lane.emptyAria", { layer: t(`layer.${value}` as const) })
              }
              onClick={() => onChange("manual", value)}
              className={cn(
                "relative flex size-11 items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
              )}
            >
              {value}
              {count > 0 && !active ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 size-1.5 rounded-full bg-muted-foreground"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "auto"
          ? t("lane.hintAuto")
          : t("lane.hintPinned", { layer: t(`layer.${selected ?? 1}` as const) })}
      </p>
    </div>
  );
}
