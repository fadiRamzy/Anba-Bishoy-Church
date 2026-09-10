/* ==========================================================================
   calendar-fab.js — floating Coptic Orthodox Church Calendar button.
   Visible on every site page (the script is global in index.html). Reads
   TODAY's information from the EXISTING calendar module only
   (coptic-calendar.js + calendar/data/*.json via CalendarStore) — it
   duplicates no data, adds no engine, and changes no calculation.
   The button is a plain anchor to #/bible/calendar, so navigation uses
   the site's existing hash router untouched.
   ========================================================================== */
(function () {
  'use strict';

  var FAB_ID = 'calFab';
  var ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';

  function engineReady() {
    return typeof calGregorianToJdn === 'function'
      && typeof calJdnToCoptic === 'function'
      && typeof COPTIC_MONTHS !== 'undefined';
  }

  function todayJdn() {
    var now = new Date();
    return calGregorianToJdn(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function copticDateText(jdn) {
    var c = calJdnToCoptic(jdn);
    return c.d + ' ' + COPTIC_MONTHS[c.m - 1] + ' ' + c.y;
  }

  /* Priority: major feast > minor feast > refa3 > saint (fixed first,
     then monthly) > season > current fast > Coptic date fallback. */
  function pickLabel(day) {
    var i;
    for (i = 0; i < day.feasts.length; i += 1) {
      if (day.feasts[i].rank === 'major') {
        return { text: day.feasts[i].name, dot: 'dot-gold' };
      }
    }
    for (i = 0; i < day.feasts.length; i += 1) {
      if (day.feasts[i].rank === 'minor') {
        return { text: day.feasts[i].name, dot: 'dot-maroon' };
      }
    }
    for (i = 0; i < day.feasts.length; i += 1) {
      if (day.feasts[i].kind === 'refa3') {
        return { text: day.feasts[i].name, dot: 'dot-maroon' };
      }
    }
    var monthly = null;
    for (i = 0; i < day.saints.length; i += 1) {
      if (day.saints[i].type === 'تذكار شهري') {
        if (!monthly) monthly = day.saints[i];
      } else {
        return { text: day.saints[i].name, dot: 'dot-maroon' };
      }
    }
    if (monthly) return { text: monthly.name, dot: 'dot-maroon' };
    if (day.season) return { text: day.season, dot: null };
    if (day.fast && day.fast.fasting && day.fast.name) {
      return { text: day.fast.name, dot: null };
    }
    return { text: copticDateText(day.jdn), dot: null };
  }

  function paint(fab, text, dot) {
    var label = fab.querySelector('.cal-fab-label');
    var dotEl = fab.querySelector('.cal-fab-dot');
    label.textContent = text;
    label.hidden = false;
    fab.setAttribute('aria-label', 'التقويم الكنسي — ' + text);
    if (dot) {
      dotEl.hidden = false;
      dotEl.className = 'cal-fab-dot ' + dot;
    } else {
      dotEl.hidden = true;
    }
  }

  function refresh(fab) {
    if (!engineReady()) {
      // Calendar engine unavailable: keep a bare button (still navigates).
      fab.querySelector('.cal-fab-label').hidden = true;
      return;
    }
    var jdn;
    try {
      jdn = todayJdn();
      // Instant fallback needs no data files: today's Coptic date.
      paint(fab, copticDateText(jdn), null);
    } catch (e) {
      fab.querySelector('.cal-fab-label').hidden = true;
      return;
    }
    // Enrich with feast/saint info from the existing module data.
    if (typeof CalendarStore === 'undefined' || typeof calResolveDay !== 'function') return;
    CalendarStore.load().then(function (D) {
      var picked = pickLabel(calResolveDay(jdn, D));
      paint(fab, picked.text, picked.dot);
    }).catch(function () { /* offline: keep the Coptic-date fallback */ });
  }

  function init() {
    if (document.getElementById(FAB_ID)) return; // mounted once
    var fab = document.createElement('a');
    fab.id = FAB_ID;
    fab.className = 'cal-fab';
    fab.href = '#/bible/calendar';
    fab.title = 'التقويم الكنسي';
    fab.setAttribute('aria-label', 'التقويم الكنسي');
    fab.innerHTML = '<span class="cal-fab-label" hidden></span>'
      + '<span class="cal-fab-btn">' + ICON_CALENDAR
      + '<span class="cal-fab-dot" hidden></span></span>';
    document.body.appendChild(fab);
    refresh(fab);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Minimal test hook (read-only; no behaviour change).
  if (typeof window !== 'undefined') {
    window.CalendarFab = { pickLabel: pickLabel, refreshNow: init };
  }
})();
