/* ==========================================================================
   coptic-calendar.js — وحدة «التقويم الكنسي» (Anba-Bishoy-Church website).
   Static, client-only. No backend, no AI, no external services.
   Lazy-loads calendar/data/*.json via fetch() only when the section is
   opened, exactly like the bible/*.json pattern. Memory cache only.

   Contents:
     1. Names (Coptic/Gregorian months, weekdays in Arabic).
     2. Pure date math: Gregorian<->JDN, Coptic<->JDN, Coptic Easter
        (Meeus Julian algorithm), paramoun rule. No DOM, no fetch —
        fully testable in Node (see calendar/README.md).
     3. CalendarStore — the 5 JSON files loader with in-memory cache.
     4. calResolveDay — pure day resolver (feasts, saints, season,
        fasting status, readings) driven by the JSON data files.
     5. CalendarUI — page renderer + route dispatcher for #/bible/calendar
        (called from BibleUI only; never touches MembersDB/VisitationDB).
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/*  1. Names                                                              */
/* ---------------------------------------------------------------------- */
const COPTIC_MONTHS = ['توت', 'بابه', 'هاتور', 'كيهك', 'طوبة', 'أمشير',
  'برمهات', 'برمودة', 'بشنس', 'بؤونة', 'أبيب', 'مسرى', 'النسيء'];
const GREG_MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/* Index 0 = Sunday, matching calWeekday(). */
const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء',
  'الخميس', 'الجمعة', 'السبت'];
/* Saturday-first order for the month grid (Egyptian wall-calendar style). */
const WEEKDAYS_SAT_FIRST = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء',
  'الأربعاء', 'الخميس', 'الجمعة'];

/* ---------------------------------------------------------------------- */
/*  2. Pure date math (no DOM, no fetch)                                  */
/* ---------------------------------------------------------------------- */

/* Gregorian civil date -> Julian Day Number (Meeus, integer). */
function calGregorianToJdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2
    + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}

/* Julian Day Number -> Gregorian civil date { y, m, d }. */
function calJdnToGregorian(j) {
  const a = j + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    y: 100 * b + d - 4800 + Math.floor(m / 10),
    m: m + 3 - 12 * Math.floor(m / 10),
    d: e - Math.floor((153 * m + 2) / 5) + 1,
  };
}

/* Coptic epoch: 1 Thout 1 AM = 29 August 284 (Julian) = JDN 1825030.
   Verified anchor: 1 Thout 1738 AM = 11 September 2021. */
const COPTIC_EPOCH = 1825029; // JDN(1 Thout 1 AM) - 1

/* A Coptic year is leap (6 days of Nasie) when year % 4 === 3. */
function calCopticLeap(y) { return y % 4 === 3; }

function calCopticToJdn(y, m, d) {
  return COPTIC_EPOCH + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d;
}

/* Julian Day Number -> Coptic date { y, m, d }. The leap day (6 Nasie)
   belongs to the 3rd year of each 4-year cycle (years 3, 7, 11, ...). */
function calJdnToCoptic(j) {
  const r = j - COPTIC_EPOCH; // 1-based day count from 1 Thout 1 AM
  const era = Math.floor((r - 1) / 1461);
  const rem = (r - 1) % 1461; // 0-based day inside the 4-year cycle
  let yInCycle;
  let dayOfYear;
  if (rem < 365) { yInCycle = 0; dayOfYear = rem + 1; }
  else if (rem < 730) { yInCycle = 1; dayOfYear = rem - 365 + 1; }
  else if (rem < 1096) { yInCycle = 2; dayOfYear = rem - 730 + 1; }
  else { yInCycle = 3; dayOfYear = rem - 1096 + 1; }
  const month = Math.min(13, Math.floor((dayOfYear - 1) / 30) + 1);
  return { y: era * 4 + yInCycle + 1, m: month, d: dayOfYear - (month - 1) * 30 };
}

/* Weekday: 0 = Sunday .. 6 = Saturday. */
function calWeekday(j) { return (((j + 1) % 7) + 7) % 7; }

/* Julian-calendar civil date -> JDN (for the Easter computation). */
function calJulianToJdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - 32083;
}

/* Coptic Easter Sunday of a Gregorian year -> JDN (Meeus Julian algorithm,
   converted to the Gregorian calendar). Verified 2021-2031 (see README). */
