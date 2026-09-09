/* ==========================================================================
   Smart Servant Assistant — Cloudflare Worker
   ========================================================================== */

const GEMINI_MODEL_DEFAULT = 'gemini-3-flash-preview';
const MAX_QUESTION_CHARS = 600;
const MAX_DATA_ROWS = 200;

/* ---- Abuse protection -------------------------------------------------- */

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 12;

let dailyCounter = { day: '', count: 0 };
const DAILY_SOFT_CAP = 300;

function isRateLimited(ip) {
  const now = Date.now();

  const arr = (rateLimitMap.get(ip) || [])
    .filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  arr.push(now);
  rateLimitMap.set(ip, arr);

  if (rateLimitMap.size > 5000) {
    rateLimitMap.clear();
  }

  return arr.length > RATE_LIMIT_MAX;
}

function isOverDailySoftCap() {
  const today = new Date().toISOString().slice(0, 10);

  if (dailyCounter.day !== today) {
    dailyCounter = {
      day: today,
      count: 0
    };
  }

  dailyCounter.count += 1;

  return dailyCounter.count > DAILY_SOFT_CAP;
}

/* ---- System prompts --------------------------------------------------- */

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

/* ---- Gemini web-search tool ------------------------------------------ */

const WEB_SEARCH_TOOL = {
  functionDeclarations: [{
    name: 'web_search',
    description: 'ابحث في الإنترنت عن معلومات موثوقة وحديثة عند الحاجة، مثل نصوص الألحان القبطية أو الحذّات أو النوتة الموسيقية أو معلومات عن قديس أو عيد أو أي معلومة غير مؤكدة.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'نص البحث بالعربية أو الإنجليزية'
        }
      },
      required: ['query'],
    },
  }],
};

/* ---- HTTP helpers ----------------------------------------------------- */

function corsHeaders(origin, allowedOrigin) {
  const allow =
    origin === allowedOrigin
      ? origin
      : allowedOrigin;

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...headers
      },
    }
  );
}

