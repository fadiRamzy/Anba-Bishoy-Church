/* =====================================================================
   Servant Assistant — «مساعد الخادم» (Phase 1)
   ---------------------------------------------------------------------
   A LOCAL retrieval assistant over the static knowledge base in kb/.
   It is NOT an AI model: it runs token/keyword search with weighted
   ranking over JSON files that ship with the site, entirely offline
   after first load. No backend, no external AI, no IndexedDB use.

   Loading contract (must be preserved):
   - This file only DEFINES code; it fetches nothing on site boot.
   - kb/manifest.json is fetched when the user first opens #/assistant,
     then only the small listed kb/*.json files (Phase 1: ~9 files).

   Depends on globals loaded BEFORE this file:
   - db.js:        normalizeArabic, flattenSearchableValues
   - app.js:       APP_ROOT, ICONS, escapeHTML, navigate, qs,
                   showToast, _loadPdfLibs
   Exposes exactly two globals: AssistantRoute (used by the router in
   app.js) and AssistantKB (tiny test/hook surface).
   ===================================================================== */
(function () {
'use strict';

/* ============================== 1. Constants ============================== */
var KB_MANIFEST_URL = 'kb/manifest.json';
var KB_TITLE = 'مساعد الخادم';
var KB_PLACEHOLDER = 'اسأل عن درس، لحن، آية، قديس، كتاب أو أي موضوع كنسي...';
var KB_MAX_RESULTS = 50;

/* Field weights for ranking. */
var W_TITLE = 5, W_KEYWORDS = 4, W_HEADINGS = 3, W_META = 2, W_BODY = 1;
var W_SYNONYM = 0.5;                 /* expanded synonyms count half */
var W_PHRASE_TITLE = 10, W_PHRASE_BODY = 3;
var W_CAT_BOOST = 1.5;               /* detected-category boost */

/* Arabic stop-words, PRE-NORMALIZED to match normalizeArabic() output
   (alef variants -> ا, ة -> ه, ى -> ي, no tashkeel). */
var KB_STOPWORDS = {};
('في من علي الي عن ان ما لا لم لن قد هل هو هي هم هن نحن انا هذا هذه ذلك تلك ' +
 'اولئك التي الذي الذين اللاتي كل كما بين مع او ام ثم لكن اذا عند بعد قبل حتي ' +
 'لان الا نحو ضد دون غير بعض جميع ايضا جدا هنا هناك حيث كيف متي اين لماذا ' +
 'يكون تكون كانت كانوا بل انما اما سوف عبر خلال حول تحت فوق امام وراء داخل ' +
 'خارج اثناء رغم منذ بينما عندما كلما مهما اي ايها يا').split(' ').forEach(function (w) { KB_STOPWORDS[w] = true; });

/* Category detection signals (written naturally; normalized+stemmed at build). */
var KB_CAT_SIGNALS_RAW = {
  bible: ['مزمور', 'مزامير', 'إنجيل', 'إصحاح', 'آية', 'آيات', 'سفر', 'أسفار', 'عهد', 'شاهد', 'شواهد'],
  hymn: ['لحن', 'ألحان', 'ترنيمة', 'مديح', 'مدايح', 'تسبحة'],
  synaxarium: ['سنكسار', 'سيرة', 'استشهاد', 'شهيد', 'شهداء'],
  saint: ['قديس', 'قديسة', 'قديسين', 'بابا', 'أنبا'],
  lesson: ['درس', 'دروس', 'مدارس', 'منهج', 'عظة'],
  rite: ['طقس', 'طقوس', 'قداس', 'صوم', 'صيام', 'صلاة'],
  feast: ['عيد', 'أعياد', 'ميلاد', 'نيروز', 'غطاس', 'عنصرة', 'خماسين', 'شعانين', 'بصخة', 'قيامة'],
  story: ['قصة', 'قصص', 'حكاية'],
  book: ['كتاب', 'كتب', 'مكتبة']
};

/* Fallback category metadata (used only if the manifest lacks an entry). */
var KB_CAT_FALLBACK = {
  bible: { label: 'الكتاب المقدس', icon: 'book' },
  hymn: { label: 'الألحان', icon: 'music' },
  synaxarium: { label: 'السنكسار', icon: 'calendar' },
  lesson: { label: 'دروس مدارس الأحد', icon: 'notes' },
  feast: { label: 'الأعياد والمناسبات', icon: 'cross' },
  rite: { label: 'الطقوس والصلوات', icon: 'church' },
  saint: { label: 'القديسون', icon: 'users' },
  story: { label: 'قصص', icon: 'notes' },
  book: { label: 'كتب', icon: 'book' },
  topic: { label: 'موضوعات', icon: 'search' }
};

/* ============================== 2. Tokenizer ============================== */
/* Light Arabic stemming: strip a leading و/ف (conjunctions) when the stem
   stays meaningful. Applied identically to queries and documents. */
function kbStemLight(t) {
  if (t.length >= 4 && (t.charAt(0) === 'و' || t.charAt(0) === 'ف')) return t.slice(1);
  return t;
}

function kbTokenize(text) {
  if (text === null || text === undefined) return [];
  var norm = normalizeArabic(String(text));
  return norm.split(/[^ء-غف-ي٠-٩0-9a-z]+/)
    .map(kbStemLight)
    .filter(function (t) {
      return t.length > 0 && !KB_STOPWORDS[t] && (t.length >= 2 || /^[0-9٠-٩]$/.test(t));
    });
}

var KB_CAT_SIGNALS = {};
Object.keys(KB_CAT_SIGNALS_RAW).forEach(function (cat) {
  var set = {};
  KB_CAT_SIGNALS_RAW[cat].forEach(function (phrase) {
    kbTokenize(phrase).forEach(function (t) { set[t] = true; });
  });
  KB_CAT_SIGNALS[cat] = set;
});

/* ============================== 3. KB loading ============================== */
var KB = {
  manifest: null, syn: {}, items: [], docs: [],
  byId: new Map(), counts: {}, ready: false, inflight: null
};

function kbFetchJSON(url, revalidate) {
  return fetch(url, revalidate ? { cache: 'no-cache' } : undefined).then(function (res) {
    if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 'network'));
    return res.json();
  });
}

