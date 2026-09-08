import { type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { EmojiPicker } from "./EmojiPicker";

import type { EventColor } from "@/lib/daydial/types";
import { useI18n } from "@/lib/i18n";

interface EventBottomSheetProps {
  title: string;
  onTitleChange: (value: string) => void;
  color: EventColor;
  onColorChange: (color: EventColor) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSave: () => void;
  onDelete?: (() => void) | undefined;
  saving?: boolean | undefined;
  titleError?: string | undefined;
  children?: ReactNode;
}

/** Rounded editing toolbar / bottom sheet for the event editor. */
export function EventBottomSheet({
  title,
  onTitleChange,
  color,
  onColorChange,
  expanded,
  onToggleExpanded,
  onSave,
  onDelete,
  saving = false,
  titleError,
  children,
}: EventBottomSheetProps) {
  const { t } = useI18n();

  return (
    <section className="rounded-3xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("editor.deleteAria")}
            className="flex touch-target items-center justify-center rounded-full bg-secondary text-destructive"
          >
            <Trash2 className="size-[18px]" aria-hidden="true" />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="event-title">
            {t("editor.titleLabel")}
          </label>
          <input
            id="event-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t("editor.titlePlaceholder")}
            aria-invalid={Boolean(titleError)}
            aria-describedby={titleError ? "event-title-error" : undefined}
            className="h-11 w-full rounded-xl bg-secondary px-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <EmojiPicker onSelect={(emoji) => onTitleChange(title ? `${title}${emoji}` : emoji)} />

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? t("editor.collapse") : t("editor.expand")}
          className="flex touch-target items-center justify-center rounded-full bg-secondary text-foreground"
        >
          {expanded ? (
            <ChevronDown className="size-[18px]" aria-hidden="true" />
          ) : (
            <ChevronUp className="size-[18px]" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-label={t("editor.saveAria")}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60"
        >
          <Check className="size-5" aria-hidden="true" />
        </button>
      </div>

      {titleError ? (
        <p id="event-title-error" className="mt-2 px-1 text-xs text-destructive">
          {titleError}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <ColorPicker value={color} onChange={onColorChange} compact />
      </div>

      {expanded ? (
        <div
          className="mt-3 max-h-[46dvh] space-y-4 overflow-y-auto overscroll-contain scroll-pb-24 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1"
          style={{ touchAction: "pan-y" }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
