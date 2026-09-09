/* ==========================================================================
   Smart Servant Assistant — Cloudflare Worker
   --------------------------------------------------------------------------
   This is the ONLY place that ever holds the Gemini / Tavily secrets. It is
   deployed separately from the GitHub Pages site (see DEPLOY.md) and is the
   sole thing the church site's app.js talks to.

   What it does, per request:
     - mode "data": phrases already-locally-filtered دليل الخدمات rows into
       a short natural Arabic summary. No web search, no external lookups.
       Never receives more than the rows the client already filtered.
     - mode "general": answers open church/Bible/hymn/doctrine questions.
       The Gemini model itself decides — via function calling — whether it
       actually needs to run a live web search (Tavily) before answering,
       so search is only used when the question genuinely needs it.

   What it deliberately does NOT do:
     - It never sees VisitationDB / خدمات الافتقاد data — the frontend only
       ever calls this Worker for المساعد الذكي, which only reads MembersDB.
     - It never asks the visitor to sign in, enter a key, or create an
       account of any kind.
   ========================================================================== */

const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash';
const MAX_QUESTION_CHARS = 600;
const MAX_DATA_ROWS = 200;

/* ---- Best-effort, zero-dependency abuse protection -----------------------
   No KV/Durable Objects/paid add-ons — just an in-memory counter that lives
   as long as this Worker "isolate" stays warm (typically hours on a
   low-traffic site, reset on redeploy or cold start). It will not stop a
   determined, distributed attacker, but it comfortably stops "someone left
   a tab looping" or a single script hammering the endpoint, which is the
   realistic threat for a small parish site. See the change report for the
   honest limits of this approach. */
const rateLimitMap = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 12; // max requests per IP per window

let dailyCounter = { day: '', count: 0 };
const DAILY_SOFT_CAP = 300; // protects the shared free Gemini/Tavily quota

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  arr.push(now);
  rateLimitMap.set(ip, arr);
  if (rateLimitMap.size > 5000) rateLimitMap.clear(); // crude memory guard
  return arr.length > RATE_LIMIT_MAX;
}

function isOverDailySoftCap() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.day !== today) dailyCounter = { day: today, count: 0 };
  dailyCounter.count += 1;
  return dailyCounter.count > DAILY_SOFT_CAP;
}

/* ---- System prompts (kept functionally identical to the previous
   in-app prompts, plus an explicit "cite sources when you searched" rule
   which app.js's original prompt didn't need since it isn't storing
   citations anywhere) --------------------------------------------------- */
const GENERAL_SYSTEM_PROMPT = `أنت "مساعد الخادم الذكي" في كنيسة الأنبا بيشوي بالمنيا الجديدة، إيبارشية شرق المنيا للأقباط الأرثوذكس.
مجالك هو: المسيحية الأرثوذكسية القبطية، الكتاب المقدس، الألحان، الطقوس، القديسين، الأعياد، الدروس وإعداد الخدمة والمخدومين.
إذا سُئلت عن موضوع لا علاقة له بهذا المجال إطلاقًا، اعتذر بأدب واشرح أنك متخصص في شؤون الخدمة والكنيسة فقط، ولا تحاول الإجابة عليه.

معك أداة بحث في الإنترنت (web_search). استخدمها فقط لما تحتاجها فعلًا: معلومة حديثة، أو تفاصيل لحن (نص، حذّات، نوتة)، أو أي حاجة مش متأكد منها تمامًا. لو السؤال أساسي وعارفه بثقة (زي شرح مثل إنجيلي معروف) مش لازم تبحث.

قواعد صارمة بخصوص الألحان:
- لا تختلق نص لحن أو ترجمة أو معلومة لحنية لم تجدها في مصدر موثوق.
- "الحذَّات" (الهذّات) شيء مختلف تمامًا عن النوتة الموسيقية الغربية (دو ري مي فا صول لا سي). لا تخلط بينهما، ووضّح دائمًا أيهما تعرض إن وجدت أيًا منهما.
- إذا لم تجد معلومة معينة (نص اللحن، الحذّات، النوتة) بعد البحث، صرّح بوضوح أنها غير متوفرة لديك، ولا تخترعها أبدًا. لا تدّعي أنك وجدت معلومة لم تجدها فعلًا.
- فضّل المصادر الكنسية/القبطية الموثوقة عند البحث.

إذا استخدمت نتائج بحث في إجابتك، اذكر روابط المصادر في نهاية الرد تحت عنوان "المصادر:".

أجب دائمًا باللغة العربية، بأسلوب واضح ومباشر يناسب خادم/خادمة في الكنيسة.`;

