import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/daydial/AppShell";
import { PrivacyPolicyContent } from "@/components/daydial/PrivacyPolicyContent";
import { clerkPublishableKey } from "@/lib/clerk";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Arcelira" },
      {
        name: "description",
        content: "Privacy policy for Arcelira — planner storage, reminders and privacy requests.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <AppShell>
      <header className="flex items-center gap-2 py-2">
        <button
          type="button"
          data-app-back
          onClick={() => void navigate({ to: "/settings" })}
          aria-label={t("common.back")}
          className="touch-target flex items-center justify-center rounded-full"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <span className="text-[17px] font-semibold">{t("settings.privacy")}</span>
      </header>
      <PrivacyPolicyContent accountFeaturesEnabled={Boolean(clerkPublishableKey())} />
    </AppShell>
  );
}
