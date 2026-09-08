import { useState } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const EMOJIS = [
  "☕️",
  "🍽️",
  "🏃",
  "💼",
  "📞",
  "🎧",
  "📚",
  "🧘",
  "🛒",
  "🚗",
  "✈️",
  "🎂",
  "💊",
  "🐶",
  "🎬",
  "🎉",
  "❤️",
  "⭐️",
  "🌙",
  "☀️",
  "🏖️",
  "💤",
  "✅",
  "🔥",
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

/** Compact emoji inserter for event titles. */
export function EmojiPicker({ onSelect, className }: EmojiPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t("editor.emojiAria")}
        className="flex touch-target items-center justify-center rounded-full bg-secondary text-foreground"
      >
        <Smile className="size-[18px]" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Emoji"
          className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-[248px] rounded-[18px] border border-border bg-card p-2 shadow-lg"
        >
          <div className="grid grid-cols-6 gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                aria-label={`Insert ${emoji}`}
                className="flex size-10 items-center justify-center rounded-xl text-[19px] hover:bg-secondary"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
