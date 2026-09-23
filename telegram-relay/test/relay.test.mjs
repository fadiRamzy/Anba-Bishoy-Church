/* ==========================================================================
   telegram-relay/test/relay.test.mjs

   Integration tests for the REAL relay logic (telegram-relay/core.js), driven
   through the REAL Node adapter (telegram-relay/local-relay.js) over HTTP,
   against a mock Telegram Bot API (test/mock-telegram.mjs).

   Run:  cd telegram-relay && node --test test/
   ========================================================================== */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createMockTelegram } from './mock-telegram.mjs';
import { createRelayServer } from '../local-relay.js';
import { safeFileName, safeCaption, createRateLimiter, isOriginAllowed } from '../core.js';

const CHAT_ID = '-1009876543210';

const mock = createMockTelegram();
let relay;
let relayUrl;

function records(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `اسم تجريبي ${i + 1}`,
    phone1: `0100000000${i}`,
    city: 'المنيا الجديدة',
    neighborhood: 'حي النور',
    street: 'شارع 1',
    stage: 'مدارس الأحد',
    sector: 'ابتدائي_أ',
    class: 'الأول',
    birthDate: '2012-03-04',
    age: 13,
    notes: 'ملاحظة',
  }));
}

/* Each extra relay gets its OWN rate limiter instance (deps.rateLimiter) so
   the rate-limit test cannot interfere with the functional ones. */
function serverWith(overrides = {}) {
  return createRelayServer({
    TELEGRAM_BOT_TOKEN: mock.VALID_TOKEN,
    TELEGRAM_CHAT_ID: CHAT_ID,
    TELEGRAM_API_BASE: mock.state.baseUrl,
    ...overrides,
  }, { rateLimiter: createRateLimiter() });
}

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', r));
const closeServer = (srv) => new Promise((r) => srv.close(r));
const localUrl = (srv) => `http://127.0.0.1:${srv.address().port}`;

async function postShare(payload, headers = {}, env = {}) {
  const res = await fetch(`${relayUrl}/api/telegram/share`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://fadiramzy.github.io',
      ...headers,
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* keep raw */ }
  return { status: res.status, json, text, headers: Object.fromEntries(res.headers) };
}

before(async () => {
  const baseUrl = await mock.listen(0);
  relay = createRelayServer({
    TELEGRAM_BOT_TOKEN: mock.VALID_TOKEN,
    TELEGRAM_CHAT_ID: CHAT_ID,
    TELEGRAM_API_BASE: baseUrl,
    RATE_LIMIT_PER_MINUTE: '1000', // throttling has its own dedicated test
  }, { rateLimiter: createRateLimiter() });
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  relayUrl = `http://127.0.0.1:${relay.address().port}`;
});

after(async () => {
  await new Promise((r) => relay.close(r));
  await mock.close();
});

test('health endpoint reports configuration without leaking the token', async () => {
  const res = await fetch(`${relayUrl}/api/telegram/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.configured, true);
  assert.equal(body.tokenConfigured, true);
  assert.equal(body.chatConfigured, true);
  assert.ok(!JSON.stringify(body).includes(mock.VALID_TOKEN), 'token must not be echoed');
});

test('uploads the Services Directory JSON as a Telegram document', async () => {
  mock.reset();
  const data = records(37);
  const json = JSON.stringify(data, null, 2);

  const res = await postShare({
    filename: 'church-services-directory-2026-09-22.json',
    caption: 'نسخة احتياطية من دليل الخدمات — 37 سجل',
    json,
  });

  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.records, 37);
  assert.equal(typeof res.json.message_id, 'number');
  assert.equal(res.json.file_name, 'church-services-directory-2026-09-22.json');

  assert.equal(mock.state.uploads.length, 1, 'exactly one Telegram upload');
  const up = mock.state.uploads[0];
  assert.equal(up.chat_id, CHAT_ID);
  assert.equal(up.file_name, 'church-services-directory-2026-09-22.json');
  assert.match(up.caption, /37 سجل/);

  const parsed = JSON.parse(up.text);
  assert.equal(parsed.length, 37, 'uploaded file holds every record');
  assert.deepEqual(parsed, data, 'uploaded file is byte-for-byte the same data');
});

test('the bot token never reaches the client', async () => {
  mock.reset();
  const res = await postShare({ filename: 'a.json', json: JSON.stringify(records(3)) });
  assert.equal(res.json.ok, true);
  assert.ok(!res.text.includes(mock.VALID_TOKEN), 'token in response body');
  assert.ok(!JSON.stringify(res.headers).includes(mock.VALID_TOKEN), 'token in response headers');
});

test('refuses payloads that are not a Services Directory array', async () => {
  mock.reset();
  for (const bad of [
    { filename: 'x.json', json: JSON.stringify({ settings: { pin: '1234' } }) },
    { filename: 'x.json', json: '"just a string"' },
    { filename: 'x.json', json: JSON.stringify([1, 2, 3]) },
    { filename: 'x.json', json: '{not json' },
    { filename: 'x.json' },
    {},
  ]) {
    const res = await postShare(bad);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(bad).slice(0, 60)} → ${res.text}`);
    assert.equal(res.json.ok, false);
  }
  assert.equal(mock.state.uploads.length, 0, 'nothing forwarded to Telegram');
});

