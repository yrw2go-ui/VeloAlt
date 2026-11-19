// Velo's service worker: shows push notifications and opens that chat when tapped.
// It does not keep a copy of the app. Any cache left by an older worker is dropped
// on activate so an installed home-screen icon picks up the new page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || "Velo";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "", icon: d.icon || "/icon-192.png", badge: "/icon-192.png", tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      // navigate() only works on a window this worker controls, and it rejects on the rest —
      // which is most of them. When it won't go, ask the page to take itself there, so tapping
      // a notification always lands on that conversation instead of wherever you last were.
      try { const to = await w.navigate(url); if (to) { await to.focus(); return; } } catch (err) { /* not ours to drive */ }
      try { w.postMessage({ type: "velo:open", url: url }); } catch (err) { /* nothing listening */ }
      await w.focus();
      return;
    }
    return self.clients.openWindow(url);
  })());
});
