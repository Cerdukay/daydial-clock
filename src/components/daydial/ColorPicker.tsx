import { EVENT_COLORS, colorVar, type EventColor } from "@/lib/daydial/types";
import { useI18n } from "@/lib/i18n";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: EventColor;
  onChange: (color: EventColor) => void;
  compact?: boolean;
}

export function ColorPicker({ value, onChange, compact = false }: ColorPickerProps) {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t("editor.colorAria")}
      className={cn("flex items-center gap-2.5", compact && "gap-2")}
    >
      {EVENT_COLORS.map((color) => {
        const active = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(`color.${color}` as const)}
            onClick={() => onChange(color)}
            className={cn(
              "flex items-center justify-center rounded-full border transition-colors",
              compact ? "size-8" : "size-9",
              active ? "border-foreground" : "border-transparent",
            )}
            style={{ backgroundColor: colorVar(color) }}
          >
            {active && (
              <Check
                className="size-4 text-[color:var(--ev-check)]"
                aria-hidden="true"
                strokeWidth={3}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
