import { Hand, X } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

interface GestureHintProps {
  onDismiss: () => void;
}

/**
 * One-time coach line that makes the invisible dial gestures discoverable:
 * tap to preview, long-press to edit, drag to move or change layer.
 */
export function GestureHint({ onDismiss }: GestureHintProps) {
  const { t } = useI18n();
  const strong = (text: string): ReactNode => (
    <span className="font-medium text-foreground">{text}</span>
  );
  const parts = t("hint.template").split(/(\{tap\}|\{longPress\}|\{drag\})/);
  const replacements: Record<string, string> = {
    "{tap}": t("hint.tap"),
    "{longPress}": t("hint.longPress"),
    "{drag}": t("hint.drag"),
  };
  return (
    <div className="flex items-start gap-2.5 rounded-[16px] border border-border bg-card px-3 py-2.5">
      <Hand className="mt-[1px] size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {parts.map((part, index) => (
          <Fragment key={index}>
            {part in replacements ? strong(replacements[part]!) : part}
          </Fragment>
        ))}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("hint.dismiss")}
        className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center text-muted-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
