import { CloudOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface SyncPromptCardProps {
  onDismiss: () => void;
  onSignIn: () => void;
}

/** One-time, dismissible card inviting guests to sign in and sync. */
export function SyncPromptCard({ onDismiss, onSignIn }: SyncPromptCardProps) {
  const { t } = useI18n();
  return (
    <section className="mb-3 rounded-3xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-start gap-3">
        <CloudOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-muted-foreground">
          {t("sync.body")}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="flex min-h-11 items-center rounded-full bg-secondary px-4 text-[14px] font-medium text-foreground"
        >
          {t("common.notNow")}
        </button>
        <button
          type="button"
          onClick={onSignIn}
          className="flex min-h-11 items-center rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground"
        >
          {t("common.signIn")}
        </button>
      </div>
    </section>
  );
}
