/* Verification harness for capacitor-bridge.js (the Android-only native bridge).
 * Loads the REAL capacitor-bridge.js (from __dirname) in a vm sandbox with mocked
 * browser globals (HTMLAnchorElement, URL, FileReader, fetch) and a mocked
 * Capacitor runtime (App/Filesystem/Share plugins), then drives the exact
 * flows the app uses:
 *   - app.js JSON export:   a.click() + synchronous revokeObjectURL
 *   - jsPDF PDF export:     dispatchEvent(new MouseEvent('click'))
 *   - hardware back button: App backButton listener
 *   - admin APK button:     href rewritten to the live GitHub Pages APK
 * Also boots service-worker.js to prove the in-app mirror never serves the
 * app shell / the bridge from the live site — the bundled index.html is the
 * only copy that loads capacitor-bridge.js, so mirroring it would silently
 * break in-app downloads (PDF + JSON) and the back button.
 * Zero dependencies — runs with plain node. Mirrors test-import.js style.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRIDGE_SRC = fs.readFileSync(path.join(__dirname, 'capacitor-bridge.js'), 'utf8');
const APK_URL = 'https://fadiramzy.github.io/Anba-Bishoy-Church/Anba-Bishoy-Church.apk';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${extra !== undefined ? `  — ${extra}` : ''}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${extra !== undefined ? `  — ${extra}` : ''}`);
  }
}
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));
async function settle(world, tries = 40) {
  // Drain both Node and sandbox async queues until the world goes quiet.
  for (let i = 0; i < tries; i++) {
    await tick();
    await vm.runInContext('Promise.resolve()', world.ctx);
  }
}

/* ---------------- mocked browser world ---------------- */
function makeWorld({ native, prepare }) {
  const calls = {
    origClick: [], origDispatch: [],
    backListeners: {}, minimizeApp: 0,
    fsWrite: [], fsUri: [], share: [], toast: [],
    createdURLs: [], revokedURLs: [], fetch: [],
    styleInjected: [], clickListeners: [],
  };

  /* Nodes the bridge's [data-apk-download] lookup should find. */
  const docState = { apkAnchors: [] };

  const document = {
    head: {
      appendChild(el) { calls.styleInjected.push(el); },
    },
    createElement(tag) {
      return {
        tag,
        attrs: {},
        textContent: '',
        setAttribute(n, v) { this.attrs[n] = String(v); },
      };
    },
    querySelectorAll(selector) {
      return selector === '[data-apk-download]' ? docState.apkAnchors.slice() : [];
    },
    addEventListener(type, cb, capture) {
      calls.clickListeners.push({ type, cb, capture: !!capture });
    },
  };

  class HTMLAnchorElement {
    constructor() {
      this.tagName = 'A';
      this._attrs = {};
      this.__capNativeDl = false;
    }
    getAttribute(n) {
      return Object.prototype.hasOwnProperty.call(this._attrs, n) ? this._attrs[n] : null;
    }
    setAttribute(n, v) { this._attrs[n] = String(v); }
  }
  // Property reflection like a real anchor (app.js/jsPDF set .href/.download).
  Object.defineProperty(HTMLAnchorElement.prototype, 'href', {
    get() { return this.getAttribute('href') || ''; },
    set(v) { this.setAttribute('href', v); },
  });
  Object.defineProperty(HTMLAnchorElement.prototype, 'download', {
    get() { return this.getAttribute('download') || ''; },
    set(v) { this.setAttribute('download', v); },
  });
  HTMLAnchorElement.prototype.click = function () { calls.origClick.push(this); };
  HTMLAnchorElement.prototype.dispatchEvent = function (e) {
    calls.origDispatch.push([this, e && e.type]);
    return true;
  };

  let blobSeq = 0;
  const URLMock = {
    createObjectURL(obj) {
      const u = `blob:mock/${++blobSeq}`;
      calls.createdURLs.push([u, obj]);
      return u;
    },
    revokeObjectURL(u) { calls.revokedURLs.push(u); },
  };

  class FakeFileReader {
    readAsDataURL(blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          const b64 = Buffer.from(buf).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
          if (this.onload) this.onload();
        })
        .catch((err) => {
          this.error = err;
          if (this.onerror) this.onerror();
        });
    }
  }

  const plugins = {
    App: {
      addListener(ev, cb) {
        calls.backListeners[ev] = cb;
        return Promise.resolve({ remove() {} });
      },
      minimizeApp() {
        calls.minimizeApp++;
        return Promise.resolve();
      },
    },
    Filesystem: {
      writeFile(opts) {
        calls.fsWrite.push(opts);
        return Promise.resolve({ uri: `file:///cache/${opts.path}` });
      },
      getUri(opts) {
        calls.fsUri.push(opts);
        return Promise.resolve({ uri: `file:///cache/${opts.path}` });
      },
    },
    Share: {
      share(opts) {
        calls.share.push(opts);
        return Promise.resolve({ activityType: 'mock' });
      },
    },
  };

  const historyBack = [];
  const window = {
    location: { hash: '' },
    history: { back: () => historyBack.push(1) },
    showToast: (msg, kind) => calls.toast.push([msg, kind]),
    Capacitor: {
      isNativePlatform: () => native,
      getPlatform: () => (native ? 'android' : 'web'),
      registerPlugin: (name) => plugins[name],
    },
  };

  const sandbox = {
    window,
    URL: URLMock,
    Blob, // Node's real Blob — same identity on both sides of `instanceof`
    FileReader: FakeFileReader,
    fetch: (...args) => {
      calls.fetch.push(args);
      return Promise.reject(new Error('fetch must not be called (registry should satisfy)'));
    },
    HTMLAnchorElement,
    document,
    console,
    setTimeout,
    clearTimeout,
  };
  const ctx = vm.createContext(sandbox);
  const world = {
    ctx, calls, historyBack, window, HTMLAnchorElement, docState,
    URL: vm.runInContext('URL', ctx), // patched registry version
    makeAnchor(download, href) {
      const a = vm.runInContext('new HTMLAnchorElement()', ctx);
      if (download !== null && download !== undefined) a.download = download;
      if (href !== null && href !== undefined) a.href = href;
      return a;
    },
  };
  /* Runs after the context exists but BEFORE the bridge boots, so a test can
     pre-render DOM the bridge is expected to pick up at startup. */
  if (prepare) prepare(world);
  vm.runInContext(BRIDGE_SRC, ctx, { filename: 'capacitor-bridge.js' });
  return world;
}