const DATA_SYSTEM_PROMPT = `أنت مساعد يعرض بيانات "دليل الخدمات" لكنيسة الأنبا بيشوي بناءً على نتائج مُفلترة محليًا بالفعل، مُرفقة لك كنص JSON.
اكتب ردًا عربيًا طبيعيًا موجزًا يلخص هذه النتائج فقط.
لا تُضف أي اسم أو رقم أو معلومة غير موجودة في البيانات المرفقة، ولا تخترع أي شيء.
إن كانت القائمة فارغة، وضّح بوضوح أنه لا توجد نتائج مطابقة في بيانات دليل الخدمات.`;

const WEB_SEARCH_TOOL = {
  functionDeclarations: [{
    name: 'web_search',
    description: 'ابحث في الإنترنت عن معلومات موثوقة وحديثة عند الحاجة، مثل نصوص الألحان القبطية أو الحذّات أو النوتة الموسيقية أو معلومات عن قديس أو عيد أو أي معلومة غير مؤكدة.',
    parameters: {
      type: 'OBJECT',
      properties: { query: { type: 'STRING', description: 'نص البحث بالعربية أو الإنجليزية' } },
      required: ['query'],
    },
  }],
};

function corsHeaders(origin, allowedOrigin) {
  const allow = origin === allowedOrigin ? origin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

async function callTavily(env, query) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`tavily_${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];
  // Compact, token-cheap text block the model can read + cite from.
  return results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title || ''}\n${r.content || ''}\nرابط: ${r.url || ''}`)
    .join('\n\n') || 'لم يتم العثور على نتائج بحث مناسبة.';
}

async function callGemini(env, { systemPrompt, userText, allowSearch }) {
  const model = env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const contents = [{ role: 'user', parts: [{ text: userText }] }];
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: 1400 },
  };
  if (allowSearch) body.tools = [WEB_SEARCH_TOOL];

  let res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw Object.assign(new Error('gemini_quota'), { code: 'quota_exceeded' });
  if (!res.ok) throw Object.assign(new Error(`gemini_${res.status}`), { code: 'upstream_error' });

  let data = await res.json();
  let candidate = data && data.candidates && data.candidates[0];
  let parts = (candidate && candidate.content && candidate.content.parts) || [];
  const functionCallPart = parts.find((p) => p.functionCall);

  if (functionCallPart && allowSearch) {
    const searchQuery = (functionCallPart.functionCall.args && functionCallPart.functionCall.args.query) || userText;
    let toolResultText;
    try {
      toolResultText = await callTavily(env, searchQuery);
    } catch (_) {
      toolResultText = 'تعذر إجراء البحث الآن (الخدمة غير متاحة مؤقتًا).';
    }

    contents.push({ role: 'model', parts: [{ functionCall: functionCallPart.functionCall }] });
    contents.push({
      role: 'function',
      parts: [{ functionResponse: { name: 'web_search', response: { result: toolResultText } } }],
    });

    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 1400 },
        tools: [WEB_SEARCH_TOOL],
      }),
    });
    if (res.status === 429) throw Object.assign(new Error('gemini_quota'), { code: 'quota_exceeded' });
    if (!res.ok) throw Object.assign(new Error(`gemini_${res.status}`), { code: 'upstream_error' });
    data = await res.json();
    candidate = data && data.candidates && data.candidates[0];
    parts = (candidate && candidate.content && candidate.content.parts) || [];
  }

  const text = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
  return text || 'لم يصل رد نصي من المساعد.';
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://fadiramzy.github.io';
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'invalid_request' }, 405, cors);
    }
    if (origin && origin !== allowedOrigin) {
      return json({ error: 'invalid_request' }, 403, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return json({ error: 'rate_limited' }, 429, cors);
    }
    if (isOverDailySoftCap()) {
      return json({ error: 'quota_exceeded' }, 429, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (_) {
      return json({ error: 'invalid_request' }, 400, cors);
    }

    const mode = payload && payload.mode;
    const question = payload && typeof payload.question === 'string' ? payload.question.trim() : '';
    if (!question || question.length > MAX_QUESTION_CHARS || (mode !== 'general' && mode !== 'data')) {
      return json({ error: 'invalid_request' }, 400, cors);
    }

    try {
      let text;
      if (mode === 'data') {
        const rows = Array.isArray(payload.dataContext) ? payload.dataContext.slice(0, MAX_DATA_ROWS) : [];
        const userText = `السؤال: ${question}\n\nنتائج مطابقة من بيانات دليل الخدمات (${rows.length} سجل):\n${JSON.stringify(rows)}`;
        text = await callGemini(env, { systemPrompt: DATA_SYSTEM_PROMPT, userText, allowSearch: false });
      } else {
        text = await callGemini(env, { systemPrompt: GENERAL_SYSTEM_PROMPT, userText: question, allowSearch: true });
      }
      return json({ text }, 200, cors);
    } catch (err) {
      const code = (err && err.code) || 'upstream_error';
      return json({ error: code }, 502, cors);
    }
  },
};
