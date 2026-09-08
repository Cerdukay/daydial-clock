import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addMinutes, startOfDay } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/daydial/AppShell";
import { EventEditor } from "@/components/daydial/EventEditor";
import { usePlanner } from "@/lib/daydial/store";
import { useI18n } from "@/lib/i18n";
import type { EventDraft } from "@/lib/daydial/types";

interface NewEventSearch {
  start?: string;
  end?: string;
}

export const Route = createFileRoute("/event/new")({
  validateSearch: (search: Record<string, unknown>): NewEventSearch => ({
    start: typeof search["start"] === "string" ? search["start"] : undefined,
    end: typeof search["end"] === "string" ? search["end"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New event — DayDial" },
      {
        name: "description",
        content: "Sketch a new time block on the dial, then name it, color it and save.",
      },
      { property: "og:title", content: "New event — DayDial" },
      { property: "og:description", content: "Create a time block on your radial day planner." },
    ],
  }),
  component: NewEventScreen,
});

function NewEventScreen() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { createEvent, settings } = usePlanner();
  const { t } = useI18n();

  const start = search.start ? new Date(search.start) : addMinutes(startOfDay(new Date()), 9 * 60);
  const end = search.end
    ? new Date(search.end)
    : addMinutes(start, settings.defaultDurationMinutes);

  const placement = settings.defaultLanePlacement;
  const initial: EventDraft = {
    title: "",
    description: "",
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    color: "cyan",
    category: "Personal",
    calendarName: "Personal",
    location: "",
    notes: "",
    // A newly-created event should remind the user at its start by default.
    // Users can still choose "No reminder" in the expanded editor.
    reminderMinutes: 0,
    repeat: "none",
    repeatUntil: null,
    repeatCount: 0,
    isCompleted: false,
    laneMode: placement === "auto" ? "auto" : "manual",
    manualLane: placement === "innermost" ? 1 : placement === "outermost" ? 4 : null,
  };

  return (
    <AppShell>
      <EventEditor
        mode="create"
        initial={initial}
        timeFormat={settings.timeFormat}
        snapMinutes={settings.snapMinutes}
        onCancel={() => void navigate({ to: "/" })}
        onSave={async (draft) => {
          try {
            await createEvent(draft);
            toast.success(t("toast.eventAdded"));
            void navigate({ to: "/" });
          } catch {
            toast.error(t("toast.eventSaveFailed"));
          }
        }}
      />
    </AppShell>
  );
}