/* ---- Upstream timeout wrapper ---------------------------------------- */

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal: controller.signal
      }
    );
  } catch (err) {
    if (
      err &&
      err.name === 'AbortError'
    ) {
      throw Object.assign(
        new Error('upstream_timeout'),
        {
          code: 'upstream_timeout'
        }
      );
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const TAVILY_TIMEOUT_MS = 6000;
const GEMINI_TIMEOUT_MS = 18000;

/* ==========================================================================
   DIAGNOSTIC TESTS
   --------------------------------------------------------------------------
   Temporary diagnostic route:
   /assistant/diag?token=...

   TEST 1:
   Google API connectivity.

   TEST 2:
   Minimal generateContent using the current production model.

   TEST 3:
   Full production-shaped generateContent using the current production model.

   TEST 4:
   Minimal generateContent using gemini-3-flash-preview.

   No response bodies, API keys, user questions, or user data are returned.
   ========================================================================== */

const DIAG_TIMEOUT_MS = 10000;

async function runDiagnosticTest(fn) {
  const startedAt = Date.now();

  try {
    const result = await fn();

    const ms = Date.now() - startedAt;

    return {
      status: result.status,
      ms,
      ok: result.ok,
      ...(result.ok
        ? {}
        : {
            error: `http_${result.status}`
          }),
    };
  } catch (err) {
    const ms = Date.now() - startedAt;

    if (
      err &&
      err.code === 'upstream_timeout'
    ) {
      return {
        ms,
        ok: false,
        error: 'timeout',
      };
    }

    return {
      ms,
      ok: false,
      error: 'fetch_error',
    };
  }
}

async function runAssistantDiagnostic(env) {
  const model =
    env.GEMINI_MODEL ||
    GEMINI_MODEL_DEFAULT;

  const googleModelsUrl =
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${env.GEMINI_API_KEY}`;

  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const previewGeminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${env.GEMINI_API_KEY}`;

  /* TEST 2 + TEST 4: Minimal Gemini request */

  const minimalBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'قل: تم',
          },
        ],
      },
    ],
  };

  /* TEST 3: Production-shaped Gemini request */

  const productionBody = {
    systemInstruction: {
      parts: [
        {
          text: GENERAL_SYSTEM_PROMPT,
        },
      ],
    },

    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'اختبار تشخيصي فقط. أجب بكلمة واحدة: تم',
          },
        ],
      },
    ],

    generationConfig: {
      maxOutputTokens: 1024,

      thinkingConfig: {
        thinkingLevel: 'minimal',
      },
    },

    tools: [
      WEB_SEARCH_TOOL
    ],
  };

  const [
    test1,
    test2,
    test3,
    test4
  ] = await Promise.all([

    /* TEST 1 — Google API connectivity */

    runDiagnosticTest(() =>
      fetchWithTimeout(
        googleModelsUrl,
        {
          method: 'GET',
        },
        DIAG_TIMEOUT_MS
      )
    ),

    /* TEST 2 — Current production model */

    runDiagnosticTest(() =>
      fetchWithTimeout(
        geminiUrl,
        {
          method: 'POST',

          headers: {
            'content-type': 'application/json',
          },

          body: JSON.stringify(
            minimalBody
          ),
        },
        DIAG_TIMEOUT_MS
      )
    ),

    /* TEST 3 — Current production request */

    runDiagnosticTest(() =>
      fetchWithTimeout(
        geminiUrl,
        {
          method: 'POST',

          headers: {
            'content-type': 'application/json',
          },

          body: JSON.stringify(
            productionBody
          ),
        },
        DIAG_TIMEOUT_MS
      )
    ),

    /* TEST 4 — Preview model */

    runDiagnosticTest(() =>
      fetchWithTimeout(
        previewGeminiUrl,
        {
          method: 'POST',

          headers: {
            'content-type': 'application/json',
          },

          body: JSON.stringify(
            minimalBody
          ),
        },
        DIAG_TIMEOUT_MS
      )
    ),
  ]);

  return {
    test1,

    test2: {
      model,
      ...test2,
    },

    test3: {
      model,
      ...test3,
    },

    test4: {
      model: 'gemini-3-flash-preview',
      ...test4,
    },
  };
}

/* ==========================================================================
   TAVILY
   ========================================================================== */

