/**
 * Service worker registration helper.
 *
 * Registers the Firebase messaging service worker (`/firebase-messaging-sw.js`)
 * with Firebase config encoded as URL query params. The SW parses
 * `self.location.search` to read the config on install.
 *
 * This is a no-op in SSR or Capacitor native (push uses native FCM there).
 */

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Register the Firebase messaging service worker.
 * Returns the registration, or null if not applicable.
 */
export async function registerFirebaseServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  // Don't register in Capacitor native — push uses native FCM there.
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return null;

  // Gather Firebase config from env
  const apiKey = import.meta.env["VITE_FIREBASE_API_KEY"];
  const projectId = import.meta.env["VITE_FIREBASE_PROJECT_ID"];
  const messagingSenderId = import.meta.env["VITE_FIREBASE_SENDER_ID"];
  const appId = import.meta.env["VITE_FIREBASE_APP_ID"];

  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;

  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    try {
      // Encode config as query params so the SW can read them via
      // self.location.search on install — no postMessage round-trip needed.
      const params = new URLSearchParams({
        apiKey,
        projectId,
        messagingSenderId,
        appId,
      });
      const swUrl = `/firebase-messaging-sw.js?${params.toString()}`;
      const reg = await navigator.serviceWorker.register(swUrl, { scope: "/" });
      return reg;
    } catch (err) {
      console.warn("[Arcelira] Failed to register Firebase service worker:", err);
      return null;
    }
  })();

  return registrationPromise;
}
