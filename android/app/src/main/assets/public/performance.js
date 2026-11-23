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
// The performance dashboard has an inclusive, optional reporting period.
// An empty bound means no limit; with both empty the period is all history.
function perfAttendanceRecords(m) {
  const from = sessionStorage.getItem('perf_period_start') || '';
  const to = sessionStorage.getItem('perf_period_end') || '';
  return Array.isArray(m.attendance) ? m.attendance.filter((r) =>
    r && typeof r.date === 'string' && (!from || r.date >= from) && (!to || r.date <= to)) : [];
}
function perfMemberAttendance(m) {
  return perfAttendanceRecords(m).some((r) => r.present === true);
}
function perfTotals(members) {
  const count = members.length;
  const present = members.filter(perfMemberAttendance).length;
  const absent = count - present;
  return { count, present, absent,
    pctPresent: count ? present * 100 / count : null,
    pctAbsent: count ? absent * 100 / count : null };
}
const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
const fmtPct = (p) => (p === null || !isFinite(p) ? '—' : `${p.toFixed(1)}%`);

/* Visitation statistics — a member counts as visited when it has at least
   one recorded visit date (stored on the member record by الدليل/«دليل الافتقاد»). */
function perfVisitDates(member) {
  const from = sessionStorage.getItem('perf_period_start') || '';
  const to = sessionStorage.getItem('perf_period_end') || '';
  return visitDates(member).filter((date) => (!from || date >= from) && (!to || date <= to));
}
function perfIsVisited(member) { return perfVisitDates(member).length > 0; }
function perfVisitStats(list) {
  let visited = 0;
  for (const m of list) if (perfIsVisited(m)) visited += 1;
  const notVisited = list.length - visited;
  return {
    visited,
    notVisited,
    pctVisited: list.length ? (visited / list.length) * 100 : null,
    pctNotVisited: list.length ? (notVisited / list.length) * 100 : null,
  };
}

