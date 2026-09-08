import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/daydial/AppShell";
import { EventEditor } from "@/components/daydial/EventEditor";
import { RecurrenceScopeSheet } from "@/components/daydial/RecurrenceScopeSheet";
import { showUndoToast } from "@/components/daydial/UndoToast";
import { usePlanner } from "@/lib/daydial/store";
import { useI18n } from "@/lib/i18n";
import type { EventDraft, RecurrenceScope } from "@/lib/daydial/types";

export const Route = createFileRoute("/event/$eventId")({
  head: () => ({
    meta: [
      { title: "Edit event — DayDial" },
      {
        name: "description",
        content: "Adjust the time, color, category and reminders of a block on your day dial.",
      },
      { property: "og:title", content: "Edit event — DayDial" },
      { property: "og:description", content: "Fine-tune an event on your radial day planner." },
    ],
  }),
  component: EditEventScreen,
});

function EditEventScreen() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { getEvent, updateEvent, deleteEvent, restoreEvent, settings, isLoading } = usePlanner();
  const [pending, setPending] = useState<
    { kind: "save"; draft: EventDraft } | { kind: "delete" } | null
  >(null);

  const event = getEvent(eventId);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center py-24" aria-busy="true">
          <div className="size-40 animate-pulse rounded-full bg-secondary" />
        </div>
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-[15px] font-medium">{t("missing.title")}</p>
          <p className="max-w-[15rem] text-sm text-muted-foreground">{t("missing.body")}</p>
          <button
            type="button"
            onClick={() => void navigate({ to: "/" })}
            className="mt-1 flex touch-target items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t("missing.back")}
          </button>
        </div>
      </AppShell>
    );
  }

  const { id: _id, ...draft } = event;
  const isInstance = Boolean(event.seriesId);

  const commitSave = async (next: EventDraft, scope: RecurrenceScope) => {
    try {
      await updateEvent(event.id, next, scope);
      toast.success(t("toast.eventUpdated"));
      void navigate({ to: "/" });
    } catch {
      toast.error(t("toast.updateFailed"));
    }
  };

  const commitDelete = async (scope: RecurrenceScope) => {
    try {
      const removed = await deleteEvent(event.id, scope);
      void navigate({ to: "/" });
      if (removed) {
        showUndoToast(
          t("toast.deleted", { title: removed.title }),
          t("common.undo"),
          () => void restoreEvent(removed),
        );
      }
    } catch {
      toast.error(t("toast.deleteFailed"));
    }
  };

  return (
    <AppShell>
      <EventEditor
        mode="edit"
        initial={draft}
        timeFormat={settings.timeFormat}
        snapMinutes={settings.snapMinutes}
        onCancel={() => void navigate({ to: "/" })}
        onSave={async (next) => {
          if (isInstance) {
            setPending({ kind: "save", draft: next });
            return;
          }
          await commitSave(next, "series");
        }}
        onDelete={async () => {
          if (isInstance) {
            setPending({ kind: "delete" });
            return;
          }
          await commitDelete("series");
        }}
      />

      <RecurrenceScopeSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        onChoose={(scope) => {
          const request = pending;
          setPending(null);
          if (!request) return;
          if (request.kind === "save") void commitSave(request.draft, scope);
          else void commitDelete(scope);
        }}
      />
    </AppShell>
  );
}
