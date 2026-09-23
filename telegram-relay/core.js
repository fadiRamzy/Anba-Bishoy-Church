/* ==========================================================================
   telegram-relay/core.js

   Platform-agnostic logic for the "مشاركة البيانات" (share Services Directory
   to Telegram) relay.

   WHY THIS EXISTS
   ---------------
   The church app is a 100% static site (GitHub Pages + Capacitor). The
   Telegram Bot API requires a bot token, and a token that ships in the
   browser is public: anyone could read it and post anything to the group.
   So the browser never talks to api.telegram.org. It posts the Services
   Directory JSON to THIS relay, which lives on a serverless runtime, reads
   the token from a server-side secret, and forwards the file to Telegram.

   The token is never:
     - written to this repository,
     - returned to the browser in a response body or header,
     - written to a log line.

   This module is deliberately runtime-agnostic (no Cloudflare / Node imports)
   so the SAME code runs as:
     - a Cloudflare Worker        (worker.js  -> thin adapter)
     - a Node HTTP server         (local-relay.js -> thin adapter, also used
                                   by the automated tests in ./test)

   Runtime contract
   ----------------
   handleRelayRequest(input, deps?) where input is:
     env         : { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_API_BASE?,
                     ALLOWED_ORIGINS?, RELAY_ACCESS_KEY?, MAX_JSON_BYTES? }
     method      : 'GET' | 'POST' | 'OPTIONS' | ...
     path        : request pathname, e.g. '/api/telegram/share'
     headers     : plain object of request headers (case-insensitive lookup is
                   handled here)
     bodyText    : raw request body as text ('' when there is none)
     clientIp    : best-effort client IP (used only for log lines)
   deps.fetch    : optional fetch implementation (tests point this at a mock
                   Telegram Bot API)

   Returns { status, headers, body } where body is a JSON string.
   ========================================================================== */

const DEFAULT_TELEGRAM_API_BASE = 'https://api.telegram.org';
const DEFAULT_MAX_JSON_BYTES = 4 * 1024 * 1024; // 4 MB (Telegram allows 50 MB per bot upload)
const SHARE_PATH = '/api/telegram/share';
const HEALTH_PATH = '/api/telegram/health';

/* Origins allowed to call the relay. The relay is public infrastructure, so
   this is defence-in-depth (Origin can be forged from a non-browser client),
   not the primary control — the primary controls are: the token stays
   server-side, the payload is size-capped and schema-checked, and the relay
   can only ever POST one document to one hard-coded chat. */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://fadiramzy.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

/* An origin list containing exactly "*" disables the Origin check. Opt-in
   only, for local development against `wrangler dev`; production keeps the
   explicit allow-list from wrangler.toml. */
function isOriginAllowed(origin, allowedOrigins) {
  if (allowedOrigins.includes('*')) return true;
  if (!origin) return false;
  const clean = origin.replace(/\/$/, '');
  return allowedOrigins.some((o) => o.replace(/\/$/, '') === clean);
}

function corsHeaders(origin, configuredOrigins) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-relay-key',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
  };
  const allowed = configuredOrigins.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
  if (origin && isOriginAllowed(origin, allowed)) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'Origin';
  }
  return headers;
}

function json(status, payload, headers) {
  return { status, headers, body: JSON.stringify(payload) };
}

function getHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

function parseList(value, fallback) {
  if (!value) return fallback;
  const list = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

/* ---------------------------------------------------------------------------
   Sliding-window rate limiter.

   The relay has to be publicly reachable (the site is public), so this is what
   stops a stranger from filling the group's chat with files. It is in-memory,
   which on a serverless runtime is per-instance and therefore best-effort —
   combine it with Cloudflare's own rate limiting rules for a hard guarantee.
   Keyed by client IP; keyed by 'unknown' when the platform gives us no IP.
   ------------------------------------------------------------------------- */
const DEFAULT_RATE_LIMIT_PER_MINUTE = 10;

function createRateLimiter() {
  const hits = new Map(); // key -> [timestamps]
  return {
    /* Returns { allowed, retryAfterSeconds, remaining }. */
    check(key, limit, windowMs = 60000, now = Date.now()) {
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= limit) {
        hits.set(key, list);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - list[0])) / 1000)),
          remaining: 0,
        };
      }
      list.push(now);
      hits.set(key, list);
      /* Keep the map from growing without bound. */
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (!v.length) hits.delete(k);
      }
      return { allowed: true, retryAfterSeconds: 0, remaining: limit - list.length };
    },
    reset() { hits.clear(); },
  };
}