function perfGroup(members, keyFn, labelFn) {
  const map = new Map();
  for (const m of members) {
    const raw = (keyFn(m) || '').toString().trim();
    const gk = raw || '— غير محدد';
    if (!map.has(gk)) map.set(gk, []);
    map.get(gk).push(m);
  }
  return [...map.entries()]
    .map(([key, group]) => ({ key, label: labelFn ? labelFn(key, group) : key, ...perfTotals(group), visit: perfVisitStats(group) }))
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
function perfGroupTable(groups, headerLabel, showVisit, linkCtx) {
  const visitQ = (visit, group) => qs(Object.assign({ tab: (linkCtx && linkCtx.tab) || 'classes', visit }, group ? { group } : {}));
  const visitCells = (g) => !showVisit ? '' : `
      <td class="perf-num"><a class="perf-visit-count" href="#/performance?${visitQ('visited', g.key)}" title="عرض المخدومين الذين تم افتقادهم في هذه المجموعة">${fmtNum(g.visit.visited)}</a></td>
      <td class="perf-num"><a class="perf-visit-count" href="#/performance?${visitQ('unvisited', g.key)}" title="عرض المخدومين الذين لم يتم افتقادهم في هذه المجموعة">${fmtNum(g.visit.notVisited)}</a></td>
      ${perfPctCell(g.visit.pctVisited, 'is-good')}`;
  const rows = groups.map((g) => `
    <tr>
      <td class="perf-group">${escapeHTML(g.label)}</td>
      <td class="perf-num">${fmtNum(g.count)}</td>
      ${perfPctCell(g.pctPresent, 'is-good')}
      ${perfPctCell(g.pctAbsent, 'is-bad')}
      <td class="perf-num">${fmtNum(g.present)}</td>
      <td class="perf-num">${fmtNum(g.absent)}</td>${visitCells(g)}
    </tr>`).join('');
  const tot = groups.reduce((acc, g) => ({
    count: acc.count + g.count,
    present: acc.present + g.present, absent: acc.absent + g.absent,
    visitVisited: acc.visitVisited + g.visit.visited,
  }), { count: 0, present: 0, absent: 0, visitVisited: 0 });
  tot.pctPresent = tot.count ? (tot.present / tot.count) * 100 : null;
  tot.pctAbsent = tot.count ? (tot.absent / tot.count) * 100 : null;
  tot.visitNot = tot.count - tot.visitVisited;
  tot.visitPct = tot.count ? (tot.visitVisited / tot.count) * 100 : null;
  const visitHead = showVisit ? '<th>تم افتقادهم</th><th>لم يتم افتقادهم</th><th>% افتقاد</th>' : '';
  const visitFoot = showVisit ? `<th class="perf-num"><a class="perf-visit-count" href="#/performance?${visitQ('visited')}">${fmtNum(tot.visitVisited)}</a></th><th class="perf-num"><a class="perf-visit-count" href="#/performance?${visitQ('unvisited')}">${fmtNum(tot.visitNot)}</a></th><th class="perf-num">${tot.visitPct === null ? '—' : `${tot.visitPct.toFixed(1)}%`}</th>` : '';
  const colspan = 6 + (showVisit ? 3 : 0);
  return `
  <div class="perf-table-wrap">
    <table class="perf-table">
      <thead><tr><th>${escapeHTML(headerLabel)}</th><th>المخدومون</th><th>% حضور</th><th>% غياب</th><th>الحاضرون</th><th>الغائبون</th>${visitHead}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${colspan}" class="perf-empty">لا توجد بيانات مسجلة</td></tr>`}</tbody>
      <tfoot><tr><th>الإجمالي</th><th class="perf-num">${fmtNum(tot.count)}</th>${tot.count ? `<th class="perf-num">${tot.pctPresent.toFixed(1)}%</th><th class="perf-num">${tot.pctAbsent.toFixed(1)}%</th>` : '<th class="perf-num">—</th><th class="perf-num">—</th>'}<th class="perf-num">${fmtNum(tot.present)}</th><th class="perf-num">${fmtNum(tot.absent)}</th>${visitFoot}</tr></tfoot>
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
        <p class="section-sub">لوحة مؤشرات قياس الأداء:</p>
        <div class="perf-gate">
          <button type="button" class="perf-role-card" data-role="amin">
            <span class="perf-role-icon">${ICONS.unlock}</span>
            <span class="perf-role-name">أمين خدمة</span>
            <span class="perf-role-desc">دخول كامل لكل المؤشرات والمستويات + تقارير البيانات غير المكتملة + الإضافة والتعديل والحذف داخل هذا القسم.</span>
          </button>
          <button type="button" class="perf-role-card" data-role="khadim">
            <span class="perf-role-icon">${ICONS.users}</span>
            <span class="perf-role-name">خادم</span>
            <span class="perf-role-desc">مؤشرات مستوى الفصل فقط + تقارير البيانات غير المكتملة + إكمال البيانات للمخدومين .</span>
          </button>
        </div>
        <p class="perf-gate-note">لوحة مؤشرات قياس الأداء.</p>
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
          ${isAmin && tab === 'overview' ? `<button type="button" class="btn btn-gold btn-sm" id="perfReportBtn">${ICONS.download}<span>تصدير التقرير الكامل</span></button>` : ''}
          ${isAmin ? `<a class="btn btn-primary btn-sm" href="#/add">${ICONS.plus}<span>إضافة مخدوم</span></a>` : ''}
          <button type="button" class="btn btn-outline btn-sm" id="perfLockBtn">${ICONS.lock}<span>قفل</span></button>
        </div>
      </div>
      <div class="perf-tabs" role="tablist">${tabsHtml}</div>
      <div class="perf-period" role="group" aria-label="فترة احتساب المؤشرات">
        <span>فترة التقرير</span>
        <label>من <input type="date" id="perfPeriodStart" value="${escapeHTML(sessionStorage.getItem('perf_period_start') || '')}" /></label>
        <label>إلى <input type="date" id="perfPeriodEnd" value="${escapeHTML(sessionStorage.getItem('perf_period_end') || '')}" /></label>
        <button type="button" class="btn btn-outline btn-sm" id="perfPeriodClear">كل الفترات</button>
      </div>
      <div id="perfBody"></div>
    </div>`;
  const periodStart = document.getElementById('perfPeriodStart');
  const periodEnd = document.getElementById('perfPeriodEnd');
  const setPeriod = () => {
    if (periodStart.value && periodEnd.value && periodStart.value > periodEnd.value) {
      showToast('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', 'error');
      periodStart.value = sessionStorage.getItem('perf_period_start') || '';
      periodEnd.value = sessionStorage.getItem('perf_period_end') || '';
      return;
    }
    sessionStorage.setItem('perf_period_start', periodStart.value);
    sessionStorage.setItem('perf_period_end', periodEnd.value);
    renderPerformance(params);
  };
  periodStart.addEventListener('change', setPeriod);
  periodEnd.addEventListener('change', setPeriod);
  document.getElementById('perfPeriodClear').addEventListener('click', () => {
    sessionStorage.removeItem('perf_period_start');
    sessionStorage.removeItem('perf_period_end');
    renderPerformance(params);
  });
  document.getElementById('perfLockBtn').addEventListener('click', () => { PerformanceAuth.lock(); renderPerformance({}); });
  const reportBtn = document.getElementById('perfReportBtn');
  if (reportBtn) reportBtn.addEventListener('click', () => perfExportWithButton(reportBtn, () => perfExportFullReportPDF(members)));

  const body = document.getElementById('perfBody');
  const total = perfTotals(members);

  /* ======================= نظرة عامة (أمين) ======================= */
  if (tab === 'overview') {
    const statKey = (params && params.stat) || '';
    const perMember = members.map((m) => {
      const present = perfMemberAttendance(m) ? 1 : 0;
      const absent = 1 - present;
      const pct = present * 100;
      return { m, present, absent, pct };
    });
    const alpha = (a, b) => String(a.m.name || '').localeCompare(String(b.m.name || ''), 'ar');
    const byAbsent = (a, b) => b.absent - a.absent || alpha(a, b);
    const drilldowns = {
      total: { label: 'كل المخدومين', list: perMember.slice().sort(alpha) },
      presence: { label: 'المخدومون الذين لديهم سجلات حضور', list: perMember.filter((x) => x.present > 0).sort((a, b) => b.present - a.present || alpha(a, b)) },
      absence: { label: 'المخدومون الغائبون', list: perMember.filter((x) => x.absent > 0).sort(byAbsent) },
      absentDays: { label: 'المخدومون الغائبون', list: perMember.filter((x) => x.absent > 0).sort(byAbsent) },
    };
    const linkCard = (key, value, label, sub, kind) => {
      const active = statKey === key;
      const href = `#/performance?${qs({ tab: 'overview', stat: active ? undefined : key })}`;
      return `<a class="perf-stat perf-stat-link ${kind || ''}${active ? ' is-active' : ''}" href="${href}" aria-pressed="${active}">
        <div class="perf-stat-value">${value}</div>
        <div class="perf-stat-label">${escapeHTML(label)}</div>
        <div class="perf-stat-sub">${escapeHTML(sub)}</div>
        <div class="perf-stat-cta">${active ? 'إغلاق القائمة' : 'عرض المخدومين المعنيين'}</div>
      </a>`;
    };
    /* visitation drill-downs (أمين خدمة only — the overview tab is أمين-only) */
    const alphaVisit = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    const visitedMembers = members.filter(perfIsVisited).sort(alphaVisit);
    const unvisitedMembers = members.filter((m) => !perfIsVisited(m)).sort(alphaVisit);
    const visitList = (kind) => (kind === 'visited' ? visitedMembers : unvisitedMembers)
      .map((m) => ({ m, present: 0, absent: 0, pct: null, visits: perfVisitDates(m) }));
    const vStats = perfVisitStats(members);
    drilldowns.visitTotal = { kind: 'visit', label: 'المخدومون الذين تم افتقادهم', list: visitList('visited') };
    drilldowns.visitPct = { kind: 'visit', label: 'المخدومون الذين تم افتقادهم', list: visitList('visited') };
    drilldowns.visitNot = { kind: 'visit', label: 'المخدومون الذين لم يتم افتقادهم', list: visitList('unvisited') };
    drilldowns.visitNotPct = { kind: 'visit', label: 'المخدومون الذين لم يتم افتقادهم', list: visitList('unvisited') };

    const dd = drilldowns[statKey];
    const ddIsVisit = !!(dd && dd.kind === 'visit');
    const ddRows = dd ? dd.list.map((item) => {
      const { m, present, absent, pct } = item;
      const classKey = perfClassKey(m);
      const pickCell = `<td class="perf-pick-cell"><input type="checkbox" class="perf-drill-pick" data-id="${m.id}" aria-label="تحديد ${escapeHTML(m.name || '')}" /></td>`;
      if (ddIsVisit) {
        const visits = item.visits || [];
        const last = visits[0] || '';
        return `
        <tr>
          ${pickCell}
          <td class="perf-group"><a class="perf-member-link" href="#/member/${m.id}">${escapeHTML(m.name || '— بلا اسم')}</a></td>
          <td class="perf-meta">${escapeHTML(perfClassLabel(classKey))}</td>
          <td class="perf-num" dir="ltr">${last ? escapeHTML(formatDMY(last)) : '—'}</td>
          <td class="perf-num">${fmtNum(visits.length)}</td>
          <td class="perf-actions"><a class="btn btn-outline btn-sm" href="#/member/${m.id}">فتح الملف</a></td>
        </tr>`;
      }
      return `
        <tr>
          ${pickCell}
          <td class="perf-group"><a class="perf-member-link" href="#/member/${m.id}">${escapeHTML(m.name || '— بلا اسم')}</a></td>
          <td class="perf-meta">${escapeHTML(perfClassLabel(classKey))}</td>
          <td class="perf-num">${fmtNum(present)}</td>
          <td class="perf-num">${fmtNum(absent)}</td>
          <td class="perf-num">${fmtPct(pct)}</td>
          <td class="perf-actions">
            <a class="btn btn-outline btn-sm" href="#/member/${m.id}">فتح الملف</a>
            <button type="button" class="btn btn-primary btn-sm perf-edit-btn" data-id="${m.id}">تعديل</button>
          </td>
        </tr>`;
    }).join('') : '';
    const drillExportBar = `
      <div class="perf-export-bar">
        <label class="perf-pick-all"><input type="checkbox" id="perfDrillPickAll" /><span>تحديد الكل</span></label>
        <span class="perf-selected-count" id="perfDrillCount">0 محدد</span>
        <button type="button" class="btn btn-outline btn-sm" id="perfDrillExportSelected">${ICONS.download}<span>تصدير المحدد PDF</span></button>
        <button type="button" class="btn btn-gold btn-sm" id="perfDrillExportAll">${ICONS.download}<span>تصدير الكل</span></button>
      </div>`;
    const ddHead = ddIsVisit
      ? '<tr><th class="perf-pick-cell"></th><th>المخدوم</th><th>القطاع · الفصل</th><th>آخر افتقاد</th><th>عدد مرات الافتقاد</th><th>الإجراء</th></tr>'
      : '<tr><th class="perf-pick-cell"></th><th>المخدوم</th><th>القطاع · الفصل</th><th>الحاضرون</th><th>الغائبون</th><th>% حضور</th><th>الإجراء</th></tr>';
    const ddColspan = ddIsVisit ? 6 : 7;
    const panel = dd ? `
      <div class="perf-drill">
        <div class="perf-drill-head">
          <h3>${escapeHTML(dd.label)}<span class="perf-drill-count">${fmtNum(dd.list.length)}</span></h3>
          <a class="perf-chip perf-chip-clear" href="#/performance?${qs({ tab: 'overview' })}">✕ إغلاق القائمة</a>
        </div>
        ${drillExportBar}
        <div class="perf-table-wrap">
          <table class="perf-table">
            <thead>${ddHead}</thead>
            <tbody>${ddRows || `<tr><td colspan="${ddColspan}" class="perf-empty">لا يوجد مخدومون مطابقون</td></tr>`}</tbody>
          </table>
        </div>
      </div>` : '';
    body.innerHTML = `
      <div class="perf-stat-grid">
        ${linkCard('total', fmtNum(total.count), 'إجمالي المخدومين', 'اضغط لعرض كل المخدومين')}
        ${linkCard('presence', fmtPct(total.pctPresent), 'نسبة الحضور', 'اضغط لعرض المخدومين الذين لديهم حضور', total.pctPresent === null ? '' : 'is-good')}
        ${linkCard('absence', fmtPct(total.pctAbsent), 'نسبة الغياب', 'اضغط لعرض المخدومين الغائبين', total.pctAbsent === null ? '' : 'is-bad')}
        ${linkCard('absentDays', fmtNum(total.absent), 'إجمالي الغائبين', 'اضغط لعرض المخدومين الغائبين', 'is-bad')}
      </div>
      <h3 class="perf-visit-title">${ICONS.visit} مؤشرات الافتقاد</h3>
      <div class="perf-stat-grid perf-stat-grid-visit">
        ${linkCard('visitTotal', fmtNum(vStats.visited), 'تم افتقادهم', 'اضغط لعرض المخدومين الذين تم افتقادهم', 'is-good')}
        ${linkCard('visitNot', fmtNum(vStats.notVisited), 'لم يتم افتقادهم', 'اضغط لعرض المخدومين الذين لم يُفتقدوا', 'is-bad')}
        ${linkCard('visitPct', fmtPct(vStats.pctVisited), 'نسبة الافتقاد', 'اضغط لعرض المخدومين الذين تم افتقادهم', vStats.pctVisited === null ? '' : 'is-good')}
        ${linkCard('visitNotPct', fmtPct(vStats.pctNotVisited), 'نسبة عدم الافتقاد', 'اضغط لعرض المخدومين الذين لم يُفتقدوا', vStats.pctNotVisited === null ? '' : 'is-bad')}
      </div>
      <div class="perf-visit-dist" role="img" aria-label="توزيع الافتقاد بين المخدومين">
        <div class="perf-visit-dist-bar"><span class="perf-visit-dist-fill visited" style="width:${vStats.pctVisited === null ? 0 : Math.max(0, Math.min(100, vStats.pctVisited)).toFixed(1)}%"></span></div>
        <div class="perf-visit-dist-legend">
          <span class="perf-visit-legend-item"><span class="perf-visit-dot visited"></span>تم افتقادهم: <b>${fmtNum(vStats.visited)}</b> (${fmtPct(vStats.pctVisited)})</span>
          <span class="perf-visit-legend-item"><span class="perf-visit-dot unvisited"></span>لم يتم افتقادهم: <b>${fmtNum(vStats.notVisited)}</b> (${fmtPct(vStats.pctNotVisited)})</span>
        </div>
      </div>
      ${panel}
      <p class="perf-footnote">المؤشرات محسوبة من سجلات الحضور والافتقاد الفعلية خلال الفترة المختارة لكل مخدوم — اضغط على أي مؤشر لعرض المخدومين المعنيين والوصول المباشر إلى ملفاتهم.</p>`;
    body.querySelectorAll('.perf-edit-btn').forEach((btn) => btn.addEventListener('click', () => {
      const member = members.find((m) => String(m.id) === String(btn.dataset.id));
      if (member) openPerfEditModal(member, role, params);
    }));
    const drillPickAll = body.querySelector('#perfDrillPickAll');
    if (drillPickAll && dd) {
      const picks = () => [...body.querySelectorAll('.perf-drill-pick')];
      const countEl = body.querySelector('#perfDrillCount');
      const syncCount = () => { countEl.textContent = `${picks().filter((p) => p.checked).length} محدد`; };
      const syncAll = () => {
        const boxes = picks();
        drillPickAll.checked = boxes.length > 0 && boxes.every((p) => p.checked);
        drillPickAll.indeterminate = !drillPickAll.checked && boxes.some((p) => p.checked);
      };
      picks().forEach((p) => p.addEventListener('change', () => { syncCount(); syncAll(); }));
      drillPickAll.addEventListener('change', () => { picks().forEach((p) => { p.checked = drillPickAll.checked; }); syncCount(); });
      const selectedMembers = () => {
        const ids = new Set(picks().filter((p) => p.checked).map((p) => p.dataset.id));
        return dd.list.filter((item) => ids.has(String(item.m.id))).map((item) => item.m);
      };
      const allMembers = () => dd.list.map((item) => item.m);
      const exportKind = ddIsVisit ? 'visit' : 'att';
      body.querySelector('#perfDrillExportAll').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const list = allMembers();
        if (!list.length) { showToast('لا توجد نتائج للتصدير', 'error'); return; }
        await perfExportWithButton(btn, () => perfExportAttendanceOrVisitPDF(list, `${dd.label}`, exportKind));
      });
      body.querySelector('#perfDrillExportSelected').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const list = selectedMembers();
        if (!list.length) { showToast('لم يتم تحديد أي اسم للتصدير', 'error'); return; }
        await perfExportWithButton(btn, () => perfExportAttendanceOrVisitPDF(list, `${dd.label} — المحددون`, exportKind));
      });
    }
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
    /* أمين خدمة only: افتقاد drill-down for the selected group (or the whole level) */
    const visitParam = isAmin ? (params && params.visit) : '';
    let visitPanel = '';
    if (visitParam === 'visited' || visitParam === 'unvisited') {
      const groupFilter = (params && params.group) || '';
      const makeKey = (m) => ((cfg.keyFn(m) || '').toString().trim() || '— غير محدد');
      const matched = members
        .filter((m) => (!groupFilter || makeKey(m) === groupFilter) && (visitParam === 'visited' ? perfIsVisited(m) : !perfIsVisited(m)))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
      const groupLabel = groupFilter ? cfg.labelFn(groupFilter) : 'كل الخدمة';
      const isVisitedList = visitParam === 'visited';
      const rowsV = matched.map((m) => {
        const visits = perfVisitDates(m);
        const last = visits[0] || '';
        return `
        <tr>
          <td class="perf-group"><a class="perf-member-link" href="#/member/${m.id}">${escapeHTML(m.name || '— بلا اسم')}</a></td>
          <td class="perf-meta">${escapeHTML(perfClassLabel(perfClassKey(m)))}</td>
          <td class="perf-num" dir="ltr">${last ? escapeHTML(formatDMY(last)) : '—'}</td>
          <td class="perf-num">${fmtNum(visits.length)}</td>
          <td class="perf-actions"><a class="btn btn-outline btn-sm" href="#/member/${m.id}">فتح الملف</a></td>
        </tr>`;
      }).join('');
      visitPanel = `
      <div class="perf-drill">
        <div class="perf-drill-head">
          <h3>${isVisitedList ? 'المخدومون الذين تم افتقادهم' : 'المخدومون الذين لم يتم افتقادهم'} — ${escapeHTML(groupLabel)}<span class="perf-drill-count">${fmtNum(matched.length)}</span></h3>
          <a class="perf-chip perf-chip-clear" href="#/performance?${qs({ tab })}">✕ إغلاق القائمة</a>
        </div>
        <div class="perf-table-wrap">
          <table class="perf-table">
            <thead><tr><th>المخدوم</th><th>القطاع · الفصل</th><th>آخر افتقاد</th><th>عدد مرات الافتقاد</th><th>الإجراء</th></tr></thead>
            <tbody>${rowsV || `<tr><td colspan="5" class="perf-empty">لا يوجد مخدومون مطابقون</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
    }
    body.innerHTML = perfGroupTable(groups, cfg.header, isAmin, { tab }) + visitPanel;
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
    const pill = (key, label) => {
      const active = key === classFilter;
      return `<button type="button" class="perf-tab perf-class-pill${active ? ' active' : ''}" data-class="${escapeHTML(key)}" aria-pressed="${active}">${escapeHTML(label)}</button>`;
    };
    const classPillsHtml = pill('', 'كل الفصول') + classOptions.map((k) => pill(k, perfClassLabel(k))).join('');

    const rows = members.map((m) => {
      const present = perfMemberAttendance(m) ? 1 : 0;
      const absent = 1 - present;
      const pct = present * 100;
      const classKey = perfClassKey(m);
      const peerList = peers.get(classKey) || [];
      let compare;
      if (peerList.length <= 1) compare = 'لا توجد مقارنة داخل الفصل';
      else {
        const peerPcts = peerList.map((p) => {
          return perfMemberAttendance(p) ? 100 : 0;
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
          <td class="perf-pick-cell"><input type="checkbox" class="perf-individual-pick" data-id="${m.id}" aria-label="تحديد ${name}" /></td>
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
      </div>
      <div class="perf-class-filter-row" role="group" aria-label="تصفية حسب الفصل">${classPillsHtml}</div>
      <div class="perf-export-bar">
        <label class="perf-pick-all"><input type="checkbox" id="perfPickAll" /><span>تحديد الكل</span></label>
        <span class="perf-selected-count" id="perfSelectedCount">0 محدد</span>
        <button type="button" class="btn btn-outline btn-sm" id="perfExportSelected">${ICONS.download}<span>تصدير المحدد</span></button>
        <button type="button" class="btn btn-gold btn-sm" id="perfExportAll">${ICONS.download}<span>تصدير الكل</span></button>
      </div>
      <div class="perf-table-wrap">
        <table class="perf-table">
          <thead><tr><th class="perf-pick-cell"></th><th>المخدوم</th><th>القطاع · الفصل</th><th>الحاضرون</th><th>الغائبون</th><th>% حضور</th><th>المقارنة داخل الفصل</th><th></th></tr></thead>
          <tbody id="perfIndividualRows">${rows || `<tr><td colspan="8" class="perf-empty">لا توجد سجلات مخدومين بعد</td></tr>`}</tbody>
        </table>
      </div>`;
    const tbody = body.querySelector('#perfIndividualRows');
    let currentClass = classFilter;
    const applyFilter = () => {
      const q = (body.querySelector('#perfSearch').value || '').trim().toLowerCase();
      tbody.querySelectorAll('tr[data-class]').forEach((row) => {
        const okClass = !currentClass || row.dataset.class === currentClass;
        const okQ = !q || row.dataset.name.includes(q) || row.dataset.phone.includes(q);
        row.style.display = okClass && okQ ? '' : 'none';
      });
    };
    body.querySelector('#perfSearch').addEventListener('input', debounce(applyFilter, 200));
    body.querySelectorAll('.perf-class-pill').forEach((pillBtn) => pillBtn.addEventListener('click', () => {
      currentClass = pillBtn.dataset.class;
      body.querySelectorAll('.perf-class-pill').forEach((p) => {
        const on = p === pillBtn;
        p.classList.toggle('active', on);
        p.setAttribute('aria-pressed', String(on));
      });
      applyFilter();
    }));
    const perfPickAll = body.querySelector('#perfPickAll');
    const perfSelectedCount = body.querySelector('#perfSelectedCount');
    const individualPicks = () => [...tbody.querySelectorAll('.perf-individual-pick')];
    const syncIndividualCount = () => { perfSelectedCount.textContent = `${individualPicks().filter((p) => p.checked).length} محدد`; };
    individualPicks().forEach((p) => p.addEventListener('change', syncIndividualCount));
    perfPickAll.addEventListener('change', () => {
      individualPicks().forEach((p) => { if (p.closest('tr').style.display !== 'none') p.checked = perfPickAll.checked; });
      syncIndividualCount();
    });
    const selectedIndividuals = () => {
      const ids = new Set(individualPicks().filter((p) => p.checked).map((p) => String(p.dataset.id)));
      return members.filter((m) => ids.has(String(m.id)));
    };
    body.querySelector('#perfExportAll').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!members.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
      await perfExportWithButton(btn, () => perfExportAttendanceOrVisitPDF(members, 'المخدومون — الكل', 'att', 'تصدير_المخدومين'));
    });
    body.querySelector('#perfExportSelected').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const list = selectedIndividuals();
      if (!list.length) { showToast('لم يتم تحديد أي مخدوم للتصدير', 'error'); return; }
      await perfExportWithButton(btn, () => perfExportAttendanceOrVisitPDF(list, 'المخدومون — المحددون', 'att', 'تصدير_المخدومين_المحددين'));
    });
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
        <td class="perf-pick-cell"><input type="checkbox" class="perf-incomplete-pick" data-id="${member.id}" aria-label="تحديد ${escapeHTML(member.name || '')}" /></td>
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
      <div class="perf-export-bar">
        <label class="perf-pick-all"><input type="checkbox" id="perfIncompletePickAll" /><span>تحديد الكل</span></label>
        <span class="perf-selected-count" id="perfIncompleteSelectedCount">0 محدد</span>
        <button type="button" class="btn btn-outline btn-sm" id="perfIncompleteExportSelected">${ICONS.download}<span>تصدير المحدد PDF</span></button>
        <button type="button" class="btn btn-gold btn-sm" id="perfIncompleteExportShown">${ICONS.download}<span>تصدير المعروض PDF</span></button>
      </div>
      <div class="perf-table-wrap">
        <table class="perf-table">
          <thead><tr><th class="perf-pick-cell"></th><th>المخدوم</th><th>القطاع · الفصل</th><th>الحقول الناقصة</th><th>الإجراء</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="perf-empty">لا توجد ملفات غير مكتملة بهذا الفلتر</td></tr>`}</tbody>
        </table>
      </div>`;
    body.querySelectorAll('.perf-edit-btn').forEach((btn) => btn.addEventListener('click', () => {
      const member = members.find((m) => String(m.id) === String(btn.dataset.id));
      if (member) openPerfEditModal(member, role, params);
    }));
    const incompletePicks = () => [...body.querySelectorAll('.perf-incomplete-pick')];
    const incompleteCountEl = body.querySelector('#perfIncompleteSelectedCount');
    const syncIncompleteCount = () => { incompleteCountEl.textContent = `${incompletePicks().filter((p) => p.checked).length} محدد`; };
    incompletePicks().forEach((p) => p.addEventListener('change', syncIncompleteCount));
    body.querySelector('#perfIncompletePickAll').addEventListener('change', (e) => {
      incompletePicks().forEach((p) => { p.checked = e.currentTarget.checked; });
      syncIncompleteCount();
    });
    const selectedIncomplete = () => {
      const ids = new Set(incompletePicks().filter((p) => p.checked).map((p) => String(p.dataset.id)));
      return shown.filter((x) => ids.has(String(x.member.id)));
    };
    body.querySelector('#perfIncompleteExportShown').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!shown.length) { showToast('لا توجد ملفات غير مكتملة للتصدير', 'error'); return; }
      await perfExportWithButton(btn, () => perfExportIncompletePDF(shown, 'البيانات غير المكتملة — المعروض', 'البيانات_غير_المكتملة'));
    });
    body.querySelector('#perfIncompleteExportSelected').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const list = selectedIncomplete();
      if (!list.length) { showToast('لم يتم تحديد أي مخدوم للتصدير', 'error'); return; }
      await perfExportWithButton(btn, () => perfExportIncompletePDF(list, 'البيانات غير المكتملة — المحددون', 'البيانات_غير_المكتملة_المحددين'));
    });
    return;
  }
}

/* ==========================================================================
   PDF exports (Performance Indicators) — reuse the shared offline table
   builder (simpleTablePdf in iftiqad.js) so every export keeps the same
   A4/maroon-header pipeline as the rest of the app. No global PDF
   behaviour is changed; these are additive, module-local exports.       */
/* ========================================================================== */

/* Run an export while its button shows a busy state; always restore it. */
async function perfExportWithButton(btn, fn) {
  if (!btn || btn.disabled) return;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>جاري التجهيز...</span>';
  try {
    await fn();
  } catch (err) {
    console.error('Performance PDF export failed:', err);
    showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

const perfExportStamp = () => new Date().toISOString().slice(0, 10);
const perfExportToday = () => formatDMY(visitTodayStr());
const perfExportSort = (list) => [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
const perfExportClassCell = (m) => escapeHTML(perfClassLabel(perfClassKey(m)));

/* نظرة عامة / المخدومون: beneficiary lists with attendance (kind 'att')
   or visitation (kind 'visit') figures. Names are included here — this is
   the per-indicator list export, NOT the numerical report. */
async function perfExportAttendanceOrVisitPDF(list, label, kind, filename) {
  const sorted = perfExportSort(list);
  const isVisit = kind === 'visit';
  const rows = sorted.map((m) => {
    if (isVisit) {
      const dates = perfVisitDates(m);
      return [
        `<span style="font-weight:700;">${escapeHTML(m.name || '—')}</span>`,
        perfExportClassCell(m),
        dates.length ? `<span dir="ltr">${escapeHTML(formatDMY(dates[0]))}</span>` : 'لم يتم افتقاده',
        `<span style="text-align:center;">${dates.length}</span>`,
      ];
    }
    const present = perfMemberAttendance(m) ? 1 : 0;
    const absent = 1 - present;
    const pct = present * 100;
    return [
      `<span style="font-weight:700;">${escapeHTML(m.name || '—')}</span>`,
      perfExportClassCell(m),
      `<span style="text-align:center;">${present}</span>`,
      `<span style="text-align:center;">${absent}</span>`,
      `<span style="text-align:center;">${pct === null ? '—' : `${pct.toFixed(1)}%`}</span>`,
    ];
  });
  await simpleTablePdf({
    title: 'مؤشر قياس الأداء',
    subtitle: label,
    note: `تاريخ الإصدار: ${perfExportToday()} — عدد المخدومين: ${sorted.length}`,
    landscape: true,
    headers: isVisit
      ? [
          { label: 'الاسم', width: 34 },
          { label: 'القطاع · الفصل', width: 26 },
          { label: 'آخر افتقاد', width: 18, align: 'center' },
          { label: 'عدد مرات الافتقاد', width: 16, align: 'center' },
        ]
      : [
          { label: 'الاسم', width: 30 },
          { label: 'القطاع · الفصل', width: 24 },
          { label: 'حاضر', width: 13, align: 'center' },
          { label: 'غائب', width: 13, align: 'center' },
          { label: '% حضور', width: 14, align: 'center' },
        ],
    rows,
    filename: filename ? `${filename}_${perfExportStamp()}.pdf` : `مؤشر_الأداء_${perfExportStamp()}.pdf`,
  });
  showToast('تم تصدير ملف PDF', 'success');
}

/* البيانات غير المكتملة: name + the EXACT missing fields of each record. */
async function perfExportIncompletePDF(items, label, filename) {
  const sorted = [...items].sort((a, b) => b.missing.length - a.missing.length
    || String(a.member.name || '').localeCompare(String(b.member.name || ''), 'ar'));
  const rows = sorted.map(({ member, missing }) => [
    `<span style="font-weight:700;">${escapeHTML(member.name || '—')}</span>`,
    perfExportClassCell(member),
    escapeHTML(missing.map((f) => f.label).join('، ')),
    `<span style="text-align:center;">${missing.length}</span>`,
  ]);
  await simpleTablePdf({
    title: 'مؤشر قياس الأداء',
    subtitle: label,
    note: `تاريخ الإصدار: ${perfExportToday()} — عدد الملفات غير المكتملة: ${sorted.length}`,
    landscape: true,
    headers: [
      { label: 'الاسم', width: 26 },
      { label: 'القطاع · الفصل', width: 22 },
      { label: 'الحقول الناقصة', width: 38 },
      { label: 'عدد الحقول الناقصة', width: 8, align: 'center' },
    ],
    rows,
    filename: filename ? `${filename}_${perfExportStamp()}.pdf` : `البيانات_غير_المكتملة_${perfExportStamp()}.pdf`,
  });
  showToast('تم تصدير ملف PDF', 'success');
}

/* التقرير العددي الكامل — أمين خدمة فقط. No personal information;
   overall totals and a compact section for each organizational level. */
async function perfExportFullReportPDF(members) {
  if (PerformanceAuth.role() !== 'amin') throw new Error('غير مصرح بتصدير التقرير العددي الكامل');
  const stats = (list) => {
    const attendance = perfTotals(list);
    const visits = perfVisitStats(list);
    const incomplete = list.filter((m) => perfMissingFields(m).length > 0).length;
    return { attendance, visits, incomplete };
  };
  const values = (list) => {
    const { attendance: a, visits: v, incomplete } = stats(list);
    return [a.count, a.present, a.absent, v.visited, v.notVisited, incomplete, list.length - incomplete].map(fmtNum);
  };
  const { attendance: total, visits, incomplete } = stats(members);
  const percentage = (n) => members.length ? fmtPct(100 * n / members.length) : '—';
  const percentages = ['—', fmtPct(total.pctPresent), fmtPct(total.pctAbsent),
    fmtPct(visits.pctVisited), fmtPct(visits.pctNotVisited),
    percentage(incomplete), percentage(members.length - incomplete)];
  // Each valid category occurs once in its own level, independently of other
  // fields. Missing categories are omitted, not invented or relabelled.
  const levels = [
    ['القطاع', 'sector'], ['المرحلة', 'stage'], ['المدينة', 'city'],
    ['الحي', 'neighborhood'], ['الفصل', 'class'],
  ];
  const sections = levels.map(([title, field]) => {
    const groups = new Map();
    const display = (value) => {
      const label = cleanLabel(value || '').trim();
      return ['—', 'غير محدد', '— غير محدد'].includes(label) ? '' : label;
    };
    for (const member of members) {
      // The class dashboard identifies a class by sector and class together.
      const key = field === 'class' ? perfClassKey(member) : String(member[field] || '').trim();
      const label = field === 'class'
        ? [display(member.sector), display(member.class)].filter(Boolean).join(' · ')
        : display(member[field]);
      if (!groups.has(key)) groups.set(key, { label, members: [] });
      groups.get(key).members.push(member);
    }
    return { title, rows: [...groups.values()]
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'))
      .map(({ label, members: group }) => [label, ...values(group)]) };
  }).filter((section) => section.rows.length);

  // A report-only renderer: other PDF templates keep their existing behavior.
  // Measure real browser layout and repeat the section/table header whenever a
  // table continues onto a new page. Rasterization uses the existing PDF layer.
  await _loadPdfLibs();
  const pageW = 842, pageH = 595;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-99999px;top:0;width:842px;';
  document.body.appendChild(stage);
  const pages = [];
  let page, body;
  const headings = ['البيان', 'المخدومون', 'حضور', 'غياب', 'افتقاد', 'لم يُفتقد', 'ناقص', 'مكتمل'];
  const tableStyle = 'width:100%;border-collapse:collapse;table-layout:fixed;direction:rtl;';
  const cellStyle = `border:1px solid #d5c9b8;padding:3px 4px;font-family:${PDF_FONT_STACK};font-size:10px;line-height:1.45;overflow-wrap:anywhere;word-break:normal;vertical-align:middle;`;
  const headerCell = `${cellStyle}background:#591420;color:white;text-align:center;font-weight:700;`;
  const header = `<colgroup><col style="width:37%">${Array(7).fill('<col style="width:9%">').join('')}</colgroup><thead><tr>${headings.slice(0, 6).map((h) => `<th rowspan="2" style="${headerCell}">${escapeHTML(h)}</th>`).join('')}<th colspan="2" style="${headerCell}">ملفات</th></tr><tr>${headings.slice(6).map((h) => `<th style="${headerCell}">${escapeHTML(h)}</th>`).join('')}</tr></thead>`;
  const rowHtml = (cells, emphasized) => `<tr>${cells.map((v, i) => {
    const value = escapeHTML(String(v));
    const highlight = (i === 3 || i === 5) && /[0-9]/.test(String(v));
    const content = highlight ? `<span style="display:inline-block;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;word-break:break-all;background:rgba(185,55,55,0.07);border-radius:3px;padding:0 1px;">${value}</span>` : value;
    return `<td style="${cellStyle}${i ? 'text-align:center;' : 'text-align:right;'}${emphasized ? 'font-weight:700;background:#fbf3df;' : ''}">${content}</td>`;
  }).join('')}</tr>`;
  function newPage() {
    page = document.createElement('div');
    page.style.cssText = `width:${pageW}px;height:${pageH}px;box-sizing:border-box;background:#fffdf8;padding:12px 16px;direction:rtl;font-family:${PDF_FONT_STACK};`;
    page.innerHTML = `<div style="text-align:center;color:#591420;font-family:${PDF_FONT_STACK};font-size:14px;font-weight:800;line-height:1.4;">كنيســــة القديس العظيم الأنبــــا بيشوي - المنيا الجديدة</div><div style="text-align:center;color:#591420;font-size:12px;font-weight:700;margin-bottom:6px;">التقرير الكامل عن الخدمة</div><div class="report-body" style="height:510px;overflow:hidden;"></div>`;
    stage.appendChild(page);
    body = page.querySelector('.report-body');
    pages.push(page);
  }
  function createTable(title) {
    const section = document.createElement('div');
    section.style.cssText = 'margin:0 0 5px;';
    section.innerHTML = `${title ? `<div style="font-size:11px;font-weight:800;color:#591420;padding:2px 2px;">${escapeHTML(title)}</div>` : ''}<table style="${tableStyle}">${header}<tbody></tbody></table>`;
    body.appendChild(section);
    return section;
  }
  function appendSection(title, rows, summary) {
    if (!rows.length) return;
    let section = createTable(title);
    for (const row of rows) {
      const tr = document.createElement('tbody');
      tr.innerHTML = rowHtml(row, summary);
      const item = tr.firstElementChild;
      section.querySelector('tbody').appendChild(item);
      if (body.scrollHeight > body.clientHeight) {
        item.remove();
        if (!section.querySelector('tbody').children.length) section.remove();
        newPage();
        section = createTable(title);
        section.querySelector('tbody').appendChild(item);
      }
    }
  }
  try {
    newPage();
    appendSection('', [['الإجمالي', ...values(members)], ['النسبة', ...percentages]], true);
    sections.forEach((section) => appendSection(section.title, section.rows, false));
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    await _pdfRenderPages(pdf, pages.map((p) => p.outerHTML), pageW, pageH);
    pdf.save(`التقرير_العددي_الكامل_${perfExportStamp()}.pdf`);
  } finally {
    stage.remove();
  }
  showToast('تم تصدير التقرير العددي الكامل', 'success');
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
