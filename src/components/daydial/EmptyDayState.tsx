import { Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function EmptyDayState({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card px-6 py-10 text-center">
      <p className="text-[15px] font-medium">{t("empty.title")}</p>
      <p className="max-w-[16rem] text-sm text-muted-foreground">{t("empty.body")}</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-1 flex touch-target items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("empty.cta")}
      </button>
    </div>
  );
}
