/* global self, URL */
// AstAx service worker (phase 8, ADR 0011). Two jobs only: show a push and open
// its page when touched. Nothing is cached: no page or data stays on the device.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = { title: "AstAx", body: "", url: "/notifiche" };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // A push without a readable body: the generic title opens the notifications.
  }
  // Only paths of AstAx are opened, never another site.
  const url =
    typeof message.url === "string" && message.url.startsWith("/") ? message.url : "/notifiche";
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/notifiche", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url === url);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
