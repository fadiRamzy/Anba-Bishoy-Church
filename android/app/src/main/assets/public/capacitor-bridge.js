/* ==========================================================================
   capacitor-bridge.js — Android (Capacitor) native enhancements.

   Loaded ONLY inside the Android app bundle: scripts/sync-web.js injects a
   <script> tag for this file into the www/ copy of index.html. The public
   website (repo-root index.html) never references it, and every behaviour
   below activates ONLY when window.Capacitor reports a native platform — so
   this file can never change website behaviour.

   What it does (Android only):
   1. Hardware back button: walks the app's hash history; on the home screen
      the app is sent to the background instead of closed (WebView state and
      IndexedDB stay in memory).
   2. File downloads (JSON backups + jsPDF PDF exports): an Android WebView
      cannot save blob: downloads, so clicks on anchors that have BOTH a
      `download` attribute and a blob: URL are rerouted to the Filesystem
      plugin (file bytes are written to the app cache) and then opened with
      the system share sheet, where the user can save/send the file anywhere
      (Downloads, Drive, WhatsApp, ...). The bytes are captured through a
      createObjectURL registry because app code revokes the blob URL
      synchronously right after clicking. app.js / jsPDF are untouched.
   3. External navigation needs no code here: tel: links and Google Maps
      links already navigate top-level (see the isAndroidWebView handler in
      app.js) and Capacitor's Bridge turns any non-app URL into an external
      intent (dialer / Maps app / browser). Geolocation permission prompts
      and <input type="file"> import pickers are likewise handled natively
      by Capacitor's WebChromeClient.

   Uses only the auto-injected Capacitor core runtime
   (window.Capacitor.registerPlugin) — no bundler, no extra JS framework.
   ========================================================================== */
