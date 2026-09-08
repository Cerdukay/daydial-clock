/**
 * Push notification registration.
 *
 * Two code paths:
 *  - Capacitor native (Android/iOS): @capacitor/push-notifications wraps the
 *    platform FCM/APNS client and exposes a JS API.
 *  - Web (PWA): Firebase Messaging via the `firebase` JS SDK uses a service
 *    worker to receive Web Push messages from FCM.
 *
 * Both paths end with a device token that is upserted into the
 * `push_tokens` table so the `send-reminders` worker can dispatch
 * FCM messages to the right device.
 */

import { Capacitor } from "@capacitor/core";
import { neon } from "@/integrations/neon/client";
import type { PushPlatform, RegisterTokenResult } from "./types";
import { registerFirebaseServiceWorker } from "./sw-register";

/** Returns true when running inside a Capacitor native shell. */
function isCapacitorNative(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === "undefined") return false;
  const bridge = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return bridge?.isNativePlatform?.() === true;
}

/** Upsert (or reactivate) a push token for the current authenticated user. */
async function syncTokenToNeon(
  token: string,
  platform: PushPlatform,
  userId: string,
): Promise<RegisterTokenResult> {
  const { error } = await neon.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform,
      is_active: true,
    },
    { onConflict: "user_id,token" },
  );

  if (error) return { success: false, error: error.message };
  return { success: true, token };
}

/** Remove / deactivate the current device's push token. */
export async function unregisterPushToken(userId: string): Promise<void> {
  // We don't know the exact token here without re-initialising, so deactivate
  // all tokens for this user. The next registration will re-activate the
  // current one. This is acceptable because sign-out is infrequent.
  await neon.from("push_tokens").update({ is_active: false }).eq("user_id", userId);
}

// ---------------------------------------------------------------------------
// Capacitor native path
// ---------------------------------------------------------------------------

async function registerCapacitorPush(userId: string): Promise<RegisterTokenResult> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== "granted") {
      return { success: false, error: "Permission not granted" };
    }
    await PushNotifications.register();
    return new Promise<RegisterTokenResult>((resolve) => {
      PushNotifications.addListener("registration", async (token) => {
        const result = await syncTokenToNeon(token.value, "android", userId);
        resolve(result);
      });
      PushNotifications.addListener("registrationError", (err) => {
        resolve({ success: false, error: JSON.stringify(err) });
      });
      // Safety timeout — resolve with a soft failure if no token arrives.
      setTimeout(() => resolve({ success: false, error: "Registration timeout" }), 10_000);
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Web (Firebase Messaging) path
// ---------------------------------------------------------------------------

async function registerWebPush(userId: string): Promise<RegisterTokenResult> {
  try {
    // Firebase is an optional dependency — only import when actually needed.
    const { initializeApp } = await import("firebase/app");
    const { getMessaging, getToken, onMessage } = await import("firebase/messaging");

    const firebaseConfig = {
      apiKey: import.meta.env["VITE_FIREBASE_API_KEY"],
      authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
      projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
      messagingSenderId: import.meta.env["VITE_FIREBASE_SENDER_ID"],
      appId: import.meta.env["VITE_FIREBASE_APP_ID"],
    };

    if (
      !firebaseConfig.apiKey ||
      !firebaseConfig.projectId ||
      !firebaseConfig.messagingSenderId ||
      !firebaseConfig.appId
    ) {
      return { success: false, error: "Firebase config missing in env" };
    }

    const app = initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    const vapidKey = import.meta.env["VITE_FIREBASE_VAPID_KEY"];
    // Register the Firebase SW (with config injected via query params)
    // before requesting a token. Falls back to existing registration.
    const swReg = await registerFirebaseServiceWorker();
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg ?? undefined,
    });

    if (!token) return { success: false, error: "No FCM token" };

    // Handle foreground messages (when the web app is open).
    onMessage(messaging, (payload) => {
      const notification = payload.notification;
      if (
        notification &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(notification.title ?? "DayDial", {
            body: notification.body,
            icon: "/icon-192.png",
            tag: payload.data?.["eventId"] ? `reminder-${payload.data["eventId"]}` : undefined,
          });
        } catch {
          // Ignore — some browsers disallow Notification in foreground.
        }
      }
    });

    return await syncTokenToNeon(token, "web", userId);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Unified API
// ---------------------------------------------------------------------------

/**
 * Register the current device for push notifications and sync the token to
 * Neon. Automatically picks the Capacitor or web path.
 *
 * Only call this for **authenticated** users — guest reminders use the
 * client-side scheduler in `guest-reminders.ts` instead.
 */
export async function registerPushNotifications(userId: string): Promise<RegisterTokenResult> {
  if (isCapacitorNative()) {
    return registerCapacitorPush(userId);
  }
  return registerWebPush(userId);
}
