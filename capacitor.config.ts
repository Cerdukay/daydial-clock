import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.daydial.app",
  appName: "DayDial",
  webDir: "dist",
  backgroundColor: "#0a0a0a",
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_daydial",
      iconColor: "#06b6d4",
    },
    Keyboard: {
      // The activity uses Android's native adjustResize mode. Enabling Capacitor's
      // fullscreen workaround here makes both layers resize the WebView during
      // every IME animation frame, which can leave the editor unresponsive.
      resizeOnFullScreen: false,
    },
  },
};

export default config;
