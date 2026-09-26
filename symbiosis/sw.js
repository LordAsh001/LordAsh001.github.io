/* Symbiosis Workbench service worker: offline support.
   Bump VERSION whenever you upload changed files so visitors get the update. */
const VERSION = 'sw-3.2.0';
const CORE = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  // pages: network first, so visitors always get the latest version when online (cache is the offline fallback)
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.open(VERSION).then(c => c.match(req, {ignoreSearch: true}).then(hit => hit || c.match('index.html')))));
    return;
  }
  // stale-while-revalidate
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, {ignoreSearch: url.origin === location.origin});
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
