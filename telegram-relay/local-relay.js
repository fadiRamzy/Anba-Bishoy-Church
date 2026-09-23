/* ==========================================================================
   telegram-relay/local-relay.js — Node HTTP adapter around ./core.js.

   Two purposes:
     1. Local development / manual testing of the Admin page without
        deploying a Worker.
     2. The automated end-to-end tests in ./test run the REAL relay logic
        through this server, so what is tested is what ships.

   Config comes from the environment (or a .dev.vars file read by the caller):
     TELEGRAM_BOT_TOKEN   required — never commit this
     TELEGRAM_CHAT_ID     required — numeric id of the group (negative number)
     TELEGRAM_API_BASE    optional — defaults to https://api.telegram.org
     ALLOWED_ORIGINS      optional — comma separated origin allow-list
     RELAY_ACCESS_KEY     optional — extra shared-secret header check
     PORT                 optional — defaults to 8787

   Run:
     cd telegram-relay && PORT=8787 node local-relay.js
   ========================================================================== */

import { createServer } from 'node:http';
import { handleRelayRequest } from './core.js';

function headersToObject(req) {
  const out = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) out[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createRelayServer(env, deps = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let bodyText = '';
    try {
      bodyText = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : '';
    } catch (e) {
      res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'حجم الطلب كبير جدًا' }));
      return;
    }

    const result = await handleRelayRequest({
      env,
      method: req.method,
      path: url.pathname,
      headers: headersToObject(req),
      bodyText,
      clientIp: req.socket.remoteAddress || '',
    }, deps);

    res.writeHead(result.status, result.headers);
    res.end(result.body);
  });
}

/* Run directly: `node local-relay.js` */
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  const env = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    TELEGRAM_API_BASE: process.env.TELEGRAM_API_BASE,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    RELAY_ACCESS_KEY: process.env.RELAY_ACCESS_KEY,
  };
  const port = Number(process.env.PORT) || 8787;
  const server = createRelayServer(env);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[telegram-relay] listening on http://0.0.0.0:${port}`);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.warn('[telegram-relay] WARNING: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — /api/telegram/share will return 503');
    }
  });
}