const rateLimiter = createRateLimiter();

/* Telegram accepts unicode file names, but we keep the name boring and safe:
   letters (incl. Arabic), digits, dash, underscore, dot — anything else is
   dropped. Guards against header/boundary injection via a crafted file name. */
function safeFileName(name, fallback) {
  const cleaned = String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}._-]/gu, '')
    .slice(0, 120);
  return cleaned.toLowerCase().endsWith('.json') ? cleaned : fallback;
}

/* Strip control characters from a caption and cap it at Telegram's limit. */
function safeCaption(caption, fallback) {
  const text = String(caption == null ? fallback : caption)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  return text.slice(0, 1024) || fallback;
}

/* UTF-8 byte length without depending on Node's Buffer (not present in the
   Cloudflare Workers runtime). */
function utf8ByteLength(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.codePointAt(i);
    if (code > 0xffff) i += 1;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Validate the payload the browser sent.
 * Returns { ok, json, records, caption, filename } or { ok:false, error }.
 *
 * The relay refuses anything that is not an array of plain objects, because
 * the whole point of this endpoint is "a Services Directory backup and
 * nothing else" — a settings blob, a PIN, or Bible text has no business here.
 */
function validatePayload(bodyText, maxBytes) {
  if (!bodyText) return { ok: false, error: 'الطلب فارغ' };

  let envelope;
  try {
    envelope = JSON.parse(bodyText);
  } catch (e) {
    return { ok: false, error: 'الطلب ليس JSON صحيحًا' };
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { ok: false, error: 'صيغة الطلب غير صحيحة' };
  }

  const raw = envelope.json;
  if (typeof raw !== 'string' || !raw) {
    return { ok: false, error: 'لا توجد بيانات (حقل json مفقود)' };
  }
  if (utf8ByteLength(raw) > maxBytes) {
    return { ok: false, error: `حجم البيانات أكبر من الحد المسموح (${Math.round(maxBytes / 1024)} ك.ب)` };
  }

  let records;
  try {
    records = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'البيانات المرفقة ليست JSON صحيحًا' };
  }
  if (!Array.isArray(records)) {
    return { ok: false, error: 'البيانات يجب أن تكون مصفوفة سجلات' };
  }
  for (const r of records) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      return { ok: false, error: 'البيانات تحتوي على سجل غير صالح' };
    }
  }

  /* Never forward a token-shaped string by accident. */
  if (/\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/.test(raw)) {
    return { ok: false, error: 'البيانات تحتوي على ما يبدو أنه توكن بوت' };
  }

  return {
    ok: true,
    json: raw,
    records,
    caption: envelope.caption,
    filename: envelope.filename,
  };
}

