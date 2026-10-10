import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useUser } from "@clerk/react";
import { AppShell } from "@/components/daydial/AppShell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Arcelira" },
      { name: "description", content: "Choose a new password for your Arcelira account." },
      { property: "og:title", content: "Set a new password — Arcelira" },
      { property: "og:description", content: "Choose a new password for your Arcelira account." },
    ],
  }),
  component: ResetPasswordScreen,
});

function ResetPasswordScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useUser();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = z.string().min(8, t("auth.shortPassword")).max(72).safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("reset.invalid"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    setBusy(true);
    if (!user) {
      setBusy(false);
      setError(t("auth.genericError"));
      return;
    }
    try {
      await user.updatePassword({ newPassword: password });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : t("auth.genericError"));
      return;
    }
    setBusy(false);
    toast.success(t("reset.updated"));
    void navigate({ to: "/" });
  };

  return (
    <AppShell>
      <div className="flex flex-1 flex-col justify-center pb-10">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
          {t("reset.title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("reset.body")}</p>
        <form onSubmit={submit} className="mt-6 space-y-2.5" noValidate>
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("reset.newPassword")}
            aria-label={t("reset.newPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("reset.confirmPassword")}
            aria-label={t("reset.confirmPassword")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          {error && (
            <p role="alert" className="px-1 text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? t("common.saving") : t("reset.update")}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