function calEasterJdn(gy) {
  const a = gy % 4;
  const b = gy % 7;
  const c = gy % 19;
  const dd = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - dd + 34) % 7;
  const mp = Math.floor((dd + e + 114) / 31); // Julian month
  const dp = ((dd + e + 114) % 31) + 1;       // Julian day
  return calJulianToJdn(gy, mp, dp);
}

/* Paramoun days (JDN list) before a feast on Gregorian (gy, gm, gd):
   feast Sunday -> Fri+Sat; feast Monday -> Fri+Sat+Sun; else -> day before. */
function calParamounJdns(gy, gm, gd) {
  const f = calGregorianToJdn(gy, gm, gd);
  const wd = calWeekday(f);
  if (wd === 0) return [f - 2, f - 1];
  if (wd === 1) return [f - 3, f - 2, f - 1];
  return [f - 1];
}

/* ---------------------------------------------------------------------- */
/*  3. CalendarStore — lazy JSON loader + memory cache                    */
/* ---------------------------------------------------------------------- */
const CalendarStore = {
  _promise: null,
  _data: null,

  load() {
    if (!this._promise) {
      const files = ['feasts-fixed', 'feasts-movable', 'saints', 'fasts', 'readings'];
      this._promise = Promise.all(files.map(async (f) => {
        const res = await fetch(`calendar/data/${f}.json`);
        if (!res.ok) throw new Error('تعذر تحميل بيانات التقويم');
        return res.json();
      })).then(([fixed, movable, saints, fasts, readings]) => {
        this._data = { fixed, movable, saints, fasts, readings };
        return this._data;
      }).catch((err) => {
        this._promise = null; // a later attempt may retry (e.g. back online)
        throw err;
      });
    }
    return this._promise;
  },
};

/* ---------------------------------------------------------------------- */
/*  4. calResolveDay — pure day resolver (data-driven)                    */
/* ---------------------------------------------------------------------- */

/* Fast-period boundaries for a Gregorian year, as JDN ranges.
   Movable fasts anchor to Easter of the same Gregorian year (all of them
   fall inside it: Jonah >= Jan 24, Apostles ends Jul 11). */
function calFastPeriods(gy, D) {
  const E = calEasterJdn(gy);
  const out = [];
  for (const p of D.fasts.periods) {
    let start;
    let end;
    if (p.id === 'nativity') {
      // Starts 16 Hathor of the Coptic year holding Jan 6; ends Jan 6.
      const yC = calJdnToCoptic(calGregorianToJdn(gy, 1, 6)).y;
      start = calCopticToJdn(yC, 3, 16);
      end = calGregorianToJdn(gy, 1, 6);
    } else if (p.id === 'virgin') {
      // 1-15 Mesori of the Coptic year holding Aug 7.
      const yC = calJdnToCoptic(calGregorianToJdn(gy, 8, 7)).y;
      start = calCopticToJdn(yC, 12, 1);
      end = calCopticToJdn(yC, 12, 15);
    } else if (p.id === 'apostles') {
      start = E + 50; // the day after Pentecost
      end = calGregorianToJdn(gy, 7, 11);
    } else {
      start = E + p.start.easterOffset;
      end = E + p.end.easterOffset;
    }
    out.push({
      id: p.id, name: p.name, degree: p.degree, fish: p.fish,
      abstinence: p.abstinence, desc: p.desc || '', start, end,
    });
  }
  return out;
}

/* Refa3 (feast-eve) markers: movable ones live in feasts-movable.json;
   the two fixed ones are resolved here. Returns [{ jdn, name }]. */
function calRefa3Markers(gy, D) {
  const E = calEasterJdn(gy);
  const out = [];
  for (const p of D.fasts.periods) {
    if (!p.refa3) continue;
    if (p.refa3.easterOffset != null) continue; // already a movable "day"
    if (p.id === 'nativity') {
      const yC = calJdnToCoptic(calGregorianToJdn(gy, 1, 6)).y;
      out.push({ jdn: calCopticToJdn(yC, 3, 15), name: `رفاع ${p.name}` });
    } else if (p.id === 'virgin') {
      const yC = calJdnToCoptic(calGregorianToJdn(gy, 8, 7)).y;
      out.push({ jdn: calCopticToJdn(yC, 11, 30), name: `رفاع ${p.name}` });
    }
  }
  return out;
}