/* Loads manifest (always revalidated so updates propagate) then the small
   listed files + synonyms, in parallel. In-memory cache only. */
function kbEnsureLoaded() {
  if (KB.ready) return Promise.resolve();
  if (KB.inflight) return KB.inflight;
  KB.inflight = (async function () {
    var manifest;
    try {
      manifest = await kbFetchJSON(KB_MANIFEST_URL, true);
    } catch (err) {
      throw new Error('تعذّر تحميل فهرس المكتبة');
    }
    if (!manifest || !Array.isArray(manifest.files)) throw new Error('ملف الفهرس غير صالح');
    KB.manifest = manifest;
    var parts = await Promise.all([
      kbFetchJSON('kb/synonyms.json', false).catch(function () { return { pairs: {} }; })
    ].concat(manifest.files.map(function (f) { return kbFetchJSON(f, false); })));
    KB.syn = (parts[0] && parts[0].pairs) || {};
    KB.items = parts.slice(1).filter(function (it) { return it && it.id && it.type; });
    KB.byId = new Map(KB.items.map(function (it) { return [it.id, it]; }));
    KB.counts = {};
    KB.docs = KB.items.map(function (item) {
      KB.counts[item.type] = (KB.counts[item.type] || 0) + 1;
      return kbBuildDoc(item);
    });
    KB.ready = true;
  })().catch(function (err) { KB.inflight = null; throw err; });
  return KB.inflight;
}

function kbArr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

/* db.js flattenSearchableValues(value, acc) fills an accumulator and returns
   nothing — wrap it into a plain string helper. */
function kbFlattenText(obj) {
  var acc = [];
  try { flattenSearchableValues(obj, acc); } catch (e) { return ''; }
  return acc.join(' ');
}

function kbBuildDoc(item) {
  var b = item.body || {};
  var title = item.title || '';
  var keyText = kbArr(item.tags).concat(kbArr(item.topics), kbArr(item.characters),
    kbArr(item.search && item.search.keywords)).join('\n');
  var headText = '';
  if (item.type === 'lesson') {
    headText = [b.mainIdea].concat(kbArr(b.keyPoints)).filter(Boolean).join('\n');
  } else if (item.type === 'hymn') {
    headText = [b.nameAr, b.nameCoptic].filter(Boolean).join('\n');
  } else if (item.type === 'bible') {
    headText = (b.bookAr || '') + ' ' + (b.chapter || '');
  } else if (item.type === 'synaxarium') {
    headText = kbArr(b.saints).concat(kbArr(b.events)).join('\n');
  } else if (item.type === 'feast' || item.type === 'rite') {
    headText = [b.name, b.season].filter(Boolean).join('\n');
  }
  var metaText = kbArr(b.occasion).concat(kbArr(b.feast), kbArr(b.saints), kbArr(b.events),
    kbArr(b.bibleRef), [
      b.ageGroup, b.grade, b.dateRule, b.season, b.whenSung, b.liturgicalContext,
      b.gregorianNote,
      b.copticDate ? (b.copticDate.day + ' ' + (b.copticDate.month || '')) : ''
    ]).filter(Boolean).join('\n');
  var flat = kbFlattenText(b);
  var bodyText = ((item.summary || '') + ' ' + flat).replace(/\s+/g, ' ').trim();
  return {
    item: item, cat: item.type,
    normTitle: normalizeArabic(title).replace(/\s+/g, ' '),
    normBody: normalizeArabic(keyText + '\n' + headText + '\n' + metaText + '\n' + bodyText).replace(/\s+/g, ' '),
    fTitle: kbTokenize(title),
    fKey: kbTokenize(keyText),
    fHead: kbTokenize(headText),
    fMeta: kbTokenize(metaText),
    fBody: kbTokenize(bodyText),
    bodyText: bodyText
  };
}

/* ============================== 4. Search ============================== */
function kbCount(tokens, t) {
  var n = 0;
  for (var i = 0; i < tokens.length; i++) if (tokens[i] === t) n++;
  return n;
}

