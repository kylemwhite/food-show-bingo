/* Food Show Bingo — offline app-shell cache.
   Bump CACHE when any shell file changes so clients pick it up. */
const CACHE = 'fsb-v2';
const SHELL = [
  './',
  './index.html',
  './qrcode.min.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Live-sync config is always fetched fresh so key changes take effect on
  // the next load; when offline it simply fails and sync stays disabled.
  if (url.pathname.endsWith('/realtime-config.js')) {
    e.respondWith(fetch(req).catch(() => new Response('', { headers: { 'Content-Type': 'application/javascript' } })));
    return;
  }

  // Cache-first for the shell; fall back to network and cache what we can.
  e.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
