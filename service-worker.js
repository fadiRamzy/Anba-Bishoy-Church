/* ==========================================================================
   service-worker.js — Offline support.
   Precaches the LOCAL files the app needs to start and run (HTML/CSS/JS,
   seed data, local PDF-export libraries, images used by the page) so the
   site keeps working with no internet connection. It does not touch
   IndexedDB (member/visitation data already lives entirely in the browser
   and already works offline) and does not add any backend/server/API.
   Cross-origin requests (e.g. Google Fonts) are left alone — the CSS
   already falls back to system fonts, so a failed font request offline
   does not break the page.
   ========================================================================== */

const CACHE_VERSION = 'abc-church-cache-v3';

/* Local files actually loaded by index.html / app.js / styles.css.
   Query strings are kept exactly as referenced so the precached entry
   matches what the page actually requests. */
const PRECACHE_URLS = [
  './',
  'index.html',
  'app.js?v=8',
  'db.js?v=3',
  'styles.css?v=9',
  'bible/bible.js?v=2',
  'bible/metadata.json',
  'logo.jpg',
  'site-bg.jpg',
  'seed.json',
  'vendor/jspdf.umd.min.js',
  'vendor/html2canvas.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/* Cache-first for same-origin app files, so the app opens instantly and
   works offline. Any successful same-origin GET response is also stored,
   so newly-visited local resources become available offline too.
   Cross-origin requests (fonts, external CDNs) are never intercepted. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // Offline and not already cached: for page navigations, fall back
          // to the cached app shell (the router is hash-based, so index.html
          // works for any #/route).
          if (req.mode === 'navigate') return caches.match('index.html');
          return cached;
        });
    })
  );
});
