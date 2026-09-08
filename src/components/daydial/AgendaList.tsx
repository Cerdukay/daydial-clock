import type { PlannerEvent } from "@/lib/daydial/types";
import { AgendaItem } from "./AgendaItem";
import { EmptyDayState } from "./EmptyDayState";
import { useI18n } from "@/lib/i18n";

interface AgendaListProps {
  events: PlannerEvent[];
  timeFormat: "12h" | "24h";
  onOpen: (event: PlannerEvent) => void;
  onToggleComplete: (event: PlannerEvent) => void;
  onCreate: () => void;
}

/** Chronological list alternative to the radial clock. */
export function AgendaList({
  events,
  timeFormat,
  onOpen,
  onToggleComplete,
  onCreate,
}: AgendaListProps) {
  const { t } = useI18n();
  if (events.length === 0) return <EmptyDayState onCreate={onCreate} />;

  return (
    <ul className="space-y-2.5 pb-4" aria-label={t("agenda.aria")}>
      {events.map((event) => (
        <AgendaItem
          key={event.id}
          event={event}
          timeFormat={timeFormat}
          onOpen={onOpen}
          onToggleComplete={onToggleComplete}
        />
      ))}
    </ul>
  );
}
