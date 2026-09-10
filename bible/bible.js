/* ==========================================================================
   bible.js — قسم «الكتاب المقدس» (Anba-Bishoy-Church website).
   Static, client-only. No backend, no AI, no external services.
   Lazy-loads bible/*.json via fetch() only when the section is opened,
   exactly like the existing seed.json pattern. Memory cache only.

   Contents:
     1. Local helpers (self-contained; app.js/db.js globals are used only
        when available, with local fallbacks, so this file never breaks
        the existing site even if load order ever changes).
     2. BibleStore — metadata + per-book JSON loader with in-memory cache.
     3. BibleSearch — Arabic-tolerant search across Bible + commentary.
     4. BibleUI — page renderers + route dispatcher (called from app.js
        router only; never touches MembersDB / VisitationDB).
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/*  1. Local helpers                                                      */
/* ---------------------------------------------------------------------- */

function bibleEscape(str) {
  if (typeof escapeHTML === 'function') return escapeHTML(str);
  return (str ?? '').toString().replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function bibleNormalize(str) {
  const base = (typeof normalizeArabic === 'function')
    ? normalizeArabic(str)
    : (str || '').toString().trim()
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  // The Van Dyke text uses U+0671 ALEF WASLA (ٱ) tens of thousands of times;
  // users never type it, so fold it (and its rare siblings) into regular alef.
  // db.js is intentionally NOT modified — this folding lives only here.
  return base.replace(/[\u0671\u0672\u0673\u0675]/g, 'ا');
}

function bibleNavigate(hash) {
  if (typeof navigate === 'function') navigate(hash);
  else window.location.hash = hash;
}

/* Minimal icon set used by this section (same stroke style as app.js). */
const BIBLE_ICONS = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c-2-1.5-5-2-8-2v16c3 0 6 .5 8 2 2-1.5 5-2 8-2V3c-3 0-6 .5-8 2z"/><path d="M12 5v16"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M5 8h14"/><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="21" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="8" r="1" fill="currentColor" stroke="none"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 12h6M9 16h6M9 8h2"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
};

