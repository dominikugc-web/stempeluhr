// Network first, cache as offline fallback, so updates arrive right away.
// Only the app's own files and the script CDNs; Firebase/Google API traffic goes straight to the network.
const CACHE = 'stempeluhr-v3';
const CACHED = [self.location.origin, 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com'];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !CACHED.includes(new URL(e.request.url).origin)) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })  // always revalidate, so app files never mix versions
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});

// Push-Benachrichtigungen (Feedback-Chat). Tipp darauf öffnet die App bzw. bringt sie nach vorn und öffnet den Chat.
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Stempeluhr', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Stempeluhr', {
    body: d.body || '', tag: d.tag, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  const admin = url.includes('/admin/');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.includes('/admin/') === admin);
    if (c) { c.postMessage({ open: url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
