/* ==========================================================================
   telegram-relay/test/e2e.test.mjs

   REAL BROWSER end-to-end test of the Admin page feature.

   What actually runs here:
     * the real repo files (index.html, styles.css, db.js, app.js, bible/,
       calendar/) served over HTTP from the repository root,
     * the real Chromium browser (Playwright) driving the real #/admin page,
     * the real IndexedDB (Chromium's own),
     * the real relay logic (telegram-relay/core.js) behind
       telegram-relay/local-relay.js,
     * a mock Telegram Bot API so no real message is posted.

   Verified:
     1. Admin page loads and shows both buttons.
     2. The existing "تنزيل نسخة JSON" download still works and holds every
        Services Directory record.
     3. "مشاركة البيانات" posts only the Services Directory to the relay.
     4. The relay uploads a real multipart document to Telegram.
     5. The uploaded JSON parses and its record count equals the count in
        IndexedDB (`members` store).
     6. Settings / PIN / visitation / Bible data are NOT in the file.
     7. Success => success toast + the Telegram group is opened.
     8. Failure => error toast and NO redirect.
     9. Rapid double click sends only one upload.
    10. No bot token appears in any served file or outgoing request.

   Run:  cd telegram-relay && node test/e2e.test.mjs
   ========================================================================== */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createMockTelegram } from './mock-telegram.mjs';
import { createRelayServer } from '../local-relay.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const GROUP_URL = 'https://t.me/+k59GS-Gk3x82ZWJk';
const SEED_COUNT = 37;

/* The exact strings the feature is allowed to show. */
const SHARE_SUCCESS_TEXT = 'تم مشاركة اخر تحديث للبيانات لديك';
const SHARE_BUTTON_LABEL = 'مشاركة البيانات المحدثه';
const SHARE_PASSWORD = '1836';
const SHARE_FAILURE_TEXT = 'تعذّرت مشاركة البيانات. حاول مرة أخرى.';
const TEST_CHAT_ID = '-1009876543210';