test('refuses oversized payloads before touching Telegram', async () => {
  mock.reset();
  const relay2 = serverWith({ MAX_JSON_BYTES: '2000' });
  await listen(relay2);
  const url = localUrl(relay2);
  const res = await fetch(`${url}/api/telegram/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://fadiramzy.github.io' },
    body: JSON.stringify({ filename: 'big.json', json: JSON.stringify(records(500)) }),
  });
  assert.equal(res.status, 400);
  assert.equal(mock.state.uploads.length, 0);
  await closeServer(relay2);
});

test('rejects a browser origin that is not allow-listed', async () => {
  mock.reset();
  const res = await postShare(
    { filename: 'x.json', json: JSON.stringify(records(2)) },
    { origin: 'https://evil.example.com' },
  );
  assert.equal(res.status, 403);
  assert.equal(mock.state.uploads.length, 0);
  assert.equal(res.headers['access-control-allow-origin'], undefined, 'no CORS grant for evil origin');
});

test('CORS preflight is answered for an allowed origin', async () => {
  const res = await fetch(`${relayUrl}/api/telegram/share`, {
    method: 'OPTIONS',
    headers: { origin: 'https://fadiramzy.github.io' },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://fadiramzy.github.io');
  assert.equal(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});

test('maps a Telegram 401 to a 502 without leaking the token', async () => {
  mock.reset();
  mock.setMode('unauthorized');
  const res = await postShare({ filename: 'x.json', json: JSON.stringify(records(2)) });
  assert.equal(res.status, 502);
  assert.equal(res.json.ok, false);
  assert.ok(!res.text.includes(mock.VALID_TOKEN));
  assert.equal(mock.state.uploads.length, 0);
  mock.setMode('ok');
});

test('maps a Telegram 400 to a 502', async () => {
  mock.reset();
  mock.setMode('badrequest');
  const res = await postShare({ filename: 'x.json', json: JSON.stringify(records(2)) });
  assert.equal(res.status, 502);
  assert.equal(res.json.ok, false);
  mock.setMode('ok');
});

test('maps a network failure to a 502', async () => {
  mock.reset();
  mock.setMode('network');
  const res = await postShare({ filename: 'x.json', json: JSON.stringify(records(2)) });
  assert.equal(res.status, 502);
  assert.equal(res.json.ok, false);
  mock.setMode('ok');
});

test('method / path / configuration guards', async () => {
  const get = await fetch(`${relayUrl}/api/telegram/share`, { headers: { origin: 'https://fadiramzy.github.io' } });
  assert.equal(get.status, 405);

  const missing = await fetch(`${relayUrl}/api/nope`, { headers: { origin: 'https://fadiramzy.github.io' } });
  assert.equal(missing.status, 404);

  const bare = createRelayServer({}, { rateLimiter: createRateLimiter() });
  await listen(bare);
  const bareUrl = localUrl(bare);
  const unconfigured = await fetch(`${bareUrl}/api/telegram/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://fadiramzy.github.io' },
    body: JSON.stringify({ filename: 'x.json', json: JSON.stringify(records(1)) }),
  });
  assert.equal(unconfigured.status, 503);
  await closeServer(bare);
});

