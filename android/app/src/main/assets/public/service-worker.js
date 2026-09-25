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

   Inside the Android (Capacitor) app the page is served from the packaged
   www/ files at https://localhost/. In that context only — detected by the
   localhost origin — the worker switches to a NETWORK-FIRST MIRROR of the
   live website: every app file is fetched from the deployed site (so a new
   web deploy reaches installed apps on the next launch, with no new APK)
   and the last good copy is cached for offline use. If the remote fetch
   fails, the mirror cache is used, and finally the bundled www/ asset.
   The website itself never takes this branch: its behaviour is unchanged.
   ========================================================================== */

const CACHE_VERSION = 'abc-church-cache-v12';

/* Native-app mirror (Android only). MIRROR_BASE is the deployed website the
   app loads its files from; requests keep their path and query string (so the
   ?v= cache-busters still apply). MIRROR_CACHE is deliberately NOT deleted on
   activate — it is the offline fallback when the live site is unreachable. */
const MIRROR_BASE = 'https://fadiramzy.github.io/Anba-Bishoy-Church';
const MIRROR_CACHE = 'abc-church-mirror-v1';
const IS_APP = self.location.hostname === 'localhost' && self.location.protocol === 'https:';

/* Local files actually loaded by index.html / app.js / styles.css.
   Query strings are kept exactly as referenced so the precached entry
   matches what the page actually requests. */
const PRECACHE_URLS = [
  './',
  'index.html',
  'app.js?v=17',
  'app-shell.js?v=1',
  'db.js?v=3',
  'styles.css?v=14',
  'bible/bible.js?v=5',
  'bible/metadata.json',
  'calendar/coptic-calendar.js?v=2',
  'calendar/calendar.css?v=3',
  'calendar/data/feasts-fixed.json',
  'calendar/data/feasts-movable.json',
  'calendar/data/saints.json',
  'calendar/data/fasts.json',
  'calendar/data/readings.json',
  'calendar/data/daily-readings.json',
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
        names.filter((name) => name !== CACHE_VERSION && name !== MIRROR_CACHE).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/* Inside the Android app a few files must still come from the packaged www/
   bundle and never from the live site:
   - the shell document (index.html): it is the only copy that carries the
     <script src="capacitor-bridge.js"> tag, so mirroring it would leave the
     app without the native bridge (back button, file downloads, APK link);
   - capacitor-bridge.js itself: app-only code the website never serves.
   Everything else keeps being mirrored, so a web deploy still reaches
   installed apps without building a new APK. */
function isBundledOnly(request, url) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  if (url.pathname === '/' || url.pathname === '/index.html') return true;
  return url.pathname === '/capacitor-bridge.js';
}

/* Android app only: serve the file at the same path on the live website.
   `no-cache` revalidates with the server on every launch (Pages answers 304
   when nothing changed, so it stays cheap) and a new deploy is picked up
   immediately. On failure the last good mirrored copy wins, and the bundled
   www/ asset is the final fallback. */
async function fetchMirrored(request) {
  const url = new URL(request.url);
  const remote = MIRROR_BASE + (url.pathname === '/' ? '/' : url.pathname) + url.search;
  const cache = await caches.open(MIRROR_CACHE);
  try {
    const response = await fetch(remote, { cache: 'no-cache' });
    if (!response || !response.ok) throw new Error('mirror ' + (response && response.status));
    if (!/\.apk$/i.test(url.pathname)) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    /* Bundled www/ bytes captured at install time — keeps the app usable
       offline even if the request never reaches the native asset loader. */
    const bundled = await caches.match(request, { cacheName: CACHE_VERSION });
    if (bundled) return bundled;
    return fetch(request);
  }
}

/* Cache-first for same-origin app files, so the app opens instantly and
   works offline. Any successful same-origin GET response is also stored,
   so newly-visited local resources become available offline too.
   Cross-origin requests (fonts, external CDNs) are never intercepted. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Android app: mirror the live website. Capacitor's own paths
     (/_capacitor_*) are handed back to the native bridge untouched, and the
     app shell + the bridge are served from the bundle (see isBundledOnly) so
     the native bridge is always loaded. */
  if (IS_APP) {
    if (url.pathname.indexOf('/_capacitor_') === 0) return;
    if (!isBundledOnly(req, url)) {
      event.respondWith(fetchMirrored(req));
      return;
    }
    /* else: fall through — the bundled copy is served cache-first below. */
  }

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