/* Anything from the plumbing that must never reach the screen. */
const FORBIDDEN_IN_UI = [
  'تيليجرام', 'telegram', 't.me', 'workers.dev', 'chat_id', 'message_id',
  'bot', 'relay', 'JSON', 'http', TEST_CHAT_ID, '401', '400', '502',
];
function assertCleanUI(text, where) {
  const hits = FORBIDDEN_IN_UI.filter((t) => text.toLowerCase().includes(t.toLowerCase()));
  if (hits.length) throw new Error(`${where} leaks ${JSON.stringify(hits)} → "${text}"`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startStaticServer(root) {
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (pathname === '/') pathname = '/index.html';
      const filePath = resolve(join(root, normalize(pathname)));
      if (!filePath.startsWith(root)) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const info = await stat(filePath).catch(() => null);
      if (!info || !info.isFile()) { res.writeHead(404); res.end('not found'); return; }
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

/* ------------------------------------------------------------------ */
/*  Tiny assertion helpers (no test framework needed)                  */
/* ------------------------------------------------------------------ */
let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✖ ${name}\n      ${e.message}`);
  }
}
function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function truthy(v, msg = '') {
  if (!v) throw new Error(`${msg} expected truthy, got ${JSON.stringify(v)}`);
}
function falsy(v, msg = '') {
  if (v) throw new Error(`${msg} expected falsy, got ${JSON.stringify(v)}`);
}

/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Clicks the share button and answers the password dialog with `password`.
   Returns before the dialog is dismissed so callers can assert on it. */
async function clickShare(pg, password = SHARE_PASSWORD) {
  await pg.click('#shareBtn');
  await pg.waitForSelector('.pin-modal', { timeout: 10000 });
  await pg.fill('.pin-modal input', password);
  await pg.click('.pin-modal .btn-confirm');
}

async function main() {
  const mock = createMockTelegram();
  const telegramBase = await mock.listen(0);

  const staticSite = await startStaticServer(REPO_ROOT);

  const relayEnv = {
    TELEGRAM_BOT_TOKEN: mock.VALID_TOKEN,
    TELEGRAM_CHAT_ID: '-1009876543210',
    TELEGRAM_API_BASE: telegramBase,
    ALLOWED_ORIGINS: staticSite.url,
  };
  const relay = createRelayServer(relayEnv);
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const relayUrl = `http://127.0.0.1:${relay.address().port}`;
  const shareEndpoint = `${relayUrl}/api/telegram/share`;

  console.log(`\nstatic site : ${staticSite.url}`);
  console.log(`relay       : ${shareEndpoint}`);
  console.log(`telegram    : ${telegramBase} (mock, token ${mock.VALID_TOKEN.slice(0, 6)}…)\n`);

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });

  /* The one piece of configuration the feature needs: where the relay lives.
     Injected before any page script runs, exactly like a real deployment. */
  await context.addInitScript((endpoint) => {
    window.TELEGRAM_SHARE_CONFIG = { endpoint };
  }, shareEndpoint);

  /* Safety net: the feature must never send the user to Telegram. If a
     regression ever opens t.me, this stub answers it locally so the test can
     observe it instead of hitting the network. */
  await context.route('**://t.me/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>telegram stub</title>',
  }));

  const page = await context.newPage();

  /* Record every request so we can prove the token never leaves the server. */
  const seenUrls = [];
  const openedPopupUrls = [];
  const navigations = [];
  context.on('page', (p) => openedPopupUrls.push(p.url()));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
  page.on('request', (r) => seenUrls.push(r.url()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    console.log(">>> step 1: boot + seed");
    /* ---------- 1. boot + seed a realistic local dataset ---------- */
    await page.goto(`${staticSite.url}/#/home`, { waitUntil: 'load' });
    /* db.js/app.js declare their globals with const/let, so they live in the
       global lexical scope, not on window — reference them bare. */
    await page.waitForFunction(
      () => typeof MembersDB !== 'undefined' && document.getElementById('app').innerHTML.length > 50,
      null,
      { timeout: 25000, polling: 100 },
    );

    const seeded = await page.evaluate(async (n) => {
      await MembersDB.clearAll();
      await VisitationDB.clearAll();
      const members = Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        name: `مخدوم تجريبي ${i + 1}`,
        phone1: `010${String(10000000 + i)}`,
        phone2: '',
        city: 'المنيا الجديدة',
        neighborhood: i % 2 ? 'حي النور' : 'حي الزهور',
        street: `شارع ${i + 1}`,
        stage: 'مدارس الأحد',
        sector: 'ابتدائي_أ',
        class: `الفصل ${i + 1}`,
        birthDate: '2012-03-04',
        age: 13,
        notes: `ملاحظة رقم ${i + 1}`,
      }));
      await MembersDB.bulkPut(members);
      // Data that must NOT appear in the shared file:
      await SettingsDB.set('admin_pin_hash', 'deadbeefdeadbeefdeadbeef');
      await SettingsDB.set('app_theme', 'dark');
      await VisitationDB.bulkPut([
        { id: 1, name: 'أسرة افتقاد ١', city: 'المنيا', children: [] },
        { id: 2, name: 'أسرة افتقاد ٢', city: 'المنيا', children: [] },
      ]);
      return {
        members: await MembersDB.count(),
        visitation: await VisitationDB.count(),
      };
    }, SEED_COUNT);

    check('local dataset seeded', () => {
      eq(seeded.members, SEED_COUNT, 'members count');
      eq(seeded.visitation, 2, 'visitation count');
    });

    console.log(">>> step 2: admin page");
    /* ---------- 2. Admin page loads ---------- */
    await page.goto(`${staticSite.url}/#/admin`, { waitUntil: 'load' });
    await page.waitForSelector('#exportBtn', { timeout: 15000 });
    await page.waitForSelector('#shareBtn', { timeout: 15000 });

    const admin = await page.evaluate(() => ({
      title: document.querySelector('.section-title')?.textContent || '',
      subtitle: document.querySelector('.section-sub')?.textContent || '',
      exportLabel: document.querySelector('#exportBtn span')?.textContent || '',
      shareLabel: document.querySelector('#shareBtn span')?.textContent || '',
      buttonsInSameRow: !!document.querySelector('#exportBtn')?.parentElement?.contains(document.querySelector('#shareBtn')),
    }));

    check('admin page loads correctly', () => {
      eq(admin.title, 'إدارة البيانات', 'admin title');
      truthy(admin.subtitle.includes(`(${SEED_COUNT} اسم)`), `subtitle shows record count → "${admin.subtitle}"`);
      falsy(pageErrors.length, `no page errors → ${pageErrors.join(' | ')}`);
    });

    check('both buttons exist, new one next to the existing one', () => {
      eq(admin.exportLabel, 'تنزيل نسخة JSON', 'existing button label unchanged');
      eq(admin.shareLabel, SHARE_BUTTON_LABEL, 'new button label');
      truthy(admin.buttonsInSameRow, 'share button sits in the same .admin-actions row');
    });

    console.log(">>> step 3: existing download");
    /* ---------- 3. existing JSON download still works ---------- */
    mock.reset();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('#exportBtn'),
    ]);
    const downloadPath = await download.path();
    const downloaded = JSON.parse(await readFile(downloadPath, 'utf8'));

    check('existing "تنزيل نسخة JSON" still works', () => {
      truthy(download.suggestedFilename().startsWith('church-members-backup-'), `filename ${download.suggestedFilename()}`);
      truthy(download.suggestedFilename().endsWith('.json'));
      eq(downloaded.length, SEED_COUNT, 'downloaded record count');
      eq(downloaded[0].name, 'مخدوم تجريبي 1');
    });

    const toastAfterDownload = await page.textContent('#toast');
    check('download success toast', () => truthy(toastAfterDownload.includes('تم تنزيل النسخة الاحتياطية'), `toast="${toastAfterDownload}"`));

    console.log(">>> step 4: share happy path");
    /* ---------- 4. new share button: happy path ---------- */
    mock.reset();
    const urlBeforeShare = page.url();
    await clickShare(page);

    /* loading state must appear and the button must be locked */
    const duringFlight = await page.evaluate(() => ({
      label: document.querySelector('#shareBtn span')?.textContent || '',
      disabled: document.querySelector('#shareBtn')?.disabled === true,
      busy: document.querySelector('#shareBtn')?.getAttribute('aria-busy'),
    }));

    await page.waitForFunction(
      (expected) => ((document.getElementById('toast') || {}).textContent || '').trim() === expected,
      SHARE_SUCCESS_TEXT,
      { timeout: 25000, polling: 100 },
    );
    const shareToast = (await page.textContent('#toast')).trim();
    const afterShare = await page.evaluate(() => ({
      label: document.querySelector('#shareBtn span')?.textContent || '',
      disabled: document.querySelector('#shareBtn')?.disabled === true,
    }));

    /* Give any stray pop-up or navigation every chance to happen before we
       assert that none did. */
    await sleep(2000);

    check('loading state shown and duplicate clicks blocked while in flight', () => {
      eq(duringFlight.label, 'جارٍ الإرسال…', 'button label while sending');
      eq(duringFlight.disabled, true, 'button disabled while sending');
      eq(duringFlight.busy, 'true', 'aria-busy set while sending');
      eq(afterShare.disabled, false, 'button re-enabled afterwards');
      eq(afterShare.label, SHARE_BUTTON_LABEL, 'label restored afterwards');
    });

    check('success message is EXACTLY the required text', () => {
      eq(shareToast, SHARE_SUCCESS_TEXT, 'success toast');
      assertCleanUI(shareToast, 'success toast');
    });

    check('user is NOT sent anywhere after success', () => {
      eq(openedPopupUrls.length, 0, `new tabs/windows opened: ${JSON.stringify(openedPopupUrls)}`);
      eq(page.url(), urlBeforeShare, 'still on the admin page');
      truthy(page.url().endsWith('#/admin'), `url is ${page.url()}`);
      falsy(seenUrls.some((u) => u.includes('t.me')), 'no request to t.me');
      eq(navigations.filter((u) => u.includes('t.me')).length, 0, `navigations: ${JSON.stringify(navigations)}`);
    });

    console.log(">>> step 5: inspect upload");
    /* ---------- 5. what actually reached Telegram ---------- */
    check('exactly one document was uploaded to Telegram', () => {
      eq(mock.state.uploads.length, 1, 'upload count');
      eq(mock.state.uploads[0].chat_id, '-1009876543210', 'chat_id');
      truthy(/^church-services-directory-\d{4}-\d{2}-\d{2}\.json$/.test(mock.state.uploads[0].file_name), `file name ${mock.state.uploads[0].file_name}`);
    });

    const uploaded = JSON.parse(mock.state.uploads[0].text);
    check('uploaded JSON is valid and contains ALL Services Directory records', () => {
      truthy(Array.isArray(uploaded), 'is an array');
      eq(uploaded.length, SEED_COUNT, 'uploaded record count vs IndexedDB count');
      eq(uploaded.length, downloaded.length, 'uploaded count equals the local download count');
      const names = uploaded.map((r) => r.name).sort();
      const expectedNames = Array.from({ length: SEED_COUNT }, (_, i) => `مخدوم تجريبي ${i + 1}`).sort();
      eq(JSON.stringify(names), JSON.stringify(expectedNames), 'every name present');
      eq(uploaded[0].notes, 'ملاحظة رقم 1', 'full field values preserved');
    });

    check('no unrelated application data in the file', () => {
      const raw = mock.state.uploads[0].text;
      falsy(raw.includes('admin_pin_hash'), 'settings key leaked');
      falsy(raw.includes('deadbeef'), 'PIN/settings value leaked');
      falsy(raw.includes('app_theme'), 'settings key leaked');
      falsy(raw.includes('أسرة افتقاد'), 'visitation data leaked');
      falsy(raw.includes('visitationFamilies'), 'visitation store leaked');
      falsy(raw.includes('b51e45a12fbae3d0ee2bf77f1a4f80cbf642e2b4d1c237d2c0f7053a54f6b388'), 'admin PIN hash leaked');
      falsy(/سفر|التكوين|المزامير/.test(raw), 'Bible text leaked');
      const keys = new Set();
      uploaded.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
      const allowed = new Set(['id', 'name', 'phone1', 'phone2', 'city', 'neighborhood', 'street', 'stage', 'sector', 'class', 'birthDate', 'age', 'notes']);
      const extra = [...keys].filter((k) => !allowed.has(k));
      eq(extra.length, 0, `unexpected fields ${JSON.stringify(extra)}`);
    });

    check('bot token never reached the browser or any request', () => {
      falsy(seenUrls.some((u) => u.includes(mock.VALID_TOKEN)), `token in a request URL: ${seenUrls.filter((u) => u.includes(mock.VALID_TOKEN))}`);
      truthy(seenUrls.some((u) => u.startsWith(relayUrl)), 'the page did call the relay');
      falsy(seenUrls.some((u) => u.includes('api.telegram.org')), 'the page never called Telegram directly');
    });

    console.log(">>> step 6: double click");
    /* ---------- 6. rapid double click sends only one upload ---------- */
    mock.reset();
    mock.state.delayMs = 900; // keep the first request in flight
    await clickShare(page);
    await sleep(60);
    await page.click('#shareBtn', { force: true }).catch(() => {});
    await page.click('#shareBtn', { force: true }).catch(() => {});
    await page.waitForFunction(() => document.querySelector('#shareBtn')?.disabled === false, null, { timeout: 20000, polling: 100 });
    mock.state.delayMs = 0;

    check('rapid double click does not duplicate the upload', () => {
      eq(mock.state.uploads.length, 1, `upload count after 3 clicks = ${mock.state.uploads.length}`);
    });

    console.log(">>> step 7: failure path");
    /* ---------- 7. failure path ---------- */
    mock.reset();
    mock.setMode('badrequest');
    const urlBeforeFailure = page.url();
    await clickShare(page);
    await page.waitForFunction(
      (expected) => ((document.getElementById('toast') || {}).textContent || '').trim() === expected,
      SHARE_FAILURE_TEXT,
      { timeout: 25000, polling: 100 },
    );
    const failToast = (await page.textContent('#toast')).trim();
    const failClass = await page.getAttribute('#toast', 'class');
    const stillEnabled = await page.evaluate(() => document.querySelector('#shareBtn').disabled === false);
    await sleep(1500);
    mock.setMode('ok');

    check('upload failure shows only a simple Arabic message and stays put', () => {
      eq(mock.state.uploads.length, 0, 'nothing reached Telegram in failure mode');
      eq(failToast, SHARE_FAILURE_TEXT, 'failure toast');
      assertCleanUI(failToast, 'failure toast');
      truthy(failClass.includes('danger'), `toast styled as an error → "${failClass}"`);
      falsy(failToast.includes('بنجاح'), 'no success wording on failure');
      eq(page.url(), urlBeforeFailure, 'still on the admin page');
      eq(openedPopupUrls.length, 0, 'no window opened on failure');
      eq(stillEnabled, true, 'button usable again after the error');
    });

    console.log(">>> step 8: unconfigured");
    /* ---------- 8. unconfigured relay gives a clear message ---------- */
    const page2 = await context.newPage();
    await page2.addInitScript(() => {
      window.TELEGRAM_SHARE_CONFIG = { endpoint: 'https://anba-bishoy-telegram-relay.YOUR_SUBDOMAIN.workers.dev/api/telegram/share' };
    });
    await page2.goto(`${staticSite.url}/#/admin`, { waitUntil: 'load' });
    await page2.waitForSelector('#shareBtn', { timeout: 15000 });
    await clickShare(page2);
    await page2.waitForFunction(() => (document.getElementById('toast') || {}).className.includes('danger'), null, { timeout: 15000 });
    const unconfiguredToast = await page2.textContent('#toast');
    check('unconfigured endpoint shows the same simple failure message', () => {
      eq(unconfiguredToast.trim(), SHARE_FAILURE_TEXT, `toast="${unconfiguredToast}"`);
      assertCleanUI(unconfiguredToast, 'unconfigured toast');
    });
    await page2.close();

    console.log(">>> step 9: source scan");
    /* ---------- 8b. no redirect even when a window COULD be opened -------- */
    mock.reset();
    const page3 = await context.newPage();
    let opened3 = 0;
    await page3.addInitScript(() => {
      window.__openCalls = [];
      const realOpen = window.open;
      window.open = (...args) => { window.__openCalls.push(String(args[0])); return null; };
      void realOpen;
    });
    await page3.goto(`${staticSite.url}/#/admin`, { waitUntil: 'domcontentloaded' });
    await page3.waitForSelector('#shareBtn', { timeout: 15000 });
    await clickShare(page3);
    await page3.waitForFunction(
      (expected) => ((document.getElementById('toast') || {}).textContent || '').trim() === expected,
      SHARE_SUCCESS_TEXT,
      { timeout: 25000, polling: 100 },
    );
    await sleep(1000);
    opened3 = (await page3.evaluate(() => window.__openCalls)).length;
    check('window.open is never called at all', () => {
      eq(mock.state.uploads.length, 1, 'upload still happened');
      eq(opened3, 0, 'window.open call count');
      truthy(page3.url().endsWith('#/admin'), `still on admin → ${page3.url()}`);
    });
    await page3.close();

    /* ---------- 8c. password gate ---------- */
    mock.reset();
    const page4 = await context.newPage();
    await page4.goto(`${staticSite.url}/#/admin`, { waitUntil: 'domcontentloaded' });
    await page4.waitForSelector('#shareBtn', { timeout: 15000 });

    /* (a) clicking must open the password dialog before anything happens */
    await page4.click('#shareBtn');
    await page4.waitForSelector('.pin-modal', { timeout: 10000 });
    const gate = await page4.evaluate(() => ({
      title: document.querySelector('.pin-modal h3')?.textContent || '',
      isPasswordInput: document.querySelector('.pin-modal input')?.type === 'password',
      buttonStillEnabled: document.querySelector('#shareBtn').disabled === false,
    }));
    check('clicking asks for a password before anything else', () => {
      eq(gate.title, 'كلمة المرور', 'dialog title');
      eq(gate.isPasswordInput, true, 'input type is password');
      eq(gate.buttonStillEnabled, true, 'no loading state while waiting for the password');
      eq(mock.state.uploads.length, 0, 'nothing uploaded while the dialog is open');
      assertCleanUI(gate.title, 'password dialog title');
    });

    /* (b) WRONG password must block the share entirely */
    await page4.fill('.pin-modal input', '0000');
    await page4.click('.pin-modal .btn-confirm');
    await page4.waitForFunction(
      () => (document.querySelector('.pin-modal .field-error') || {}).textContent?.length > 0,
      null, { timeout: 10000, polling: 100 },
    );
    const wrongErr = await page4.textContent('.pin-modal .field-error');
    const stillOpen = await page4.locator('.pin-modal').count();
    const uploadsAfterWrong = mock.state.uploads.length;
    const relayCallsAfterWrong = await page4.evaluate(() => performance.getEntriesByType('resource')
      .filter((r) => r.name.includes('/api/telegram/share')).length);
    const toastAfterWrong = await page4.textContent('#toast');
    const urlAfterWrong = page4.url();
    await sleep(800);

    check('a wrong password shares nothing at all', () => {
      eq(wrongErr.trim(), 'كلمة المرور غير صحيحة', 'inline error text');
      eq(stillOpen, 1, 'dialog stays open so it can be retried');
      eq(uploadsAfterWrong, 0, 'no upload reached the relay');
      eq(relayCallsAfterWrong, 0, 'the browser never even called the backend');
      truthy(urlAfterWrong.endsWith('#/admin'), `still on the admin page → ${urlAfterWrong}`);
      eq(toastAfterWrong.includes('تم مشاركة'), false, 'no success message');
      assertCleanUI(wrongErr, 'wrong-password error');
    });

    /* (c) cancel must also share nothing */
    await page4.click('.pin-modal .btn-cancel');
    await sleep(300);
    const dialogsAfterCancel = await page4.locator('.pin-modal').count();
    const urlAfterCancel = page4.url();
    check('cancelling the password dialog shares nothing', () => {
      eq(dialogsAfterCancel, 0, 'dialog dismissed');
      eq(mock.state.uploads.length, 0, 'still no upload');
      truthy(urlAfterCancel.endsWith('#/admin'), 'still on the admin page');
    });

    /* (d) the RIGHT password then works */
    await clickShare(page4);
    await page4.waitForFunction(
      (expected) => ((document.getElementById('toast') || {}).textContent || '').trim() === expected,
      SHARE_SUCCESS_TEXT, { timeout: 25000, polling: 100 },
    );
    const toastAfterCorrect = (await page4.textContent('#toast')).trim();
    const uploadsAfterCorrect = mock.state.uploads.length;
    check('the correct password allows the share through', () => {
      eq(uploadsAfterCorrect, 1, 'exactly one upload after the correct password');
      eq(toastAfterCorrect, SHARE_SUCCESS_TEXT, 'success toast');
    });
    await page4.close();

    /* ---------- 9. served source contains no secret ---------- */
    const appSource = await (await fetch(`${staticSite.url}/app.js?v=10`)).text();
    const indexSource = await (await fetch(`${staticSite.url}/index.html`)).text();
    check('served frontend source contains no Telegram secret', () => {
      falsy(appSource.includes(mock.VALID_TOKEN), 'token in app.js');
      falsy(indexSource.includes(mock.VALID_TOKEN), 'token in index.html');
      falsy(/bot\d{6,}:[A-Za-z0-9_-]{30,}/.test(appSource), 'token-shaped string in app.js');
      falsy(/bot\d{6,}:[A-Za-z0-9_-]{30,}/.test(indexSource), 'token-shaped string in index.html');
      truthy(appSource.includes(SHARE_BUTTON_LABEL), 'new button code is really in the served app.js');
    });

  } finally {
    /* Best-effort teardown: keep-alive sockets from the browser can hold
       server.close() open forever, so cap it and exit explicitly. */
    const teardown = (async () => {
      await browser.close().catch(() => {});
      relay.closeAllConnections && relay.closeAllConnections();
      mock.server.closeAllConnections && mock.server.closeAllConnections();
      staticSite.server.closeAllConnections && staticSite.server.closeAllConnections();
      await Promise.all([
        new Promise((r) => relay.close(r)),
        new Promise((r) => mock.close(r)),
        new Promise((r) => staticSite.server.close(r)),
      ]);
    })();
    await Promise.race([teardown, sleep(4000)]);
  }

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log('  FAILED → ' + f));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E harness crashed:', e);
  process.exit(1);
});
