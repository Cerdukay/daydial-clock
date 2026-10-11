import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, BellOff, Calendar, Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/daydial/AppShell";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { usePlanner } from "@/lib/daydial/store";
import { LANGUAGES, LANGUAGE_NAMES, useI18n, type DictKey } from "@/lib/i18n";
import {
  getNotificationPermission,
  isCapacitorNative,
  requestExactNotificationPermission,
  requestNotificationPermission,
  registerPushNotifications,
  rescheduleGuestReminders,
  rescheduleLocalReminders,
} from "@/lib/notifications";
import { exportToICal, downloadICal, parseICal } from "@/lib/calendar";
import { NOTIFICATION_SOUNDS, type NotificationSound } from "@/lib/daydial/types";
import { previewNotificationSound } from "@/lib/notifications/sounds";
import { clerkPublishableKey } from "@/lib/clerk";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

const NOTIFICATION_SOUND_KEYS: Record<NotificationSound, DictKey> = {
  none: "notifications.soundSilent",
  chime: "notifications.soundChime",
  bell: "notifications.soundBell",
  digital: "notifications.soundDigital",
  gentle: "notifications.soundGentle",
};

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Arcelira" },
      {
        name: "description",
        content:
          "Choose your theme, snap interval, default view and reduced-motion preference for Arcelira.",
      },
      { property: "og:title", content: "Settings — Arcelira" },
      { property: "og:description", content: "Tune Arcelira to the way you plan." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const {
    settings,
    updateSettings,
    session,
    isGuest,
    guestEventCount,
    migrateGuestData,
    signOut,
    events,
    exceptions,
    createEvent,
  } = usePlanner();
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [notifBusy, setNotifBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getNotificationPermission().then((permission) => {
      if (active) setNotifPermission(permission);
    });
    return () => {
      active = false;
    };
  }, []);

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
        <h1 className="text-[17px] font-semibold tracking-tight">{t("settings.title")}</h1>
      </header>

      <section className="space-y-2 pb-4" aria-label={t("settings.appearance")}>
        <h2 className="px-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.appearance")}
        </h2>
        <Row label={t("settings.language")} hint={t("settings.languageHint")}>
          <NativeSelect
            value={settings.language}
            onValueChange={(value) =>
              updateSettings({ language: value as typeof settings.language })
            }
            className="h-10 w-36"
            aria-label={t("settings.language")}
            options={LANGUAGES.map((language) => ({
              value: language,
              label: LANGUAGE_NAMES[language],
            }))}
          />
        </Row>
        <Row label={t("settings.theme")}>
          <NativeSelect
            value={settings.theme}
            onValueChange={(value) => updateSettings({ theme: value as typeof settings.theme })}
            className="h-10 w-32"
            aria-label={t("settings.theme")}
            options={[
              { value: "system", label: t("settings.system") },
              { value: "light", label: t("settings.light") },
              { value: "dark", label: t("settings.dark") },
            ]}
          />
        </Row>
        <Row label={t("settings.reduceMotion")} hint={t("settings.reduceMotionHint")}>
          <Switch
            checked={settings.reduceMotion}
            onCheckedChange={(checked) => updateSettings({ reduceMotion: checked })}
            aria-label={t("settings.reduceMotion")}
          />
        </Row>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-[15px] font-medium">{t("settings.labelStyleTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("settings.labelStyleHint")}</p>
          <div
            className="mt-3 flex gap-1 rounded-full bg-secondary p-1"
            role="radiogroup"
            aria-label={t("labelStyle.groupAria")}
          >
            {(
              [
                { value: "inside", label: t("labelStyle.insideTitle") },
                { value: "outside", label: t("labelStyle.outsideTitle") },
              ] as const
            ).map((option) => {
              const selected = settings.eventLabelStyle === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => updateSettings({ eventLabelStyle: option.value })}
                  className={
                    "flex h-10 flex-1 items-center justify-center rounded-full text-[14px] font-medium transition-colors " +
                    (selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <Row label={t("settings.timeFormat")}>
          <NativeSelect
            value={settings.timeFormat}
            onValueChange={(value) =>
              updateSettings({ timeFormat: value as typeof settings.timeFormat })
            }
            className="h-10 w-32"
            aria-label={t("settings.timeFormat")}
            options={[
              { value: "12h", label: t("settings.format12") },
              { value: "24h", label: t("settings.format24") },
            ]}
          />
        </Row>
      </section>

      <section className="space-y-2 pb-4" aria-label={t("settings.clockSection")}>
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.clockSection")}
        </h2>
        <Row label={t("settings.defaultLayer")} hint={t("settings.defaultLayerHint")}>
          <NativeSelect
            value={settings.defaultLanePlacement}
            onValueChange={(value) =>
              updateSettings({
                defaultLanePlacement: value as typeof settings.defaultLanePlacement,
              })
            }
            className="h-10 w-32"
            aria-label={t("settings.defaultLayer")}
            options={[
              { value: "auto", label: t("settings.automatic") },
              { value: "innermost", label: t("layer.1") },
              { value: "outermost", label: t("layer.4") },
            ]}
          />
        </Row>
        <Row label={t("settings.editingMethod")} hint={t("settings.editingMethodHint")}>
          <NativeSelect
            value={settings.editingMethod}
            onValueChange={(value) =>
              updateSettings({ editingMethod: value as typeof settings.editingMethod })
            }
            className="h-10 w-56 max-w-[64%]"
            aria-label={t("settings.editingMethod")}
            options={[
              { value: "both", label: t("settings.controlsAndDrag") },
              { value: "controls", label: t("settings.controlsOnly") },
              { value: "gestures", label: t("settings.dragOnly") },
            ]}
          />
        </Row>
      </section>

      <section className="space-y-2 pb-4" aria-label={t("settings.planning")}>
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.planning")}
        </h2>
        <Row label={t("settings.defaultView")}>
          <NativeSelect
            value={settings.defaultView}
            onValueChange={(value) =>
              updateSettings({ defaultView: value as typeof settings.defaultView })
            }
            className="h-10 w-32"
            aria-label={t("settings.defaultView")}
            options={[
              { value: "clock", label: t("nav.clock") },
              { value: "agenda", label: t("nav.agenda") },
            ]}
          />
        </Row>
        <Row label={t("settings.snap")}>
          <NativeSelect
            value={String(settings.snapMinutes)}
            onValueChange={(value) => updateSettings({ snapMinutes: Number(value) })}
            className="h-10 w-32"
            aria-label={t("settings.snap")}
            options={[5, 10, 15, 30].map((count) => ({
              value: String(count),
              label: t("settings.minutes", { count }),
            }))}
          />
        </Row>
        <Row label={t("settings.defaultDuration")}>
          <NativeSelect
            value={String(settings.defaultDurationMinutes)}
            onValueChange={(value) => updateSettings({ defaultDurationMinutes: Number(value) })}
            className="h-10 w-32"
            aria-label={t("settings.defaultDuration")}
            options={[
              { value: "30", label: t("settings.minutes", { count: 30 }) },
              { value: "45", label: t("settings.minutes", { count: 45 }) },
              { value: "60", label: t("settings.hours1") },
              { value: "90", label: t("settings.hours15") },
            ]}
          />
        </Row>
        <Row label={t("settings.showCompleted")}>
          <Switch
            checked={settings.showCompletedEvents}
            onCheckedChange={(checked) => updateSettings({ showCompletedEvents: checked })}
            aria-label={t("settings.showCompleted")}
          />
        </Row>
        <Row label={t("settings.haptics")} hint={t("settings.hapticsHint")}>
          <Switch
            checked={settings.hapticsEnabled}
            onCheckedChange={(checked) => updateSettings({ hapticsEnabled: checked })}
            aria-label={t("settings.haptics")}
          />
        </Row>
      </section>

      <section className="space-y-2 pb-4" aria-label={t("notifications.title")}>
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("notifications.title")}
        </h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            {notifPermission === "granted" ? (
              <Bell className="size-5 text-primary" aria-hidden="true" />
            ) : (
              <BellOff className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
            <p className="text-[15px] font-medium">
              {notifPermission === "granted"
                ? t("notifications.enabled")
                : t("notifications.enable")}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {notifPermission === "denied"
              ? t("notifications.denied")
              : t("notifications.enableHint")}
          </p>
          {notifPermission !== "granted" && (
            <button
              type="button"
              disabled={notifBusy}
              onClick={async () => {
                setNotifBusy(true);
                try {
                  const perm = await requestNotificationPermission();
                  setNotifPermission(perm);
                  if (perm === "granted" && isCapacitorNative()) {
                    await requestExactNotificationPermission();
                    await rescheduleLocalReminders(events, exceptions, settings.notificationSound);
                  } else if (perm === "granted" && isGuest) {
                    rescheduleGuestReminders(events, settings.notificationSound);
                  } else if (perm === "granted" && !isGuest) {
                    const userId = session?.user.id;
                    if (!userId) return;
                    const result = await registerPushNotifications(userId);
                    if (!result.success && result.error) {
                      toast.error(t("notifications.pushFailed"));
                    }
                  }
                } finally {
                  setNotifBusy(false);
                }
              }}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {t("notifications.enable")}
            </button>
          )}
        </div>
        <Row label={t("notifications.sound")} hint={t("notifications.soundHint")}>
          <NativeSelect
            value={settings.notificationSound}
            onValueChange={(value) => {
              const sound = value as NotificationSound;
              updateSettings({ notificationSound: sound });
              previewNotificationSound(sound);
            }}
            className="h-10 w-32"
            aria-label={t("notifications.sound")}
            options={NOTIFICATION_SOUNDS.map((sound) => ({
              value: sound.value,
              label: t(NOTIFICATION_SOUND_KEYS[sound.value]),
            }))}
          />
        </Row>
      </section>

      <section className="space-y-2 pb-4" aria-label={t("calendar.title")}>
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("calendar.title")}
        </h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Calendar className="size-5 text-primary" aria-hidden="true" />
            <p className="text-[15px] font-medium">{t("calendar.title")}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (events.length === 0) {
                  toast.error(t("calendar.exportEmpty"));
                  return;
                }
                const ics = exportToICal(events, exceptions);
                downloadICal("daydial-export.ics", ics);
              }}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground"
            >
              <Download className="size-4" aria-hidden="true" />
              {t("calendar.export")}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border text-sm font-medium"
            >
              <Upload className="size-4" aria-hidden="true" />
              {t("calendar.import")}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("calendar.exportHint")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const drafts = parseICal(text);
                if (drafts.length === 0) {
                  toast.error(t("calendar.importFailed"));
                  return;
                }
                for (const draft of drafts) {
                  await createEvent(draft);
                }
                toast.success(t("calendar.imported", { count: drafts.length }));
              } catch {
                toast.error(t("calendar.importFailed"));
              } finally {
                e.target.value = "";
              }
            }}
          />
        </div>
      </section>

      <section className="space-y-2 pb-4" aria-label={t("settings.account")}>
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.account")}
        </h2>
        {isGuest ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-medium">{t("settings.guestTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.guestBody", { count: guestEventCount })}
            </p>
            {/* Guest-only builds have no Clerk instance, so /auth just bounces
                back here — don't offer a button that cannot lead anywhere. */}
            {clerkPublishableKey() ? (
              <button
                type="button"
                onClick={() => void navigate({ to: "/auth" })}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
              >
                {t("settings.guestCta")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="truncate text-sm font-medium">{session?.user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.syncBody")}</p>
            {guestEventCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const count = await migrateGuestData();
                  toast.success(t("settings.imported", { count }));
                }}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-full border border-border text-sm font-medium"
              >
                {t("settings.importGuest", { count: guestEventCount })}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/auth" });
              }}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-secondary text-sm font-medium"
            >
              {t("settings.signOut")}
            </button>
          </div>
        )}
      </section>
      <section className="space-y-2 pb-10" aria-label={t("settings.support")}>
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.support")}
        </h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          <a href={SUPPORT_MAILTO} className="block break-all py-2 text-sm text-primary underline">
            {SUPPORT_EMAIL}
          </a>
          <Link to="/privacy" className="block py-2 text-sm text-primary underline">
            {t("settings.privacy")}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}