function kbSearch(rawQuery, catFilter) {
  var q = (rawQuery || '').trim();
  var tokens = [];
  kbTokenize(q).forEach(function (t) { if (tokens.indexOf(t) === -1) tokens.push(t); });
  var rawWords = [];
  q.split(/\s+/).forEach(function (w) {
    if (w.length >= 2 && rawWords.indexOf(w) === -1) rawWords.push(w);
  });
  /* Synonym expansion (single-token, half weight). */
  var expanded = [];
  tokens.forEach(function (t) {
    expanded.push({ t: t, w: 1 });
    (KB.syn[t] || []).forEach(function (s) {
      if (s && s !== t) expanded.push({ t: s, w: W_SYNONYM });
    });
  });
  /* Category detection: most signal hits wins. */
  var detected = null, detHits = 0;
  Object.keys(KB_CAT_SIGNALS).forEach(function (cat) {
    var set = KB_CAT_SIGNALS[cat], hits = 0;
    tokens.forEach(function (t) { if (set[t]) hits++; });
    if (hits > detHits) { detHits = hits; detected = cat; }
  });
  var normQ = normalizeArabic(q).replace(/\s+/g, ' ').trim();
  var inScope = KB.docs.filter(function (d) { return !catFilter || d.cat === catFilter; });
  /* Non-empty query with no valid tokens (e.g. Latin-only gibberish): no matches. */
  if (!tokens.length && q) {
    return { results: [], detected: null, tokens: tokens, total: 0, browse: false };
  }
  /* Empty query = browse mode: list the category. */
  if (!tokens.length) {
    return {
      results: inScope.slice(0, KB_MAX_RESULTS).map(function (doc) {
        return { doc: doc, score: 0, snippet: kbSnippet(doc, tokens, rawWords) };
      }),
      detected: null, tokens: tokens, total: inScope.length, browse: true
    };
  }
  var results = [];
  inScope.forEach(function (doc) {
    var score = 0, matched = 0;
    var seen = {};
    expanded.forEach(function (ex) {
      var s = W_TITLE * Math.min(kbCount(doc.fTitle, ex.t), 3)
        + W_KEYWORDS * Math.min(kbCount(doc.fKey, ex.t), 3)
        + W_HEADINGS * Math.min(kbCount(doc.fHead, ex.t), 3)
        + W_META * Math.min(kbCount(doc.fMeta, ex.t), 2)
        + W_BODY * Math.min(kbCount(doc.fBody, ex.t), 2);
      if (s > 0) {
        if (!seen[ex.t]) { seen[ex.t] = true; matched++; }
        score += s * ex.w;
      }
    });
    if (matched === 0) return;
    if (normQ.length >= 4) {
      if (doc.normTitle.indexOf(normQ) !== -1) score += W_PHRASE_TITLE;
      else if (doc.normBody.indexOf(normQ) !== -1) score += W_PHRASE_BODY;
    }
    if (detected && doc.cat === detected) score *= W_CAT_BOOST;
    score *= ((doc.item.search && doc.item.search.boost) || 1);
    results.push({ doc: doc, score: score, snippet: kbSnippet(doc, tokens, rawWords) });
  });
  results.sort(function (a, b) { return b.score - a.score; });
  return { results: results.slice(0, KB_MAX_RESULTS), detected: detected, tokens: tokens, total: results.length, browse: false };
}

/* ============================== 5. Snippets ============================== */
function kbEscapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function kbSnippet(doc, tokens, rawWords) {
  var full = ((doc.item.title || '') + '. ' + (doc.bodyText || '')).replace(/\s+/g, ' ').trim() || doc.item.title || '';
  if (!tokens.length || !full) {
    var head = full.slice(0, 160);
    return escapeHTML(head) + (full.length > 160 ? '…' : '');
  }
  /* Position the window around the first normalized-token hit. */
  var normFull = doc.normTitle + ' ' + doc.normBody;
  var hit = -1;
  tokens.forEach(function (t) {
    if (t.length < 2) return;
    var i = normFull.indexOf(t);
    if (i !== -1 && (hit === -1 || i < hit)) hit = i;
  });
  var start = 0, end = Math.min(full.length, 160);
  if (hit !== -1 && normFull.length > 0) {
    var center = Math.floor((hit / normFull.length) * full.length);
    start = Math.max(0, center - 70);
    end = Math.min(full.length, center + 90);
    if (start > 0) { var sp = full.indexOf(' ', start); if (sp !== -1 && sp < end) start = sp + 1; }
    if (end < full.length) { var sp2 = full.lastIndexOf(' ', end); if (sp2 > start) end = sp2; }
  }
  var out = full.slice(start, end);
  if (start > 0) out = '…' + out;
  if (end < full.length) out = out + '…';
  /* Highlight using the RAW query words (they match the displayed text). */
  var html = escapeHTML(out);
  (rawWords || []).slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (w) {
    try {
      var re = new RegExp(kbEscapeRegExp(escapeHTML(w)), 'g');
      html = html.replace(re, '<mark>$&</mark>');
    } catch (e) { /* invalid pattern: skip highlighting */ }
  });
  return html;
}

function kbExcerpt(doc, maxLen) {
  var text = ((doc.item.title || '') + '. ' + (doc.bodyText || '')).replace(/\s+/g, ' ').trim();
  if (text.length > maxLen) {
    var cut = text.lastIndexOf(' ', maxLen);
    text = text.slice(0, cut > 0 ? cut : maxLen) + '…';
  }
  return text;
}

/* ============================== 6. View helpers ============================== */
function kbSetTopNav(backHash, backLabel) {
  var nav = document.getElementById('topNav');
  if (nav) {
    nav.innerHTML = '<a class="back-link" href="#' + backHash + '">' +
      '<span class="back-icon">' + ICONS.back + '</span>' + escapeHTML(backLabel) + '</a>';
  }
}

function kbCatMeta(cat) {
  var list = (KB.manifest && KB.manifest.categories) || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === cat) return list[i];
  return KB_CAT_FALLBACK[cat] || { label: cat, icon: 'notes' };
}
function kbCatLabel(cat) { return kbCatMeta(cat).label || cat; }
function kbCatIcon(cat) { return ICONS[kbCatMeta(cat).icon] || ICONS.notes; }

function kbLoadingHTML(crumb) {
  return '<div class="container">' +
    '<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><span>' + escapeHTML(crumb) + '</span></p>' +
    '<h2 class="section-title">' + KB_TITLE + '</h2>' +
    '<div class="empty-state">' + ICONS.search + '<p>جارٍ تحميل المكتبة...</p></div></div>';
}

function kbErrorHTML(message) {
  return '<div class="container">' +
    '<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><span>' + KB_TITLE + '</span></p>' +
    '<h2 class="section-title">' + KB_TITLE + '</h2>' +
    '<div class="empty-state">' + ICONS.empty + '<p>' + escapeHTML(message) + '</p>' +
    '<p><button type="button" class="btn btn-outline btn-sm" id="kbRetryBtn">إعادة المحاولة</button></p></div></div>';
}

function kbWireRetry(renderFn) {
  var btn = document.getElementById('kbRetryBtn');
  if (btn) btn.addEventListener('click', function () { renderFn(); });
}

