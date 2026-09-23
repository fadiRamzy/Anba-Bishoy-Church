/* ==========================================================================
   telegram-relay/test/mock-telegram.mjs

   A faithful in-process mock of the small slice of the Telegram Bot API that
   the relay uses:

     POST /bot<token>/sendDocument     (multipart/form-data)
     GET  /bot<token>/getFile?file_id=
     GET  /file/bot<token>/<file_path>
     GET  /bot<token>/getMe

   It records every upload (parsed multipart fields + raw bytes) so tests can
   assert on chat_id, file_name, caption and the exact document content, and it
   can serve the uploaded bytes back so a test can prove the file round-trips.

   It can also be told to fail (setMode('unauthorized' | 'badrequest' |
   'network')) so the error paths are covered too.
   ========================================================================== */

import { createServer } from 'node:http';

const VALID_TOKEN = '111222333:AAHmocktelegramtokenforofflinetestsonly9';

export function createMockTelegram() {
  const state = {
    uploads: [],
    mode: 'ok', // ok | unauthorized | badrequest | network
    requests: [],
    delayMs: 0, // artificial latency, used to test the in-flight UI state
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');

    state.requests.push({ method: req.method, path: url.pathname, query: url.search });

    const send = (code, payload) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (url.pathname.startsWith('/file/bot')) {
      const filePath = url.pathname.replace(/^\/file\/bot[^/]*\//, '');
      const up = state.uploads.find((u) => u.file_path === filePath);
      if (!up) return send(404, { ok: false, description: 'Not Found' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(up.bytes);
      return undefined;
    }

    if (req.method === 'POST' && url.pathname.endsWith('/sendDocument')) {
      const token = url.pathname.split('/')[1].replace(/^bot/, '');
      if (state.mode === 'network') {
        res.destroy();
        return undefined;
      }
      if (state.mode === 'unauthorized' || token !== VALID_TOKEN) {
        return send(401, { ok: false, error_code: 401, description: 'Unauthorized' });
      }
      if (state.mode === 'badrequest') {
        return send(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' });
      }

      if (state.delayMs > 0) {
        await new Promise((r) => setTimeout(r, state.delayMs));
      }

      let form;
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks);
        const r = new Request(`http://mock${url.pathname}`, {
          method: 'POST',
          headers: { 'content-type': req.headers['content-type'] },
          body: raw,
        });
        form = await r.formData();
      } catch (e) {
        return send(400, { ok: false, error_code: 400, description: `multipart parse failed: ${e.message}` });
      }

      const doc = form.get('document');
      const bytes = doc ? Buffer.from(await doc.arrayBuffer()) : Buffer.alloc(0);
      const id = `file_${state.uploads.length + 1}`;
      const filePath = `documents/${id}.json`;
      state.uploads.push({
        file_id: id,
        file_path: filePath,
        chat_id: form.get('chat_id'),
        caption: form.get('caption'),
        file_name: doc && doc.name ? doc.name : null,
        bytes,
        text: bytes.toString('utf8'),
      });

      return send(200, {
        ok: true,
        result: {
          message_id: 1000 + state.uploads.length,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(form.get('chat_id')), type: 'supergroup', title: 'Mock Group' },
          document: {
            file_id: id,
            file_unique_id: id,
            file_name: doc && doc.name ? doc.name : 'upload.json',
            mime_type: 'application/json',
            file_size: bytes.length,
          },
        },
      });
    }

    if (url.pathname.endsWith('/getMe')) {
      return send(200, { ok: true, result: { id: 111222333, is_bot: true, username: 'mock_bot' } });
    }

    if (url.pathname.endsWith('/getFile')) {
      const id = url.searchParams.get('file_id');
      const up = state.uploads.find((u) => u.file_id === id);
      if (!up) return send(404, { ok: false, description: 'Not Found' });
      return send(200, { ok: true, result: { file_id: id, file_path: up.file_path, file_size: up.bytes.length } });
    }

    return send(404, { ok: false, description: `unhandled ${req.method} ${url.pathname}` });
  });

  return {
    server,
    state,
    VALID_TOKEN,
    setMode(mode) { state.mode = mode; },
    reset() { state.uploads = []; state.requests = []; state.mode = 'ok'; },
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
          const { port: p } = server.address();
          state.baseUrl = `http://127.0.0.1:${p}`;
          resolve(state.baseUrl);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

export { VALID_TOKEN as MOCK_TOKEN };
