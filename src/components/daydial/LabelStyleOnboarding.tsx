import { useState } from "react";
import { Check } from "lucide-react";
import type { EventLabelStyle } from "@/lib/daydial/types";
import { LabelStylePreview } from "./LabelStylePreview";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface LabelStyleOnboardingProps {
  initial?: EventLabelStyle;
  onContinue: (style: EventLabelStyle) => void;
  onDismiss: () => void;
}

const OPTIONS: EventLabelStyle[] = ["inside", "outside"];

/**
 * Label-style preference prompt. Shown as a bottom sheet after the user has
 * actually used the clock once, so the choice is concrete rather than abstract.
 */
export function LabelStyleOnboarding({
  initial = "inside",
  onContinue,
  onDismiss,
}: LabelStyleOnboardingProps) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<EventLabelStyle>(initial);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onDismiss}
        className="absolute inset-0 bg-foreground/25"
      />

      <div className="relative w-full self-center rounded-t-[26px] border border-border bg-background px-5 pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.25)] sm:max-w-[440px]">
        <span aria-hidden="true" className="mx-auto mb-4 block h-1 w-10 rounded-full bg-border" />
        <h2 className="font-serif text-[26px] leading-tight tracking-tight">
          {t("labelStyle.title")}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("labelStyle.subtitle")}</p>

        <div className="mt-5 space-y-2.5" role="radiogroup" aria-label={t("labelStyle.groupAria")}>
          {OPTIONS.map((option) => {
            const selected = choice === option;
            const title =
              option === "inside" ? t("labelStyle.insideTitle") : t("labelStyle.outsideTitle");
            const description =
              option === "inside" ? t("labelStyle.insideDesc") : t("labelStyle.outsideDesc");
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(option)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[18px] border bg-card p-3.5 text-left transition-colors",
                  selected ? "border-primary ring-1 ring-primary" : "border-border",
                )}
              >
                <LabelStylePreview style={option} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {description}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
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

        <div className="mt-4 space-y-1.5">
          <button
            type="button"
            onClick={() => onContinue(choice)}
            className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
          >
            {t("labelStyle.use")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-11 w-full items-center justify-center rounded-full text-[13px] font-medium text-muted-foreground"
          >
            {t("labelStyle.later")}
          </button>
        </div>
      </div>
    </div>
  );
}