function kbSearchPanelHTML(inputId, value) {
  return '<div class="search-panel"><form id="' + inputId + 'Form" role="search">' +
    '<div class="search-box">' + ICONS.search +
    '<input type="text" id="' + inputId + '" placeholder="' + KB_PLACEHOLDER +
    '" value="' + escapeHTML(value || '') + '" autocomplete="off" /></div></form>' +
    '<p class="search-hint">بحث محلي بالكامل — يعمل بدون إنترنت بعد أول تحميل</p></div>';
}

function kbWireSearchForm(inputId, cat) {
  var form = document.getElementById(inputId + 'Form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = ((document.getElementById(inputId) || {}).value || '').trim();
    navigate('/assistant/search?' + qs({ q: v, cat: cat || undefined }));
  });
}

function kbPdfButtonHTML(btnId) {
  return '<button type="button" id="' + btnId + '" class="btn btn-outline btn-sm">' +
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'style="vertical-align:-3px;margin-inline-end:4px;"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>' +
    'استخراج PDF</button>';
}

function kbResultCardHTML(item, snippetHTML) {
  var tags = kbArr(item.tags).slice(0, 3).join(' • ');
  return '<a href="#/assistant/item/' + encodeURIComponent(item.id) + '" class="member-card">' +
    '<span class="icon-wrap" style="width:44px;height:44px;border-radius:50%;background:var(--color-maroon-tint);' +
    'color:var(--color-maroon);display:flex;align-items:center;justify-content:center;flex:none;">' +
    kbCatIcon(item.type) + '</span>' +
    '<span class="member-info"><span class="member-name">' + escapeHTML(item.title || '') + '</span>' +
    '<span class="member-meta">' + escapeHTML(kbCatLabel(item.type) + (tags ? ' • ' + tags : '')) + '</span>' +
    '<span class="kb-snippet">' + snippetHTML + '</span></span></a>';
}

/* ============================== 7. Views ============================== */
async function kbRenderHome() {
  kbSetTopNav('/', 'رجوع للرئيسية');
  APP_ROOT.innerHTML = kbLoadingHTML(KB_TITLE);
  try { await kbEnsureLoaded(); }
  catch (err) {
    APP_ROOT.innerHTML = kbErrorHTML('تعذّر تحميل مكتبة المساعد. تحقق من الاتصال ثم حاول مجددًا.');
    kbWireRetry(kbRenderHome);
    return;
  }
  var cats = ((KB.manifest && KB.manifest.categories) || []).filter(function (c) { return (KB.counts[c.id] || 0) > 0; });
  var cards = cats.map(function (c) {
    var n = KB.counts[c.id] || 0;
    return '<a href="#/assistant/category/' + encodeURIComponent(c.id) + '" class="nav-card">' +
      '<span class="icon-wrap">' + (ICONS[c.icon] || ICONS.notes) + '</span>' +
      '<span>' + escapeHTML(c.label) + '</span>' +
      '<span class="member-meta">' + n + (n === 1 ? ' عنصر' : ' عناصر') + '</span></a>';
  }).join('');
  APP_ROOT.innerHTML = '<div class="container">' +
    '<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><span>' + KB_TITLE + '</span></p>' +
    '<h2 class="section-title">' + KB_TITLE + '</h2>' +
    '<p class="section-sub">بحث محلي في مكتبة الكنيسة: دروس، ألحان، آيات، سنكسار وأعياد</p>' +
    kbSearchPanelHTML('kbHomeInput', '') +
    (cards ? '<div class="nav-grid">' + cards + '</div>' : '') +
    '<div class="info-section"><h3>' + ICONS.book + ' عن مساعد الخادم</h3><div class="kb-prose">' +
    '<p>مساعد الخادم أداة <strong>بحث محلية</strong> تسترجع المحتوى من مكتبة الجهاز فقط — لا تستخدم ' +
    'أي ذكاء اصطناعي خارجي، ولا ترسل أي بيانات عبر الإنترنت.</p>' +
    '<p>المحتوى الحالي <strong>عيّنات صغيرة للتجربة</strong>: نصوص كتابية من ترجمة فاندايك 1865 ' +
    '(ملكية عامة)، وشروح ودروس من صياغة الكنيسة. الآيات تُعرض بنصّها الأصلي دون أي تغيير.</p>' +
    '</div></div></div>';
  kbWireSearchForm('kbHomeInput', '');
}

