/* ==========================================================================
   telegram-relay/test/real-telegram-upload.mjs

   THE REAL THING. Runs the complete production flow against the actual
   Telegram Bot API (https://api.telegram.org) — no mocks:

     real Chromium  →  real repo files (index.html / app.js / db.js)
                    →  real relay (telegram-relay/core.js via local-relay.js)
                    →  api.telegram.org  →  your group

   Then it downloads the uploaded document straight back out of Telegram with
   getFile and parses it, to prove the file that landed in the group is the
   real, complete Services Directory backup.

   Credentials come ONLY from the environment — never from this repository:

     cd telegram-relay
     export TELEGRAM_BOT_TOKEN='123456789:AAE...'
     export TELEGRAM_CHAT_ID='-1001234567890'
     node test/real-telegram-upload.mjs

   or:  set -a && . ./.dev.vars && set +a && node test/real-telegram-upload.mjs
   ========================================================================== */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createRelayServer } from '../local-relay.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const GROUP_URL = 'https://t.me/+k59GS-Gk3x82ZWJk';
const SHARE_SUCCESS_TEXT = 'تم مشاركة اخر تحديث للبيانات لديك';
const SHARE_PASSWORD = '1836';
const RECORD_COUNT = Number(process.env.REAL_TEST_RECORDS || 37);
const TELEGRAM_API = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickShare(pg) {
  await pg.click('#shareBtn');
  await pg.waitForSelector('.pin-modal', { timeout: 15000 });
  await pg.fill('.pin-modal input', SHARE_PASSWORD);
  await pg.click('.pin-modal .btn-confirm');
}
const mask = (t) => (t ? `${t.slice(0, 6)}…${t.slice(-4)}` : '(missing)');

