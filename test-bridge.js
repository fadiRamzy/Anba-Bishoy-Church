/* Verification harness for capacitor-bridge.js (the Android-only native bridge).
 * Loads the REAL /home/user/capacitor-bridge.js in a vm sandbox with mocked
 * browser globals (HTMLAnchorElement, URL, FileReader, fetch) and a mocked
 * Capacitor runtime (App/Filesystem/Share plugins), then drives the exact
 * flows the app uses:
 *   - app.js JSON export:   a.click() + synchronous revokeObjectURL
 *   - jsPDF PDF export:     dispatchEvent(new MouseEvent('click'))
 *   - hardware back button: App backButton listener
 * Zero dependencies — runs with plain node. Mirrors test-import.js style.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const BRIDGE_SRC = fs.readFileSync(path.join(__dirname, 'capacitor-bridge.js'), 'utf8');

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
function makeWorld({ native }) {
  const calls = {
    origClick: [], origDispatch: [],
    backListeners: {}, minimizeApp: 0,
    fsWrite: [], fsUri: [], share: [], toast: [],
    createdURLs: [], revokedURLs: [], fetch: [],
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
    Blob,
    FileReader: FakeFileReader,
    fetch: (...args) => {
      calls.fetch.push(args);
      return Promise.reject(new Error('fetch must not be called (registry should satisfy)'));
    },
    HTMLAnchorElement,
    console,
    setTimeout,
    clearTimeout,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(BRIDGE_SRC, ctx, { filename: 'capacitor-bridge.js' });

  return {
    ctx, calls, historyBack, window, HTMLAnchorElement,
    URL: vm.runInContext('URL', ctx),
    makeAnchor(download, href) {
      const a = vm.runInContext('new HTMLAnchorElement()', ctx);
      if (download !== null && download !== undefined) a.download = download;
      if (href !== null && href !== undefined) a.href = href;
      return a;
    },
  };
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

  /* ---- 2. app.js JSON-export pattern: a.click() + immediate revoke ---- */
  const jsonBytes = '{"members":[{"id":1,"name":"مخدوم"}]}';
  const blob = new Blob([jsonBytes], { type: 'application/json' });
  const url = w.URL.createObjectURL(blob);
  const a = w.makeAnchor('church-members-backup-2026-09-24.json', url);
  a.click();
  w.URL.revokeObjectURL(url);
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
  const ret = pa.dispatchEvent({ type: 'click' });
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
  w.makeAnchor(null, 'https://www.google.com/maps?q=1,2').click();
  w.makeAnchor(null, 'tel:+201234567890').click();
  const dlHttp = w.makeAnchor('file.json', 'https://example.com/file.json');
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

  /* ---- 6. failure before share sheet → error toast + native fallback ---- */
  const w2 = makeWorld({ native: true });
  await settle(w2);
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

  console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exitCode = 1;
});