async function kbRenderSearch(params) {
  params = params || {};
  kbSetTopNav('/assistant', 'رجوع لمساعد الخادم');
  var q = (params.q || '').trim();
  var cat = params.cat || '';
  APP_ROOT.innerHTML = kbLoadingHTML('نتائج البحث');
  try { await kbEnsureLoaded(); }
  catch (err) {
    APP_ROOT.innerHTML = kbErrorHTML('تعذّر تحميل مكتبة المساعد. تحقق من الاتصال ثم حاول مجددًا.');
    kbWireRetry(function () { kbRenderSearch(params); });
    return;
  }
  if (cat && !KB_CAT_FALLBACK[cat] && !((KB.manifest.categories || []).some(function (c) { return c.id === cat; }))) cat = '';
  var res = kbSearch(q, cat);
  var heading = q ? 'نتائج البحث' : ('قسم ' + kbCatLabel(cat));
  var crumb = q ? ('نتائج البحث عن: ' + q) : ('قسم ' + kbCatLabel(cat));
  var detectedHint = (res.detected && !res.browse)
    ? '<p class="search-hint">رُصد أن سؤالك عن قسم: <strong>' + escapeHTML(kbCatLabel(res.detected)) + '</strong></p>'
    : '';
  var countHint = res.browse
    ? '<p class="search-hint">' + res.total + (res.total === 1 ? ' عنصر في هذا القسم' : ' عنصر في هذا القسم') + '</p>'
    : '<p class="search-hint">' + (res.total ? ('عدد النتائج: ' + res.total) : 'لا توجد نتائج مطابقة — جرّب كلمات أخرى') + '</p>';
  var catOptions = '<option value="">كل الأقسام</option>' + ((KB.manifest.categories || [])
    .filter(function (c) { return (KB.counts[c.id] || 0) > 0; })
    .map(function (c) {
      return '<option value="' + escapeHTML(c.id) + '"' + (c.id === cat ? ' selected' : '') + '>' +
        escapeHTML(c.label) + ' (' + (KB.counts[c.id] || 0) + ')</option>';
    }).join(''));
  var listHTML = res.results.length
    ? '<div class="member-list">' + res.results.map(function (r) { return kbResultCardHTML(r.doc.item, r.snippet); }).join('') + '</div>'
    : '<div class="empty-state">' + ICONS.empty + '<p>لا توجد نتائج مطابقة في المكتبة الحالية.</p></div>';
  APP_ROOT.innerHTML = '<div class="container">' +
    '<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span>' +
    '<a href="#/assistant">' + KB_TITLE + '</a><span class="sep">/</span><span>' + escapeHTML(crumb) + '</span></p>' +
    '<h2 class="section-title">' + escapeHTML(heading) + '</h2>' +
    kbSearchPanelHTML('kbSearchInput', q) +
    '<div class="filter-bar"><div class="field"><label for="kbCatSelect">القسم</label>' +
    '<select id="kbCatSelect">' + catOptions + '</select></div></div>' +
    detectedHint + countHint +
    '<div style="margin:18px 0 24px;">' + kbPdfButtonHTML('kbPdfBtn') + '</div>' +
    listHTML + '</div>';
  kbWireSearchForm('kbSearchInput', cat);
  var sel = document.getElementById('kbCatSelect');
  if (sel) sel.addEventListener('change', function () {
    navigate('/assistant/search?' + qs({ q: q || undefined, cat: sel.value || undefined }));
  });
  var btn = document.getElementById('kbPdfBtn');
  if (btn) btn.addEventListener('click', function () {
    var rows = res.results.map(function (r) {
      return { title: r.doc.item.title || '', cat: kbCatLabel(r.doc.cat), text: kbExcerpt(r.doc, 320) };
    });
    var label = q ? ('نتائج البحث عن ' + q) : ('قسم ' + kbCatLabel(cat));
    kbDownloadPDF(btn, rows, label);
  });
}

/* ---------- detail body builders (one per content type) ---------- */
function kbMetaRow(dt, dd, full) {
  if (!dd) return '';
  return '<div class="info-item' + (full ? ' full' : '') + '"><dt>' + escapeHTML(dt) + '</dt><dd>' + dd + '</dd></div>';
}
function kbJoinList(arr) {
  return kbArr(arr).map(escapeHTML).join('، ');
}
function kbBullets(arr) {
  arr = kbArr(arr);
  if (!arr.length) return '';
  return '<ul class="kb-list">' + arr.map(function (x) { return '<li>' + escapeHTML(x) + '</li>'; }).join('') + '</ul>';
}
function kbParas(text) {
  if (!text) return '';
  return String(text).split(/\n+/).map(function (p) {
    return '<p>' + escapeHTML(p.trim()) + '</p>';
  }).join('');
}

function kbBibleBodyHTML(b) {
  var verses = kbArr(b.verses).map(function (v) {
    return '<div class="kb-verse"><span class="kb-verse-n">' + escapeHTML(String(v.n)) + '</span>' +
      '<span>' + escapeHTML(v.text || '') + '</span></div>';
  }).join('');
  var range = (b.verseStart && b.verseEnd) ? ('الآيات ' + b.verseStart + '–' + b.verseEnd) : '';
  return '<div class="info-section"><h3>' + ICONS.book + ' النص الكتابي</h3>' +
    '<dl class="info-grid">' +
    kbMetaRow('السفر', escapeHTML(b.bookAr || '')) +
    kbMetaRow('الإصحاح', escapeHTML(String(b.chapter || ''))) +
    kbMetaRow('الترجمة', 'فاندايك 1865 (ملكية عامة)') +
    (range ? kbMetaRow('النطاق', escapeHTML(range)) : '') +
    (b.partial && b.excerptNote ? kbMetaRow('ملاحظة', escapeHTML(b.excerptNote), true) : '') +
    '</dl><div class="kb-verses">' + verses + '</div></div>';
}

function kbLessonBodyHTML(b) {
  return '<div class="info-section"><h3>' + ICONS.notes + ' بيانات الدرس</h3>' +
    '<dl class="info-grid">' +
    kbMetaRow('الفئة العمرية', escapeHTML(b.ageGroup || '')) +
    kbMetaRow('المرحلة', escapeHTML(b.grade || '')) +
    kbMetaRow('المدة', b.durationMin ? ('نحو ' + escapeHTML(String(b.durationMin)) + ' دقيقة') : '') +
    kbMetaRow('الفكرة الرئيسية', escapeHTML(b.mainIdea || ''), true) +
    (b.memoryVerse ? kbMetaRow('الآية للحفظ', escapeHTML('"' + (b.memoryVerse.text || '') + '" (' + (b.memoryVerse.ref || '') + ')'), true) : '') +
    (kbArr(b.bibleRef).length ? kbMetaRow('الشاهد الكتابي', escapeHTML(kbArr(b.bibleRef).join('، ')), true) : '') +
    '</dl></div>' +
    '<div class="info-section"><h3>' + ICONS.notes + ' محتوى الدرس</h3><div class="kb-prose">' +
    (b.story ? '<h4>القصة</h4>' + kbParas(b.story) : '') +
    (b.explanation ? '<h4>الشرح</h4>' + kbParas(b.explanation) : '') +
    (kbArr(b.keyPoints).length ? '<h4>نقاط أساسية</h4>' + kbBullets(b.keyPoints) : '') +
    (kbArr(b.questions).length ? '<h4>أسئلة للحوار</h4>' + kbBullets(b.questions) : '') +
    (kbArr(b.activity).length ? '<h4>نشاط</h4>' + kbBullets(b.activity) : '') +
    (b.application ? '<h4>تطبيق عملي</h4>' + kbParas(b.application) : '') +
    (b.conclusion ? '<h4>ختام</h4>' + kbParas(b.conclusion) : '') +
    '</div></div>';
}