function calResolveFast(jdn, g, wd, offset, feasts, gyPeriods) {
  const isWedFri = wd === 3 || wd === 5;
  const isChristmas = g.m === 1 && g.d === 7;
  const isEpiphany = g.m === 1 && g.d === 19;
  // 1. The 50 holy days: no fasting at all, even Wed/Fri.
  if (offset >= 0 && offset <= 49) {
    return { fasting: false, label: 'إفطار — الخمسون المقدسة', detail: 'فترة فرح لا صوم فيها.' };
  }
  // 2. Christmas and Epiphany fully break even a Wed/Fri fast.
  if (isChristmas || isEpiphany) {
    return { fasting: false, label: isChristmas ? 'إفطار — عيد الميلاد المجيد' : 'إفطار — عيد الغطاس المجيد', detail: 'عيد سيدي كبير يُفطر تمامًا.' };
  }
  // 3. Paramoun days (strict; on Sat/Sun: fasting food without abstinence).
  for (const pm of gyPeriods.paramouns) {
    if (pm.jdns.includes(jdn)) {
      const weekend = wd === 0 || wd === 6;
      return {
        fasting: true, name: pm.name, degree: 1, fish: false,
        abstinence: !weekend,
        label: weekend ? `صوم — ${pm.name} (بدون انقطاع)` : `صوم انقطاعي — ${pm.name}`,
        detail: 'صوم انقطاعي حتى الغروب — بدون لحوم وألبان وسمك.',
      };
    }
  }
  // 4. The five fasting periods.
  for (const p of gyPeriods.periods) {
    if (jdn < p.start || jdn > p.end) continue;
    const noFish = p.fish === false || (p.fish === 'except-wed-fri' && isWedFri);
    return {
      fasting: true, name: p.name, degree: p.degree, fish: !noFish,
      abstinence: p.abstinence,
      label: `صوم انقطاعي — ${p.name}`,
      detail: noFish
        ? 'أطعمة صيامي فقط — بدون لحوم وألبان وسمك.'
        : 'يُسمح بالسمك (ما عدا الأربعاء والجمعة).',
    };
  }
  // 5. Weekly Wednesday/Friday fast; a minor Lordly feast that day lifts
  //    only the abstinence (fasting food remains).
  if (isWedFri) {
    const minorLord = feasts.some((f) => f.kind === 'lord' && f.rank === 'minor');
    return {
      fasting: true, name: 'صوم الأربعاء والجمعة', degree: 1, fish: false,
      abstinence: !minorLord,
      label: minorLord ? 'صوم — عيد سيدي (بدون انقطاع)' : 'صوم انقطاعي — الأربعاء والجمعة',
      detail: minorLord
        ? 'عيد سيدي يكسر الانقطاع فقط — الأكل بأطعمة صيامي.'
        : 'أطعمة صيامي فقط — بدون لحوم وألبان وسمك.',
    };
  }
  // 6. Feast day otherwise.
  return { fasting: false, label: 'إفطار', detail: 'لا صوم اليوم.' };
}

/* Full day resolution. D = the 5 loaded JSON docs. Returns everything the
   UI needs; movable feasts use Easter of the day's own Gregorian year. */
