// Network first, cache as offline fallback, so updates arrive right away.
// Only the app's own files and the script CDNs; Firebase/Google API traffic goes straight to the network.
const CACHE = 'stempeluhr-v2';
const CACHED = [self.location.origin, 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com'];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !CACHED.includes(new URL(e.request.url).origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
