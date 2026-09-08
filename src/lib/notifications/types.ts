/** Shared notification types used by both the web and Capacitor push paths. */

export type NotificationPermissionStatus = "default" | "granted" | "denied";

export type PushPlatform = "web" | "android" | "ios";

/** A pending reminder scheduled on the client (guest mode foreground). */
export interface ScheduledReminder {
  eventId: string;
  fireAt: number; // epoch ms
  title: string;
  body: string;
}

/** Result of registering a push token with the backend. */
export interface RegisterTokenResult {
  success: boolean;
  token?: string;
  error?: string;
}
