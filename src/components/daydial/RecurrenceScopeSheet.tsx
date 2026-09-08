import { Repeat } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { RecurrenceScope } from "@/lib/daydial/types";

interface RecurrenceScopeSheetProps {
  open: boolean;
  onClose: () => void;
  onChoose: (scope: RecurrenceScope) => void;
}

/** Asks whether an edit or delete applies to one occurrence or the whole series. */
export function RecurrenceScopeSheet({ open, onClose, onChoose }: RecurrenceScopeSheetProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25"
      />
      <div className="relative mx-4 mb-[max(env(safe-area-inset-bottom),1.25rem)] w-full max-w-[408px] rounded-3xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Repeat className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[16px] font-medium">{t("recurrence.scopeTitle")}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{t("recurrence.scopeBody")}</p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {[
            {
              scope: "single" as RecurrenceScope,
              label: t("recurrence.thisEvent"),
              hint: t("recurrence.thisEventHint"),
            },
            {
              scope: "series" as RecurrenceScope,
              label: t("recurrence.allEvents"),
              hint: t("recurrence.allEventsHint"),
            },
          ].map((option) => (
            <button
              key={option.scope}
              type="button"
              onClick={() => onChoose(option.scope)}
              className="flex min-h-[60px] w-full flex-col justify-center rounded-2xl bg-secondary px-4 py-2.5 text-left"
            >
              <span className="text-[15px] font-medium">{option.label}</span>
              <span className="text-[12.5px] text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 items-center rounded-full bg-secondary px-4 text-[14px] font-medium"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
