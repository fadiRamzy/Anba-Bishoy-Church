/* ==========================================================================
   telegram-relay/worker.js — Cloudflare Worker entry point.

   Thin adapter only: all logic lives in ./core.js so the exact same code is
   exercised by the automated tests and by the Node adapter (local-relay.js).

   Deploy:
     cd telegram-relay
     npm i -g wrangler          # or: npx wrangler ...
     wrangler secret put TELEGRAM_BOT_TOKEN     # NEVER committed to git
     wrangler deploy
   Then put the printed https://<name>.<subdomain>.workers.dev/api/telegram/share
   URL into TELEGRAM_RELAY_ENDPOINT in app.js.
   ========================================================================== */

import { handleRelayRequest, SHARE_PATH, HEALTH_PATH } from './core.js';

function requestHeadersToObject(request) {
  const out = {};
  request.headers.forEach((value, key) => { out[key] = value; });
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPath = (p) => url.pathname.replace(/\/+$/, '') === p;

    /* Root path: a tiny human-readable index so the Worker URL is not a blank
       404. Contains no secrets. */
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return new Response(
        `Telegram relay for Anba Bishoy Church.\nEndpoints: ${SHARE_PATH} (POST), ${HEALTH_PATH} (GET).\n`,
        { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } },
      );
    }

    const bodyText = (request.method === 'POST' || request.method === 'PUT')
      ? await request.text()
      : '';

    const result = await handleRelayRequest({
      env,
      method: request.method,
      path: url.pathname,
      headers: requestHeadersToObject(request),
      bodyText,
      clientIp: request.headers.get('CF-Connecting-IP') || '',
    });

    /* A 204 must carry a null body — workerd rejects/warns on a zero-length
       non-null body for null-body statuses. */
    return new Response(result.status === 204 ? null : result.body, {
      status: result.status,
      headers: result.headers,
    });
  },
};
