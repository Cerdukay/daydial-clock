/**
 * Client-only entry point for the Capacitor SPA build.
 *
 * Unlike the TanStack Start SSR build, this entry renders the router entirely
 * on the client. It reuses the same route tree, providers, and components as
 * the web app — the only difference is that there is no server-side rendering.
 */

import { App } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { ClerkProvider } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import { PlannerProvider, usePlanner } from "@/lib/daydial/store";
import { I18nProvider } from "@/lib/i18n";
import { getRouter } from "@/router";
import { clerkPublishableKey } from "@/lib/clerk";
import {
  ensureNativeNotificationPermission,
  isCapacitorNative,
  rescheduleLocalReminders,
} from "@/lib/notifications";
import { ErrorBoundary } from "@/components/daydial/ErrorBoundary";
import { dismissVirtualKeyboard } from "@/lib/daydial/keyboard";

import "@/styles.css";

const queryClient = new QueryClient();
const router = getRouter();

function LocalizedCapacitorContent() {
  const { settings, events, exceptions, isLoading } = usePlanner();
  const startupPermissionAttemptedRef = useRef(false);
  const reminderStateRef = useRef({
    events,
    exceptions,
    sound: settings.notificationSound,
    ready: !isLoading,
  });
  reminderStateRef.current = {
    events,
    exceptions,
    sound: settings.notificationSound,
    ready: !isLoading,
  };

  // Android 13+ will not display notifications until POST_NOTIFICATIONS is
  // granted. Ask on the first fully-hydrated native launch so the user is not
  // left wondering why a scheduled reminder never arrived. The system state
  // prevents repeated prompts after a grant or denial.
  useEffect(() => {
    if (!isCapacitorNative() || isLoading || startupPermissionAttemptedRef.current) {
      return;
    }
    startupPermissionAttemptedRef.current = true;
    void (async () => {
      await ensureNativeNotificationPermission();
      const current = reminderStateRef.current;
      if (!current.ready) return;
      await rescheduleLocalReminders(current.events, current.exceptions, current.sound);
    })();
  }, [isLoading]);

  // Android can clear exact alarms when the user changes the alarm setting,
  // and OEMs may drop alarms during aggressive process cleanup. Reconcile the
  // schedule whenever the app returns to the foreground.
  useEffect(() => {
    if (!isCapacitorNative()) return;
    let removed = false;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      const current = reminderStateRef.current;
      if (!current.ready) return;
      void rescheduleLocalReminders(current.events, current.exceptions, current.sound);
    }).then((handle) => {
      if (removed) {
        void handle.remove();
      } else {
        appStateListener = handle;
      }
    });
    return () => {
      removed = true;
      if (appStateListener) void appStateListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!isCapacitorNative()) return;

    let removed = false;
    let keyboardVisible = false;
    let listeners: Array<{ remove: () => Promise<void> }> = [];

    const backListener = App.addListener("backButton", async () => {
      const activeElement = document.activeElement;
      if (
        keyboardVisible &&
        (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
      ) {
        await dismissVirtualKeyboard();
        return;
      }

      const openOverlay = document.querySelector<HTMLElement>(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"], [role="listbox"]',
      );
      if (openOverlay) {
        openOverlay.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
        return;
      }

      const expandedControl = document.querySelector<HTMLElement>('[aria-expanded="true"]');
      if (expandedControl) {
        expandedControl.click();
        return;
      }

      const inAppBackButton = document.querySelector<HTMLButtonElement>("[data-app-back]");
      if (inAppBackButton && !inAppBackButton.disabled) {
        inAppBackButton.click();
        return;
      }

      if (window.location.pathname !== "/") {
        await router.navigate({ to: "/" });
        return;
      }

      await App.exitApp();
    });

    void Promise.all([
      Keyboard.addListener("keyboardDidShow", () => {
        keyboardVisible = true;
      }),
      Keyboard.addListener("keyboardDidHide", () => {
        keyboardVisible = false;
      }),
      backListener,
    ]).then((handles) => {
      if (removed) {
        for (const handle of handles) void handle.remove();
      } else {
        listeners = handles;
      }
    });

    return () => {
      removed = true;
      for (const listener of listeners) void listener.remove();
    };
  }, []);

  return (
    <I18nProvider language={settings.language}>
      <RouterProvider router={router} />
    </I18nProvider>
  );
}

function CapacitorApp() {
  const publishableKey = clerkPublishableKey();
  const content = (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <PlannerProvider>
          <LocalizedCapacitorContent />
        </PlannerProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
  return publishableKey ? (
    <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider>
  ) : (
    content
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");
createRoot(container).render(<CapacitorApp />);