(function () {
  'use strict';

  /* Wait for the Capacitor runtime (injected natively by the Android app).
     Gives up silently after ~6s so a plain browser never hangs on this. */
  function whenNativeReady(callback) {
    var tries = 0;
    (function poll() {
      try {
        var C = window.Capacitor;
        if (C && C.isNativePlatform && C.isNativePlatform()) {
          callback(C);
          return;
        }
        /* Capacitor present but reporting web (shouldn't happen in www/) — stop. */
        if (C && C.getPlatform && C.getPlatform() === 'web') return;
      } catch (e) { /* ignore and retry */ }
      if (++tries >= 60) return;
      setTimeout(poll, 100);
    })();
  }

  /* Resolve a plugin proxy from the core runtime without needing the
     plugin's own JS bundle (works for App/Filesystem/Share method calls
     and addListener). */
  function resolvePlugin(C, name) {
    try {
      if (C.registerPlugin) return C.registerPlugin(name);
      if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
    } catch (e) {}
    return null;
  }

  function toast(message, kind) {
    try {
      if (typeof window.showToast === 'function') window.showToast(message, kind || '');
    } catch (e) {}
  }

  function sanitizeFilename(name) {
    var clean = String(name || 'download').replace(/[\\/:*?"<>|]/g, '_').trim();
    return clean || 'download';
  }

  whenNativeReady(function (C) {
    /* ---------------- 1. Hardware back button ---------------- */
    var App = resolvePlugin(C, 'App');
    if (App && App.addListener) {
      try {
        App.addListener('backButton', function () {
          var hash = window.location.hash || '';
          if (hash && hash !== '#' && hash !== '#/') {
            window.history.back();
          } else if (App.minimizeApp) {
            App.minimizeApp();
          }
        });
      } catch (e) {}
    }

    /* ---------------- 2. blob: downloads → save + share ---------------- */
    var Filesystem = resolvePlugin(C, 'Filesystem');
    var Share = resolvePlugin(C, 'Share');
    if (Filesystem && Share && Filesystem.writeFile && Filesystem.getUri && Share.share) {
      try {
        installDownloadBridge(Filesystem, Share);
      } catch (e) {}
    }
  });

  function installDownloadBridge(Filesystem, Share) {
    /* Registry of blob: URL -> Blob. App code (and jsPDF) may revoke the
       object URL synchronously right after clicking, so the bytes must be
       captured up-front; the async share flow then reads from here instead
       of re-fetching the (possibly revoked) URL. */
    var blobRegistry = new Map();
    var REGISTRY_CAP = 20;

    var origCreateObjectURL = URL.createObjectURL.bind(URL);
    var origRevokeObjectURL = URL.revokeObjectURL.bind(URL);

    URL.createObjectURL = function (obj) {
      var url = origCreateObjectURL(obj);
      try {
        if (obj instanceof Blob && typeof url === 'string') {
          blobRegistry.set(url, obj);
          if (blobRegistry.size > REGISTRY_CAP) {
            blobRegistry.delete(blobRegistry.keys().next().value);
          }
        }
      } catch (e) {}
      return url;
    };

    URL.revokeObjectURL = function (url) {
      /* Still perform the real revoke, but keep our registry copy — the
         native download below reads the Blob asynchronously, after app
         code has already revoked the URL. The entry is dropped once the
         download flow finishes (see finally block). */
      try {
        origRevokeObjectURL(url);
      } catch (e) {}
    };

    function isBlobDownloadAnchor(a) {
      if (!a || a.tagName !== 'A') return false;
      if (a.getAttribute('download') === null) return false; /* normal link */
      var href = a.getAttribute('href') || '';
      return href.indexOf('blob:') === 0;
    }

    function readBlobAsBase64(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '').split(',')[1] || ''); };
        reader.onerror = function () { reject(reader.error || new Error('read failed')); };
        reader.readAsDataURL(blob);
      });
    }

    function handleDownload(anchor) {
      var blobUrl = anchor.getAttribute('href') || '';
      var filename = sanitizeFilename(anchor.getAttribute('download'));
      var reachedShareSheet = false;

      var blobPromise;
      if (blobRegistry.has(blobUrl)) {
        blobPromise = Promise.resolve(blobRegistry.get(blobUrl));
      } else {
        /* Fallback for URLs created before this bridge loaded (rare). */
        blobPromise = fetch(blobUrl).then(function (res) {
          if (!res.ok) throw new Error('fetch failed: ' + res.status);
          return res.blob();
        });
      }

      blobPromise
        .then(readBlobAsBase64)
        .then(function (base64) {
          if (!base64) throw new Error('empty file');
          /* No `encoding` option → the plugin writes base64 data as binary. */
          return Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
        })
        .then(function () {
          return Filesystem.getUri({ path: filename, directory: 'CACHE' });
        })
        .then(function (ret) {
          if (!ret || !ret.uri) throw new Error('no uri');
          reachedShareSheet = true;
          return Share.share({ title: filename, url: ret.uri, dialogTitle: 'حفظ أو مشاركة الملف' });
        })
        .then(
          function () {
            blobRegistry.delete(blobUrl);
            /* No success toast: app code already toasted, and the share
               sheet itself is the confirmation. */
          },
          function () {
            blobRegistry.delete(blobUrl);
            if (!reachedShareSheet) {
              /* The share sheet never opened → a real failure (not a user
                 dismissal). Let WebView try its default handling as a last
                 resort and tell the user. */
              try {
                if (origAnchorClick && !anchor.__capRetried) {
                  anchor.__capRetried = true;
                  origAnchorClick.call(anchor);
                }
              } catch (e) {}
              toast('تعذّر حفظ الملف على الجهاز', 'error');
            }
            /* else: user dismissed the share sheet — stay silent. */
          }
        );
    }

    function maybeIntercept(anchor) {
      if (anchor.__capNativeDl) return false; /* already handled / fallback pass */
      if (!isBlobDownloadAnchor(anchor)) return false;
      anchor.__capNativeDl = true;
      try {
        handleDownload(anchor);
      } catch (e) {
        toast('تعذّر حفظ الملف على الجهاز', 'error');
      }
      return true;
    }

    /* app.js export buttons use a.click() ... */
    var origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (maybeIntercept(this)) return undefined;
      return origAnchorClick.call(this);
    };

    /* ... while jsPDF dispatches a synthetic MouseEvent('click'). Patching
       dispatchEvent on HTMLAnchorElement only (not EventTarget) keeps the
       interception narrowly scoped to download anchors. */
    var origAnchorDispatch = HTMLAnchorElement.prototype.dispatchEvent;
    HTMLAnchorElement.prototype.dispatchEvent = function (event) {
      if (event && event.type === 'click' && maybeIntercept(this)) return true;
      return origAnchorDispatch.call(this, event);
    };
  }
})();