function kbHymnBodyHTML(b) {
  return '<div class="info-section"><h3>' + ICONS.music + ' بيانات اللحن</h3>' +
    '<dl class="info-grid">' +
    kbMetaRow('الاسم', escapeHTML(b.nameAr || '')) +
    (b.nameCoptic ? kbMetaRow('الاسم بالقبطية', escapeHTML(b.nameCoptic)) : '') +
    (kbArr(b.occasion).length ? kbMetaRow('المناسبة', kbJoinList(b.occasion)) : '') +
    (kbArr(b.feast).length ? kbMetaRow('العيد', kbJoinList(b.feast)) : '') +
    (b.liturgicalContext ? kbMetaRow('السياق الطقسي', escapeHTML(b.liturgicalContext), true) : '') +
    (b.whenSung ? kbMetaRow('متى يُقال', escapeHTML(b.whenSung), true) : '') +
    '</dl></div>' +
    '<div class="info-section"><h3>' + ICONS.music + ' شرح اللحن</h3><div class="kb-prose">' +
    kbParas(b.explanationOriginal) +
    '<p class="kb-muted">النص الكامل للحن والتدوين الموسيقي غير متاحين في هذه النسخة — تُضاف ' +
    'لاحقًا من مصدر مصرّح به فقط.</p></div></div>';
}

function kbSynaxariumBodyHTML(b) {
  var cd = b.copticDate || {};
  return '<div class="info-section"><h3>' + ICONS.calendar + ' بيانات اليوم</h3>' +
    '<dl class="info-grid">' +
    ((cd.day && cd.month) ? kbMetaRow('اليوم القبطي', escapeHTML(cd.day + ' ' + cd.month)) : '') +
    (b.gregorianNote ? kbMetaRow('الموافق', escapeHTML(b.gregorianNote)) : '') +
    (kbArr(b.saints).length ? kbMetaRow('القديسون', kbJoinList(b.saints), true) : '') +
    (kbArr(b.events).length ? kbMetaRow('الأحداث', kbJoinList(b.events), true) : '') +
    '</dl></div>' +
    '<div class="info-section"><h3>' + ICONS.calendar + ' التذكار</h3><div class="kb-prose">' +
    kbParas(b.summaryOriginal) +
    (kbArr(b.details).length ? '<h4>تفاصيل</h4>' + kbBullets(b.details) : '') +
    '</div></div>';
}

function kbFeastBodyHTML(b) {
  return '<div class="info-section"><h3>' + ICONS.cross + ' بيانات العيد</h3>' +
    '<dl class="info-grid">' +
    (b.name ? kbMetaRow('العيد', escapeHTML(b.name)) : '') +
    (b.dateRule ? kbMetaRow('التاريخ', escapeHTML(b.dateRule)) : '') +
    (b.season ? kbMetaRow('الموسم', escapeHTML(b.season)) : '') +
    (b.fastBefore ? kbMetaRow('الصوم السابق', escapeHTML(b.fastBefore)) : '') +
    (b.readingsNote ? kbMetaRow('القراءات', escapeHTML(b.readingsNote +
      (kbArr(b.nativityPassages || b.readings).length ? ' ' + kbArr(b.nativityPassages || b.readings).join('؛ ') : '')), true) : '') +
    (kbArr(b.hymns).length ? kbMetaRow('ألحان مرتبطة', kbJoinList(b.hymns), true) : '') +
    '</dl></div>' +
    '<div class="info-section"><h3>' + ICONS.cross + ' معنى العيد</h3><div class="kb-prose">' +
    kbParas(b.meaning) +
    (b.customs ? '<h4>عادات الاحتفال</h4>' + kbParas(b.customs) : '') +
    '</div></div>';
}

function kbGenericBodyHTML(b) {
  var flat = kbFlattenText(b).replace(/ /g, '\n');
  return '<div class="info-section"><h3>' + ICONS.notes + ' المحتوى</h3><div class="kb-prose">' +
    kbParas(flat) + '</div></div>';
}

function kbContentBodyHTML(item) {
  var b = item.body || {};
  if (item.type === 'bible') return kbBibleBodyHTML(b);
  if (item.type === 'lesson') return kbLessonBodyHTML(b);
  if (item.type === 'hymn') return kbHymnBodyHTML(b);
  if (item.type === 'synaxarium') return kbSynaxariumBodyHTML(b);
  if (item.type === 'feast' || item.type === 'rite') return kbFeastBodyHTML(b);
  return kbGenericBodyHTML(b);
}

function kbRelatedHTML(item) {
  var rel = kbArr(item.related);
  if (!rel.length) return '<p class="kb-muted">لا يوجد محتوى مرتبط بعد.</p>';
  /* Missing target ids are skipped silently: a bad link must never break render. */
  var cards = rel.map(function (r) {
    if (r.id && KB.byId.has(r.id)) {
      var t = KB.byId.get(r.id);
      return kbResultCardHTML(
        { id: t.id, type: t.type, title: t.title, tags: [r.label || kbCatLabel(t.type)] },
        escapeHTML(t.summary || '')
      );
    }
    if (r.query) {
      return '<a href="#/assistant/search?' + qs({ q: r.query }) + '" class="member-card">' +
        '<span class="icon-wrap" style="width:44px;height:44px;border-radius:50%;background:var(--color-maroon-tint);' +
        'color:var(--color-maroon);display:flex;align-items:center;justify-content:center;flex:none;">' +
        ICONS.search + '</span>' +
        '<span class="member-info"><span class="member-name">' + escapeHTML(r.label || r.query) + '</span>' +
        '<span class="member-meta">موضوع مرتبط — اضغط للبحث عنه</span></span></a>';
    }
    return '';
  }).join('');
  return cards ? '<div class="member-list">' + cards + '</div>' : '<p class="kb-muted">لا يوجد محتوى مرتبط بعد.</p>';
}