test('optional RELAY_ACCESS_KEY is enforced', async () => {
  const keyed = serverWith({ RELAY_ACCESS_KEY: 's3cr3t-key' });
  await listen(keyed);
  const url = localUrl(keyed);
  const payload = JSON.stringify({ filename: 'x.json', json: JSON.stringify(records(2)) });

  const denied = await fetch(`${url}/api/telegram/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://fadiramzy.github.io' },
    body: payload,
  });
  assert.equal(denied.status, 403);

  const allowed = await fetch(`${url}/api/telegram/share`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://fadiramzy.github.io',
      'x-relay-key': 's3cr3t-key',
    },
    body: payload,
  });
  assert.equal(allowed.status, 200);
  await closeServer(keyed);
});

test('rate limit protects the public endpoint from spam', async () => {
  mock.reset();
  const limited = serverWith({ RATE_LIMIT_PER_MINUTE: '3' });
  await listen(limited);
  const url = localUrl(limited);
  const body = JSON.stringify({ filename: 'x.json', json: JSON.stringify(records(1)) });
  const call = () => fetch(`${url}/api/telegram/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://fadiramzy.github.io' },
    body,
  });

  const statuses = [];
  for (let i = 0; i < 5; i += 1) statuses.push((await call()).status);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429], 'only 3 uploads per minute allowed');
  assert.equal(mock.state.uploads.length, 3, 'throttled requests never reached Telegram');

  const tooMany = await call();
  assert.equal(tooMany.headers.get('retry-after') !== null, true, 'retry-after header set');
  await closeServer(limited);
});

test('origin allow-list, including the opt-in "*" wildcard', () => {
  assert.equal(isOriginAllowed('https://fadiramzy.github.io', ['https://fadiramzy.github.io']), true);
  assert.equal(isOriginAllowed('https://evil.example.com', ['https://fadiramzy.github.io']), false);
  assert.equal(isOriginAllowed(undefined, ['https://fadiramzy.github.io']), false, 'no Origin header is not "allowed"');
  assert.equal(isOriginAllowed('http://127.0.0.1:4173', ['*']), true, 'wildcard is opt-in for local dev');
  /* A trailing slash must not defeat the comparison. */
  assert.equal(isOriginAllowed('https://fadiramzy.github.io/', ['https://fadiramzy.github.io']), true);
});

test('file name and caption sanitising', () => {
  /* Slashes are stripped, so the result is no longer a .json name and the
     safe fallback is used instead of anything path-shaped. */
  assert.equal(safeFileName('../../etc/passwd', 'fallback.json'), 'fallback.json');
  assert.equal(safeFileName('backup.json', 'fallback.json'), 'backup.json');
  assert.ok(!safeFileName('a/b\\c.json', 'fallback.json').includes('/'));
  assert.equal(safeFileName('ok.json', 'f.json'), 'ok.json');
  assert.equal(safeFileName('نسخة.json', 'f.json'), 'نسخة.json');
  assert.equal(safeFileName('nope.txt', 'fallback.json'), 'fallback.json');
  assert.equal(safeCaption('a'.repeat(3000), 'fb').length, 1024);
  assert.equal(safeCaption('   ', 'fallback'), 'fallback');
});

test('the uploaded file round-trips through getFile', async () => {
  mock.reset();
  const data = records(12);
  const res = await postShare({ filename: 'roundtrip.json', json: JSON.stringify(data, null, 2) });
  assert.equal(res.json.ok, true);

  const up = mock.state.uploads[0];
  const gf = await (await fetch(`${mock.state.baseUrl}/bot${mock.VALID_TOKEN}/getFile?file_id=${up.file_id}`)).json();
  assert.equal(gf.ok, true);
  const downloaded = await (await fetch(`${mock.state.baseUrl}/file/bot${mock.VALID_TOKEN}/${gf.result.file_path}`)).text();
  assert.deepEqual(JSON.parse(downloaded), data, 'downloaded copy equals the original records');
});
