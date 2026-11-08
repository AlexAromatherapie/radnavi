/* RadNavi Service Worker: App offline startbar, besuchte Kartenkacheln werden zwischengespeichert. */
const APP = 'radnavi-app-v7';
const TILES = 'radnavi-tiles-v1';
const MAX_TILES = 3000;
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'profile.brf', 'manifest.webmanifest',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
const TILE_HOSTS = ['tile-cyclosm.openstreetmap.fr', 'tile.openstreetmap.org', 'tile.opentopomap.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== TILES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

let putCount = 0;
async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') {
        c.put(req, res.clone());
        if (++putCount % 100 === 0) trimTiles();
      }
      return res;
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    // Netzwerk zuerst (immer aktuelle Version), offline aus dem Cache
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(APP).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  }
  // Routing (brouter.de) und Suche (photon) laufen immer direkt übers Netz
});