function kbSourceHTML(item) {
  var s = item.source || {};
  if (!s.origin && !s.license && !s.notes) return '';
  return '<div class="info-section"><h3>' + ICONS.notes + ' المصدر والحقوق</h3>' +
    '<dl class="info-grid">' +
    kbMetaRow('المصدر', escapeHTML([s.origin, s.edition].filter(Boolean).join(' — ')), true) +
    kbMetaRow('الترخيص', escapeHTML(s.license || '')) +
    (s.url ? kbMetaRow('الرابط', escapeHTML(s.url)) : '') +
    (s.notes ? kbMetaRow('ملاحظات', escapeHTML(s.notes), true) : '') +
    '</dl></div>';
}

function kbInitials(name) {
  var parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  if (parts.length === 1) return parts[0].charAt(0);
  return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
}

async function kbRenderItem(id) {
  kbSetTopNav('/assistant', 'رجوع لمساعد الخادم');
  APP_ROOT.innerHTML = kbLoadingHTML(KB_TITLE);
  try { await kbEnsureLoaded(); }
  catch (err) {
    APP_ROOT.innerHTML = kbErrorHTML('تعذّر تحميل مكتبة المساعد. تحقق من الاتصال ثم حاول مجددًا.');
    kbWireRetry(function () { kbRenderItem(id); });
    return;
  }
  var item = KB.byId.get(id);
  if (!item) {
    APP_ROOT.innerHTML = '<div class="container">' +
      '<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span>' +
      '<a href="#/assistant">' + KB_TITLE + '</a><span class="sep">/</span><span>غير موجود</span></p>' +
      '<div class="empty-state">' + ICONS.empty + '<p>هذا المحتوى غير موجود في المكتبة الحالية.</p>' +
      '<p><a href="#/assistant" class="btn btn-outline btn-sm">رجوع لمساعد الخادم</a></p></div></div>';
    return;
  }
  var tags = kbArr(item.tags).map(function (t) { return '<span class="tag">' + escapeHTML(t) + '</span>'; }).join('');
  APP_ROOT.innerHTML = '<div class="container">' +
    '<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span>' +
    '<a href="#/assistant">' + KB_TITLE + '</a><span class="sep">/</span>' +
    '<a href="#/assistant/category/' + encodeURIComponent(item.type) + '">' + escapeHTML(kbCatLabel(item.type)) + '</a>' +
    '<span class="sep">/</span><span>' + escapeHTML(item.title || '') + '</span></p>' +
    '<div class="profile-header">' +
    '<span class="profile-avatar">' + escapeHTML(kbInitials(item.title)) + '</span>' +
    '<div><h1 class="profile-name">' + escapeHTML(item.title || '') + '</h1>' +
    '<div class="profile-tags"><span class="tag">' + escapeHTML(kbCatLabel(item.type)) + '</span>' + tags + '</div></div>' +
    '<div class="profile-actions">' + kbPdfButtonHTML('kbItemPdfBtn') + '</div></div>' +
    (item.summary ? '<div class="info-section"><h3>' + ICONS.notes + ' نبذة</h3><div class="kb-prose">' +
      kbParas(item.summary) + '</div></div>' : '') +
    kbContentBodyHTML(item) +
    '<div class="info-section"><h3>' + ICONS.search + ' محتوى مرتبط</h3>' + kbRelatedHTML(item) + '</div>' +
    kbSourceHTML(item) + '</div>';
  var btn = document.getElementById('kbItemPdfBtn');
  if (btn) btn.addEventListener('click', function () {
    var doc = KB.docs.find(function (d) { return d.item.id === item.id; });
    var rows = doc ? kbChunkRows(item, doc) : [{ title: item.title || '', cat: kbCatLabel(item.type), text: item.summary || '' }];
    kbDownloadPDF(btn, rows, item.title || KB_TITLE);
  });
}

/* Split a long item body into printable rows so no row is ever cut by a page break. */
function kbChunkRows(item, doc) {
  var text = (doc.bodyText || '').replace(/\s+/g, ' ').trim();
  var chunks = [];
  var MAX = 500;
  while (text.length > MAX) {
    var cut = text.lastIndexOf(' ', MAX);
    if (cut <= 0) cut = MAX;
    chunks.push(text.slice(0, cut));
    text = text.slice(cut).trim();
  }
  if (text) chunks.push(text);
  if (!chunks.length) chunks = [item.summary || item.title || ''];
  return chunks.map(function (c, i) {
    return { title: i === 0 ? (item.title || '') : '…', cat: i === 0 ? kbCatLabel(item.type) : '…', text: c };
  });
}

/* ============================== 8. PDF export ============================== */
/* Same local pipeline and visual style as the existing exporters
   (jsPDF + html2canvas, RTL, probe-measured rows, bin-packed pages). */
