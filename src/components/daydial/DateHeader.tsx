import { format } from "date-fns";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface DateHeaderProps {
  date: Date;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  onGoToToday: () => void;
  onOpenSettings: () => void;
  onOpenAgenda: () => void;
  onNewEvent: () => void;
  onArrangeLayers?: (() => void) | undefined;
}

/** Editorial serif date heading with a chevron; double-tap returns to today. */
export function DateHeader({
  date,
  calendarOpen,
  onToggleCalendar,
  onGoToToday,
  onOpenSettings,
  onOpenAgenda,
  onNewEvent,
  onArrangeLayers,
}: DateHeaderProps) {
  const { t, dateLocale } = useI18n();
  const lastTap = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click — uses click (not pointerdown) for Capacitor safety.
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const handleClick = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      onGoToToday();
      return;
    }
    lastTap.current = now;
    onToggleCalendar();
  };

  const runAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={calendarOpen}
        aria-label={t("header.aria", {
          date: format(date, "EEEE d MMMM yyyy", { locale: dateLocale }),
        })}
        className="flex min-w-0 touch-target items-center gap-2 rounded-full text-left"
      >
        <span
          className="truncate font-serif font-normal leading-[1.08] tracking-[-0.01em] text-foreground"
          style={{ fontSize: "clamp(32px, 9vw, 42px)" }}
        >
          {format(date, "EEEE", { locale: dateLocale })}{" "}
          <span className="tabular-nums">{format(date, "d", { locale: dateLocale })}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-6 shrink-0 text-muted-foreground transition-transform",
            calendarOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-label={t("menu.more")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-12 z-50 min-w-[12rem] rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onNewEvent)}
              className="flex w-full cursor-default select-none items-center rounded-xl px-3 py-2.5 text-left text-sm outline-none transition-colors active:bg-accent"
            >
              {t("menu.newEvent")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onGoToToday)}
              className="flex w-full cursor-default select-none items-center rounded-xl px-3 py-2.5 text-left text-sm outline-none transition-colors active:bg-accent"
            >
              {t("menu.jumpToToday")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onOpenAgenda)}
              className="flex w-full cursor-default select-none items-center rounded-xl px-3 py-2.5 text-left text-sm outline-none transition-colors active:bg-accent"
            >
              {t("menu.agendaView")}
            </button>
            {onArrangeLayers ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(onArrangeLayers)}
                className="flex w-full cursor-default select-none items-center rounded-xl px-3 py-2.5 text-left text-sm outline-none transition-colors active:bg-accent"
              >
                {t("menu.arrangeLayers")}
              </button>
            ) : null}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onOpenSettings)}
              className="flex w-full cursor-default select-none items-center rounded-xl px-3 py-2.5 text-left text-sm outline-none transition-colors active:bg-accent"
            >
              {t("menu.settings")}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
