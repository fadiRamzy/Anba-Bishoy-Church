/* ==========================================================================
   دليل الافتقاد — Beneficiary Visitation Directory (additive module).

   Tracks "افتقاد" (pastoral visits) per beneficiary. Visit records live on
   the SAME member record in the existing IndexedDB members store as:
       member.visits = ['YYYY-MM-DD', ...]   (deduplicated by date)
   kept deliberately separate from member.attendance — visitation never
   touches attendance history, and vice versa. No new object stores and no
   changes to existing screens other than an additive "سجل الافتقاد" section
   in the member profile (add/delete dates, Admin-authorised).

   Also exposes:
     • the shared OFFLINE table-PDF builder (simpleTablePdf) used by the
       Performance Indicators exports as well — same jsPDF/html2canvas
       pipeline as every other export in the app;
     • small visit helpers consumed by performance.js.
   ========================================================================== */

const VISIT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Strict calendar check (the regex alone would accept e.g. 2026-13-99). */
function isValidVisitDate(v) {
  if (!VISIT_DATE_RE.test(v)) return false;
  const [y, mo, d] = v.split('-').map(Number);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[mo - 1];
}

/* Normalized visit dates of a member: valid ISO strings, deduplicated,
   newest first. Read-only — never mutates the record. */
function visitDates(member) {
  const list = Array.isArray(member && member.visits) ? member.visits : [];
  const seen = new Set();
  const out = [];
  for (const d of list) {
    if (typeof d !== 'string') continue;
    const v = d.trim();
    if (!isValidVisitDate(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.sort((a, b) => b.localeCompare(a));
}
const visitCount = (member) => visitDates(member).length;
const isVisitedMember = (member) => visitCount(member) > 0;
const lastVisitDate = (member) => visitDates(member)[0] || '';
function visitTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const stripHTML = (html) => String(html || '').replace(/<[^>]*>/g, '');

/* Record one visit date for a member (duplicate same-date prevented). */
async function recordVisitDate(member, dateStr) {
  const v = String(dateStr || '').trim();
  if (!isValidVisitDate(v)) {
    showToast('من فضلك اختر تاريخًا صحيحًا', 'error');
    return false;
  }
  const list = visitDates(member);
  if (list.includes(v)) {
    showToast('هذا التاريخ مسجل بالفعل لنفس المخدوم', 'error');
    return false;
  }
  member.visits = [...list, v];
  await MembersDB.put(member);
  return true;
}
async function removeVisitDate(member, dateStr) {
  const list = visitDates(member);
  const idx = list.indexOf(dateStr);
  if (idx < 0) return false;
  list.splice(idx, 1);
  member.visits = list;
  await MembersDB.put(member);
  return true;
}

/* ==========================================================================
   Shared offline table→A4 PDF builder (same pipeline as the rest of the
   app: vendored jsPDF + html2canvas, Arabic-safe rasterized pages).
   opts = {
     title, subtitle,           // big lines in the maroon header
     note,                      // small line (date / filter summary)
     headers: [{ label, width, align? }],   // widths in %, must total 100
     rows: [[cellHtml, ...], ...],          // cell HTML (escaped by caller)
     filename,                  // e.g. 'دليل_الافتقاد_2026-11-22.pdf'
     landscape?: bool,          // default false (A4 portrait)
     rowsPerPage?: number,      // cap rows per page (default 24 portrait / 14 landscape)
     footerNote?: string,       // small line at the bottom of every page
   }
   A serial «م» column is prepended automatically.
   ========================================================================== */
async function simpleTablePdf(opts) {
  const landscape = !!opts.landscape;
  const PAGE_W = landscape ? 842 : 595;
  const PAGE_H = landscape ? 595 : 842;
  const MARGIN = 14;
  const HEAD_H = 66;
  const TABLE_TOP_GAP = 8;
  const THEAD_H = 30;
  const CONTENT_TOP = MARGIN + HEAD_H + TABLE_TOP_GAP;
  const CONTENT_H = PAGE_H - CONTENT_TOP - 26 - MARGIN; /* leave room for page footer */
  const BLOCK_TOP = CONTENT_TOP + THEAD_H;
  const BLOCK_H = PAGE_H - BLOCK_TOP - 26 - MARGIN;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const rowsCap = opts.rowsPerPage || (landscape ? 14 : 24);

  await _loadPdfLibs();
  const { jsPDF } = window.jspdf;

  const cellStyle = `border:1px solid #C7B9A6;padding:4px 6px;vertical-align:middle;font-size:8.5px;line-height:1.45;overflow-wrap:break-word;word-break:normal;hyphens:none;font-family:${PDF_FONT_STACK};`;
  const thBase = `background:#591420;color:#fff;border:1px solid #591420;font-weight:700;text-align:center;vertical-align:middle;padding:5px 3px;font-size:9px;line-height:1.4;overflow-wrap:break-word;font-family:${PDF_FONT_STACK};`;

  /* A report may carry several tables (sections) — each section gets its own
     headers/rows and a title line; serial numbers run continuously. */
  const sections = (Array.isArray(opts.sections) && opts.sections.length)
    ? opts.sections
    : [{ headers: opts.headers || [], rows: opts.rows || [], title: '' }];

  /* measure wrapped cell heights so no row is ever split across pages */
  const probe = document.createElement('div');
  probe.style.cssText = PDF_PROBE_BASE;
  document.body.appendChild(probe);
  const measureH = (text, width) => {
    probe.style.width = `${Math.max(10, width - PDF_CELL_PAD_X)}px`;
    probe.textContent = String(text || '');
    return probe.offsetHeight;
  };

  const packedSections = sections.map((section) => {
    const sourceHeaders = section.headers || [];
    const totalWidth = sourceHeaders.reduce((sum, h) => sum + (Number(h.width) || 0), 0) || 1;
    const headers = [{ label: 'م', width: 6, align: 'center' }, ...sourceHeaders.map((h) => ({ ...h, width: 94 * (Number(h.width) || 0) / totalWidth }))];
    const colW = headers.map((h) => (CONTENT_W * h.width) / 100);
    const measured = (section.rows || []).map((row) => {
      let h = 18;
      for (let i = 0; i < row.length; i += 1) {
        h = Math.max(h, measureH(stripHTML(row[i]), colW[i + 1]));
      }
      return { row, rowH: Math.ceil(h) + 2 };
    });
    /* bin-pack rows into pages (a section title line eats a little height) */
    const blockH = section.title ? Math.max(120, BLOCK_H - 24) : BLOCK_H;
    const pagesRows = [];
    let current = [];
    let currentH = 0;
    for (const item of measured) {
      if (current.length && (current.length >= rowsCap || currentH + item.rowH > blockH)) {
        pagesRows.push(current);
        current = [];
        currentH = 0;
      }
      current.push(item);
      currentH += item.rowH;
    }
    if (current.length) pagesRows.push(current);
    if (!pagesRows.length) pagesRows.push([]);
    return { headers, colW, pagesRows, title: section.title || '' };
  });
  probe.remove();

  const totalPages = packedSections.reduce((sum, s) => sum + s.pagesRows.length, 0);
  const pageFooterNote = opts.footerNote || 'كنيسة الأنبا بيشوي بالمنيا الجديدة';

  function pageHTML(section, pageItems, startSerial, pageIndex) {
    const { headers, colW } = section;
    const bodyRows = pageItems.map(({ row }, i) => {
      const serial = startSerial + i;
      const cells = row.map((cell, j) => {
        const align = headers[j + 1].align || 'start';
        const wrap = pdfCellWrap(stripHTML(cell), colW[j + 1]);
        return `<td style="${cellStyle}text-align:${align};${wrap}">${cell}</td>`;
      }).join('');
      return `<tr style="${i % 2 ? 'background:rgba(251,243,223,0.5);' : ''}"><td style="${cellStyle}text-align:center;font-weight:700;">${serial}</td>${cells}</tr>`;
    }).join('');
    const headCells = headers.map((h) => `<th style="${thBase}width:${h.width.toFixed(2)}%;text-align:${h.align || 'center'}">${escapeHTML(h.label)}</th>`).join('');
    return `
      <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:#FFFDF8;box-sizing:border-box;position:relative;overflow:hidden;direction:rtl;">
        <div style="position:absolute;inset:0;background-image:url('site-bg.jpg');background-size:cover;background-position:center;opacity:0.08;"></div>
        <div style="position:relative;padding:${MARGIN}px;">
          <div style="background:#591420;color:#fff;text-align:center;padding:7px 10px 8px;border-bottom:3px solid #AD8332;">
            <div style="font-family:${PDF_HEAD_FONT}font-size:15px;font-weight:700;line-height:1.5;">كنيســــة القديس العظيم الأنبــــا بيشوي - المنيا الجديدة</div>
            <div style="font-family:${PDF_FONT_STACK};font-size:12px;font-weight:800;margin-top:2px;color:#F6ECDC;">${escapeHTML(opts.title || '')}</div>
            ${opts.subtitle ? `<div style="font-family:${PDF_FONT_STACK};font-size:10px;font-weight:700;margin-top:2px;">${escapeHTML(opts.subtitle)}</div>` : ''}
          </div>
          ${opts.note ? `<div style="font-family:${PDF_FONT_STACK};font-size:8.5px;color:#6B5E4F;margin:6px 2px 0;display:flex;justify-content:space-between;gap:12px;"><span>${escapeHTML(opts.note)}</span><span>صفحة ${pageIndex + 1} من ${totalPages}</span></div>` : `<div style="font-family:${PDF_FONT_STACK};font-size:8.5px;color:#6B5E4F;margin:6px 2px 0;text-align:end;">صفحة ${pageIndex + 1} من ${totalPages}</div>`}
          ${section.title ? `<div style="font-family:${PDF_FONT_STACK};font-size:11px;font-weight:800;color:#591420;margin:8px 2px 0;">${escapeHTML(section.title)}</div>` : ''}
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:6px;">
            <thead><tr>${headCells}</tr></thead>
            <tbody>${bodyRows || `<tr><td colspan="${headers.length}" style="${cellStyle}text-align:center;color:#6B5E4F;padding:18px 6px;">لا توجد بيانات</td></tr>`}</tbody>
          </table>
          <div style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-family:${PDF_FONT_STACK};font-size:7.5px;color:#9A8B7A;">${escapeHTML(pageFooterNote)}</div>
        </div>
      </div>`;
  }

  let serial = 1;
  let pageIndex = 0;
  const pages = [];
  for (const section of packedSections) {
    for (const block of section.pagesRows) {
      const start = serial;
      serial += block.length;
      pages.push(pageHTML(section, block, start, pageIndex));
      pageIndex += 1;
    }
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  await _pdfRenderPages(pdf, pages, PAGE_W, PAGE_H);
  pdf.save(opts.filename || `تصدير_${Date.now()}.pdf`);
}

/* ==========================================================================
   دليل الافتقاد — the directory page
   ========================================================================== */
const iftSelection = new Set(); /* member ids picked for PDF export (session) */
let iftExporting = false;

async function renderIftiqad(params) {
  renderChrome(true);
  const members = await MembersDB.getAll();
  const view = (params && params.view === 'unvisited') ? 'unvisited' : 'visited';
  const q = ((params && params.q) || '').trim().toLowerCase();
  const fSector = (params && params.sector) || '';
  const fStage = (params && params.stage) || '';
  const fCity = (params && params.city) || '';
  const fNeighborhood = (params && params.neighborhood) || '';
  const fClass = (params && params.class) || '';

  const unique = (fn) => [...new Set(members.map((m) => (fn(m) || '').toString().trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ar'));
  const sectorOpts = unique((m) => m.sector);
  const stageOpts = unique((m) => m.stage);
  const cityOpts = unique((m) => m.city);
  const neighborhoodOpts = unique((m) => m.neighborhood);
  const classOpts = unique((m) => m.class);

  const optionTag = (value, current, label) => `<option value="${escapeHTML(value)}" ${value === current ? 'selected' : ''}>${escapeHTML(label || cleanLabel(value))}</option>`;
  const buildQuery = (extra) => qs(Object.assign({ view, q: q || undefined, sector: fSector || undefined, stage: fStage || undefined, city: fCity || undefined, neighborhood: fNeighborhood || undefined, class: fClass || undefined }, extra || {}));

  const visitedMembers = members.filter(isVisitedMember);
  const unvisitedMembers = members.filter((m) => !isVisitedMember(m));
  const viewList = view === 'visited' ? visitedMembers : unvisitedMembers;

  const today = visitTodayStr();
  const cards = viewList.map((m) => {
    const dates = visitDates(m);
    const last = dates[0] || '';
    const name = escapeHTML(m.name || '— بلا اسم');
    const classKey = `${(m.sector || '').toString().trim()}ￎ${(m.class || '').toString().trim()}`;
    const metaTop = [cleanLabel(m.sector), cleanLabel(m.class)].filter((x) => x && x !== '—').join(' · ');
    const metaStage = m.stage ? cleanLabel(m.stage) : '';
    const metaWhere = [cleanLabel(m.city), m.neighborhood].filter((x) => x && x !== '—').join(' · ');
    return `
      <div class="ift-card" data-id="${m.id}" data-name="${escapeHTML((m.name || '').toLowerCase())}" data-phone="${escapeHTML((((m.phone1 || '') + ' ' + (m.phone2 || ''))).toLowerCase())}" data-sector="${escapeHTML((m.sector || '').trim())}" data-stage="${escapeHTML((m.stage || '').trim())}" data-city="${escapeHTML((m.city || '').trim())}" data-neighborhood="${escapeHTML((m.neighborhood || '').trim())}" data-class="${escapeHTML((m.class || '').trim())}">
        <input type="checkbox" class="ift-pick" data-id="${m.id}" aria-label="تحديد ${name} للتصدير" />
        <a class="member-avatar ift-avatar" href="#/member/${m.id}" aria-hidden="true" tabindex="-1">${escapeHTML(initials(m.name))}</a>
        <div class="ift-info">
          <a class="member-name ift-name" href="#/member/${m.id}">${name}</a>
          <span class="member-meta">${escapeHTML([metaTop, metaStage].filter(Boolean).join(' · ') || '—')}</span>
          <span class="member-meta">${escapeHTML(metaWhere || '—')}</span>
          <span class="member-meta">${m.phone1 ? `<a class="ift-phone" href="tel:${escapeHTML(m.phone1)}" dir="ltr">${escapeHTML(m.phone1)}</a>` : '<span class="muted">بدون هاتف</span>'}</span>
          <span class="ift-visit-line">${last
            ? `آخر افتقاد: <strong dir="ltr">${escapeHTML(formatDMY(last))}</strong> · عدد مرات الافتقاد: <strong>${dates.length}</strong>`
            : 'لم يتم افتقاده بعد'}</span>
          <div class="ift-record-row">
            <input type="date" class="ift-date-input" value="${today}" max="${today}" aria-label="تاريخ الافتقاد" />
            <button type="button" class="btn btn-outline btn-sm ift-today-btn">${ICONS.calendar}<span>تاريخ اليوم</span></button>
            <button type="button" class="btn btn-primary btn-sm ift-add-btn">${ICONS.plus}<span>تسجيل افتقاد</span></button>
          </div>
        </div>
      </div>`;
  }).join('');

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>دليل الافتقاد</span></p>
      <h2 class="section-title">دليل الافتقاد</h2>
      <p class="section-sub">متابعة افتقاد المخدومين في كل القطاعات والفصول — سجّل تاريخ الافتقاد، ومن ثم تابع حالته من الملف الشخصي.</p>

      <div class="search-panel ift-search-panel">
        <div class="search-box">
          ${ICONS.search}
          <input type="text" id="iftSearch" placeholder="ابحث بالاسم أو رقم الهاتف..." value="${escapeHTML((params && params.q) || '')}" autocomplete="off" />
        </div>
      </div>

      <div class="filter-bar ift-filter-bar">
        <div class="field"><label for="iftSector">القطاع</label><select id="iftSector"><option value="">كل القطاعات</option>${sectorOpts.map((o) => optionTag(o, fSector)).join('')}</select></div>
        <div class="field"><label for="iftStage">المرحلة</label><select id="iftStage"><option value="">كل المراحل</option>${stageOpts.map((o) => optionTag(o, fStage)).join('')}</select></div>
        <div class="field"><label for="iftCity">المدينة</label><select id="iftCity"><option value="">كل المدن</option>${cityOpts.map((o) => optionTag(o, fCity)).join('')}</select></div>
        <div class="field"><label for="iftNeighborhood">الحي</label><select id="iftNeighborhood"><option value="">كل الأحياء</option>${neighborhoodOpts.map((o) => optionTag(o, fNeighborhood)).join('')}</select></div>
        <div class="field"><label for="iftClass">الفصل</label><select id="iftClass"><option value="">كل الفصول</option>${classOpts.map((o) => optionTag(o, fClass)).join('')}</select></div>
        <div class="field ift-clear-field"><label>&nbsp;</label><button type="button" class="btn btn-outline btn-sm" id="iftClearFilters">${ICONS.back}<span>مسح الفلاتر</span></button></div>
      </div>

      <div class="perf-tabs ift-views" role="tablist" aria-label="حالة الافتقاد">
        <a class="perf-tab${view === 'visited' ? ' active' : ''}" href="#/iftiqad?${buildQuery({ view: 'visited' })}" role="tab" aria-selected="${view === 'visited'}">تم افتقاده <b class="ift-view-count">${visitedMembers.length}</b></a>
        <a class="perf-tab${view === 'unvisited' ? ' active' : ''}" href="#/iftiqad?${buildQuery({ view: 'unvisited' })}" role="tab" aria-selected="${view === 'unvisited'}">لم يتم افتقاده <b class="ift-view-count">${unvisitedMembers.length}</b></a>
      </div>

      <div class="perf-export-bar ift-export-bar">
        <label class="perf-pick-all"><input type="checkbox" id="iftPickAll" /><span>تحديد الكل المعروض</span></label>
        <span class="perf-selected-count" id="iftSelectedCount">0 محدد</span>
        <button type="button" class="btn btn-outline btn-sm" id="iftExportSelected">${ICONS.download}<span>تصدير المحدد PDF</span></button>
        <button type="button" class="btn btn-gold btn-sm" id="iftExportFiltered">${ICONS.download}<span>تصدير المعروض PDF</span></button>
      </div>

      <div class="member-list ift-list" id="iftList">
        ${cards || `<div class="empty-state">${ICONS.empty}<p>${view === 'visited' ? 'لا يوجد مخدومون تم افتقادهم بعد' : 'لا يوجد مخدومون — الكل تم افتقاده 🎉'}</p></div>`}
      </div>
      <p class="perf-footnote">تُحفظ تواريخ الافتقاد داخل الملف الشخصي لكل مخدوم — وتمنع الوحدة تسجيل نفس التاريخ مرتين لنفس المخدوم. المؤشرات تُحدَّث تلقائيًا مع أي إضافة أو حذف.</p>
    </div>`;

  const listEl = document.getElementById('iftList');
  const searchEl = document.getElementById('iftSearch');

  /* ---- client-side search + select filters (rows already rendered) ---- */
  const applyFilter = () => {
    const term = (searchEl.value || '').trim().toLowerCase();
    const sector = document.getElementById('iftSector').value;
    const stage = document.getElementById('iftStage').value;
    const city = document.getElementById('iftCity').value;
    const neighborhood = document.getElementById('iftNeighborhood').value;
    const cls = document.getElementById('iftClass').value;
    let visible = 0;
    listEl.querySelectorAll('.ift-card').forEach((card) => {
      const d = card.dataset;
      const okQ = !term || d.name.includes(term) || d.phone.includes(term);
      const ok = okQ && (!sector || d.sector === sector) && (!stage || d.stage === stage) && (!city || d.city === city) && (!neighborhood || d.neighborhood === neighborhood) && (!cls || d.class === cls);
      card.style.display = ok ? '' : 'none';
      if (ok) visible += 1;
    });
    const emptyEl = listEl.querySelector('.empty-state');
    if (visible === 0 && !emptyEl) {
      listEl.insertAdjacentHTML('beforeend', `<div class="empty-state ift-empty-filtered">${ICONS.empty}<p>لا توجد نتائج مطابقة للفلاتر الحالية</p></div>`);
    } else if (visible > 0) {
      const ef = listEl.querySelector('.ift-empty-filtered');
      if (ef) ef.remove();
    }
    syncPickAll();
  };
  searchEl.addEventListener('input', debounce(applyFilter, 180));
  ['iftSector', 'iftStage', 'iftCity', 'iftNeighborhood', 'iftClass'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      /* keep the view + all filters in the URL so reloads/back keep state */
      navigate(`/iftiqad?${buildQuery({ [id === 'iftSector' ? 'sector' : id === 'iftStage' ? 'stage' : id === 'iftCity' ? 'city' : id === 'iftNeighborhood' ? 'neighborhood' : 'class']: document.getElementById(id).value || undefined, q: searchEl.value.trim() || undefined })}`);
    });
  });
  document.getElementById('iftClearFilters').addEventListener('click', () => navigate('/iftiqad'));

  /* ---- selection (for PDF export) ---- */
  const selectedCountEl = document.getElementById('iftSelectedCount');
  const pickAll = document.getElementById('iftPickAll');
  const syncSelectedCount = () => { selectedCountEl.textContent = `${iftSelection.size} محدد`; };
  const syncPickAll = () => {
    const boxes = [...listEl.querySelectorAll('.ift-pick')].filter((b) => b.closest('.ift-card').style.display !== 'none');
    pickAll.checked = boxes.length > 0 && boxes.every((b) => b.checked);
    pickAll.indeterminate = !pickAll.checked && boxes.some((b) => b.checked);
  };
  listEl.querySelectorAll('.ift-pick').forEach((box) => {
    const id = Number(box.dataset.id);
    box.checked = iftSelection.has(id);
    box.addEventListener('change', () => {
      if (box.checked) iftSelection.add(id); else iftSelection.delete(id);
      syncSelectedCount();
      syncPickAll();
    });
  });
  pickAll.addEventListener('change', () => {
    listEl.querySelectorAll('.ift-pick').forEach((box) => {
      if (box.closest('.ift-card').style.display === 'none') return;
      box.checked = pickAll.checked;
      const id = Number(box.dataset.id);
      if (pickAll.checked) iftSelection.add(id); else iftSelection.delete(id);
    });
    syncSelectedCount();
  });
  syncSelectedCount();
  applyFilter(); /* pre-apply URL filters + restored search on load */

  /* ---- register visit (Admin-authorised) ---- */
  const rerender = () => renderIftiqad(params);
  const addVisit = async (card, dateStr) => {
    const id = Number(card.dataset.id);
    const member = members.find((m) => String(m.id) === String(id));
    if (!member) return;
    if (!(await Admin.require())) return;
    const ok = await recordVisitDate(member, dateStr);
    if (ok) {
      showToast('تم تسجيل الافتقاد', 'success');
      rerender();
    }
  };
  listEl.querySelectorAll('.ift-card').forEach((card) => {
    const input = card.querySelector('.ift-date-input');
    card.querySelector('.ift-add-btn').addEventListener('click', () => addVisit(card, input.value));
    card.querySelector('.ift-today-btn').addEventListener('click', () => addVisit(card, visitTodayStr()));
  });

  /* ---- PDF export ---- */
  const collectFiltered = () => {
    const term = (searchEl.value || '').trim().toLowerCase();
    const sector = document.getElementById('iftSector').value;
    const stage = document.getElementById('iftStage').value;
    const city = document.getElementById('iftCity').value;
    const neighborhood = document.getElementById('iftNeighborhood').value;
    const cls = document.getElementById('iftClass').value;
    return viewList.filter((m) => {
      const okQ = !term || (m.name || '').toLowerCase().includes(term) || `${m.phone1 || ''} ${m.phone2 || ''}`.toLowerCase().includes(term);
      return okQ && (!sector || (m.sector || '').trim() === sector) && (!stage || (m.stage || '').trim() === stage)
        && (!city || (m.city || '').trim() === city) && (!neighborhood || (m.neighborhood || '').trim() === neighborhood) && (!cls || (m.class || '').trim() === cls);
    });
  };
  const exportPdf = async (which, btn) => {
    if (iftExporting) return;
    const list = which === 'selected' ? members.filter((m) => iftSelection.has(String(m.id)) || iftSelection.has(m.id)) : collectFiltered();
    if (!list.length) {
      showToast(which === 'selected' ? 'لم يتم تحديد أي مخدوم للتصدير' : 'لا توجد نتائج مطابقة للفلاتر الحالية', 'error');
      return;
    }
    iftExporting = true;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>جاري التجهيز...</span>';
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const rows = list.map((m) => {
        const dates = visitDates(m);
        const name = escapeHTML(m.name || '—');
        return [
          `<span style="font-weight:700;">${name}</span>`,
          escapeHTML(cleanLabel(m.sector) || '—'),
          escapeHTML(cleanLabel(m.stage) || '—'),
          escapeHTML(cleanLabel(m.class) || '—'),
          escapeHTML(cleanLabel(m.city) || '—'),
          escapeHTML(m.neighborhood || '—'),
          `<span dir="ltr">${escapeHTML(m.phone1 || '—')}</span>`,
          dates.length ? `<span dir="ltr">${escapeHTML(formatDMY(dates[0]))}</span>` : 'لم يتم افتقاده',
          `<span style="text-align:center;">${dates.length}</span>`,
          dates.length ? `<span dir="ltr" style="font-size:7.5px;">${dates.map((d) => escapeHTML(formatDMY(d))).join('، ')}</span>` : '—',
        ];
      });
      const viewLabel = view === 'visited' ? 'المخدومون الذين تم افتقادهم' : 'المخدومون الذين لم يتم افتقادهم';
      const filterBits = [
        fSector && `القطاع: ${cleanLabel(fSector)}`,
        fStage && `المرحلة: ${cleanLabel(fStage)}`,
        fCity && `المدينة: ${cleanLabel(fCity)}`,
        fNeighborhood && `الحي: ${fNeighborhood}`,
        fClass && `الفصل: ${cleanLabel(fClass)}`,
        q && `بحث: ${q}`,
      ].filter(Boolean).join(' · ');
      await simpleTablePdf({
        title: 'دليل الافتقاد',
        subtitle: viewLabel + (which === 'selected' ? ' — المحددون فقط' : ''),
        note: `تاريخ الإصدار: ${formatDMY(today)} — عدد المخدومين: ${list.length}${filterBits ? ` — ${filterBits}` : ''}`,
        landscape: true,
        headers: [
          { label: 'الاسم', width: 16 },
          { label: 'القطاع', width: 9 },
          { label: 'المرحلة', width: 8 },
          { label: 'الفصل', width: 9 },
          { label: 'المدينة', width: 8 },
          { label: 'الحي', width: 9 },
          { label: 'الموبايل', width: 10, align: 'center' },
          { label: 'آخر افتقاد', width: 8, align: 'center' },
          { label: 'عدد مرات الافتقاد', width: 6, align: 'center' },
          { label: 'كل التواريخ', width: 17 },
        ],
        rows,
        filename: `دليل_الافتقاد_${view === 'visited' ? 'تم_افتقاده' : 'لم_يتم_افتقاده'}_${stamp}.pdf`,
      });
      showToast('تم تصدير ملف PDF', 'success');
    } catch (err) {
      console.error('PDF generation failed:', err);
      showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
    } finally {
      iftExporting = false;
      btn.disabled = false;
      btn.innerHTML = original;
    }
  };
  document.getElementById('iftExportFiltered').addEventListener('click', (e) => exportPdf('filtered', e.currentTarget));
  document.getElementById('iftExportSelected').addEventListener('click', (e) => exportPdf('selected', e.currentTarget));
}