async function callTavily(
  env,
  query
) {
  const res =
    await fetchWithTimeout(
      'https://api.tavily.com/search',
      {
        method: 'POST',

        headers: {
          'content-type': 'application/json',
          Authorization:
            `Bearer ${env.TAVILY_API_KEY}`,
        },

        body: JSON.stringify({
          query,

          search_depth: 'basic',

          max_results: 5,

          include_answer: false,
        }),
      },

      TAVILY_TIMEOUT_MS
    );

  if (!res.ok) {
    console.error(
      'tavily_upstream_error',
      res.status,
      await res.text()
        .catch(() => '')
    );

    throw new Error(
      `tavily_${res.status}`
    );
  }

  const data =
    await res.json();

  const results =
    Array.isArray(data.results)
      ? data.results
      : [];

  return results
    .slice(0, 5)
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title || ''}\n${r.content || ''}\nرابط: ${r.url || ''}`
    )
    .join('\n\n')
    ||
    'لم يتم العثور على نتائج بحث مناسبة.';
}

/* ==========================================================================
   GEMINI
   ========================================================================== */

async function callGemini(
  env,
  {
    systemPrompt,
    userText,
    allowSearch
  }
) {
  const model =
    env.GEMINI_MODEL ||
    GEMINI_MODEL_DEFAULT;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const t0 = Date.now();

  const mark = (stage) =>
    console.log(
      'assistant_stage',
      stage,
      `${Date.now() - t0}ms`
    );

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: userText
        }
      ]
    }
  ];

  const generationConfig = {
    maxOutputTokens: 1024,

    thinkingConfig: {
      thinkingLevel: 'minimal'
    },
  };

  const body = {
    systemInstruction: {
      parts: [
        {
          text: systemPrompt
        }
      ]
    },

    contents,

    generationConfig,
  };

  if (allowSearch) {
    body.tools = [
      WEB_SEARCH_TOOL
    ];
  }

  mark(
    `gemini_1_start model=${model}`
  );

  let res =
    await fetchWithTimeout(
      url,
      {
        method: 'POST',

        headers: {
          'content-type': 'application/json'
        },

        body: JSON.stringify(body),
      },

      GEMINI_TIMEOUT_MS
    );

  mark('gemini_1_done');

  if (res.status === 429) {
    throw Object.assign(
      new Error('gemini_quota'),
      {
        code: 'quota_exceeded'
      }
    );
  }

  if (!res.ok) {
    console.error(
      'gemini_upstream_error',
      model,
      res.status,
      await res.text()
        .catch(() => '')
    );

    throw Object.assign(
      new Error(
        `gemini_${res.status}`
      ),
      {
        code: 'upstream_error'
      }
    );
  }

  let data =
    await res.json();

  let candidate =
    data &&
    data.candidates &&
    data.candidates[0];

  let parts =
    (
      candidate &&
      candidate.content &&
      candidate.content.parts
    ) || [];

  const functionCallPart =
    parts.find(
      (p) => p.functionCall
    );

  if (
    functionCallPart &&
    allowSearch
  ) {
    const searchQuery =
      (
        functionCallPart
          .functionCall
          .args &&
        functionCallPart
          .functionCall
          .args
          .query
      ) ||
      userText;

    let toolResultText;

    mark('tavily_start');

    try {
      toolResultText =
        await callTavily(
          env,
          searchQuery
        );
    } catch (_) {
      toolResultText =
        'تعذر إجراء البحث الآن (الخدمة غير متاحة مؤقتًا).';
    }

    mark('tavily_done');

    contents.push(
      candidate.content
    );

    contents.push({
      role: 'user',

      parts: [
        {
          functionResponse: {
            id:
              functionCallPart
                .functionCall
                .id,

            name: 'web_search',

            response: {
              result:
                toolResultText
            },
          },
        },
      ],
    });

    mark(
      `gemini_2_start model=${model}`
    );

    res =
      await fetchWithTimeout(
        url,
        {
          method: 'POST',

          headers: {
            'content-type': 'application/json'
          },

          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: systemPrompt
                }
              ]
            },

            contents,

            generationConfig,

            tools: [
              WEB_SEARCH_TOOL
            ],
          }),
        },

        GEMINI_TIMEOUT_MS
      );

    mark('gemini_2_done');

    if (res.status === 429) {
      throw Object.assign(
        new Error('gemini_quota'),
        {
          code: 'quota_exceeded'
        }
      );
    }

    if (!res.ok) {
      console.error(
        'gemini_upstream_error_followup',
        model,
        res.status,
        await res.text()
          .catch(() => '')
      );

      throw Object.assign(
        new Error(
          `gemini_${res.status}`
        ),
        {
          code: 'upstream_error'
        }
      );
    }

    data =
      await res.json();

    candidate =
      data &&
      data.candidates &&
      data.candidates[0];

    parts =
      (
        candidate &&
        candidate.content &&
        candidate.content.parts
      ) || [];
  }

  const text =
    parts
      .filter(
        (p) => p.text
      )
      .map(
        (p) => p.text
      )
      .join('\n')
      .trim();

  return (
    text ||
    'لم يصل رد نصي من المساعد.'
  );
}

/* ==========================================================================
   WORKER ENTRY
   ========================================================================== */

export default {
  async fetch(
    request,
    env
  ) {

    /* ----------------------------------------------------------------------
       TEMPORARY DIAGNOSTIC ENDPOINT
       ---------------------------------------------------------------------- */

    const requestUrl =
      new URL(
        request.url
      );

    if (
      request.method === 'GET' &&
      requestUrl.pathname ===
        '/assistant/diag'
    ) {
      const suppliedToken =
        requestUrl.searchParams.get(
          'token'
        );

      if (
        !env.DIAG_TOKEN ||
        suppliedToken !==
          env.DIAG_TOKEN
      ) {
        return new Response(
          'Not Found',
          {
            status: 404,

            headers: {
              'content-type':
                'text/plain; charset=utf-8',

              'cache-control':
                'no-store',
            },
          }
        );
      }

      if (!env.GEMINI_API_KEY) {
        return json(
          {
            error:
              'server_config_error'
          },

          500,

          {
            'cache-control':
              'no-store'
          }
        );
      }

      try {
        const result =
          await runAssistantDiagnostic(
            env
          );

        return json(
          result,

          200,

          {
            'cache-control':
              'no-store'
          }
        );
      } catch (_) {
        return json(
          {
            error:
              'diagnostic_failed'
          },

          500,

          {
            'cache-control':
              'no-store'
          }
        );
      }
    }

    /* ----------------------------------------------------------------------
       PRODUCTION /assistant
       ---------------------------------------------------------------------- */

    const allowedOrigin =
      env.ALLOWED_ORIGIN ||
      'https://fadiramzy.github.io';

    const origin =
      request.headers.get(
        'Origin'
      ) || '';

    const cors =
      corsHeaders(
        origin,
        allowedOrigin
      );

    if (
      request.method ===
      'OPTIONS'
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: cors
        }
      );
    }

    if (
      request.method !==
      'POST'
    ) {
      return json(
        {
          error:
            'invalid_request'
        },

        405,

        cors
      );
    }

    if (
      origin &&
      origin !==
        allowedOrigin
    ) {
      return json(
        {
          error:
            'invalid_request'
        },

        403,

        cors
      );
    }

    if (
      !env.GEMINI_API_KEY ||
      !env.TAVILY_API_KEY
    ) {
      return json(
        {
          error:
            'server_config_error'
        },

        500,

        cors
      );
    }

    const ip =
      request.headers.get(
        'CF-Connecting-IP'
      ) ||
      'unknown';

    if (
      isRateLimited(ip)
    ) {
      return json(
        {
          error:
            'rate_limited'
        },

        429,

        cors
      );
    }

    if (
      isOverDailySoftCap()
    ) {
      return json(
        {
          error:
            'quota_exceeded'
        },

        429,

        cors
      );
    }

    let payload;

    try {
      payload =
        await request.json();
    } catch (_) {
      return json(
        {
          error:
            'invalid_request'
        },

        400,

        cors
      );
    }

    const mode =
      payload &&
      payload.mode;

    const question =
      payload &&
      typeof payload.question ===
        'string'
        ? payload.question.trim()
        : '';

    if (
      !question ||
      question.length >
        MAX_QUESTION_CHARS ||
      (
        mode !== 'general' &&
        mode !== 'data'
      )
    ) {
      return json(
        {
          error:
            'invalid_request'
        },

        400,

        cors
      );
    }

    try {
      let text;

      if (
        mode === 'data'
      ) {
        const rows =
          Array.isArray(
            payload.dataContext
          )
            ? payload.dataContext.slice(
                0,
                MAX_DATA_ROWS
              )
            : [];

        const userText =
          `السؤال: ${question}\n\nنتائج مطابقة من بيانات دليل الخدمات (${rows.length} سجل):\n${JSON.stringify(rows)}`;

        text =
          await callGemini(
            env,
            {
              systemPrompt:
                DATA_SYSTEM_PROMPT,

              userText,

              allowSearch:
                false
            }
          );
      } else {
        text =
          await callGemini(
            env,
            {
              systemPrompt:
                GENERAL_SYSTEM_PROMPT,

              userText:
                question,

              allowSearch:
                true
            }
          );
      }

      return json(
        {
          text
        },

        200,

        cors
      );
    } catch (err) {
      const code =
        (
          err &&
          err.code
        ) ||
        'upstream_error';

      return json(
        {
          error:
            code
        },

        502,

        cors
      );
    }
  },
};
