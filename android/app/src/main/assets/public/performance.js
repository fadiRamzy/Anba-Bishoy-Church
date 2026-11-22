/* ==========================================================================
   مؤشر قياس الأداء — Performance Indicators (additive module).
   Reads the SAME members store and the SAME attendance records used by the
   rest of the app (single data source — never duplicates or forks data).
   No new object stores, no changes to existing screens or workflows.

   Two module-local roles, enforced in JS and at every render boundary:
     أمين خدمة  (full access to every level + add/edit/delete in-module)
     خادم       (class-level indicators + incomplete-data reports +
                 editing existing beneficiary info to COMPLETE MISSING
                 fields only — never deleting, never overwriting data)
   Passwords are stored only as SHA-256 hashes, same architecture as the
   existing Admin/Services gates (sessionStorage unlock flag per tab —
   nothing is stored in plaintext, anywhere).                          */

const PERF_PIN_HASHES = {
  amin: 'f8d64a31eb7d864da9252b7e5dd2659229cf1a3c4bf9d6d544c0318c81e13cff',
  khadim: '034c5253b305b3105104304670429ff4cf6a502d5732ecef2f511f0582a04584',
};

const PERF_ROLES = {
  amin: { key: 'amin', label: 'أمين خدمة', full: true },
  khadim: { key: 'khadim', label: 'خادم', full: false },
};

