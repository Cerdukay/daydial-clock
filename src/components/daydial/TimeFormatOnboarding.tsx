import { useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type TimeFormat = "12h" | "24h";

interface TimeFormatOnboardingProps {
  initial: TimeFormat;
  onContinue: (format: TimeFormat) => void;
}

const OPTIONS: TimeFormat[] = ["24h", "12h"];

/** Required first-run choice that determines how the main planning dial is divided. */
export function TimeFormatOnboarding({ initial, onContinue }: TimeFormatOnboardingProps) {
  const { language, t } = useI18n();
  const [choice, setChoice] = useState<TimeFormat>(initial);
  const subtitle =
    language === "tr"
      ? "Günün tamamını tek kadranda görün veya sabah ve akşamı ayrı ayrı planlayın."
      : "See the full day on one dial, or plan morning and evening separately.";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/25 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="time-format-title"
    >
      <div className="w-full rounded-t-[28px] border border-border bg-background px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.35)] sm:max-w-[420px] sm:rounded-[28px] sm:pb-5">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Clock3 className="size-6" aria-hidden="true" />
        </div>
        <h2
          id="time-format-title"
          className="mt-4 text-center font-serif text-[26px] leading-tight tracking-tight"
        >
          {t("settings.timeFormat")}
        </h2>
        <p className="mx-auto mt-2 max-w-[320px] text-center text-sm leading-relaxed text-muted-foreground">
          {subtitle}
        </p>

        <div
          className="mt-5 grid grid-cols-2 gap-2.5"
          role="radiogroup"
          aria-label={t("settings.timeFormat")}
        >
          {OPTIONS.map((option) => {
            const selected = choice === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(option)}
                className={cn(
                  "relative flex min-h-28 flex-col items-center justify-center rounded-2xl border px-3 text-center transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <span className="text-2xl font-semibold tabular-nums">
                  {option === "24h" ? "24" : "12"}
                </span>
                <span className="mt-1 text-sm font-medium">
                  {option === "24h" ? t("settings.format24") : t("settings.format12")}
                </span>
                <span
                  className={cn(
                    "absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full border",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                  aria-hidden="true"
                >
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onContinue(choice)}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
        >
          {t("common.done")}
        </button>
      </div>
    </div>
  );
}
