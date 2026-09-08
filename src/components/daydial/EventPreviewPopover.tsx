import { Pencil } from "lucide-react";
import { formatRange } from "@/lib/daydial/format";
import { colorVar, type PlannerEvent } from "@/lib/daydial/types";
import { useI18n } from "@/lib/i18n";

interface EventPreviewPopoverProps {
  event: PlannerEvent | null;
  timeFormat: "12h" | "24h";
  onClose: () => void;
  onEdit: (event: PlannerEvent) => void;
}

/** Compact preview shown when tapping a short, unlabeled event arc. */
export function EventPreviewPopover({
  event,
  timeFormat,
  onClose,
  onEdit,
}: EventPreviewPopoverProps) {
  const { t } = useI18n();
  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("preview.closeAria")}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20"
      />
      <div className="relative mx-4 mb-[max(env(safe-area-inset-bottom),1.25rem)] w-full max-w-[408px] rounded-3xl border border-border bg-card p-4 shadow-lg">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 h-9 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorVar(event.color) }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-medium">
              {event.title || t("common.untitled")}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
              {formatRange(event.startAt, event.endAt, timeFormat)}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t(`category.${event.category}` as const)}
            </p>
            {event.location ? (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{event.location}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 items-center rounded-full bg-secondary px-4 text-[14px] font-medium text-foreground"
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            onClick={() => onEdit(event)}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground"
          >
            <Pencil className="size-4" aria-hidden="true" />
            {t("preview.edit")}
          </button>
        </div>
      </div>
    </div>
  );
}