function startStaticServer(root) {
  const server = createServer(async (req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = resolve(join(root, normalize(pathname)));
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(await readFile(filePath));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

let step = 0;
function ok(msg) { console.log(`  ${'✔'} [${++step}] ${msg}`); }
function fail(msg) { console.log(`  ✖ [${++step}] ${msg}`); failures.push(msg); }
const failures = [];

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  REAL Telegram upload test — no mocks');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  bot token   : ${mask(TOKEN)}`);
  console.log(`  chat id     : ${CHAT_ID || '(missing)'}`);
  console.log(`  telegram api: ${TELEGRAM_API}`);
  console.log(`  group url   : ${GROUP_URL}`);
  console.log(`  records     : ${RECORD_COUNT}\n`);

  if (!TOKEN || !CHAT_ID) {
    console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in the environment.');
    process.exit(2);
  }

  /* 0. the credentials themselves are valid */
  const me = await (await fetch(`${TELEGRAM_API}/bot${TOKEN}/getMe`)).json();
  if (!me.ok) {
    console.error(`getMe failed: ${me.description} — the token is wrong or revoked.`);
    process.exit(2);
  }
  ok(`bot authenticated as @${me.result.username} (id ${me.result.id})`);

  const chat = await (await fetch(`${TELEGRAM_API}/bot${TOKEN}/getChat?chat_id=${encodeURIComponent(CHAT_ID)}`)).json();
  if (!chat.ok) {
    console.error(`getChat failed: ${chat.description} — is the bot a member of the group?`);
    process.exit(2);
  }
  ok(`chat resolved: "${chat.result.title}" (type ${chat.result.type}, id ${chat.result.id})`);

  const staticSite = await startStaticServer(REPO_ROOT);

  /* REAL_TEST_ENDPOINT lets this test target an ALREADY RUNNING relay — e.g. the
     real Cloudflare Worker under `wrangler dev` (workerd) — instead of spinning
     up the Node adapter. Same core.js either way, but this exercises the actual
     worker.js entry point in the real Workers runtime. */
  const externalEndpoint = process.env.REAL_TEST_ENDPOINT;
  let relay = null;
  let endpoint = externalEndpoint;
  if (externalEndpoint) {
    console.log(`  relay       : ${externalEndpoint}  (external)`);
  } else {
  relay = createRelayServer({
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_CHAT_ID: CHAT_ID,
    TELEGRAM_API_BASE: TELEGRAM_API,
    ALLOWED_ORIGINS: staticSite.url,
    RATE_LIMIT_PER_MINUTE: '1000',
  });
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${relay.address().port}/api/telegram/share`;
  }

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript((e) => {
    window.TELEGRAM_SHARE_CONFIG = { endpoint: e };
    /* Test-only instrumentation: remember the relay's reply so the harness can
       download the exact file the browser uploaded (no second upload). */
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      try {
        if (String(args[0]).includes('/api/telegram/share')) {
          window.__lastRelayReply = await res.clone().json();
        }
      } catch (err) { /* ignore */ }
      return res;
    };
  }, endpoint);
  /* Safety net: the feature must never send the user to Telegram. If a
     regression ever opens t.me, this stub answers it locally. */
  await context.route('**://t.me/**', (route) => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>telegram stub</title>',
  }));

  const page = await context.newPage();
  const seenUrls = [];
  page.on('request', (r) => seenUrls.push(r.url()));
  const pageErrors = [];
  const openedPopupUrls = [];
  context.on('page', (p) => openedPopupUrls.push(p.url()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  let uploaded = null;
  let localRecords = null;
  let messageId = null;

  try {
    /* 1. boot the real app and fill the real IndexedDB */
    await page.goto(`${staticSite.url}/#/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => typeof MembersDB !== 'undefined' && document.getElementById('app').innerHTML.length > 50,
      null, { timeout: 25000, polling: 100 },
    );
    localRecords = await page.evaluate(async (n) => {
      await MembersDB.clearAll();
      await SettingsDB.set('admin_pin_hash', 'deadbeefdeadbeefdeadbeef');
      await VisitationDB.clearAll();
      await VisitationDB.bulkPut([{ id: 1, name: 'أسرة افتقاد ١', city: 'المنيا', children: [] }]);
      await MembersDB.bulkPut(Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        name: `مخدوم اختبار حقيقي ${i + 1}`,
        phone1: `010${String(20000000 + i)}`,
        phone2: '',
        city: 'المنيا الجديدة',
        neighborhood: i % 2 ? 'حي النور' : 'حي الزهور',
        street: `شارع ${i + 1}`,
        stage: 'مدارس الأحد',
        sector: 'ابتدائي_أ',
        class: `الفصل ${i + 1}`,
        birthDate: '2012-03-04',
        age: 13,
        notes: `ملاحظة ${i + 1}`,
      })));
      return { count: await MembersDB.count(), records: await MembersDB.getAll() };
    }, RECORD_COUNT);
    ok(`Admin data prepared in the browser's IndexedDB: ${localRecords.count} Services Directory records`);
    if (localRecords.count !== RECORD_COUNT) fail(`IndexedDB count ${localRecords.count} != ${RECORD_COUNT}`);

    /* 2. admin page + existing download still work */
    await page.goto(`${staticSite.url}/#/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#exportBtn');
    await page.waitForSelector('#shareBtn');
    ok('Admin page (#/admin) loaded with both buttons');
    if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('#exportBtn'),
    ]);
    const downloaded = JSON.parse(await readFile(await download.path(), 'utf8'));
    if (downloaded.length === RECORD_COUNT) ok(`existing "تنزيل نسخة JSON" download works (${downloaded.length} records)`);
    else fail(`download has ${downloaded.length} records, expected ${RECORD_COUNT}`);

    /* 3. click the new button — a real file goes to the real group */
    const urlBeforeShare = page.url();
    await clickShare(page);
    await page.waitForFunction(
      (expected) => ((document.getElementById('toast') || {}).textContent || '').trim() === expected,
      SHARE_SUCCESS_TEXT,
      { timeout: 60000, polling: 100 },
    );
    const toast = (await page.textContent('#toast')).trim();
    await sleep(2000); // give any stray pop-up / navigation time to happen
    if (toast === SHARE_SUCCESS_TEXT) ok(`browser showed exactly: "${toast}"`);
    else fail(`toast was "${toast}", expected "${SHARE_SUCCESS_TEXT}"`);

    const leaks = ['تيليجرام', 'telegram', 't.me', 'workers.dev', 'chat', 'bot', 'JSON', 'http']
      .filter((t) => toast.toLowerCase().includes(t.toLowerCase()));
    if (!leaks.length) ok('the success message reveals nothing about the destination or backend');
    else fail(`success message leaks ${leaks.join(', ')}`);

    if (openedPopupUrls.length === 0 && page.url() === urlBeforeShare) ok('user was NOT redirected or sent to any new tab');
    else fail(`redirect detected: popups=${JSON.stringify(openedPopupUrls)} url=${page.url()}`);

    /* 4. pull the exact uploaded file back out of Telegram and parse it.
          The relay's success reply carries the bot-scoped file_id, which the
          page captured for us (see the fetch wrapper in addInitScript). */
    const relayReply = await page.evaluate(() => window.__lastRelayReply || null);
    if (!relayReply || relayReply.ok !== true) {
      fail(`no successful relay reply captured in the page: ${JSON.stringify(relayReply)}`);
    } else {
      messageId = relayReply.message_id;
      ok(`Telegram accepted the upload from the browser (message_id ${messageId}, file "${relayReply.file_name}", ${relayReply.file_size} bytes, ${relayReply.records} records)`);

      const gf = await (await fetch(`${TELEGRAM_API}/bot${TOKEN}/getFile?file_id=${relayReply.file_id}`)).json();
      if (!gf.ok) {
        fail(`getFile failed: ${gf.description}`);
      } else {
        const back = await (await fetch(`${TELEGRAM_API}/file/bot${TOKEN}/${gf.result.file_path}`)).text();
        uploaded = JSON.parse(back);
        if (uploaded.length === RECORD_COUNT) ok(`the file stored by Telegram parses as valid JSON and holds ${uploaded.length} records`);
        else fail(`file stored by Telegram has ${uploaded.length} records, expected ${RECORD_COUNT}`);

        const sameNames = JSON.stringify(uploaded.map((r) => r.name).sort())
          === JSON.stringify(localRecords.records.map((r) => r.name).sort());
        if (sameNames) ok('every record in the Telegram copy matches the local Services Directory');
        else fail('records differ between local data and the Telegram copy');

        const leaks = ['deadbeef', 'admin_pin_hash', 'أسرة افتقاد', 'bible', 'psa'].filter((t) => back.includes(t));
        if (!leaks.length) ok('the file in the group contains no settings / PIN / visitation / Bible data');
        else fail(`unrelated data present in the Telegram file: ${leaks.join(', ')}`);
      }
    }

    /* 6. the group link itself resolves */
    const groupRes = await fetch(GROUP_URL, { redirect: 'follow' });
    if (groupRes.ok || groupRes.status === 302) ok(`group invite link is reachable (HTTP ${groupRes.status})`);
    else fail(`group link returned HTTP ${groupRes.status}`);

    /* 7. nothing secret left the browser */
    const leaked = seenUrls.filter((u) => u.includes(TOKEN));
    if (!leaked.length) ok('the bot token never appeared in any browser request');
    else fail(`token leaked into browser requests: ${leaked.join(', ')}`);
    if (!seenUrls.some((u) => u.includes('api.telegram.org'))) ok('the browser never called api.telegram.org directly');
    else fail('the browser called api.telegram.org directly');
  } finally {
    const teardown = (async () => {
      await browser.close().catch(() => {});
      if (relay) relay.closeAllConnections && relay.closeAllConnections();
      staticSite.server.closeAllConnections && staticSite.server.closeAllConnections();
    })();
    await Promise.race([teardown, sleep(4000)]);
  }

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`  ${step - failures.length}/${step} real checks passed`);
  if (failures.length) {
    console.log('  FAILURES:');
    failures.forEach((f) => console.log('   - ' + f));
  } else {
    console.log('  ✅ The Services Directory file is really in the Telegram group.');
  }
  console.log('──────────────────────────────────────────────────────────────\n');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error('crashed:', e); process.exit(1); });