(async () => {
  /* ============ native world ============ */
  const w = makeWorld({ native: true });
  await settle(w);

  /* ---- 1. back button wiring ---- */
  check('backButton listener registered', typeof w.calls.backListeners.backButton === 'function');
  w.window.location.hash = '#/home';
  w.calls.backListeners.backButton();
  await tick();
  check('back button on inner route → history.back()', w.historyBack.length === 1);
  check('back button on inner route → app NOT minimized', w.calls.minimizeApp === 0);
  w.window.location.hash = '#/';
  w.calls.backListeners.backButton();
  await tick();
  check('back button on home → minimizeApp()', w.calls.minimizeApp === 1);
  check('back button on home → no history.back()', w.historyBack.length === 1);

  /* ---- APK button: no longer hidden in the native app ---- */
  check('native: no APK-hide style injected (button stays visible)',
    w.calls.styleInjected.length === 0, JSON.stringify(w.calls.styleInjected));

  /* ---- 2. app.js JSON-export pattern: a.click() + immediate revoke ---- */
  const jsonBytes = '{"members":[{"id":1,"name":"\u0645\u062e\u062f\u0648\u0645"}]}';
  const blob = new Blob([jsonBytes], { type: 'application/json' });
  const url = w.URL.createObjectURL(blob); // patched: registers blob
  const a = w.makeAnchor('church-members-backup-2026-09-24.json', url);
  a.click();
  w.URL.revokeObjectURL(url); // app.js revokes synchronously — must not break us
  await settle(w);

  const expectedB64 = Buffer.from(jsonBytes, 'utf8').toString('base64');
  check('export intercepted (original click suppressed)', w.calls.origClick.length === 0);
  check('fetch never called (bytes came from registry)', w.calls.fetch.length === 0);
  check('Filesystem.writeFile called once', w.calls.fsWrite.length === 1);
  const wf = w.calls.fsWrite[0] || {};
  check('writeFile path = download filename', wf.path === 'church-members-backup-2026-09-24.json', wf.path);
  check('writeFile directory = CACHE', wf.directory === 'CACHE', wf.directory);
  check('writeFile data = exact blob bytes (base64)', wf.data === expectedB64);
  check('writeFile has no encoding flag (binary mode)', !('encoding' in wf));
  check('Filesystem.getUri called for same file',
    w.calls.fsUri.length === 1 && w.calls.fsUri[0].path === wf.path);
  check('Share.share called once', w.calls.share.length === 1);
  const sh = w.calls.share[0] || {};
  check('share url = native file uri', sh.url === 'file:///cache/church-members-backup-2026-09-24.json', sh.url);
  check('share title = filename', sh.title === 'church-members-backup-2026-09-24.json');
  check('no error toast on success', w.calls.toast.length === 0, JSON.stringify(w.calls.toast));

  /* ---- 3. jsPDF pattern: dispatchEvent(MouseEvent click) ---- */
  const n0 = { fs: w.calls.fsWrite.length, share: w.calls.share.length, disp: w.calls.origDispatch.length };
  const pdfBlob = new Blob(['%PDF-1.4 fake-bytes'], { type: 'application/pdf' });
  const pdfUrl = w.URL.createObjectURL(pdfBlob);
  const pa = w.makeAnchor('birthdays.pdf', pdfUrl);
  const ret = pa.dispatchEvent({ type: 'click' }); // jsPDF dispatches, never .click()
  await settle(w);
  check('dispatchEvent interception returns true', ret === true);
  check('dispatched click suppressed from original', w.calls.origDispatch.length === n0.disp);
  check('dispatched download → writeFile', w.calls.fsWrite.length === n0.fs + 1);
  check('dispatched download → share sheet',
    w.calls.share.length === n0.share + 1 &&
    w.calls.share[w.calls.share.length - 1].url === 'file:///cache/birthdays.pdf');

  /* ---- 4. non-download anchors pass through untouched ---- */
  const c0 = w.calls.origClick.length;
  const s0 = w.calls.share.length;
  w.makeAnchor(null, 'https://www.google.com/maps?q=1,2').click(); // maps link
  w.makeAnchor(null, 'tel:+201234567890').click(); // phone link
  const dlHttp = w.makeAnchor('file.json', 'https://example.com/file.json'); // download attr, http href
  dlHttp.click();
  await settle(w);
  check('plain links use original click', w.calls.origClick.length === c0 + 3);
  check('plain links never trigger share', w.calls.share.length === s0);

  /* ---- 5. empty download attr → sanitized fallback name ---- */
  const f0 = w.calls.fsWrite.length;
  const u2 = w.URL.createObjectURL(new Blob(['x'], { type: 'text/plain' }));
  w.makeAnchor('', u2).click();
  await settle(w);
  check('empty download attr → filename "download"',
    w.calls.fsWrite.length === f0 + 1 && w.calls.fsWrite[f0].path === 'download',
    w.calls.fsWrite[f0] && w.calls.fsWrite[f0].path);

  /* ---- 5b. APK download links → live APK on GitHub Pages ---- */
  // (a) app.js's temporary anchor, clicked programmatically after the PIN gate.
  const apkTemp = w.makeAnchor('Anba-Bishoy-Church.apk', 'Anba-Bishoy-Church.apk');
  const apkClicks0 = w.calls.origClick.length;
  const apkShare0 = w.calls.share.length;
  apkTemp.click();
  await settle(w);
  check('native: APK click → href rewritten to the live Pages URL',
    apkTemp.getAttribute('href') === APK_URL, apkTemp.getAttribute('href'));
  check('native: APK click reaches the original click (external browser)',
    w.calls.origClick.length === apkClicks0 + 1);
  check('native: APK click is not treated as a blob download',
    w.calls.share.length === apkShare0);

  // (b) the rendered admin button (data-apk-download) via dispatchEvent.
  const apkRendered = w.makeAnchor('Anba-Bishoy-Church.apk', 'Anba-Bishoy-Church.apk');
  apkRendered.setAttribute('data-apk-download', '');
  apkRendered.dispatchEvent({ type: 'click' });
  await settle(w);
  check('native: [data-apk-download] button rewritten on dispatchEvent',
    apkRendered.getAttribute('href') === APK_URL, apkRendered.getAttribute('href'));

  // (c) a real tap: the capture-phase listener rewrites before navigation.
  const apkTap = w.makeAnchor('Anba-Bishoy-Church.apk', 'Anba-Bishoy-Church.apk');
  apkTap.setAttribute('data-apk-download', '');
  const clickListener = w.calls.clickListeners[0] || {};
  check('native: capture-phase click listener registered',
    typeof clickListener.cb === 'function' && clickListener.capture === true);
  if (clickListener.cb) clickListener.cb({ target: apkTap });
  check('native: tap on the APK button rewritten before navigation',
    apkTap.getAttribute('href') === APK_URL, apkTap.getAttribute('href'));

  // (d) an APK button already rendered when the bridge boots.
  const apkWorld = makeWorld({
    native: true,
    prepare(world) {
      const rendered = world.makeAnchor('Anba-Bishoy-Church.apk', 'Anba-Bishoy-Church.apk');
      rendered.setAttribute('data-apk-download', '');
      world.docState.apkAnchors.push(rendered);
      world.rendered = rendered;
    },
  });
  await settle(apkWorld);
  check('native: pre-rendered APK button rewritten at bridge start',
    apkWorld.rendered.getAttribute('href') === APK_URL, apkWorld.rendered.getAttribute('href'));

  /* ---- 6. failure before share sheet → error toast + native fallback ---- */
  const w2 = makeWorld({ native: true });
  await settle(w2);
  // Break the AFTER-revoke path: unknown blob URL + failing fetch.
  const bad = w2.makeAnchor('broken.json', 'blob:mock/does-not-exist');
  const oc0 = w2.calls.origClick.length;
  bad.click();
  await settle(w2);
  check('failed download → original click used as fallback', w2.calls.origClick.length === oc0 + 1);
  check('failed download → Arabic error toast',
    w2.calls.toast.length === 1 && /تعذّر حفظ الملف/.test(w2.calls.toast[0][0]),
    JSON.stringify(w2.calls.toast));

  /* ============ web world (bridge must stay dormant) ============ */
  const web = makeWorld({ native: false });
  await settle(web);
  check('web: no backButton listener registered', Object.keys(web.calls.backListeners).length === 0);
  const wurl = web.URL.createObjectURL(new Blob(['x']));
  const wa = web.makeAnchor('a.json', wurl);
  wa.click();
  await settle(web);
  check('web: clicks pass through to original', web.calls.origClick.length === 1);
  check('web: no share triggered', web.calls.share.length === 0);
  check('web: no filesystem writes', web.calls.fsWrite.length === 0);
  check('web: no style injected (APK button stays visible)', web.calls.styleInjected.length === 0);

  /* ---- web: APK links stay exactly as authored (website untouched) ---- */
  const webApk = web.makeAnchor('Anba-Bishoy-Church.apk', 'Anba-Bishoy-Church.apk');
  webApk.setAttribute('data-apk-download', '');
  const webClicks0 = web.calls.origClick.length;
  webApk.click();
  await settle(web);
  check('web: APK href left relative (no rewrite on the website)',
    webApk.getAttribute('href') === 'Anba-Bishoy-Church.apk', webApk.getAttribute('href'));
  check('web: APK click passes through to original', web.calls.origClick.length === webClicks0 + 1);
  check('web: no capture-phase click listener registered', web.calls.clickListeners.length === 0);

  /* ============ service-worker.js: the app shell must stay bundled ============ */
  /* In the Android app the bridge only loads through the packaged index.html
     (the live site's copy has no capacitor-bridge.js tag on purpose), so the
     mirror must serve the shell + the bridge from the bundle and mirror only
     the app's assets. */
  const SW_SRC = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
  function bootSW({ hostname, protocol }) {
    const listeners = {}, net = [];
    const cacheStub = (name) => ({
      put: () => Promise.resolve(),
      match: () => Promise.resolve({ fromBundle: true, cacheName: name }),
      addAll: () => Promise.resolve(),
    });
    const ctx = vm.createContext({
      self: {
        location: { hostname, protocol, origin: protocol + '//' + hostname },
        addEventListener: (type, cb) => (listeners[type] = cb),
        skipWaiting: () => Promise.resolve(),
        clients: { claim: () => Promise.resolve() },
      },
      caches: {
        open: (n) => Promise.resolve(cacheStub(n)),
        match: () => Promise.resolve({ fromBundle: true }),
        keys: () => Promise.resolve([]),
        delete: () => Promise.resolve(true),
      },
      fetch: (input) => {
        net.push(typeof input === 'string' ? input : input.url);
        return Promise.resolve({ ok: true, status: 200, clone() { return this; } });
      },
      URL, Promise, console, Error,
    });
    vm.runInContext(SW_SRC, ctx, { filename: 'service-worker.js' });
    return {
      net,
      request(url, extra) {
        let p;
        const event = Object.assign({ request: { method: 'GET', url, mode: 'no-cors' }, respondWith: (r) => (p = r) }, extra);
        listeners.fetch(event);
        return p;
      },
    };
  }

  const APP_ORIGIN = 'https://localhost';
  const appSW = bootSW({ hostname: 'localhost', protocol: 'https:' });
  const shell = await appSW.request(APP_ORIGIN + '/', { mode: 'navigate', destination: 'document' });
  check('sw: app shell document is served from the bundle, never mirrored',
    !!shell && appSW.net.length === 0, JSON.stringify(appSW.net));
  await appSW.request(APP_ORIGIN + '/index.html', { destination: 'document' });
  check('sw: index.html is never mirrored (bridge tag must survive)',
    appSW.net.length === 0, JSON.stringify(appSW.net));
  await appSW.request(APP_ORIGIN + '/capacitor-bridge.js');
  check('sw: capacitor-bridge.js always comes from the bundle',
    appSW.net.length === 0, JSON.stringify(appSW.net));
  await appSW.request(APP_ORIGIN + '/app.js?v=17');
  check('sw: app assets are still mirrored from the live site',
    appSW.net.length === 1 &&
    appSW.net[0] === 'https://fadiramzy.github.io/Anba-Bishoy-Church/app.js?v=17', appSW.net[0]);
  const capCall = appSW.request(APP_ORIGIN + '/_capacitor_http_interceptor_/x');
  check('sw: /_capacitor_* handed back to the native bridge untouched', capCall === undefined);
  check('sw: nothing else reached the network', appSW.net.length === 1, JSON.stringify(appSW.net));

  const webSW = bootSW({ hostname: 'fadiramzy.github.io', protocol: 'https:' });
  const webResp = await webSW.request('https://fadiramzy.github.io/Anba-Bishoy-Church/app.js?v=17');
  check('sw: website origin is unchanged (cache-first, never mirrored)',
    !!webResp && webSW.net.every((u) => u === 'https://fadiramzy.github.io/Anba-Bishoy-Church/app.js?v=17'),
    JSON.stringify(webSW.net));

  console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exitCode = 1;
});
