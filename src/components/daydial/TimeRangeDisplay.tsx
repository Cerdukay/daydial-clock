import { differenceInMinutes } from "date-fns";
import { formatRange } from "@/lib/daydial/format";
import { durationText, useI18n } from "@/lib/i18n";

export function TimeRangeDisplay({
  start,
  end,
  timeFormat,
}: {
  start: Date;
  end: Date;
  timeFormat: "12h" | "24h";
}) {
  const { t } = useI18n();
  const minutes = Math.max(0, differenceInMinutes(end, start));
  return (
    <div className="text-center" aria-live="polite">
      <p className="text-[21px] font-semibold tabular-nums tracking-tight">
        {formatRange(start, end, timeFormat)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{durationText(t, minutes)}</p>
    </div>
  );
}
