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

  /* The header survives route renders; the existing appearance setting is
     the single source of truth for both this button and Administration. */
  var topNav = document.getElementById('topNav');
  if (topNav && topNav.parentNode) {
    var themeToggle = document.createElement('button');
    themeToggle.type = 'button';
    themeToggle.id = 'themeToggle';
    themeToggle.className = 'theme-toggle';
    topNav.parentNode.insertBefore(themeToggle, topNav.nextSibling);
    var sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M19.07 4.93l-1.42 1.42M6.35 17.65l-1.42 1.42"/></svg>';
    var moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 15.2A8.8 8.8 0 018.8 3.5 9 9 0 1020.5 15.2z"/></svg>';
    function syncAppearanceControl() {
      var dark = document.documentElement.dataset.appearance === 'dark';
      themeToggle.innerHTML = dark ? moon : sun;
      themeToggle.title = dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن';
      themeToggle.setAttribute('aria-label', themeToggle.title);
      themeToggle.setAttribute('aria-pressed', String(dark));
      document.querySelectorAll('[data-appearance-choice]').forEach(function (choice) {
        choice.setAttribute('aria-pressed', String(choice.dataset.appearanceChoice === (dark ? 'dark' : 'light')));
      });
    }
    themeToggle.addEventListener('click', function () {
      if (typeof window.setChurchAppearance === 'function') {
        window.setChurchAppearance(document.documentElement.dataset.appearance === 'dark' ? 'light' : 'dark');
        syncAppearanceControl();
      }
    });
    new MutationObserver(syncAppearanceControl).observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] });
    syncAppearanceControl();
  }

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
    attendance: 'directory',
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