async function handleRelayRequest(input, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const env = input.env || {};
  const method = String(input.method || 'GET').toUpperCase();
  const path = String(input.path || '/');
  const headers = input.headers || {};
  const origin = getHeader(headers, 'origin');
  const allowedOrigins = parseList(env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  const cors = corsHeaders(origin, allowedOrigins);

  if (method === 'OPTIONS') {
    return { status: 204, headers: cors, body: '' };
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const configured = Boolean(token) && Boolean(chatId);

  if (path.replace(/\/+$/, '') === HEALTH_PATH) {
    /* Reports whether the relay is configured WITHOUT revealing anything
       secret — the frontend uses this to explain a missing configuration. */
    return json(200, {
      ok: true,
      configured,
      endpoint: SHARE_PATH,
      tokenConfigured: Boolean(token),
      chatConfigured: Boolean(chatId),
    }, cors);
  }

  if (path.replace(/\/+$/, '') !== SHARE_PATH) {
    return json(404, { ok: false, error: 'غير موجود' }, cors);
  }

  if (method !== 'POST') {
    return json(405, { ok: false, error: 'يجب استخدام POST' }, cors);
  }

  if (!configured) {
    return json(503, {
      ok: false,
      error: 'خدمة الإرسال إلى تيليجرام غير مُعدّة بعد (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)',
    }, cors);
  }

  /* Optional shared key, for deployments that want more than origin checks. */
  if (env.RELAY_ACCESS_KEY) {
    const provided = getHeader(headers, 'x-relay-key');
    if (provided !== env.RELAY_ACCESS_KEY) {
      return json(403, { ok: false, error: 'ممنوع' }, cors);
    }
  }

  if (origin && !isOriginAllowed(origin, allowedOrigins)) {
    return json(403, { ok: false, error: 'المصدر غير مسموح' }, cors);
  }

  const limiter = deps.rateLimiter || rateLimiter;
  const limitPerMinute = Number(env.RATE_LIMIT_PER_MINUTE) > 0
    ? Number(env.RATE_LIMIT_PER_MINUTE)
    : DEFAULT_RATE_LIMIT_PER_MINUTE;
  const throttled = limiter.check(input.clientIp || 'unknown', limitPerMinute);
  if (!throttled.allowed) {
    const limited = { ...cors, 'retry-after': String(throttled.retryAfterSeconds) };
    return json(429, {
      ok: false,
      error: `تم تجاوز الحد المسموح (${limitPerMinute} عملية في الدقيقة). حاول بعد ${throttled.retryAfterSeconds} ثانية.`,
    }, limited);
  }

  const maxBytes = Number(env.MAX_JSON_BYTES) > 0 ? Number(env.MAX_JSON_BYTES) : DEFAULT_MAX_JSON_BYTES;
  const check = validatePayload(input.bodyText || '', maxBytes);
  if (!check.ok) {
    return json(400, { ok: false, error: check.error }, cors);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = safeFileName(check.filename, `church-services-directory-${stamp}.json`);
  const caption = safeCaption(
    check.caption,
    `نسخة احتياطية من دليل الخدمات — ${check.records.length} سجل — ${stamp}`,
  );

  const apiBase = (env.TELEGRAM_API_BASE || DEFAULT_TELEGRAM_API_BASE).replace(/\/+$/, '');
  /* The token only ever lives in this URL, inside the serverless runtime. */
  const url = `${apiBase}/bot${token}/sendDocument`;

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  const fileLike = typeof File !== 'undefined'
    ? new File([check.json], fileName, { type: 'application/json' })
    : new Blob([check.json], { type: 'application/json' });
  form.append('document', fileLike, fileName);

  let telegramResponse;
  try {
    telegramResponse = await fetchImpl(url, { method: 'POST', body: form });
  } catch (e) {
    console.error('[telegram-relay] request to Telegram failed:', e && e.message);
    return json(502, { ok: false, error: 'تعذر الاتصال بتيليجرام' }, cors);
  }

  let telegramBody;
  try {
    telegramBody = await telegramResponse.json();
  } catch (e) {
    telegramBody = null;
  }

  if (!telegramResponse.ok || !telegramBody || telegramBody.ok !== true || !telegramBody.result) {
    const description = (telegramBody && telegramBody.description) || `HTTP ${telegramResponse.status}`;
    console.error('[telegram-relay] Telegram rejected the upload:', telegramResponse.status, description);
    /* Deliberately generic message — never echo the raw Telegram error, which
       can contain the request URL (and therefore the token) in some cases. */
    return json(502, {
      ok: false,
      error: `رفض تيليجرام رفع الملف (${telegramBody && telegramBody.error_code ? telegramBody.error_code : telegramResponse.status})`,
      detail: String(description).slice(0, 200),
    }, cors);
  }

  const result = telegramBody.result;
  console.info(
    `[telegram-relay] uploaded ${check.records.length} records to chat ${chatId} as message ${result.message_id}`,
  );

  /* Only non-secret metadata goes back to the browser. A Telegram file_id is
     scoped to this bot, so on its own it cannot be used to read or re-send
     anything without the token — it is safe to return and lets a client
     reference the exact file it just uploaded. */
  return json(200, {
    ok: true,
    message_id: result.message_id,
    file_id: result.document ? result.document.file_id : undefined,
    chat_id: result.chat && typeof result.chat.id !== 'undefined' ? result.chat.id : String(chatId),
    file_name: (result.document && result.document.file_name) || fileName,
    file_size: result.document ? result.document.file_size : undefined,
    records: check.records.length,
  }, cors);
}

export {
  handleRelayRequest,
  validatePayload,
  safeFileName,
  safeCaption,
  createRateLimiter,
  isOriginAllowed,
  SHARE_PATH,
  HEALTH_PATH,
  DEFAULT_TELEGRAM_API_BASE,
  DEFAULT_MAX_JSON_BYTES,
  DEFAULT_ALLOWED_ORIGINS,
};
