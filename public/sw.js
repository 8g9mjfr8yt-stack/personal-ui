// Fáza 7.1 — service worker pre Web Push notifikácie v Personal UI.
// Musí byť na koreňovej ceste (/sw.js), aby mal scope nad celou appkou.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Denný agent", message: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Denný agent";
  const options = {
    body: data.message || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/today" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/today";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (existing) {
        await existing.focus();
        if ("navigate" in existing) {
          try {
            await existing.navigate(targetUrl);
          } catch {
            // niektoré iOS verzie navigate() z notification handlera odmietnu —
            // appka sa aspoň zaostrí, používateľ dokliká sám.
          }
        }
        return;
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
