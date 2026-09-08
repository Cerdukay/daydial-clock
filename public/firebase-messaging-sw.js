// Firebase Messaging service worker for background Web Push.
// This file MUST live at the site root so it controls the full scope.
// Firebase imports its messaging SW compat bundle from the CDN.
//
// Config is passed via URL query params when the SW is registered:
//   navigator.serviceWorker.register('/firebase-messaging-sw.js?apiKey=...&projectId=...')
// We parse self.location.search here to extract the config.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Parse config from the SW's own URL query string.
const params = new URLSearchParams(self.location.search);
const config = {
  apiKey: params.get("apiKey") || "",
  projectId: params.get("projectId") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
};

if (config.apiKey && config.projectId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  // Handle background messages — show a notification automatically.
  messaging.onBackgroundMessage((payload) => {
    const { notification, data } = payload;
    const title = notification?.title || "DayDial";
    const options = {
      body: notification?.body || "",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: data?.eventId ? `reminder-${data.eventId}` : undefined,
      data: data || {},
    };
    self.registration.showNotification(title, options);
  });
}

// Handle notification click — focus or open the app and navigate to the event.
self.addEventListener("notificationclick", (event) => {
  const eventId = event.notification.data?.eventId;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          if (eventId) client.navigate(`/event/${eventId}`);
          return client.focus();
        }
      }
      const url = eventId ? `/event/${eventId}` : "/";
      return self.clients.openWindow(url);
    }),
  );
});
