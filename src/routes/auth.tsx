import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SignIn, SignUp } from "@clerk/react";
import { AppShell } from "@/components/daydial/AppShell";
import { useI18n } from "@/lib/i18n";
import { clerkPublishableKey } from "@/lib/clerk";

export const Route = createFileRoute("/auth")({
  // Guest-only builds (Capacitor) render without <ClerkProvider>, and <SignIn>
  // throws outside it — which used to blank the app behind the error boundary.
  // Send those users back to the planner instead of mounting a broken screen.
  beforeLoad: () => {
    if (!clerkPublishableKey()) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Sign in — Arcelira" },
      {
        name: "description",
        content:
          "Sign in or create an Arcelira account to sync your radial day planner across devices.",
      },
      { property: "og:title", content: "Sign in — Arcelira" },
      { property: "og:description", content: "Sync your Arcelira plan across every device." },
    ],
  }),
  component: AuthScreen,
});

function AuthScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <AppShell>
      <header className="flex items-center gap-2 py-2">
        <button
          type="button"
          data-app-back
          onClick={() => void navigate({ to: "/" })}
          aria-label={t("common.back")}
          className="flex touch-target items-center justify-center rounded-full"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center pb-10">
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="rounded-full px-3 py-1.5 text-sm font-medium data-[active=true]:bg-secondary"
            data-active={mode === "signin"}
          >
            {t("auth.signin")}
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className="rounded-full px-3 py-1.5 text-sm font-medium data-[active=true]:bg-secondary"
            data-active={mode === "signup"}
          >
            {t("auth.signup")}
          </button>
        </div>
        {mode === "signin" ? <SignIn routing="hash" /> : <SignUp routing="hash" />}
      </div>
    </AppShell>
  );
}
