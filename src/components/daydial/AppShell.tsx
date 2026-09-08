import { useEffect, type ReactNode } from "react";
import { usePlanner } from "@/lib/daydial/store";
import { cn } from "@/lib/utils";

/**
 * Full-bleed mobile shell. Uses the entire viewport width on phones and only
 * centers a fixed column on larger (tablet / desktop) screens.
 */
export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  const { settings } = usePlanner();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = settings.theme === "dark" || (settings.theme === "system" && prefersDark);
    root.classList.toggle("dark", dark);
    root.classList.toggle("reduce-motion", settings.reduceMotion);
  }, [settings.theme, settings.reduceMotion]);

  return (
    <div className="flex min-h-dvh w-full justify-center bg-background">
      <main
        className={cn(
          "flex min-h-dvh w-full flex-col overflow-x-hidden bg-background px-safe pt-safe pb-safe md:max-w-[440px] md:border-x md:border-border",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
