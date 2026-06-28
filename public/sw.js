/* Chippi service worker — web push only.
 *
 * Dependency-free and deliberately minimal. Two responsibilities:
 *   1. push           — show the notification the server sent.
 *   2. notificationclick — focus an open Chippi tab, or open the target URL.
 *
 * The payload is JSON: { title, body, url }. We defend against a missing or
 * malformed payload so a bad push never throws inside the SW (which on iOS can
 * cause the browser to silently revoke the subscription).
 */

self.addEventListener('push', function (event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Chippi', body: event.data.text() };
    }
  }

  const title = data.title || 'Chippi';
  const options = {
    body: data.body || '',
    icon: '/chip-avatar.png',
    badge: '/chip-avatar.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  // Resolve the target to an absolute URL so we can compare against open tabs.
  let targetPath = targetUrl;
  try {
    targetPath = new URL(targetUrl, self.location.origin).pathname;
  } catch (e) {
    targetPath = targetUrl;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // 1. Prefer a tab ALREADY on the target — just focus it, no reload.
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (!('focus' in client)) continue;
          try {
            if (new URL(client.url).pathname === targetPath) {
              return client.focus();
            }
          } catch (e) {
            /* malformed client.url — fall through */
          }
        }

        // 2. Otherwise navigate an existing tab to the target, THEN focus it.
        //    Crucially the navigate/focus promises are RETURNED so waitUntil
        //    keeps the SW alive until they finish — otherwise the browser can
        //    cut the navigation short and the click appears to do nothing.
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (!('focus' in client)) continue;
          if (targetUrl !== '/' && 'navigate' in client) {
            return client
              .navigate(targetUrl)
              .then(function (navigated) {
                return (navigated || client).focus();
              })
              .catch(function () {
                return client.focus();
              });
          }
          return client.focus();
        }

        // 3. No tab open — open a new one at the target.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
