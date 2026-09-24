/* ==========================================================================
   app-shell.js — mobile-app shell polish (UI only).

   Adds presentation behaviour around the existing app: bottom-tab state,
   per-screen content height (identity banner shown on hub screens only),
   page-transition re-triggering, a route progress bar, app-bar elevation on
   scroll and dialog/sheet state on <body>.

   It never touches data, routes, storage or any function of app.js / db.js /
   bible.js / coptic-calendar.js — it only reads location.hash and observes
   DOM mutations in order to style them.
   ========================================================================== */
(function () {
  'use strict';

  var appRoot = document.getElementById('app');
  var appBar = document.getElementById('appBar');
  var tabBar = document.getElementById('tabBar');
  var progress = document.getElementById('routeProgress');

  /* ---------------------------------------------------------------------- */
  /*  Which tab owns which existing route                                    */
  /* ---------------------------------------------------------------------- */
  var TAB_BY_SEGMENT = {
    '': 'home',
    home: 'directory',
    search: 'directory',
    browse: 'directory',
    member: 'directory',
    add: 'directory',
    edit: 'directory',
    birthdays: 'directory',
    visitation: 'visitation',
    bible: 'bible',
    admin: 'admin',
  };

  /* Screens that keep the church identity banner (eparchy + verse). */
  var HUB_PATHS = { '': 1, home: 1, visitation: 1, bible: 1 };

  function currentPath() {
    var raw = (window.location.hash || '').replace(/^#\/?/, '');
    return raw.split('?')[0].replace(/\/+$/, '');
  }

  function firstSegment() {
    var parts = currentPath().split('/').filter(Boolean);
    return parts.length ? decodeURIComponent(parts[0]) : '';
  }

  function syncChrome() {
    var path = currentPath();
    var seg = firstSegment();

    /* active tab */
    if (tabBar) {
      var activeTab = TAB_BY_SEGMENT[seg] || 'home';
      var items = tabBar.querySelectorAll('.tab-item');
      for (var i = 0; i < items.length; i++) {
        var isActive = items[i].getAttribute('data-tab') === activeTab;
        items[i].classList.toggle('active', isActive);
        if (isActive) items[i].setAttribute('aria-current', 'page');
        else items[i].removeAttribute('aria-current');
      }
    }

    /* identity banner only on hub screens, so inner screens start higher */
    var depth = (path === '' || HUB_PATHS[path]) ? 'hub' : 'page';
    if (document.body.getAttribute('data-depth') !== depth) {
      document.body.setAttribute('data-depth', depth);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Route progress bar                                                     */
  /* ---------------------------------------------------------------------- */
  var progressTimer = null;

  function startProgress() {
    if (!progress) return;
    progress.classList.remove('is-done');
    progress.classList.add('is-active');
    clearTimeout(progressTimer);
    // Safety net: never leave the bar hanging if a screen renders nothing.
    progressTimer = setTimeout(finishProgress, 1800);
  }

  function finishProgress() {
    if (!progress || !progress.classList.contains('is-active')) return;
    progress.classList.add('is-done');
    setTimeout(function () {
      progress.classList.remove('is-active', 'is-done');
    }, 620);
  }

  /* ---------------------------------------------------------------------- */
  /*  Screen transition: re-run the entrance animation after each render     */
  /* ---------------------------------------------------------------------- */
  function pulseScreen() {
    if (!appRoot) return;
    appRoot.classList.remove('page-enter');
    void appRoot.offsetWidth; /* force reflow so the animation restarts */
    appRoot.classList.add('page-enter');
  }

  if (appRoot && typeof MutationObserver === 'function') {
    new MutationObserver(function () {
      pulseScreen();
      finishProgress();
      document.documentElement.classList.remove('app-booting');
    }).observe(appRoot, { childList: true });
  }

  /* ---------------------------------------------------------------------- */
  /*  Dialog / bottom-sheet awareness (dialogs are created by app.js)        */
  /* ---------------------------------------------------------------------- */
  function syncModalState() {
    var open = !!document.querySelector('.pin-modal-backdrop');
    document.body.classList.toggle('has-modal', open);
  }

  if (typeof MutationObserver === 'function') {
    new MutationObserver(syncModalState).observe(document.body, { childList: true });
  }

  /* ---------------------------------------------------------------------- */
  /*  App-bar elevation while scrolling                                      */
  /* ---------------------------------------------------------------------- */
  function syncScroll() {
    if (!appBar) return;
    appBar.classList.toggle('is-scrolled', window.scrollY > 6);
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      syncScroll();
    });
  }, { passive: true });

  /* ---------------------------------------------------------------------- */
  /*  Wire up                                                               */
  /* ---------------------------------------------------------------------- */
  window.addEventListener('hashchange', function () {
    startProgress();
    syncChrome();
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncChrome();
    syncModalState();
    syncScroll();
  });

  // The app boots asynchronously; run once immediately too so the first
  // screen already has its chrome state.
  syncChrome();
  syncModalState();
  syncScroll();
  startProgress();
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    document.documentElement.classList.remove('app-booting');
  }
})();
