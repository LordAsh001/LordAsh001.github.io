/* Service worker for the main website only: lets it be installed and opened offline.
   It handles the homepage, its section pages and the booking, privacy and terms pages. Every tool
   (atlases, studios, LARA …) is left alone and always loads straight from the network. */
const CACHE = "site-v1";
const SHELL = ["/", "/content.json", "/assets/traction.js", "/assets/enhance.js", "/assets/legal.js", "/manifest.webmanifest", "/images/icon-192.png"];
const OWN = /^\/(|index\.html|content\.json|feed\.xml|manifest\.webmanifest|photos\.json|youtube\.json|privacy\.html|terms\.html|book\/.*|assets\/.*|images\/.*|(research|publications|resources|work|teaching|kind-words|path|recognition|writing|contact)\/(index\.html)?)$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !OWN.test(url.pathname)) return; // tools and other sites: network only
  const isImage = url.pathname.startsWith("/images/");
  if (isImage) { // photos: show the saved copy at once and refresh it in the background
    e.respondWith(caches.open(CACHE).then((c) => c.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  // pages and data: network first, cached copy when offline
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("/") : undefined))));
});