async function kbDownloadPDF(btn, rows, heading) {
  if (!rows.length) { showToast('لا توجد نتائج لتصديرها', 'error'); return; }
  var originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'جاري التجهيز...';
  var cleanupEls = [];
  try {
    await _loadPdfLibs();
    var jsPDF = window.jspdf.jsPDF;
    var PAGE_W = 595, PAGE_H = 842;
    var MARGIN = 26;
    var HEADER_H = 96;
    var BLOCK_W = PAGE_W - MARGIN * 2;
    var BLOCK_H = PAGE_H - HEADER_H - MARGIN * 2;
    var HEAD_ROW_H = 24;
    var MIN_ROW_H = 20;
    var COLS = [
      { key: 'title', label: 'العنوان', w: 0.30 },
      { key: 'cat', label: 'القسم', w: 0.20 },
      { key: 'text', label: 'مقتطف', w: 0.50 }
    ];
    var colW = COLS.map(function (c) { return BLOCK_W * c.w - 2; });
    var probe = document.createElement('div');
    probe.style.cssText = "position:fixed;visibility:hidden;left:-9999px;top:0;font-family:'Cairo',system-ui,sans-serif;" +
      'font-size:10.5px;line-height:1.4;padding:5px 6px;box-sizing:border-box;word-break:break-word;';
    document.body.appendChild(probe);
    cleanupEls.push(probe);
    function measureH(text, width) {
      probe.style.width = width + 'px';
      probe.textContent = text;
      return probe.offsetHeight;
    }
    var measured = rows.map(function (r, idx) {
      var serial = idx + 1;
      var h = Math.max(
        MIN_ROW_H,
        measureH(serial + ' - ' + r.title, colW[0]),
        measureH(r.cat, colW[1]),
        measureH(r.text, colW[2])
      );
      return { title: r.title, cat: r.cat, text: r.text, serial: serial, rowH: h };
    });
    var blocks = [], current = [], currentH = HEAD_ROW_H;
    measured.forEach(function (r) {
      if (currentH + r.rowH > BLOCK_H && current.length) {
        blocks.push(current);
        current = [];
        currentH = HEAD_ROW_H;
      }
      current.push(r);
      currentH += r.rowH;
    });
    if (current.length) blocks.push(current);

    function tableHTML(blockRows) {
      var colgroup = COLS.map(function (c) { return '<col style="width:' + (c.w * 100) + '%;">'; }).join('');
      var th = COLS.map(function (c) {
        return '<th style="border:1px solid #9AA7B2;background:#DCE6F1;color:#1F2A37;' +
          "font-family:'Cairo',sans-serif;font-weight:700;font-size:10.5px;line-height:1.35;" +
          'padding:5px 6px;text-align:center;vertical-align:middle;">' + escapeHTML(c.label) + '</th>';
      }).join('');
      var trs = blockRows.map(function (r) {
        return '<tr>' +
          '<td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;' +
          "font-family:'Cairo',sans-serif;word-break:break-word;text-align:right;vertical-align:middle;\">" +
          r.serial + ' - ' + escapeHTML(r.title) + '</td>' +
          '<td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;' +
          "font-family:'Cairo',sans-serif;word-break:break-word;text-align:center;vertical-align:middle;\">" +
          escapeHTML(r.cat) + '</td>' +
          '<td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;' +
          "font-family:'Cairo',sans-serif;word-break:break-word;text-align:right;vertical-align:middle;\">" +
          escapeHTML(r.text) + '</td></tr>';
      }).join('');
      return '<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup>' +
        colgroup + '</colgroup><thead><tr>' + th + '</tr></thead><tbody>' + trs + '</tbody></table>';
    }
    function pageHTML(pageBlock) {
      return '<div style="width:' + PAGE_W + 'px;height:' + PAGE_H + 'px;background:#FFFDF8;' +
        'box-sizing:border-box;position:relative;overflow:hidden;">' +
        '<div style="position:absolute;inset:0;background-image:url(\'site-bg.jpg\');' +
        'background-size:cover;background-position:center;opacity:0.08;"></div>' +
        '<div style="position:relative;padding:' + MARGIN + 'px;direction:rtl;">' +
        '<div style="text-align:center;margin-bottom:10px;">' +
        '<div style="font-family:\'Aref Ruqaa\',serif;font-size:22px;color:#7C1F2C;font-weight:700;">' +
        escapeHTML(heading) + '</div>' +
        '<div style="font-family:\'Cairo\',sans-serif;font-size:10px;color:#AD8332;font-weight:700;margin-top:2px;">' +
        'إيبارشية شرق المنيا للأقباط الأرثوذكس</div>' +
        '<div style="font-family:\'Cairo\',sans-serif;font-size:11px;color:#591420;font-weight:700;margin-top:1px;">' +
        'كنيسة الأنبا بيشوي بالمنيا الجديدة — ' + KB_TITLE + '</div></div>' +
        '<div style="width:' + BLOCK_W + 'px;">' + tableHTML(pageBlock) + '</div></div></div>';
    }
    var stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-99999px;top:0;';
    document.body.appendChild(stage);
    cleanupEls.push(stage);
    var pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    for (var i = 0; i < blocks.length; i++) {
      stage.innerHTML = pageHTML(blocks[i]);
      var pageEl = stage.firstElementChild;
      // eslint-disable-next-line no-await-in-loop
      var canvas = await window.html2canvas(pageEl, { scale: 2, backgroundColor: '#FFFDF8', useCORS: true });
      var imgData = canvas.toDataURL('image/png');
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, PAGE_W, PAGE_H);
    }
    var stamp = new Date().toISOString().slice(0, 10);
    var slug = String(heading || 'نتائج').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 40) || 'نتائج';
    pdf.save('مساعد_الخادم_' + slug + '_' + stamp + '.pdf');
  } catch (err) {
    console.error('Assistant PDF generation failed:', err);
    showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
  } finally {
    cleanupEls.forEach(function (el) { el.remove(); });
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

/* ============================== 9. Route entry ============================== */
async function AssistantRoute(sub, params) {
  var s = sub || [];
  if (s.length === 0) return kbRenderHome();
  if (s[0] === 'search') return kbRenderSearch(params || {});
  if (s[0] === 'category' && s[1]) return kbRenderSearch({ q: '', cat: decodeURIComponent(s[1]) });
  if (s[0] === 'item' && s[1]) return kbRenderItem(decodeURIComponent(s[1]));
  return kbRenderHome();
}

globalThis.AssistantRoute = AssistantRoute;
/* Tiny hook surface for automated validation (no UI dependency). */
globalThis.AssistantKB = {
  ensure: kbEnsureLoaded,
  search: kbSearch,
  tokenize: kbTokenize,
  getKB: function () { return KB; }
};

})();