/* Arabic plural labels for counts (إصحاح / آية / سفر). */
function arabicCountLabel(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
const chaptersLabel = (n) => arabicCountLabel(n, 'إصحاح واحد', 'إصحاحان', 'إصحاحات', 'إصحاحًا');
const versesLabel = (n) => arabicCountLabel(n, 'آية واحدة', 'آيتان', 'آيات', 'آية');
const booksLabel = (n) => arabicCountLabel(n, 'سفر واحد', 'سفران', 'أسفار', 'سفرًا');

/* ---------------------------------------------------------------------- */
/*  2. BibleStore — lazy JSON loader + memory cache                       */
/* ---------------------------------------------------------------------- */
const BibleStore = {
  _meta: null,
  _books: new Map(),
  _tafsir: new Map(),

  async metadata() {
    if (!this._meta) {
      const res = await fetch('bible/metadata.json');
      if (!res.ok) throw new Error('تعذر تحميل فهرس الأسفار');
      this._meta = await res.json();
    }
    return this._meta;
  },

  async bookInfo(id) {
    const meta = await this.metadata();
    return (meta.books || []).find((b) => b.id === id) || null;
  },

  /* Loads ONE book file (bible/ot/<id>.json or bible/nt/<id>.json), once —
     every later visit reuses the in-memory copy. */
  async loadBook(id) {
    if (this._books.has(id)) return this._books.get(id);
    const info = await this.bookInfo(id);
    if (!info) throw new Error('السفر غير موجود');
    const res = await fetch(`bible/${info.testament}/${id}.json`);
    if (!res.ok) throw new Error('تعذر تحميل السفر');
    const data = await res.json();
    this._books.set(id, data);
    return data;
  },

  /* Commentary file for a book. Missing/unfinished files resolve to a
     "pending" skeleton — never an error — so the section keeps working
     while commentary content is still being added. */
  async loadTafsir(id) {
    if (this._tafsir.has(id)) return this._tafsir.get(id);
    let data = null;
    try {
      const res = await fetch(`bible/tafsir/${id}.json`);
      data = res.ok ? await res.json() : null;
    } catch (e) { data = null; }
    if (!data || typeof data !== 'object') {
      data = { bookId: id, status: 'pending', source: null, chapters: [] };
    }
    this._tafsir.set(id, data);
    return data;
  },

  tafsirChapter(tafsirData, chapterNum) {
    if (!tafsirData || tafsirData.status === 'pending') return null;
    const list = Array.isArray(tafsirData.chapters) ? tafsirData.chapters : [];
    return list.find((c) => Number(c.chapter) === Number(chapterNum)) || null;
  },
};

/* ---------------------------------------------------------------------- */
/*  3. BibleSearch — search inside the Bible + inside the commentary      */
/* ---------------------------------------------------------------------- */
const BibleSearch = {
  _token: 0,
  MAX_RESULTS: 200,

  cancel() { this._token += 1; },

  /* scope: 'all' | 'ot' | 'nt' | 'tafsir'.
     'all' covers the whole Bible plus whatever commentary exists.
     Books are scanned in canonical order with progress callbacks; a newer
     search automatically cancels an older one via the token. */
  async run(query, scope, onProgress) {
    const myToken = ++this._token;
    const norm = bibleNormalize(query);
    if (!norm || norm.length < 2) return { results: [], truncated: false };

    const meta = await BibleStore.metadata();
    if (myToken !== this._token) return { results: [], cancelled: true };
    const books = (meta.books || []).filter((b) => {
      if (scope === 'ot') return b.testament === 'ot';
      if (scope === 'nt') return b.testament === 'nt';
      return true;
    });

    const results = [];
    const searchBible = scope !== 'tafsir';
    const searchTafsir = scope === 'all' || scope === 'tafsir';
    const totalSteps = books.length * ((searchBible && searchTafsir) ? 2 : 1);
    let step = 0;

    if (searchBible) {
      for (const b of books) {
        if (myToken !== this._token) return { results: [], cancelled: true };
        step += 1;
        if (onProgress) onProgress(step, totalSteps, b.name);
        let data;
        try {
          data = await BibleStore.loadBook(b.id);
        } catch (e) { continue; } // eslint-disable-line no-continue
        for (let c = 0; c < data.chapters.length; c += 1) {
          const verses = data.chapters[c];
          for (let v = 0; v < verses.length; v += 1) {
            if (bibleNormalize(verses[v]).includes(norm)) {
              results.push({
                type: 'verse', bookId: b.id, book: b.name,
                chapter: c + 1, verse: v + 1, text: verses[v],
              });
              if (results.length >= this.MAX_RESULTS) return { results, truncated: true };
            }
          }
        }
        // Let the browser breathe every few books so the page stays responsive.
        if (step % 3 === 0) await new Promise((r) => setTimeout(r, 0)); // eslint-disable-line no-await-in-loop
      }
    }

    if (searchTafsir) {
      for (const b of books) {
        if (myToken !== this._token) return { results: [], cancelled: true };
        step += 1;
        if (onProgress) onProgress(step, totalSteps, b.name);
        const taf = await BibleStore.loadTafsir(b.id); // eslint-disable-line no-await-in-loop
        if (!taf || taf.status === 'pending' || !Array.isArray(taf.chapters)) continue; // eslint-disable-line no-continue
        for (const ch of taf.chapters) {
          for (const sec of (ch.sections || [])) {
            const hay = bibleNormalize(`${sec.title || ''} ${sec.text || ''}`);
            if (hay.includes(norm)) {
              results.push({
                type: 'tafsir', bookId: b.id, book: b.name,
                chapter: ch.chapter, verses: sec.verses || '',
                title: sec.title || '', text: sec.text || '',
              });
              if (results.length >= this.MAX_RESULTS) return { results, truncated: true };
            }
          }
        }
      }
    }

    return { results, truncated: false };
  },
};

/* Snippet builder with tashkeel-tolerant <mark> highlighting. Matching for
   display happens in a stripped+folded space (tashkeel removed, alef/ya/ta
   variants unified — all 1:1 per-character mappings, so offsets stay aligned),
   then the hit is mapped back to original offsets for display. */
function bibleStripTashkeel(str) {
  return (str || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '');
}

function bibleCompareForm(str) {
  return bibleStripTashkeel(str)
    .replace(/[إأآا\u0671\u0672\u0673\u0675]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/* strippedOffset -> original string offset (tashkeel chars occupy original
   offsets but none in stripped space). */
function bibleMapToOriginal(text, strippedOffset) {
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/[\u064B-\u0652\u0670\u0640]/.test(text[i])) continue;
    if (seen === strippedOffset) return i;
    seen += 1;
  }
  return text.length;
}

function bibleHighlightSnippet(text, rawQuery, maxLen = 220) {
  const q = bibleCompareForm((rawQuery || '').trim());
  let snippet = text;
  if (snippet.length > maxLen) {
    const cmp = bibleCompareForm(snippet);
    const at = q.length >= 2 ? cmp.indexOf(q) : -1;
    if (at > 40) {
      const origAt = bibleMapToOriginal(snippet, at);
      const start = Math.max(0, origAt - 60);
      snippet = (start > 0 ? '…' : '') + snippet.slice(start, start + maxLen)
        + ((start + maxLen < text.length) ? '…' : '');
    } else {
      snippet = snippet.slice(0, maxLen) + '…';
    }
  }
  if (!q || q.length < 2) return bibleEscape(snippet);
  const at = bibleCompareForm(snippet).indexOf(q);
  if (at === -1) return bibleEscape(snippet);
  const origStart = bibleMapToOriginal(snippet, at);
  const origEnd = bibleMapToOriginal(snippet, at + q.length);
  return bibleEscape(snippet.slice(0, origStart))
    + '<mark>' + bibleEscape(snippet.slice(origStart, origEnd)) + '</mark>'
    + bibleEscape(snippet.slice(origEnd));
}

/* ---------------------------------------------------------------------- */
/*  4. BibleUI — pages. Called only from the app.js router's #/bible      */
/*     branch. Read-only: never writes to any database.                   */
/* ---------------------------------------------------------------------- */
const BibleUI = {
  _page: 0, // guards async renders against navigation-away clobbering

  route(segments, params) {
    this._page += 1;
    BibleSearch.cancel();
    const sub = segments[1];
    if (!sub) return this.home();
    if (sub === 'ot' || sub === 'nt') return this.testament(sub);
    if (sub === 'book' && segments[2]) return this.book(segments[2]);
    if (sub === 'read' && segments[2] && segments[3]) return this.chapter(segments[2], segments[3], params);
    if (sub === 'tafsir' && !segments[2]) return this.tafsirHome();
    if (sub === 'tafsir' && segments[2] && !segments[3]) return this.tafsirBook(segments[2]);
    if (sub === 'tafsir' && segments[2] && segments[3]) return this.tafsirChapter(segments[2], segments[3]);
    if (sub === 'search') return this.search(params);
    return this.home();
  },

  /* Top nav row for bible pages: back link only (this section is
     read-only, so there is no admin toggle here). */
  chrome(backHash, backLabel) {
    document.getElementById('topNav').innerHTML = `
      <span><a href="#${backHash}" class="back-link">${BIBLE_ICONS.back}<span>${bibleEscape(backLabel)}</span></a></span>
      <span></span>`;
  },

  loadErrorHTML(message) {
    return `<div class="container"><div class="empty-state">${BIBLE_ICONS.empty}<p>${bibleEscape(message)}</p><p style="font-size:.85rem;">تحقق من الاتصال ثم أعد المحاولة.</p></div></div>`;
  },

  /* #/bible — the four sub-sections. */
  async home() {
    const page = this._page;
    this.chrome('/', 'رجوع للصفحة الرئيسية');
    const root = document.getElementById('app');
    let statsLine = 'العهد القديم · العهد الجديد · التفسير · البحث';
    try {
      const meta = await BibleStore.metadata();
      if (page !== this._page) return;
      const n = meta.books.length;
      const ch = meta.books.reduce((s, b) => s + b.chapters, 0);
      const v = meta.books.reduce((s, b) => s + b.verses, 0);
      statsLine = `${booksLabel(n)} · ${chaptersLabel(ch)} · ${versesLabel(v)}`;
    } catch (e) { /* keep the fallback line */ }
    if (page !== this._page) return;
    root.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><span>الكتاب المقدس</span></p>
        <h2 class="section-title">الكتاب المقدس</h2>
        <p class="section-sub">${bibleEscape(statsLine)} — ترجمة سميث وفاندايك (ملكية عامة)</p>
        <div class="cross-divider">${BIBLE_ICONS.cross}</div>
        <div class="bible-home-grid">
          <a href="#/bible/ot" class="landing-card">
            <span class="icon-wrap">${BIBLE_ICONS.book}</span>
            <span class="landing-card-title">العهد القديم</span>
            <span class="bible-card-sub">39 سفرًا — من التكوين إلى ملاخي</span>
          </a>
          <a href="#/bible/nt" class="landing-card">
            <span class="icon-wrap">${BIBLE_ICONS.book}</span>
            <span class="landing-card-title">العهد الجديد</span>
            <span class="bible-card-sub">27 سفرًا — من متى إلى الرؤيا</span>
          </a>
          <a href="#/bible/tafsir" class="landing-card">
            <span class="icon-wrap">${BIBLE_ICONS.notes}</span>
            <span class="landing-card-title">التفسير</span>
            <span class="bible-card-sub">تفسير الكتاب المقدس</span>
          </a>
          <a href="#/bible/search" class="landing-card">
            <span class="icon-wrap">${BIBLE_ICONS.search}</span>
            <span class="landing-card-title">البحث</span>
            <span class="bible-card-sub">ابحث في الكتاب المقدس والتفسير</span>
          </a>
        </div>
      </div>`;
  },

  /* #/bible/ot and #/bible/nt — book lists in canonical (Coptic) order. */
  async testament(test) {
    const page = this._page;
    const title = test === 'ot' ? 'العهد القديم' : 'العهد الجديد';
    this.chrome('/bible', 'رجوع للكتاب المقدس');
    const root = document.getElementById('app');
    let books;
    try {
      const meta = await BibleStore.metadata();
      books = meta.books.filter((b) => b.testament === test);
    } catch (e) {
      if (page !== this._page) return;
      root.innerHTML = this.loadErrorHTML('تعذر تحميل قائمة الأسفار');
      return;
    }
    if (page !== this._page) return;
    root.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><span>${title}</span></p>
        <h2 class="section-title">${title}</h2>
        <p class="section-sub">${booksLabel(books.length)} مرتبة بالترتيب القبطي</p>
        <div class="bible-books-grid">
          ${books.map((b, i) => `
            <a href="#/bible/book/${b.id}" class="bible-book-card">
              <span class="bible-book-order">${i + 1}</span>
              <span class="bible-book-info">
                <span class="bible-book-name">${bibleEscape(b.name)}</span>
                <span class="bible-book-meta">${chaptersLabel(b.chapters)}</span>
              </span>
            </a>`).join('')}
        </div>
      </div>`;
  },

  /* #/bible/book/:id — chapter picker for one book. */
  async book(id) {
    const page = this._page;
    let info;
    try {
      info = await BibleStore.bookInfo(id);
    } catch (e) {
      if (page !== this._page) return;
      document.getElementById('app').innerHTML = this.loadErrorHTML('تعذر تحميل بيانات السفر');
      return;
    }
    if (!info) return bibleNavigate('/bible');
    if (page !== this._page) return;
    const parentHash = info.testament === 'ot' ? '/bible/ot' : '/bible/nt';
    const parentLabel = info.testament === 'ot' ? 'العهد القديم' : 'العهد الجديد';
    this.chrome(parentHash, `رجوع لـ${parentLabel}`);
    const nums = Array.from({ length: info.chapters }, (_, i) => i + 1);
    document.getElementById('app').innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><a href="#${parentHash}">${parentLabel}</a><span class="sep">/</span><span>${bibleEscape(info.name)}</span></p>
        <h2 class="section-title">سفر ${bibleEscape(info.name)}</h2>
        <p class="section-sub">${chaptersLabel(info.chapters)} · ${versesLabel(info.verses)} — اختر الإصحاح</p>
        <div class="chapter-grid">
          ${nums.map((n) => `<a href="#/bible/read/${info.id}/${n}" class="chapter-btn">${n}</a>`).join('')}
        </div>
      </div>`;
  },

  /* #/bible/read/:id/:ch?v= — chapter text with verse numbers,
     prev/next navigation, and a link to this chapter's commentary. */
  async chapter(id, chRaw, params) {
    const page = this._page;
    let info;
    try {
      info = await BibleStore.bookInfo(id);
    } catch (e) {
      if (page !== this._page) return;
      document.getElementById('app').innerHTML = this.loadErrorHTML('تعذر تحميل بيانات السفر');
      return;
    }
    const ch = parseInt(chRaw, 10);
    if (!info || !(ch >= 1 && ch <= info.chapters)) return bibleNavigate(`/bible/book/${id}`);
    this.chrome(`/bible/book/${id}`, `رجوع لسفر ${info.name}`);
    const root = document.getElementById('app');
    let data;
    try {
      data = await BibleStore.loadBook(id);
    } catch (e) {
      if (page !== this._page) return;
      root.innerHTML = this.loadErrorHTML('تعذر تحميل نص الإصحاح');
      return;
    }
    if (page !== this._page) return;
    const verses = data.chapters[ch - 1] || [];

    // Prev/next chapter, continuing across book boundaries in canonical order.
    const meta = await BibleStore.metadata();
    if (page !== this._page) return;
    const idx = meta.books.findIndex((b) => b.id === id);
    const prev = ch > 1
      ? { id, ch: ch - 1, label: `الإصحاح ${ch - 1}` }
      : (idx > 0 ? { id: meta.books[idx - 1].id, ch: meta.books[idx - 1].chapters, label: `${meta.books[idx - 1].name} ${meta.books[idx - 1].chapters}` } : null);
    const next = ch < info.chapters
      ? { id, ch: ch + 1, label: `الإصحاح ${ch + 1}` }
      : (idx < meta.books.length - 1 ? { id: meta.books[idx + 1].id, ch: 1, label: `${meta.books[idx + 1].name} 1` } : null);

    root.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><a href="#/bible/book/${info.id}">${bibleEscape(info.name)}</a><span class="sep">/</span><span>إصحاح ${ch}</span></p>
        <h2 class="section-title">${bibleEscape(info.name)} — إصحاح ${ch}</h2>
        <p class="section-sub">${versesLabel(verses.length)}</p>
        <div class="chapter-nav">
          ${prev ? `<a href="#/bible/read/${prev.id}/${prev.ch}" class="btn btn-outline btn-sm">→ ${bibleEscape(prev.label)}</a>` : '<span></span>'}
          <a href="#/bible/tafsir/${info.id}/${ch}" class="btn btn-outline btn-sm">${BIBLE_ICONS.notes}<span>تفسير هذا الإصحاح</span></a>
          ${next ? `<a href="#/bible/read/${next.id}/${next.ch}" class="btn btn-outline btn-sm">${bibleEscape(next.label)} ←</a>` : '<span></span>'}
        </div>
        <div class="verse-list">
          ${verses.map((t, i) => `
            <div class="verse-row" id="v${i + 1}">
              <span class="verse-num">${i + 1}</span>
              <p class="verse-text">${bibleEscape(t)}</p>
            </div>`).join('')}
        </div>
        <div class="chapter-nav chapter-nav-bottom">
          ${prev ? `<a href="#/bible/read/${prev.id}/${prev.ch}" class="btn btn-outline btn-sm">→ ${bibleEscape(prev.label)}</a>` : '<span></span>'}
          ${next ? `<a href="#/bible/read/${next.id}/${next.ch}" class="btn btn-outline btn-sm">${bibleEscape(next.label)} ←</a>` : '<span></span>'}
        </div>
      </div>`;

    // Deep-link highlight from search results (?v=12).
    const v = parseInt(params && params.v, 10);
    if (v >= 1 && v <= verses.length) {
      const el = document.getElementById(`v${v}`);
      if (el) {
        el.classList.add('verse-hl');
        setTimeout(() => {
          try {
            if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
          } catch (e) { /* old browsers — highlight alone is enough */ }
        }, 60);
      }
    }
  },

  /* #/bible/tafsir — commentary book list (both testaments). */
  async tafsirHome() {
    const page = this._page;
    this.chrome('/bible', 'رجوع للكتاب المقدس');
    const root = document.getElementById('app');
    let books;
    try {
      const meta = await BibleStore.metadata();
      books = meta.books;
    } catch (e) {
      if (page !== this._page) return;
      root.innerHTML = this.loadErrorHTML('تعذر تحميل قائمة أسفار التفسير');
      return;
    }
    if (page !== this._page) return;
    const ot = books.filter((b) => b.testament === 'ot');
    const nt = books.filter((b) => b.testament === 'nt');
    const groupHTML = (list) => `
      <div class="bible-books-grid">
        ${list.map((b) => `
          <a href="#/bible/tafsir/${b.id}" class="bible-book-card">
            <span class="bible-book-info">
              <span class="bible-book-name">تفسير ${bibleEscape(b.name)}</span>
              <span class="bible-book-meta">${chaptersLabel(b.chapters)}</span>
            </span>
          </a>`).join('')}
      </div>`;
    root.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><span>التفسير</span></p>
        <h2 class="section-title">تفسير الكتاب المقدس</h2>
        <p class="section-sub">اختر السفر لعرض تفسير إصحاحاته</p>
        <h3 class="bible-group-title">العهد القديم</h3>
        ${groupHTML(ot)}
        <h3 class="bible-group-title">العهد الجديد</h3>
        ${groupHTML(nt)}
      </div>`;
  },

  /* #/bible/tafsir/:id — chapters of one book's commentary. Pending books
     show an honest "coming later" notice instead of a chapter grid. */
  async tafsirBook(id) {
    const page = this._page;
    let info;
    try {
      info = await BibleStore.bookInfo(id);
    } catch (e) {
      if (page !== this._page) return;
      document.getElementById('app').innerHTML = this.loadErrorHTML('تعذر تحميل بيانات السفر');
      return;
    }
    if (!info) return bibleNavigate('/bible/tafsir');
    this.chrome('/bible/tafsir', 'رجوع للتفسير');
    const root = document.getElementById('app');
    const taf = await BibleStore.loadTafsir(id);
    if (page !== this._page) return;

    const crumbs = `<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><a href="#/bible/tafsir">التفسير</a><span class="sep">/</span><span>${bibleEscape(info.name)}</span></p>
      <h2 class="section-title">تفسير سفر ${bibleEscape(info.name)}</h2>`;

    const readyChapters = (taf.status !== 'pending' && Array.isArray(taf.chapters)) ? taf.chapters : [];
    if (!readyChapters.length) {
      root.innerHTML = `
        <div class="container">
          ${crumbs}
          <div class="empty-state">${BIBLE_ICONS.empty}<p>تفسير سفر ${bibleEscape(info.name)} سيُضاف قريبًا من مصدر موثوق</p>
          <p style="font-size:.85rem;margin-top:10px;"><a href="#/bible/book/${info.id}" class="btn btn-outline btn-sm">قراءة سفر ${bibleEscape(info.name)}</a></p></div>
        </div>`;
      return;
    }
    const readySet = new Set(readyChapters.map((c) => Number(c.chapter)));
    const nums = Array.from({ length: info.chapters }, (_, i) => i + 1);
    root.innerHTML = `
      <div class="container">
        ${crumbs}
        ${taf.source ? `<p class="section-sub">المصدر: ${bibleEscape(taf.source)}</p>` : ''}
        <div class="chapter-grid">
          ${nums.map((n) => `<a href="#/bible/tafsir/${info.id}/${n}" class="chapter-btn${readySet.has(n) ? '' : ' chapter-btn-pending'}" title="${readySet.has(n) ? '' : 'سيُضاف قريبًا'}">${n}</a>`).join('')}
        </div>
      </div>`;
  },

  /* #/bible/tafsir/:id/:ch — one chapter's commentary (or pending notice). */
  async tafsirChapter(id, chRaw) {
    const page = this._page;
    let info;
    try {
      info = await BibleStore.bookInfo(id);
    } catch (e) {
      if (page !== this._page) return;
      document.getElementById('app').innerHTML = this.loadErrorHTML('تعذر تحميل بيانات السفر');
      return;
    }
    const ch = parseInt(chRaw, 10);
    if (!info || !(ch >= 1 && ch <= info.chapters)) return bibleNavigate(`/bible/tafsir/${id}`);
    this.chrome(`/bible/tafsir/${id}`, `رجوع لتفسير ${info.name}`);
    const root = document.getElementById('app');
    const taf = await BibleStore.loadTafsir(id);
    if (page !== this._page) return;
    const entry = BibleStore.tafsirChapter(taf, ch);

    const crumbs = `<p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><a href="#/bible/tafsir/${info.id}">تفسير ${bibleEscape(info.name)}</a><span class="sep">/</span><span>إصحاح ${ch}</span></p>
      <h2 class="section-title">تفسير ${bibleEscape(info.name)} — إصحاح ${ch}</h2>`;

    if (!entry || !(entry.sections || []).length) {
      root.innerHTML = `
        <div class="container">
          ${crumbs}
          <div class="empty-state">${BIBLE_ICONS.empty}<p>تفسير هذا الإصحاح سيُضاف قريبًا من مصدر موثوق</p>
          <p style="font-size:.85rem;margin-top:10px;"><a href="#/bible/read/${info.id}/${ch}" class="btn btn-outline btn-sm">قراءة نص الإصحاح</a></p></div>
        </div>`;
      return;
    }
    root.innerHTML = `
      <div class="container">
        ${crumbs}
        ${taf.source ? `<p class="section-sub">المصدر: ${bibleEscape(taf.source)}</p>` : ''}
        <div style="margin-bottom:18px;"><a href="#/bible/read/${info.id}/${ch}" class="btn btn-outline btn-sm">${BIBLE_ICONS.book}<span>قراءة نص الإصحاح</span></a></div>
        ${entry.sections.map((s) => `
          <div class="info-section tafsir-section">
            ${s.title ? `<h3>${bibleEscape(s.title)}</h3>` : ''}
            ${s.verses ? `<p class="tafsir-verses-label">الآيات: ${bibleEscape(s.verses)}</p>` : ''}
            <p class="tafsir-text">${bibleEscape(s.text || '').replace(/\n/g, '<br>')}</p>
          </div>`).join('')}
      </div>`;
  },

  /* #/bible/search — search inside the Bible and inside the commentary. */
  async search(params) {
    const page = this._page;
    this.chrome('/bible', 'رجوع للكتاب المقدس');
    const root = document.getElementById('app');
    const q0 = (params && params.q) || '';
    const scope0 = (params && params.scope) || 'all';
    const SCOPES = [
      { key: 'all', label: 'الكل' },
      { key: 'ot', label: 'العهد القديم' },
      { key: 'nt', label: 'العهد الجديد' },
      { key: 'tafsir', label: 'التفسير' },
    ];
    root.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><span>البحث</span></p>
        <h2 class="section-title">البحث في الكتاب المقدس والتفسير</h2>
        <div class="search-panel">
          <form id="bibleSearchForm">
            <div class="search-box">
              ${BIBLE_ICONS.search}
              <input type="text" id="bibleSearchInput" value="${bibleEscape(q0)}" placeholder="ابحث عن كلمة أو آية... مثال: المحبة" autocomplete="off" />
            </div>
          </form>
          <div class="chip-row" style="margin:14px 0 0;">
            ${SCOPES.map((s) => `<button type="button" class="chip bible-scope-chip${scope0 === s.key ? ' active' : ''}" data-scope="${s.key}">${s.label}</button>`).join('')}
          </div>
          <p class="search-hint" id="bibleSearchHint">اكتب كلمتين على الأقل — البحث يتجاهل التشكيل ويشمل الكتاب المقدس كاملًا</p>
        </div>
        <div id="bibleSearchResults"></div>
      </div>`;

    const input = document.getElementById('bibleSearchInput');
    const resultsBox = document.getElementById('bibleSearchResults');
    const hintEl = document.getElementById('bibleSearchHint');
    const chips = Array.from(document.querySelectorAll('.bible-scope-chip'));
    let scope = scope0;

    const runSearch = async () => {
      const q = input.value.trim();
      if (bibleNormalize(q).length < 2) {
        resultsBox.innerHTML = '';
        hintEl.textContent = 'اكتب كلمتين على الأقل — البحث يتجاهل التشكيل ويشمل الكتاب المقدس كاملًا';
        return;
      }
      hintEl.textContent = 'جارٍ البحث...';
      resultsBox.innerHTML = '';
      const out = await BibleSearch.run(q, scope, (done, total) => {
        if (page === this._page && hintEl.isConnected) {
          hintEl.textContent = `جارٍ البحث... (${done} من ${total})`;
        }
      });
      if (page !== this._page || !resultsBox.isConnected || out.cancelled) return;
      if (!out.results.length) {
        hintEl.textContent = 'انتهى البحث';
        const tafsirNote = scope === 'tafsir'
          ? '<p>لم يُضف محتوى التفسير بعد — جرّب البحث في الكتاب المقدس.</p>'
          : `<p>لا توجد نتائج مطابقة لـ "${bibleEscape(q)}"</p>`;
        resultsBox.innerHTML = `<div class="empty-state">${BIBLE_ICONS.empty}${tafsirNote}</div>`;
        return;
      }
      hintEl.textContent = out.truncated
        ? `عرض أول ${out.results.length} نتيجة — حدّد كلمات البحث أكثر لنتائج أدق`
        : `${out.results.length} نتيجة`;
      resultsBox.innerHTML = `<div class="bible-results">${out.results.map((r) => {
        if (r.type === 'verse') {
          return `
            <a href="#/bible/read/${r.bookId}/${r.chapter}?v=${r.verse}" class="bible-result">
              <span class="bible-result-ref">${bibleEscape(r.book)} ${r.chapter} : ${r.verse}</span>
              <span class="bible-result-text">${bibleHighlightSnippet(r.text, q)}</span>
            </a>`;
        }
        return `
          <a href="#/bible/tafsir/${r.bookId}/${r.chapter}" class="bible-result">
            <span class="bible-result-ref">تفسير ${bibleEscape(r.book)} — إصحاح ${r.chapter}${r.verses ? ` (الآيات ${bibleEscape(r.verses)})` : ''}</span>
            <span class="bible-result-text">${bibleHighlightSnippet(r.text, q)}</span>
          </a>`;
      }).join('')}</div>`;
    };

    let deb = null;
    input.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(runSearch, 600);
    });
    document.getElementById('bibleSearchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(deb);
      runSearch();
    });
    chips.forEach((chip) => chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      scope = chip.dataset.scope;
      runSearch();
    }));

    if (q0) runSearch();
  },
};