function calResolveDay(jdn, D) {
  const g = calJdnToGregorian(jdn);
  const c = calJdnToCoptic(jdn);
  const wd = calWeekday(jdn);
  const E = calEasterJdn(g.y);
  const offset = jdn - E;

  // Movable feast days (incl. refa3 markers with kind 'refa3').
  const feasts = [];
  for (const f of D.movable.days) {
    if (f.offset === offset) {
      feasts.push({ name: f.name, rank: f.rank || null, kind: f.kind, desc: f.desc || '' });
    }
  }
  // Fixed feasts (Coptic-anchored, except Christmas/Epiphany: Gregorian).
  for (const f of D.fixed.feasts) {
    const hit = f.greg
      ? (g.m === f.greg[0] && g.d === f.greg[1])
      : (c.m === f.m && c.d === f.d);
    if (hit) feasts.push({ name: f.name, rank: f.rank || null, kind: f.kind, desc: f.desc || '' });
  }
  // Fixed refa3 markers (Nativity + Virgin).
  for (const r of calRefa3Markers(g.y, D).concat(calRefa3Markers(g.y + 1, D))) {
    if (r.jdn === jdn) feasts.push({ name: r.name, rank: null, kind: 'refa3', desc: '' });
  }

  // Saints + angels.
  const saints = [];
  for (const s of D.saints.commemorations) {
    if (c.m === s.m && c.d === s.d) {
      saints.push({ name: s.name, type: s.type, kind: s.kind || 'saint', desc: s.desc || '' });
    }
  }
  // Monthly commemorations (the 29th skips Tobi and Amshir; a monthly
  // entry is hidden when the same day already carries that kind of feast).
  const hasLord = feasts.some((f) => f.kind === 'lord');
  const hasVirgin = feasts.some((f) => f.kind === 'virgin');
  for (const rule of D.saints.monthly) {
    if (c.d !== rule.day) continue;
    if (rule.exceptMonths && rule.exceptMonths.includes(c.m)) continue;
    if (rule.kind === 'lord' && hasLord) continue;
    if (rule.kind === 'virgin' && hasVirgin) continue;
    saints.push({ name: rule.name, type: 'تذكار شهري', kind: rule.kind });
  }

  // Season: the most specific matching range wins (file order).
  let season = null;
  for (const s of D.movable.seasons) {
    if (offset >= s.from && offset <= s.to) season = s.name;
  }

  // Documented readings (chapter level only).
  const readings = [];
  for (const r of D.readings.readings) {
    if (typeof r.easterOffset === 'number') {
      if (r.easterOffset === offset) readings.push(r);
    } else if (offset >= r.fromOffset && offset <= r.toOffset) {
      readings.push(r);
    }
  }

  // Fasting status. The Nativity fast spans Jan 1, so periods of both the
  // current and the previous Gregorian year are considered.
  const paramouns = [];
  for (const gy of [g.y - 1, g.y]) {
    for (const [gm, gd, nm] of [[1, 7, 'برامون عيد الميلاد'], [1, 19, 'برامون عيد الغطاس']]) {
      paramouns.push({ name: nm, jdns: calParamounJdns(gy, gm, gd) });
    }
  }
  const periods = calFastPeriods(g.y, D).concat(
    // The Nativity fast spans Jan 1 (Nov -> Jan 6), so November/December
    // days also consult next Gregorian year's fast.
    (g.m === 11 || g.m === 12) ? calFastPeriods(g.y + 1, D).filter((p) => p.id === 'nativity') : [],
  );
  const fast = calResolveFast(jdn, g, wd, offset, feasts, { periods, paramouns });

  return {
    jdn, g, c, wd, weekday: WEEKDAYS_AR[wd], easterOffset: offset,
    feasts, saints, season, readings, fast,
  };
}

/* Export pure helpers for Node verification (harmless in the browser). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calGregorianToJdn, calJdnToGregorian, calCopticToJdn, calJdnToCoptic,
    calCopticLeap, calWeekday, calEasterJdn, calParamounJdns,
    calFastPeriods, calRefa3Markers, calResolveDay,
    COPTIC_MONTHS, GREG_MONTHS_AR, WEEKDAYS_AR,
  };
}

/* ---------------------------------------------------------------------- */
/*  5. CalendarUI — #/bible/calendar page (browser only)                  */
/* ---------------------------------------------------------------------- */
if (typeof document !== 'undefined') {
const CAL_ICONS = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M5 8h14"/></svg>',
};