const PerformanceAuth = {
  unlockedKey: 'perf_unlocked_role',
  role() { return sessionStorage.getItem(this.unlockedKey); },
  isUnlocked() { return !!this.role(); },
  lock() { sessionStorage.removeItem(this.unlockedKey); },
  promptRole(roleKey) {
    const role = PERF_ROLES[roleKey];
    if (!role) return Promise.resolve(false);
    return new Promise((resolve) => {
      openPinModal({
        title: `مؤشر قياس الأداء — ${role.label}`,
        message: `من فضلك أدخل كلمة مرور «${role.label}» للدخول.`,
        confirmLabel: 'دخول',
        onSubmit: async (pin, close) => {
          const hash = await sha256Hex(pin || '');
          if (hash !== PERF_PIN_HASHES[roleKey]) return 'كلمة المرور غير صحيحة';
          sessionStorage.setItem(this.unlockedKey, roleKey);
          close();
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Statistics helpers (actual attendance records only, never estimates) */
/* ------------------------------------------------------------------ */
function perfAttendanceRecords(m) {
  return Array.isArray(m.attendance) ? m.attendance.filter((r) => r && typeof r.date === 'string') : [];
}
function perfTotals(members) {
  let records = 0, present = 0;
  for (const m of members) {
    const list = perfAttendanceRecords(m);
    records += list.length;
    for (const r of list) if (r.present === true) present += 1;
  }
  const absent = records - present;
  const pctPresent = records ? (present / records) * 100 : null;
  const pctAbsent = records ? (absent / records) * 100 : null;
  return { count: members.length, records, present, absent, pctPresent, pctAbsent };
}
const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
const fmtPct = (p) => (p === null || !isFinite(p) ? '—' : `${p.toFixed(1)}%`);

function perfGroup(members, keyFn, labelFn) {
  const map = new Map();
  for (const m of members) {
    const raw = (keyFn(m) || '').toString().trim();
    const gk = raw || '— غير محدد';
    if (!map.has(gk)) map.set(gk, []);
    map.get(gk).push(m);
  }
  return [...map.entries()]
    .map(([key, group]) => ({ key, label: labelFn ? labelFn(key, group) : key, ...perfTotals(group) }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'ar'));
}
const perfClassKey = (m) => `${(m.sector || '').toString().trim()}ￎ${(m.class || '').toString().trim()}`;
const perfClassLabel = (key) => {
  const [sector, cls] = key.split('ￎ');
  return `${sector && sector !== '— غير محدد' ? cleanLabel(sector) : '— غير محدد'} · ${cls && cls !== '— غير محدد' ? cleanLabel(cls) : '— غير محدد'}`;
};

/* Required profile fields — presence checks mirror the registration form
   (name is the only mandatory field there plus these below). Phone satisfied
   by EITHER phone number. Optional (phone2, notes) never flagged.        */
const PERF_REQUIRED_FIELDS = [
  { key: 'name', label: 'الاسم' },
  { key: 'phone', label: 'رقم الموبايل (واحد على الأقل)', isMissing: (m) => !(String(m.phone1 || '').trim() || String(m.phone2 || '').trim()) },
  { key: 'street', label: 'العنوان / الشارع' },
  { key: 'locationLink', label: 'الموقع على الخريطة (لوكيشن)' },
  { key: 'sector', label: 'القطاع' },
  { key: 'stage', label: 'المرحلة' },
  { key: 'city', label: 'المدينة' },
  { key: 'neighborhood', label: 'الحي' },
  { key: 'class', label: 'الفصل' },
];
function perfMissingFields(m) {
  return PERF_REQUIRED_FIELDS.filter((f) => (f.isMissing ? f.isMissing(m) : !String(m[f.key] || '').trim()));
}

function perfIncomplete(members) {
  return members
    .map((m) => ({ member: m, missing: perfMissingFields(m) }))
    .filter((x) => x.missing.length > 0)
    .sort((a, b) => b.missing.length - a.missing.length || String(a.member.name || '').localeCompare(String(b.member.name || ''), 'ar'));
}

const PERF_TABS = {
  overview: { label: 'نظرة عامة', full: true },
  sectors: { label: 'القطاع', full: true },
  stages: { label: 'المرحلة', full: true },
  cities: { label: 'المدينة', full: true },
  neighborhoods: { label: 'الحي', full: true },
  classes: { label: 'الفصل', full: false },
  individuals: { label: 'المخدومون', full: false },
  incomplete: { label: 'البيانات غير المكتملة', full: false },
};
const PERF_TAB_ORDER_AMIN = ['overview', 'sectors', 'stages', 'cities', 'neighborhoods', 'classes', 'individuals', 'incomplete'];
const PERF_TAB_ORDER_KHADIM = ['classes', 'individuals', 'incomplete'];

/* Percentage cell with a tiny inline bar — simple visual indicator. */
function perfPctCell(p, kind) {
  if (p === null) return '<td class="perf-num">—</td>';
  const width = Math.max(0, Math.min(100, p));
  return `<td class="perf-num"><span class="perf-pct ${kind}"><span class="perf-pct-bar" style="width:${width.toFixed(1)}%"></span><span class="perf-pct-val">${p.toFixed(1)}%</span></span></td>`;
}
function perfGroupTable(groups, headerLabel) {
  const rows = groups.map((g) => `
    <tr>
      <td class="perf-group">${escapeHTML(g.label)}</td>
      <td class="perf-num">${fmtNum(g.count)}</td>
      ${perfPctCell(g.pctPresent, 'is-good')}
      ${perfPctCell(g.pctAbsent, 'is-bad')}
      <td class="perf-num">${fmtNum(g.present)}</td>
      <td class="perf-num">${fmtNum(g.absent)}</td>
      <td class="perf-num">${fmtNum(g.records)}</td>
    </tr>`).join('');
  const tot = groups.reduce((acc, g) => ({
    count: acc.count + g.count, records: acc.records + g.records,
    present: acc.present + g.present, absent: acc.absent + g.absent,
  }), { count: 0, records: 0, present: 0, absent: 0 });
  tot.pctPresent = tot.records ? (tot.present / tot.records) * 100 : null;
  tot.pctAbsent = tot.records ? (tot.absent / tot.records) * 100 : null;
  return `
  <div class="perf-table-wrap">
    <table class="perf-table">
      <thead><tr><th>${escapeHTML(headerLabel)}</th><th>المخدومون</th><th>% حضور</th><th>% غياب</th><th>أيام الحضور</th><th>أيام الغياب</th><th>إجمالي السجلات</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="perf-empty">لا توجد بيانات مسجلة</td></tr>`}</tbody>
      <tfoot><tr><th>الإجمالي</th><th class="perf-num">${fmtNum(tot.count)}</th>${tot.records ? `<th class="perf-num">${tot.pctPresent.toFixed(1)}%</th><th class="perf-num">${tot.pctAbsent.toFixed(1)}%</th>` : '<th class="perf-num">—</th><th class="perf-num">—</th>'}<th class="perf-num">${fmtNum(tot.present)}</th><th class="perf-num">${fmtNum(tot.absent)}</th><th class="perf-num">${fmtNum(tot.records)}</th></tr></tfoot>
    </table>
  </div>`;
}

function perfStatCard(value, label, sub, kind) {
  return `<div class="perf-stat ${kind || ''}"><div class="perf-stat-value">${value}</div><div class="perf-stat-label">${escapeHTML(label)}</div>${sub ? `<div class="perf-stat-sub">${escapeHTML(sub)}</div>` : ''}</div>`;
}

/* ==========================================================================
   Router entry point                                                     */
/* ========================================================================== */
async function renderPerformance(params) {
  renderChrome(true);
  const members = await MembersDB.getAll();

  /* ----- auth gate ----- */
  if (!PerformanceAuth.isUnlocked()) {
    APP_ROOT.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>مؤشر قياس الأداء</span></p>
        <h2 class="section-title">مؤشر قياس الأداء</h2>
        <p class="section-sub">لوحة مؤشرات قياس الأداء — للمعدنيين المصرّح لهم فقط. اختر نوع الدخول:</p>
        <div class="perf-gate">
          <button type="button" class="perf-role-card" data-role="amin">
            <span class="perf-role-icon">${ICONS.unlock}</span>
            <span class="perf-role-name">أمين خدمة</span>
            <span class="perf-role-desc">دخول كامل لكل المؤشرات والمستويات + تقارير البيانات غير المكتملة + الإضافة والتعديل والحذف داخل هذا القسم.</span>
          </button>
          <button type="button" class="perf-role-card" data-role="khadim">
            <span class="perf-role-icon">${ICONS.users}</span>
            <span class="perf-role-name">خادم</span>
            <span class="perf-role-desc">مؤشرات مستوى الفصل فقط + تقارير البيانات غير المكتملة + إكمال الحقول الناقصة للمخدومين (بدون حذف وبدون بقية المستويات).</span>
          </button>
        </div>
        <p class="perf-gate-note">الوصول مصرّح به للمعدنيين فقط — كل جلسة دخول مرتبطة بالجلسة الحالية للمتصفح.</p>
      </div>`;
    APP_ROOT.querySelectorAll('.perf-role-card').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await PerformanceAuth.promptRole(btn.dataset.role);
        if (ok) renderPerformance(parseHash().params);
      });
    });
    return;
  }

  const roleKey = PerformanceAuth.role();
  const role = PERF_ROLES[roleKey] || PERF_ROLES.khadim;
  const isAmin = role.full === true;

  const allowedTabs = isAmin ? PERF_TAB_ORDER_AMIN : PERF_TAB_ORDER_KHADIM;
  const requested = (params && params.tab) || '';
  const tab = allowedTabs.includes(requested) ? requested : allowedTabs[0];
  const fieldFilter = (params && params.field) || '';
  const qFilter = (params && params.q || '').trim().toLowerCase();
  const classFilter = (params && params.class) || '';

  /* ----- module chrome (title + tabs + lock) ----- */
  const tabsHtml = allowedTabs.map((key) => {
    const t = PERF_TABS[key];
    const active = key === tab;
    const href = `#/performance?${qs({ tab: key })}`;
    return `<a class="perf-tab${active ? ' active' : ''}" href="${href}" aria-current="${active ? 'page' : 'false'}">${escapeHTML(t.label)}</a>`;
  }).join('');

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>مؤشر قياس الأداء</span></p>
      <div class="perf-head">
        <div>
          <h2 class="section-title" style="margin-bottom:2px;">مؤشر قياس الأداء</h2>
          <p class="section-sub" style="margin:0;">${isAmin ? 'دخول أمين خدمة — صلاحية كاملة داخل هذا القسم' : 'دخول خادم — مؤشرات مستوى الفصل والبيانات غير المكتملة فقط'}</p>
        </div>
        <div class="perf-head-actions">
          ${isAmin ? `<a class="btn btn-primary btn-sm" href="#/add">${ICONS.plus}<span>إضافة مخدوم</span></a>` : ''}
          <button type="button" class="btn btn-outline btn-sm" id="perfLockBtn">${ICONS.lock}<span>قفل</span></button>
        </div>
      </div>
      <div class="perf-tabs" role="tablist">${tabsHtml}</div>
      <div id="perfBody"></div>
    </div>`;
  document.getElementById('perfLockBtn').addEventListener('click', () => { PerformanceAuth.lock(); renderPerformance({}); });

  const body = document.getElementById('perfBody');
  const total = perfTotals(members);
  const servants = members.filter((m) => (m.stage || '').toString().trim() === 'مدرسة الشمامسة - معهد الالحان');

  /* ======================= نظرة عامة (أمين) ======================= */
  if (tab === 'overview') {
    body.innerHTML = `
      <div class="perf-stat-grid">
        ${perfStatCard(fmtNum(total.count), 'إجمالي المخدومين', 'المسجّلون في قاعدة البيانات')}
        ${perfStatCard(fmtNum(servants.length), 'الخدام والخادمات', 'مرحلة مدرسة الشمامسة – معهد الالحان')}
        ${perfStatCard(fmtPct(total.pctPresent), 'نسبة الحضور', 'من إجمالي سجلات الحضور', total.pctPresent === null ? '' : 'is-good')}
        ${perfStatCard(fmtPct(total.pctAbsent), 'نسبة الغياب', 'من إجمالي سجلات الحضور', total.pctAbsent === null ? '' : 'is-bad')}
        ${perfStatCard(fmtNum(total.records), 'إجمالي سجلات الحضور', 'أيام مسجلة لكل المخدومين')}
        ${perfStatCard(fmtNum(total.absent), 'إجمالي أيام الغياب', 'سجلات بحالة غياب')}
      </div>
      <p class="perf-footnote">المؤشرات محسوبة من سجلات الحضور الفعلية المحفوظة لكل مخدوم — تُحدَّث تلقائيًا مع كل تسجيل أو حذف أو تعديل.</p>`;
    return;
  }

  /* ======================= جداول المستويات ======================= */
  const levelConfigs = {
    sectors: { header: 'القطاع', keyFn: (m) => m.sector, labelFn: (k) => cleanLabel(k) },
    stages: { header: 'المرحلة', keyFn: (m) => m.stage, labelFn: (k) => cleanLabel(k) },
    cities: { header: 'المدينة', keyFn: (m) => m.city, labelFn: (k) => cleanLabel(k) },
    neighborhoods: { header: 'الحي', keyFn: (m) => m.neighborhood, labelFn: (k) => cleanLabel(k) },
    classes: { header: 'القطاع · الفصل', keyFn: perfClassKey, labelFn: (k) => perfClassLabel(k) },
  };
  if (levelConfigs[tab]) {
    const cfg = levelConfigs[tab];
    const groups = perfGroup(members, cfg.keyFn, cfg.labelFn);
    body.innerHTML = perfGroupTable(groups, cfg.header);
    return;
  }

  /* ======================= المخدومون (فردي) ======================= */
  if (tab === 'individuals') {
    const peers = new Map();
    for (const m of members) {
      const k = perfClassKey(m);
      if (!peers.has(k)) peers.set(k, []);
      peers.get(k).push(m);
    }
    const classOptions = [...peers.keys()].sort((a, b) => perfClassLabel(a).localeCompare(perfClassLabel(b), 'ar'));
    const classOptionsHtml = ['<option value="">كل الفصول</option>']
      .concat(classOptions.map((k) => `<option value="${escapeHTML(k)}" ${k === classFilter ? 'selected' : ''}>${escapeHTML(perfClassLabel(k))}</option>`))
      .join('');

    const rows = members.map((m) => {
      const list = perfAttendanceRecords(m);
      const present = list.filter((r) => r.present === true).length;
      const absent = list.length - present;
      const pct = list.length ? (present / list.length) * 100 : null;
      const classKey = perfClassKey(m);
      const peerList = peers.get(classKey) || [];
      let compare;
      if (peerList.length <= 1) compare = 'لا توجد مقارنة داخل الفصل';
      else {
        const peerPcts = peerList.map((p) => {
          const pl = perfAttendanceRecords(p);
          const pp = pl.filter((r) => r.present === true).length;
          return pl.length ? (pp / pl.length) * 100 : 0;
        });
        const mine = pct === null ? 0 : pct;
        const rank = 1 + peerPcts.filter((p) => p > mine).length;
        const better = peerPcts.filter((p) => p < mine).length;
        const share = Math.round((better / peerList.length) * 100);
        compare = `المركز ${rank} من ${peerList.length} · أعلى من ${share}% من فصله`;
      }
      const name = escapeHTML(m.name || '— بلا اسم');
      const classLabel = escapeHTML(perfClassLabel(classKey));
      const missing = perfMissingFields(m);
      return `
        <tr data-name="${escapeHTML((m.name || '').toLowerCase())}" data-phone="${escapeHTML(((m.phone1 || '') + ' ' + (m.phone2 || '')).toLowerCase())}" data-class="${escapeHTML(classKey)}">
          <td class="perf-group"><a class="perf-member-link" href="#/member/${m.id}">${name}</a></td>
          <td class="perf-meta">${classLabel}</td>
          <td class="perf-num">${fmtNum(present)}</td>
          <td class="perf-num">${fmtNum(absent)}</td>
          <td class="perf-num">${fmtPct(pct)}</td>
          <td class="perf-meta">${escapeHTML(compare)}</td>
          <td class="perf-actions"><button type="button" class="btn btn-outline btn-sm perf-edit-btn" data-id="${m.id}">${missing.length ? 'إكمال البيانات' : 'تعديل'}</button></td>
        </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="perf-controls">
        <input type="text" id="perfSearch" class="perf-search" placeholder="ابحث بالاسم أو رقم الهاتف..." value="${escapeHTML(params.q || '')}" autocomplete="off" />
        <select id="perfClassFilter" class="perf-class-filter">${classOptionsHtml}</select>
      </div>
      <div class="perf-table-wrap">
        <table class="perf-table">
          <thead><tr><th>المخدوم</th><th>القطاع · الفصل</th><th>أيام الحضور</th><th>أيام الغياب</th><th>% حضور</th><th>المقارنة داخل الفصل</th><th></th></tr></thead>
          <tbody id="perfIndividualRows">${rows || `<tr><td colspan="7" class="perf-empty">لا توجد سجلات مخدومين بعد</td></tr>`}</tbody>
        </table>
      </div>`;
    const tbody = body.querySelector('#perfIndividualRows');
    const applyFilter = () => {
      const q = (body.querySelector('#perfSearch').value || '').trim().toLowerCase();
      const cls = body.querySelector('#perfClassFilter').value;
      tbody.querySelectorAll('tr[data-class]').forEach((row) => {
        const okClass = !cls || row.dataset.class === cls;
        const okQ = !q || row.dataset.name.includes(q) || row.dataset.phone.includes(q);
        row.style.display = okClass && okQ ? '' : 'none';
      });
    };
    body.querySelector('#perfSearch').addEventListener('input', debounce(applyFilter, 200));
    body.querySelector('#perfClassFilter').addEventListener('change', applyFilter);
    body.querySelectorAll('.perf-edit-btn').forEach((btn) => btn.addEventListener('click', () => {
      const member = members.find((m) => String(m.id) === String(btn.dataset.id));
      if (member) openPerfEditModal(member, role, params);
    }));
    if (classFilter || qFilter) applyFilter();
    return;
  }

  /* ======================= البيانات غير المكتملة ======================= */
  if (tab === 'incomplete') {
    const incomplete = perfIncomplete(members);
    const byField = new Map();
    for (const x of incomplete) for (const f of x.missing) byField.set(f.key, (byField.get(f.key) || 0) + 1);
    const fieldChips = PERF_REQUIRED_FIELDS
      .filter((f) => byField.get(f.key))
      .map((f) => {
        const active = fieldFilter === f.key;
        const href = `#/performance?${qs({ tab: 'incomplete', field: active ? undefined : f.key })}`;
        return `<a class="perf-chip${active ? ' active' : ''}" href="${href}">${escapeHTML(f.label)} <b>${fmtNum(byField.get(f.key))}</b></a>`;
      })
      .concat(fieldFilter ? [`<a class="perf-chip perf-chip-clear" href="#/performance?${qs({ tab: 'incomplete' })}">✕ مسح الفلتر</a>`] : [])
      .join('');
    const shown = fieldFilter ? incomplete.filter((x) => x.missing.some((f) => f.key === fieldFilter)) : incomplete;

    const rows = shown.map(({ member, missing }) => `
      <tr>
        <td class="perf-group"><a class="perf-member-link" href="#/member/${member.id}">${escapeHTML(member.name || '— بلا اسم')}</a></td>
        <td class="perf-meta">${escapeHTML([cleanLabel(member.sector || ''), cleanLabel(member.class || '')].filter(Boolean).join(' · ') || '—')}</td>
        <td class="perf-missing-cell">${missing.map((f) => `<span class="perf-missing">${escapeHTML(f.label)}</span>`).join('')}</td>
        <td class="perf-actions">
          <a class="btn btn-outline btn-sm" href="#/member/${member.id}">فتح الملف</a>
          <button type="button" class="btn btn-primary btn-sm perf-edit-btn" data-id="${member.id}">إكمال البيانات</button>
        </td>
      </tr>`).join('');

    body.innerHTML = `
      <div class="perf-stat-grid perf-stat-grid-sm">
        ${perfStatCard(fmtNum(incomplete.length), 'ملفات غير مكتملة', `من إجمالي ${fmtNum(members.length)} مسجلًا`, 'is-warn')}
        ${perfStatCard(fmtNum(members.length - incomplete.length), 'ملفات مكتملة', 'البيانات المطلوبة موجودة', 'is-good')}
      </div>
      <div class="perf-field-chips">${fieldChips || '<span class="perf-empty">لا توجد حقول ناقصة — كل الملفات مكتملة 🎉</span>'}</div>
      <div class="perf-table-wrap">
        <table class="perf-table">
          <thead><tr><th>المخدوم</th><th>القطاع · الفصل</th><th>الحقول الناقصة</th><th>الإجراء</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4" class="perf-empty">لا توجد ملفات غير مكتملة بهذا الفلتر</td></tr>`}</tbody>
        </table>
      </div>`;
    body.querySelectorAll('.perf-edit-btn').forEach((btn) => btn.addEventListener('click', () => {
      const member = members.find((m) => String(m.id) === String(btn.dataset.id));
      if (member) openPerfEditModal(member, role, params);
    }));
    return;
  }
}

/* ==========================================================================
   Quick edit — complete/edit a beneficiary record from inside this module.
   أمين خدمة : edits any field (and can delete).
   خادم      : fills ONLY the missing fields — fields already holding a
               value are read-only, nothing can be overwritten or deleted. */
/* ========================================================================== */
function openPerfEditModal(member, role, params) {
  const isAmin = role && role.full === true;
  const missing = perfMissingFields(member);
  const missingKeys = new Set(missing.map((f) => f.key));
  const incomplete = missing.length > 0;

  const fieldRow = (key, label, inputHtml, missingField) => {
    const editable = isAmin || !String(member[key] || '').trim() || missingField;
    return `<div class="field perf-field${editable ? '' : ' is-locked-field'}">
      <label for="perf_${key}">${escapeHTML(label)}${missingField ? ' <span class="req">*</span>' : ''}</label>
      ${inputHtml(key, editable)}
      ${editable ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
    </div>`;
  };
  const textInput = (key, editable, type) => `<input type="${type || 'text'}" id="perf_${key}" value="${escapeHTML(member[key] || '')}" ${editable ? '' : 'disabled'} />`;
  const opts = (list, selected) => ['<option value="">— اختر —</option>']
    .concat(list.map((o) => `<option value="${escapeHTML(o)}" ${o === selected ? 'selected' : ''}>${escapeHTML(cleanLabel(o))}</option>`))
    .join('');
  const stageEditable = isAmin || missingKeys.has('stage');
  const sectorEditable = isAmin || missingKeys.has('sector');
  const classEditable = isAmin || missingKeys.has('class');

  const bodyHtml = `
    <div class="form-grid perf-form-grid">
      ${fieldRow('name', 'الاسم', (k, e) => textInput(k, e), missingKeys.has('name'))}
      <div class="field"><label for="perf_phone1">رقم الموبايل <span class="req">*</span></label>
        <input type="tel" id="perf_phone1" value="${escapeHTML(member.phone1 || '')}" ${isAmin || !String(member.phone1 || '').trim() ? '' : 'disabled'} />
        ${isAmin || !String(member.phone1 || '').trim() ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field"><label for="perf_phone2">رقم الموبايل (2)</label>
        <input type="tel" id="perf_phone2" value="${escapeHTML(member.phone2 || '')}" ${isAmin || !String(member.phone2 || '').trim() ? '' : 'disabled'} />
        <small class="perf-locked-note">اختياري</small>
      </div>
      <div class="field"><label for="perf_street">العنوان / الشارع${missingKeys.has('street') ? ' <span class="req">*</span>' : ''}</label>
        <input type="text" id="perf_street" value="${escapeHTML(member.street || '')}" ${isAmin || !String(member.street || '').trim() ? '' : 'disabled'} />
        ${isAmin || !String(member.street || '').trim() ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field full"><label for="perf_locationLink">الموقع على الخريطة (لوكيشن)${missingKeys.has('locationLink') ? ' <span class="req">*</span>' : ''}</label>
        <input type="url" id="perf_locationLink" value="${escapeHTML(member.locationLink || '')}" placeholder="https://maps.google.com/..." ${isAmin || !String(member.locationLink || '').trim() ? '' : 'disabled'} />
        ${isAmin || !String(member.locationLink || '').trim() ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field"><label for="perf_stage">المرحلة${missingKeys.has('stage') ? ' <span class="req">*</span>' : ''}</label>
        <select id="perf_stage" ${stageEditable ? '' : 'disabled'}>${opts(STAGE_OPTIONS, member.stage)}</select>
        ${stageEditable ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field"><label for="perf_sector">القطاع${missingKeys.has('sector') ? ' <span class="req">*</span>' : ''}</label>
        <select id="perf_sector" ${sectorEditable ? '' : 'disabled'}>${opts(SECTOR_MAP[member.stage] || [], member.sector)}${member.sector && !(SECTOR_MAP[member.stage] || []).includes(member.sector) ? `<option value="${escapeHTML(member.sector)}" selected>${escapeHTML(cleanLabel(member.sector))}</option>` : ''}</select>
        ${sectorEditable ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field"><label for="perf_class">الفصل${missingKeys.has('class') ? ' <span class="req">*</span>' : ''}</label>
        <select id="perf_class" ${classEditable ? '' : 'disabled'}>${opts(CLASS_MAP[member.sector] || [], member.class)}${member.class && !(CLASS_MAP[member.sector] || []).includes(member.class) ? `<option value="${escapeHTML(member.class)}" selected>${escapeHTML(cleanLabel(member.class))}</option>` : ''}</select>
        ${classEditable ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field"><label for="perf_city">المدينة${missingKeys.has('city') ? ' <span class="req">*</span>' : ''}</label>
        <select id="perf_city" ${isAmin || !String(member.city || '').trim() ? '' : 'disabled'}>${opts(CITY_OPTIONS, member.city)}</select>
        ${isAmin || !String(member.city || '').trim() ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field"><label for="perf_neighborhood">الحي${missingKeys.has('neighborhood') ? ' <span class="req">*</span>' : ''}</label>
        <select id="perf_neighborhood" ${isAmin || !String(member.neighborhood || '').trim() ? '' : 'disabled'}>${opts(NEIGHBORHOOD_OPTIONS, member.neighborhood)}</select>
        ${isAmin || !String(member.neighborhood || '').trim() ? '' : '<small class="perf-locked-note">مسجّل بالفعل — لا يمكن تعديله بهذا الدخول</small>'}
      </div>
      <div class="field full"><label for="perf_notes">الملاحظات</label>
        <textarea id="perf_notes" ${isAmin || !String(member.notes || '').trim() ? '' : 'disabled'}>${escapeHTML(member.notes || '')}</textarea>
        <small class="perf-locked-note">اختياري</small>
      </div>
    </div>`;

  const backdrop = document.createElement('div');
  backdrop.className = 'pin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="pin-modal perf-modal" role="dialog" aria-modal="true" aria-label="إكمال بيانات ${escapeHTML(member.name || '')}">
      <div class="att-notif-modal-head perf-modal-head">
        <h3>${incomplete ? 'إكمال بيانات' : 'تعديل بيانات'}: ${escapeHTML(member.name || '')}</h3>
        <button type="button" class="att-notif-close" id="perfModalClose" aria-label="إغلاق">&times;</button>
      </div>
      ${incomplete ? `<p class="perf-modal-missing">الحقول الناقصة: ${missing.map((f) => `<span class="perf-missing">${escapeHTML(f.label)}</span>`).join(' ')}</p>` : '<p class="perf-modal-ok">كل الحقول المطلوبة مكتملة — يمكن التعديل حسب صلاحيتك.</p>'}
      <div class="perf-modal-body">${bodyHtml}</div>
      <div class="perf-modal-foot">
        ${isAmin ? `<button type="button" class="btn btn-outline btn-danger" id="perfDeleteBtn">${ICONS.trash}<span>حذف السجل</span></button>` : ''}
        <button type="button" class="btn btn-outline" id="perfCancelBtn">إلغاء</button>
        <button type="button" class="btn btn-primary" id="perfSaveBtn">حفظ</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('#perfModalClose').addEventListener('click', close);
  backdrop.querySelector('#perfCancelBtn').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  /* dependent selects: stage -> sector, sector -> class (full edit only when allowed) */
  const stageSel = backdrop.querySelector('#perf_stage');
  const sectorSel = backdrop.querySelector('#perf_sector');
  const classSel = backdrop.querySelector('#perf_class');
  const refill = (select, list, keep) => {
    const cur = keep ? select.value : '';
    select.innerHTML = opts(list, cur || '');
    if (cur && !list.includes(cur)) {
      const opt = document.createElement('option');
      opt.value = cur; opt.textContent = cleanLabel(cur); opt.selected = true;
      select.appendChild(opt);
    }
  };
  if (stageSel) stageSel.addEventListener('change', () => {
    refill(sectorSel, SECTOR_MAP[stageSel.value] || [], false);
    if (classSel) classSel.innerHTML = opts([], '');
  });
  if (sectorSel) sectorSel.addEventListener('change', () => refill(classSel, CLASS_MAP[sectorSel.value] || [], false));

  const save = async () => {
    const val = (id) => { const el = backdrop.querySelector('#perf_' + id); return el ? el.value.trim() : ''; };
    if (!val('name')) { showToast('الاسم مطلوب', 'error'); return; }
    const record = { ...member };
    if (isAmin) {
      record.name = val('name');
      record.phone1 = val('phone1') || null;
      record.phone2 = val('phone2') || null;
      record.street = val('street') || null;
      record.locationLink = val('locationLink') || null;
      record.stage = val('stage') || null;
      record.sector = val('sector') || null;
      record.class = val('class') || null;
      record.city = val('city') || null;
      record.neighborhood = val('neighborhood') || null;
      record.notes = val('notes') || null;
    } else {
      /* خادم: فقط الحقول الناقصة يمكن تعبئتها — لا شيء آخر يتغير */
      if (missingKeys.has('name')) record.name = val('name');
      if (!String(member.phone1 || '').trim()) record.phone1 = val('phone1') || member.phone1 || null;
      if (!String(member.phone2 || '').trim() && val('phone2')) record.phone2 = val('phone2');
      if (missingKeys.has('street')) record.street = val('street') || null;
      if (missingKeys.has('locationLink')) record.locationLink = val('locationLink') || null;
      if (missingKeys.has('stage')) record.stage = val('stage') || null;
      if (missingKeys.has('sector')) record.sector = val('sector') || null;
      if (missingKeys.has('class')) record.class = val('class') || null;
      if (missingKeys.has('city')) record.city = val('city') || null;
      if (missingKeys.has('neighborhood')) record.neighborhood = val('neighborhood') || null;
      if (!String(member.notes || '').trim() && val('notes')) record.notes = val('notes');
    }
    record.stageGender = deriveStageGender(record.sector || '') || member.stageGender || null;
    await MembersDB.put(record);
    showToast('تم حفظ البيانات', 'success');
    close();
    renderPerformance(parseHash().params);
  };
  backdrop.querySelector('#perfSaveBtn').addEventListener('click', save);

  const deleteBtn = backdrop.querySelector('#perfDeleteBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', async () => {
    if (!confirm(`هل تريد حذف سجل «${member.name || ''}» نهائيًا؟`)) return;
    await MembersDB.remove(member.id);
    showToast('تم حذف السجل', 'success');
    close();
    renderPerformance(parseHash().params);
  });
}