function calEscape(str) {
  if (typeof escapeHTML === 'function') return escapeHTML(str);
  return (str ?? '').toString().replace(/[&<>\"']/g, (s) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[s]));
}

function calFormatGreg(g) {
  return `${g.d} ${GREG_MONTHS_AR[g.m - 1]} ${g.y}`;
}

function calFormatCoptic(c) {
  return `${c.d} ${COPTIC_MONTHS[c.m - 1]} ${c.y} ش.`;
}

const CalendarUI = {
  _page: 0,

  route(segments, params) {
    this._page += 1;
    return this.main(params || {});
  },

  chrome() {
    document.getElementById('topNav').innerHTML = `\n      <span><a href="#/bible" class="back-link">${CAL_ICONS.back}<span>رجوع للكتاب المقدس</span></a></span>\n      <span></span>`;
  },

  /* One full day card (used for "today" and for the selected grid day). */
  dayCardHTML(day, title) {
    const feastRows = day.feasts.map((f) => {
      const badge = f.kind === 'refa3'
        ? '<span class="cal-badge cal-badge-refa3">رفاع</span>'
        : f.rank === 'major'
          ? '<span class="cal-badge cal-badge-major">عيد كبير</span>'
          : f.rank === 'minor'
            ? '<span class="cal-badge cal-badge-minor">عيد صغير</span>'
            : '<span class="cal-badge">مناسبة</span>';
      return `<li class="cal-event">${badge}<span><strong>${calEscape(f.name)}</strong>${f.desc ? `<br><span class="cal-event-desc">${calEscape(f.desc)}</span>` : ''}</span></li>`;
    }).join('');
    const saintRows = day.saints.map((s) => (
      `<li class="cal-event"><span class="cal-badge cal-badge-saint">${calEscape(s.type || 'تذكار')}</span><span><strong>${calEscape(s.name)}</strong>${s.desc ? `<br><span class="cal-event-desc">${calEscape(s.desc)}</span>` : ''}</span></li>`
    )).join('');
    const readingRows = day.readings.map((r) => (
      `<li class="cal-event"><span class="cal-badge cal-badge-reading">قراءة</span><span><strong>${calEscape(r.ref)}</strong>${r.note ? `<br><span class="cal-event-desc">${calEscape(r.note)}</span>` : ''}</span></li>`
    )).join('');
    const emptyEvents = (!feastRows && !saintRows)
      ? '<li class="cal-event cal-event-empty">لا توجد أعياد أو تذكارات مسجلة في هذا اليوم.</li>' : '';
    return `
      <section class="cal-card cal-today">
        <p class="cal-card-kicker">${calEscape(title)}</p>
        <h3 class="cal-day-coptic">${calEscape(day.weekday)}، ${calEscape(calFormatCoptic(day.c))}</h3>
        <p class="cal-day-greg">${calEscape(calFormatGreg(day.g))}</p>
        <div class="cal-chips">
          ${day.season ? `<span class="cal-chip cal-chip-season">${calEscape(day.season)}</span>` : ''}
          <span class="cal-chip ${day.fast.fasting ? 'cal-chip-fast' : 'cal-chip-feast'}">${calEscape(day.fast.label)}</span>
        </div>
        <p class="cal-fast-detail">${calEscape(day.fast.detail)}</p>
        <ul class="cal-events">
          ${feastRows}${saintRows}${emptyEvents}
        </ul>
        ${readingRows ? `<h4 class="cal-subhead">قراءات اليوم</h4><ul class="cal-events">${readingRows}</ul>` : ''}
      </section>`;
  },

  /* Gregorian month grid, Saturday-first, with Coptic dates + markers. */
  monthHTML(gy, gm, D, selectedJdn) {
    const firstJdn = calGregorianToJdn(gy, gm, 1);
    const nextJdn = gm === 12 ? calGregorianToJdn(gy + 1, 1, 1) : calGregorianToJdn(gy, gm + 1, 1);
    const days = nextJdn - firstJdn;
    const lead = (calWeekday(firstJdn) + 1) % 7; // blanks before day 1 (Sat-first)
    const today = new Date();
    const todayJdn = calGregorianToJdn(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const prev = gm === 1 ? { y: gy - 1, m: 12 } : { y: gy, m: gm - 1 };
    const next = gm === 12 ? { y: gy + 1, m: 1 } : { y: gy, m: gm + 1 };
    let cells = '';
    for (let i = 0; i < lead; i += 1) cells += '<span class="cal-cell cal-cell-blank"></span>';
    for (let d = 1; d <= days; d += 1) {
      const jdn = firstJdn + d - 1;
      const day = calResolveDay(jdn, D);
      const major = day.feasts.some((f) => f.rank === 'major');
      const minor = day.feasts.some((f) => f.rank === 'minor');
      const hasSaint = day.saints.length > 0;
      const cls = ['cal-cell'];
      if (day.fast.fasting) cls.push('is-fast');
      if (jdn === todayJdn) cls.push('is-today');
      if (jdn === selectedJdn) cls.push('is-selected');
      cells += `<button type="button" class="${cls.join(' ')}" data-jdn="${jdn}" aria-label="${calEscape(calFormatGreg(day.g))}">`
        + `<span class="cal-cell-g">${d}</span>`
        + `<span class="cal-cell-c">${day.c.d} ${COPTIC_MONTHS[day.c.m - 1]}</span>`
        + `<span class="cal-dots">`
        + (major ? '<i class="cal-dot dot-major"></i>' : '')
        + (minor ? '<i class="cal-dot dot-minor"></i>' : '')
        + (hasSaint ? '<i class="cal-dot dot-saint"></i>' : '')
        + `</span></button>`;
    }
    return `
      <section class="cal-card">
        <div class="cal-month-nav">
          <a class="btn btn-outline btn-sm" href="#/bible/calendar?y=${prev.y}&m=${prev.m}">→ ${calEscape(GREG_MONTHS_AR[prev.m - 1])}</a>
          <h3 class="cal-month-title">${calEscape(GREG_MONTHS_AR[gm - 1])} ${gy}</h3>
          <a class="btn btn-outline btn-sm" href="#/bible/calendar?y=${next.y}&m=${next.m}">${calEscape(GREG_MONTHS_AR[next.m - 1])} ←</a>
        </div>
        <div class="cal-grid" role="grid">
          ${WEEKDAYS_SAT_FIRST.map((w) => `<span class="cal-dow">${w}</span>`).join('')}
          ${cells}
        </div>
        <div class="cal-legend">
          <span><i class="cal-dot dot-major"></i> عيد كبير</span>
          <span><i class="cal-dot dot-minor"></i> عيد صغير</span>
          <span><i class="cal-dot dot-saint"></i> تذكار قديس</span>
          <span><i class="cal-swatch sw-fast"></i> يوم صوم</span>
        </div>
        <p class="cal-note">اضغط على أي يوم لعرض تفاصيله. <a href="#/bible/calendar">الرجوع لليوم الحالي</a></p>
      </section>`;
  },

  /* Next feast/fast/season highlights after today. */
  upcomingHTML(todayJdn, D) {
    const items = [];
    let prevSeason = calResolveDay(todayJdn, D).season;
    let prevFastName = null;
    for (let j = todayJdn + 1; j <= todayJdn + 120 && items.length < 12; j += 1) {
      const day = calResolveDay(j, D);
      const names = [];
      for (const f of day.feasts) {
        if (f.rank === 'major' || f.rank === 'minor' || f.kind === 'refa3') names.push(f.name);
      }
      if (day.season && day.season !== prevSeason) names.unshift(`بدء ${day.season}`);
      const fastName = day.fast.fasting ? day.fast.name : null;
      if (fastName && fastName !== prevFastName
          && !names.some((n) => n.includes(fastName.replace('صوم ', '')))) {
        names.push(`بدء ${fastName}`);
      }
      prevSeason = day.season;
      prevFastName = fastName;
      if (names.length) {
        items.push({ jdn: j, g: day.g, c: day.c, names });
      }
    }
    if (!items.length) return '';
    return `
      <section class="cal-card">
        <h3 class="cal-section-head">المناسبات القادمة</h3>
        <ul class="cal-upcoming">
          ${items.map((it) => `
            <li>
              <a href="#/bible/calendar?y=${it.g.y}&m=${it.g.m}&day=${it.g.d}">
                <span class="cal-up-date">${calEscape(calFormatGreg(it.g))} <span class="cal-up-coptic">(${calEscape(calFormatCoptic(it.c))})</span></span>
                <span class="cal-up-names">${it.names.map(calEscape).join(' · ')}</span>
              </a>
            </li>`).join('')}
        </ul>
      </section>`;
  },

  /* The five fasts + paramouns with real dates for a Gregorian year. */
  fastsHTML(gy, D) {
    const periods = calFastPeriods(gy, D);
    // Nativity fast starting in November of this year ends next Jan 6.
    const yCNat = calJdnToCoptic(calGregorianToJdn(gy + 1, 1, 6)).y;
    const natStart = calCopticToJdn(yCNat, 3, 16);
    const natEnd = calGregorianToJdn(gy + 1, 1, 6);
    const rows = periods.map((p) => {
      const s = p.id === 'nativity' ? natStart : p.start;
      const e = p.id === 'nativity' ? natEnd : p.end;
      const days = e - s + 1;
      const food = p.fish === false
        ? 'بدون سمك'
        : 'يُسمح بالسمك ما عدا الأربعاء والجمعة';
      return `<tr><td>${calEscape(p.name)}</td>`
        + `<td>${calEscape(calFormatGreg(calJdnToGregorian(s)))} — ${calEscape(calFormatGreg(calJdnToGregorian(e)))}</td>`
        + `<td>${days} يومًا</td><td>${calEscape(food)}</td></tr>`;
    }).join('');
    const pmXmas = calParamounJdns(gy, 1, 7).map((j) => calFormatGreg(calJdnToGregorian(j))).join('، ');
    const pmEph = calParamounJdns(gy, 1, 19).map((j) => calFormatGreg(calJdnToGregorian(j))).join('، ');
    return `
      <section class="cal-card">
        <h3 class="cal-section-head">أصوام سنة ${gy}</h3>
        <div class="cal-table-wrap"><table class="cal-table">
          <thead><tr><th>الصوم</th><th>الفترة</th><th>المدة</th><th>الطعام</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <ul class="cal-paramoun">
          <li>برامون عيد الميلاد ${gy}: ${calEscape(pmXmas)} (صوم انقطاعي بدون سمك).</li>
          <li>برامون عيد الغطاس ${gy}: ${calEscape(pmEph)} (صوم انقطاعي بدون سمك).</li>
          <li>صوم الأربعاء والجمعة أسبوعيًا — ما عدا الخمسين المقدسة وعيدي الميلاد والغطاس.</li>
        </ul>
      </section>`;
  },

  /* #/bible/calendar — full page. */
  async main(params) {
    const page = this._page;
    this.chrome();
    const root = document.getElementById('app');
    const now = new Date();
    let gy = parseInt(params.y, 10);
    let gm = parseInt(params.m, 10);
    if (!(gy >= 1900 && gy <= 2200)) gy = now.getFullYear();
    if (!(gm >= 1 && gm <= 12)) gm = now.getMonth() + 1;
    const selDay = parseInt(params.day, 10);
    let D;
    try {
      D = await CalendarStore.load();
    } catch (e) {
      if (page !== this._page) return;
      root.innerHTML = `<div class="container"><div class="empty-state">${CAL_ICONS.calendar}<p>تعذر تحميل بيانات التقويم الكنسي</p><p style="font-size:.85rem;">تحقق من الاتصال ثم أعد المحاولة.</p></div></div>`;
      return;
    }
    if (page !== this._page) return;
    const todayJdn = calGregorianToJdn(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const todayDay = calResolveDay(todayJdn, D);
    const dim = (gm === 12 ? calGregorianToJdn(gy + 1, 1, 1) : calGregorianToJdn(gy, gm + 1, 1)) - calGregorianToJdn(gy, gm, 1);
    const selectedJdn = (selDay >= 1 && selDay <= dim) ? calGregorianToJdn(gy, gm, selDay) : null;
    root.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/bible">الكتاب المقدس</a><span class="sep">/</span><span>التقويم الكنسي</span></p>
        <h2 class="section-title">التقويم الكنسي</h2>
        <p class="section-sub">الأعياد والأصوام والتذكارات والقراءات — بالتقويمين القبطي والميلادي</p>
        <div class="cross-divider">${CAL_ICONS.cross}</div>
        ${this.dayCardHTML(todayDay, 'اليوم')}
        ${this.monthHTML(gy, gm, D, selectedJdn)}
        <div id="calDetail">${selectedJdn && selectedJdn !== todayJdn ? this.dayCardHTML(calResolveDay(selectedJdn, D), 'اليوم المحدد') : ''}</div>
        ${this.upcomingHTML(todayJdn, D)}
        ${this.fastsHTML(gy, D)}
        <section class="cal-card cal-sources">
          <h3 class="cal-section-head">عن هذه البيانات</h3>
          <p>مواعيد الأعياد والأصوام محسوبة من قاعدة عيد القيامة القبطي، ومدققة مع النتيجة القبطية السنوية لموقع الأنبا تكلا (st-takla.org). التفاصيل والمصادر الكاملة في ملف <code>calendar/README.md</code> المرفق مع الموقع.</p>
        </section>
      </div>`;
    // In-page day picking (no extra routes): tapping a grid cell renders
    // its details right under the month grid.
    const grid = root.querySelector('.cal-grid');
    const detail = document.getElementById('calDetail');
    if (grid && detail) {
      grid.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button.cal-cell[data-jdn]');
        if (!btn) return;
        const jdn = parseInt(btn.dataset.jdn, 10);
        root.querySelectorAll('.cal-cell.is-selected').forEach((el) => el.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        detail.innerHTML = jdn === todayJdn
          ? ''
          : this.dayCardHTML(calResolveDay(jdn, D), 'اليوم المحدد');
        if (jdn !== todayJdn && typeof detail.scrollIntoView === 'function') {
          try { detail.scrollIntoView({ block: 'nearest' }); } catch (e) { /* old browsers */ }
        }
      });
    }
  },
};

if (typeof window !== 'undefined') window.CalendarUI = CalendarUI;
}
