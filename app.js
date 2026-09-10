/* ==========================================================================
   app.js — routing, rendering, and all UI behaviour.
   Static, client-only. No network calls except loading data/seed.json once.
   ========================================================================== */

const APP_ROOT = document.getElementById('app');
const TOAST = document.getElementById('toast');

/* ---------------------------------------------------------------------- */
/*  Icons (inline SVG, stroke-based, currentColor)                        */
/* ---------------------------------------------------------------------- */
const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  sector: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V21H3z"/><path d="M9 21v-7h6v7"/></svg>',
  neighborhood: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  journey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19c3-1 4-3 4-5s-2-3-2-5 2-4 5-4 5 2 5 4-2 3-2 5 1 4 4 5"/><circle cx="4" cy="19" r="1.4"/><circle cx="20" cy="19" r="1.4"/></svg>',
  city: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l5-4v16M14 21V4l6 3v14M4 21h16M9 9h1M9 13h1M17 11h1M17 15h1"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .6 2.9a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.9.3 1.9.5 2.9.6a2 2 0 011.8 2.1z"/></svg>',
  location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 12h6M9 16h6M9 8h2"/></svg>',
  church: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M10 4h4M4 22V11l8-6 8 6v11M4 22h16M9 22v-6h6v6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.6-1.8"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9m0 0l-4 4m4-4l4 4M4 3h16"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M5 8h14"/><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="21" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="8" r="1" fill="currentColor" stroke="none"/></svg>',
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7a2 2 0 012-2h12a2 2 0 012 2v7M2 21h20M4 14a3 3 0 013-3h10a3 3 0 013 3M9 9V6M12 9V6M15 9V6M9 6c0-.8.5-1.2.5-2S9 2.5 9 2M12 6c0-.8.5-1.2.5-2S12 2.5 12 2M15 6c0-.8.5-1.2.5-2S15 2.5 15 2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c-2-1.5-5-2-8-2v16c3 0 6 .5 8 2 2-1.5 5-2 8-2V3c-3 0-6 .5-8 2z"/><path d="M12 5v16"/></svg>',
};

/* ---------------------------------------------------------------------- */
/*  Header branding: verse shown differs by top-level section.            */
/*  "home" = دليل الخدمات (the original site, unchanged).                  */
/*  "landing" / "visitation" = the new platform-level pages.              */
/* ---------------------------------------------------------------------- */
const BRAND_VERSES = {
  home: {
    text: 'ثُمَّ قَالَ بُولُسُ لِبَرْنَابَا: لِنَرْجِعْ وَنَفْتَقِدْ إِخْوَتَنَا فِي كُلِّ مَدِينَةٍ نَادَيْنَا فِيهَا بِكَلِمَةِ الرَّبِّ كَيْفَ هُمْ.',
    ref: 'أَعْمَالُ الرُّسُلِ ١٥ : ٣٦',
  },
  landing: {
    text: '«إِلَهُ السَّمَاءِ هُوَ يُعْطِينَا النَّجَاحَ، وَنَحْنُ عَبِيدُهُ نَقُومُ وَنَبْنِي»',
    ref: 'نَحَمْيَا ٢: ٢٠',
  },
  visitation: {
    text: '«إِنْ كَانَ لِإِنْسَانٍ مِئَةُ خَرُوفٍ، وَضَلَّ وَاحِدٌ مِنْهَا، أَفَلَا يَتْرُكُ التِّسْعَةَ وَالتِّسْعِينَ عَلَى الْجِبَالِ، وَيَذْهَبُ يَطْلُبُ الضَّالَّ؟»',
    ref: 'مَتَّى ١٨: ١٢',
  },
  bible: {
    text: 'سِرَاجٌ لِرِجْلِي كَلَامُكَ وَنُورٌ لِسَبِيلِي.',
    ref: 'اَلْمَزَامِيرُ ١١٩ : ١٠٥',
  },
};

const BRAND_TAGLINES = {
  home: 'دليل الخدام لمتابعة الافتقاد',
  landing: 'دليل خدمات الكنيسة',
  visitation: 'دليل الكاهن لمتابعة الافتقاد',
  bible: 'الكتاب المقدس',
};

function applyHeaderChrome(section) {
  const verse = BRAND_VERSES[section] || BRAND_VERSES.home;
  const verseEl = document.getElementById('brandVerse');
  const refEl = document.getElementById('brandVerseRef');
  if (verseEl) verseEl.textContent = verse.text;
  if (refEl) refEl.textContent = verse.ref;
  const taglineEl = document.getElementById('brandTagline');
  if (taglineEl) taglineEl.textContent = BRAND_TAGLINES[section] || BRAND_TAGLINES.home;
  const footer = document.getElementById('siteFooter');
  if (footer) footer.style.display = (section === 'home') ? '' : 'none';
  document.body.setAttribute('data-section', section);
}

/* ---------------------------------------------------------------------- */
/*  Field metadata                                                        */
/* ---------------------------------------------------------------------- */
const FIELD_LABELS = {
  name: 'الاسم', phone1: 'رقم الموبايل', phone2: 'رقم الموبايل (2)',
  city: 'المدينة', neighborhood: 'الحي', street: 'الشارع',
  stage: 'الرحلة (مرحله)', sector: 'القطاع', class: 'الفصل',
  birthDate: 'تاريخ الميلاد', age: 'السن', notes: 'الملاحظات',
};

const NAV_SECTIONS = [
  { key: 'sector', field: 'sector', label: 'القطاع', icon: 'sector' },
  { key: 'neighborhood', field: 'neighborhood', label: 'الحي', icon: 'neighborhood' },
  { key: 'stage', field: 'stage', label: 'المرحلة', icon: 'journey' },
  { key: 'city', field: 'city', label: 'المدينة', icon: 'city' },
];

/* تصفية: broad stage/sector categories reused for in-context filtering
   inside a browse page (e.g. داخل الحي المختار). Reuses existing sector values. */
const CATEGORY_DEFS = [
  { label: 'حضانه', match: (m) => m.sector === 'حضانه' },
  { label: 'ابتدائي', match: (m) => m.sector === 'ابتدائي_أ' || m.sector === 'ابتدائي_ب' },
  { label: 'إعدادي', match: (m) => m.sector === 'اعدادي' || m.sector === 'اعدادي بنين' || m.sector === 'اعدادي بنات' },
  { label: 'ثانوي', match: (m) => m.sector === 'ثانوي' || m.sector === 'ثانوي بنين' || m.sector === 'ثانوي بنات' },
  { label: 'جامعة', match: (m) => m.sector === 'اجتماع الشباب' || m.sector === 'جامعة شباب' || m.sector === 'جامعة شابات' },
  { label: 'خريجين', match: (m) => m.sector === 'اجتماع الخريجين' || m.sector === 'خريجين شباب' || m.sector === 'خريجين شابات' },
];

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */
function escapeHTML(str) {
  return (str ?? '').toString().replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showToast(message, kind = '') {
  TOAST.textContent = message;
  TOAST.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { TOAST.className = 'toast'; }, 2600);
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return (parts[0]?.[0] || '؟');
}

function computeAge(member) {
  if (member.birthDate) {
    const d = new Date(member.birthDate);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
      if (age >= 0 && age < 130) return age;
    }
  }
  if (typeof member.age === 'number' && !isNaN(member.age)) return member.age;
  return null;
}

const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function formatBirthDate(member) {
  if (member.birthDate) {
    const d = new Date(member.birthDate);
    if (!isNaN(d.getTime())) {
      return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
  }
  if (member.birthDay && member.birthMonth && member.birthYear) {
    const mIdx = Number(member.birthMonth) - 1;
    if (mIdx >= 0 && mIdx < 12) return `${member.birthDay} ${ARABIC_MONTHS[mIdx]} ${member.birthYear}`;
  }
  return null;
}

/* Egyptian mobile display fix: 10-digit numbers missing the leading 0 get it added.
   Numbers already starting with 0 are left as-is. Display-only. */
function formatPhone(value) {
  const digits = (value || '').toString().trim();
  if (!digits) return '';
  return (digits.length === 10 && digits[0] !== '0') ? '0' + digits : digits;
}

function phoneLinkHTML(value) {
  const formatted = formatPhone(value);
  if (!formatted) return '<span class="muted">غير متوفر</span>';
  return `<a href="tel:${escapeHTML(formatted)}" class="location-link">${escapeHTML(formatted)}</a>`;
}

function fieldOrFallback(value) {
  if (value === null || value === undefined || value === '') {
    return '<span class="muted">غير متوفر</span>';
  }
  return escapeHTML(value);
}

/* "الشارع" field: if the stored value is an http/https URL (e.g. a Google Maps
   link), render it as a clickable link. Otherwise show it as plain text,
   exactly as before. Never alters the stored value itself. */
function streetFieldHTML(value) {
  if (value === null || value === undefined || value === '') {
    return '<span class="muted">غير متوفر</span>';
  }
  const str = value.toString().trim();
  if (/^https?:\/\/\S+$/i.test(str)) {
    return `<a href="${escapeHTML(str)}" target="_blank" rel="noopener noreferrer" class="location-link">${ICONS.location} فتح الموقع على Google Maps</a>`;
  }
  return escapeHTML(str);
}

/* Display-only cleanup: strips underscores/extra separators for user-facing
   labels (المرحلة / القطاع / الفصل). Never touches the underlying stored value. */
function cleanLabel(value) {
  if (value === null || value === undefined) return '';
  return value.toString().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function navigate(hash) {
  window.location.hash = hash;
}

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const params = {};
  if (queryPart) {
    queryPart.split('&').forEach((pair) => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }
  return { segments, params };
}

/* ---------------------------------------------------------------------- */
/*  Admin / write-access gate                                             */
/* ---------------------------------------------------------------------- */
const ADMIN_PIN_HASH = 'b51e45a12fbae3d0ee2bf77f1a4f80cbf642e2b4d1c237d2c0f7053a54f6b388';

const Admin = {
  unlockedKey: 'admin_unlocked',

  isUnlocked() {
    return sessionStorage.getItem(this.unlockedKey) === '1';
  },

  lock() {
    sessionStorage.removeItem(this.unlockedKey);
    renderAdminButton();
    showToast('تم قفل وضع الإدارة');
  },

  async require() {
    if (this.isUnlocked()) return true;
    return this.promptPin(ADMIN_PIN_HASH);
  },

  promptPin(storedHash) {
    return new Promise((resolve) => {
      openPinModal({
        title: 'رمز وضع الإدارة',
        message: 'من فضلك ادخل رمز الإدارة للمتابعة في التعديل.',
        confirmLabel: 'دخول',
        onSubmit: async (pin, close) => {
          const hash = await sha256Hex(pin || '');
          if (hash !== storedHash) return 'الرمز غير صحيح';
          sessionStorage.setItem(this.unlockedKey, '1');
          renderAdminButton();
          close();
          showToast('تم تفعيل وضع الإدارة', 'success');
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  },
};

function openPinModal({ title, message, confirmLabel, onSubmit, onCancel }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'pin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="pin-modal" role="dialog" aria-modal="true">
      <h3>${escapeHTML(title)}</h3>
      <p style="color:var(--color-ink-soft);font-size:.88rem;">${escapeHTML(message)}</p>
      <input type="password" inputmode="numeric" maxlength="12" placeholder="••••" autofocus />
      <div class="field-error" style="min-height:1.2em;"></div>
      <div class="form-actions" style="justify-content:center;">
        <button class="btn btn-outline btn-cancel">إلغاء</button>
        <button class="btn btn-primary btn-confirm">${escapeHTML(confirmLabel)}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const input = backdrop.querySelector('input');
  const errorEl = backdrop.querySelector('.field-error');
  const close = () => backdrop.remove();

  backdrop.querySelector('.btn-cancel').addEventListener('click', () => { close(); onCancel && onCancel(); });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { close(); onCancel && onCancel(); } });

  const submit = async () => {
    const err = await onSubmit(input.value.trim(), close);
    if (err) { errorEl.textContent = err; input.focus(); }
  };
  backdrop.querySelector('.btn-confirm').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => input.focus(), 30);
}

/* ---------------------------------------------------------------------- */
/*  خدمات الافتقاد — entry password gate (separate from Admin's PIN).      */
/*  Reuses the exact same openPinModal() pattern as Admin above.          */
/* ---------------------------------------------------------------------- */
const VISITATION_PIN_HASH = 'eb5af8ab99b55cda453f70e6a92c7b327bd8f76f49ff6a81c18ade4c26690057';

const VisitationAuth = {
  // Stores only today's date string (e.g. "2026-09-08") — never the
  // password itself. Authentication is valid for that calendar day only;
  // once the local date changes, isUnlocked() stops matching and the
  // password is requested again.
  unlockedKey: 'visitation_unlocked_date',

  todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  },

  isUnlocked() {
    return localStorage.getItem(this.unlockedKey) === this.todayStr();
  },

  require() {
    if (this.isUnlocked()) return Promise.resolve(true);
    return new Promise((resolve) => {
      openPinModal({
        title: 'خدمات الافتقاد',
        message: 'من فضلك أدخل كلمة المرور للدخول إلى خدمات الافتقاد.',
        confirmLabel: 'دخول',
        onSubmit: async (pin, close) => {
          const hash = await sha256Hex(pin || '');
          if (hash !== VISITATION_PIN_HASH) return 'كلمة المرور غير صحيحة';
          localStorage.setItem(this.unlockedKey, this.todayStr());
          close();
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  },
};

function renderAdminButton() {
  const btn = document.getElementById('adminToggle');
  if (!btn) return;
  const unlocked = Admin.isUnlocked();
  btn.classList.toggle('active', unlocked);
  btn.innerHTML = unlocked
    ? `${ICONS.unlock} <span>وضع الإدارة مفعّل</span>`
    : `${ICONS.lock} <span>وضع الإدارة</span>`;
}

/* ---------------------------------------------------------------------- */
/*  Layout chrome (header nav row + admin toggle)                         */
/* ---------------------------------------------------------------------- */
function renderChrome(showBack, backHash) {
  const nav = document.getElementById('topNav');
  nav.innerHTML = `
    <span>${showBack ? `<a href="#${backHash || '/home'}" class="back-link">${ICONS.back}<span>رجوع للرئيسية</span></a>` : ''}</span>
    <button id="adminToggle" class="admin-toggle" type="button"></button>
  `;
  document.getElementById('adminToggle').addEventListener('click', async () => {
    if (Admin.isUnlocked()) {
      Admin.lock();
    } else {
      await Admin.require();
    }
  });
  renderAdminButton();
}

/* ---------------------------------------------------------------------- */
/*  Router                                                                 */
/* ---------------------------------------------------------------------- */
let lastRouterPath = null;
async function router() {
  const { segments, params } = parseHash();
  const currentPath = segments.join('/');
  // Only reset scroll when navigating to a genuinely different page/section.
  // Query-param-only changes (filter chips, admin lock toggle, etc. on the
  // same page) must not yank the user back to the top.
  if (currentPath !== lastRouterPath) {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  lastRouterPath = currentPath;

  // Platform-level main landing page (the two big service buttons).
  if (segments.length === 0) { applyHeaderChrome('landing'); return renderLanding(); }

  // "خدمات الافتقاد" — password-gated before entering (see item 12).
  if (segments[0] === 'visitation') {
    const ok = await VisitationAuth.require();
    if (!ok) { navigate('/'); return; }
    applyHeaderChrome('visitation');
    if (segments.length === 1) return renderVisitationHome(params);
    if (segments[1] === 'add') return renderVisitationForm(null);
    if (segments[1] === 'edit' && segments[2]) return renderVisitationForm(segments[2]);
    if (segments[1] === 'member' && segments[2]) return renderVisitationProfile(segments[2]);
    if (segments[1] === 'families') return renderVisitationFamilies(params);
    if (segments[1] === 'guide') return renderVisitationGuide();
    if (segments[1] === 'data') return renderVisitationDataManagement();
    return renderVisitationHome(params);
  }

  // "الكتاب المقدس" — read-only Bible + commentary section. All rendering
  // lives in bible/bible.js (BibleUI); this branch only dispatches to it.
  if (segments[0] === 'bible') {
    applyHeaderChrome('bible');
    return BibleUI.route(segments, params);
  }

  // "دليل الخدمات" — the original, existing website, unchanged, now living
  // under the /home (and its existing sub-routes) instead of the bare root.
  applyHeaderChrome('home');
  if (segments[0] === 'home') return renderHome(params);
  if (segments[0] === 'search') return renderSearch(params);
  if (segments[0] === 'browse' && segments[1]) return renderBrowse(segments[1], segments[2], params);
  if (segments[0] === 'member' && segments[1]) return renderProfile(segments[1]);
  if (segments[0] === 'add') return renderForm(null);
  if (segments[0] === 'edit' && segments[1]) return renderForm(segments[1]);
  if (segments[0] === 'admin') return renderAdminPanel();
  if (segments[0] === 'birthdays') return renderBirthdays();
  applyHeaderChrome('landing');
  return renderLanding();
}

window.addEventListener('hashchange', router);

/* ---------------------------------------------------------------------- */
/*  APK/WebView compatibility for tel: and Google Maps links only.
    Simple "URL to APK" wrappers (e.g. H2APK) often fail to open tel: and
    target="_blank" map links because they don't implement multi-window
    creation and sometimes miss non-http schemes. This only activates
    inside an Android WebView (detected via the standard "; wv" UA token)
    and forces a top-level navigation so the wrapper's external-URL/intent
    handling can catch it. Normal browsers are completely unaffected.   */
/* ---------------------------------------------------------------------- */
function isAndroidWebView() {
  return /Android/i.test(navigator.userAgent) && /; ?wv\)/i.test(navigator.userAgent);
}
if (isAndroidWebView()) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const isTel = href.startsWith('tel:');
    const isMaps = /google\.com\/maps|maps\.google\.com/i.test(href);
    if (isTel || isMaps) {
      e.preventDefault();
      window.location.href = href;
    }
  });
}

/* ---------------------------------------------------------------------- */
/*  Main platform landing page — entry point of the whole site now.       */
/*  Shows the available services as large cards. For this step there are  */
/*  only two: the existing "دليل الخدمات" site, and a placeholder for      */
/*  "خدمات الافتقاد".                                                      */
/* ---------------------------------------------------------------------- */
async function renderLanding() {
  document.getElementById('topNav').innerHTML = '';
  APP_ROOT.innerHTML = `
    <div class="container">
      <div class="cross-divider">${ICONS.cross}</div>
      <div class="landing-grid">
        <a href="#/home" class="landing-card">
          <span class="icon-wrap">${ICONS.notes}</span>
          <span class="landing-card-title">دليل الخدمات</span>
        </a>
        <a href="#/visitation" class="landing-card">
          <span class="icon-wrap">${ICONS.church}</span>
          <span class="landing-card-title">خدمات الافتقاد</span>
        </a>
        <a href="#/bible" class="landing-card">
          <span class="icon-wrap">${ICONS.book}</span>
          <span class="landing-card-title">الكتاب المقدس</span>
        </a>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/*  خدمات الافتقاد — Visitation Services                                   */
/*  Separate data store (VisitationDB) and pages, reusing the existing     */
/*  site's components/styling/database patterns wherever possible.        */
/* ---------------------------------------------------------------------- */
function renderVisitationChrome(backHash, backLabel) {
  // Close any reminder panel left open from a previous visitation page.
  const openPanel = document.getElementById('visitationReminderPanel');
  if (openPanel) openPanel.remove();

  document.getElementById('topNav').innerHTML = `
    <span><a href="#${backHash}" class="back-link">${ICONS.back}<span>${escapeHTML(backLabel)}</span></a></span>
    <span>
      <button type="button" class="visitation-reminder-btn" id="visitationReminderBtn">
        ${ICONS.bell}<span>اُرعَ خرافي</span>
        <span class="reminder-badge" id="visitationReminderBadge" hidden>0</span>
      </button>
    </span>
  `;
  setupVisitationReminderButton();
}

/* ---------------------------------------------------------------------- */
/*  "افتكر مخدومك" — in-page reminder of people overdue for visitation.    */
/*  Visible only on #/visitation pages (rendered inside renderVisitationChrome). */
/* ---------------------------------------------------------------------- */
// Families with no visitation in this many days (or never visited) are
// considered to currently "require visitation attention".
const VISITATION_REMINDER_THRESHOLD_DAYS = 30;

async function getVisitationReminders() {
  const all = await VisitationDB.getAll();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withGap = all.map((f) => {
    const dates = Array.isArray(f.visitationDates) ? f.visitationDates.slice().sort((a, b) => b.localeCompare(a)) : [];
    const latest = dates[0] || null;
    let days;
    if (latest) {
      const ld = new Date(`${latest}T00:00:00`);
      days = Math.floor((today - ld) / 86400000);
    } else {
      days = Infinity; // never visited — most urgent
    }
    return { family: f, latest, days };
  });

  return withGap
    .filter((x) => x.days >= VISITATION_REMINDER_THRESHOLD_DAYS)
    .sort((a, b) => {
      if (a.days === b.days) return 0;
      return a.days > b.days ? -1 : 1; // longest-overdue first
    });
}

function visitationReminderRowHTML(item) {
  const addressParts = [item.family.neighborhood, item.family.street].filter(Boolean);
  const address = addressParts.join(' - ');
  const firstName = (item.family.name || '').trim().split(/\s+/)[0] || item.family.name;
  const elapsedLine = item.latest
    ? `<div class="reminder-date-elapsed">لم يتم افتقاد ${escapeHTML(firstName)} منذ ${formatElapsedSince(item.latest)}</div>`
    : '';
  return `
    <a class="reminder-row" href="#/visitation/member/${item.family.id}">
      <div class="reminder-name">${escapeHTML(item.family.name)}</div>
      <div class="reminder-address ${address ? '' : 'muted'}">${address ? escapeHTML(address) : 'العنوان غير مسجل'}</div>
      <div class="reminder-date">تاريخ آخر افتقاد: ${item.latest ? formatDMY(item.latest) : 'لا يوجد افتقاد مسجل بعد'}</div>
      ${elapsedLine}
    </a>`;
}

function openVisitationReminderPanel(anchorBtn, reminders) {
  const panel = document.createElement('div');
  panel.id = 'visitationReminderPanel';
  panel.className = 'reminder-panel';
  panel.innerHTML = `
    <div class="reminder-panel-header">
      <h3>اُرعَ خرافي</h3>
      <button type="button" class="reminder-panel-close" aria-label="إغلاق">&times;</button>
    </div>
    <div class="reminder-panel-body">
      ${reminders.length ? reminders.map(visitationReminderRowHTML).join('') : `<div class="empty-state">${ICONS.empty}<p>لا يوجد مخدومين محتاجين افتقاد حاليًا</p></div>`}
    </div>
  `;
  document.body.appendChild(panel);

  const rect = anchorBtn.getBoundingClientRect();
  panel.style.top = `${rect.bottom + window.scrollY + 8}px`;
  panel.style.right = `${window.innerWidth - rect.right}px`;

  const close = () => panel.remove();
  panel.querySelector('.reminder-panel-close').addEventListener('click', close);
  setTimeout(() => {
    document.addEventListener('click', function onDocClick(e) {
      if (!panel.isConnected) { document.removeEventListener('click', onDocClick); return; }
      if (!panel.contains(e.target) && !anchorBtn.contains(e.target)) {
        close();
        document.removeEventListener('click', onDocClick);
      }
    });
  }, 0);
}

async function setupVisitationReminderButton() {
  const btn = document.getElementById('visitationReminderBtn');
  const badge = document.getElementById('visitationReminderBadge');
  if (!btn) return;

  const reminders = await getVisitationReminders();
  if (!btn.isConnected) return; // page navigated away while we were reading the DB
  if (reminders.length) {
    badge.textContent = String(reminders.length);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  btn.addEventListener('click', () => {
    const existing = document.getElementById('visitationReminderPanel');
    if (existing) { existing.remove(); return; }
    openVisitationReminderPanel(btn, reminders);
  });
}

const MARITAL_STATUS_OPTIONS = ['أعزب', 'متزوج', 'متزوجة', 'أرمل', 'أرملة'];

/* الحالة الاجتماعية -> which spouse section (if any) to show. */
function visitationSpouseSectionFor(status) {
  if (status === 'متزوج' || status === 'أرمل') return 'wife';
  if (status === 'متزوجة' || status === 'أرملة') return 'husband';
  return null;
}

/* Visitation "إضافة أسرة" — الخدمة dropdown options (change 1). */
const VISITATION_SERVICE_OPTIONS = [
  'مدارس الأحد',
  'إعدادي',
  'ثانوي',
  'جامعة',
  'خريجين',
  'الاجتماع العام',
  'اجتماع الكرمة المثمرة',
  'اجتماع الصلاة',
];

/* 'YYYY-MM-DD' -> 'DD/MM/YYYY', string-based (no Date object) so the
   displayed day never shifts due to timezone conversion. */
function formatDMY(isoDateStr) {
  const parts = (isoDateStr || '').split('-');
  if (parts.length !== 3) return isoDateStr || '';
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

/* Small date-picker modal, reusing the exact same look/markup as
   openPinModal() (same CSS classes) but with a date input. */
function openDateModal({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'pin-modal-backdrop';
    backdrop.innerHTML = `
      <div class="pin-modal" role="dialog" aria-modal="true">
        <h3>${escapeHTML(title)}</h3>
        <p style="color:var(--color-ink-soft);font-size:.88rem;">${escapeHTML(message)}</p>
        <input type="date" />
        <div class="field-error" style="min-height:1.2em;"></div>
        <div class="form-actions" style="justify-content:center;">
          <button class="btn btn-outline btn-cancel">إلغاء</button>
          <button class="btn btn-primary btn-confirm">${escapeHTML(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('input');
    const errorEl = backdrop.querySelector('.field-error');
    const close = () => backdrop.remove();
    backdrop.querySelector('.btn-cancel').addEventListener('click', () => { close(); resolve(null); });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { close(); resolve(null); } });
    const submit = () => {
      if (!input.value) { errorEl.textContent = 'من فضلك اختر تاريخًا'; return; }
      close();
      resolve(input.value);
    };
    backdrop.querySelector('.btn-confirm').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 30);
  });
}

function visitationCardHTML(f) {
  const latest = latestVisitationDate(f);
  const addressPart = [f.neighborhood, f.street].filter(Boolean).join(' - ');
  return `
    <a href="#/visitation/member/${f.id}" class="member-card visitation-card">
      <span class="member-avatar">${escapeHTML(initials(f.name))}</span>
      <span class="member-info">
        <span class="member-name">${escapeHTML(f.name)}</span>
        ${f.job ? `<span class="member-job">${escapeHTML(f.job)}</span>` : ''}
        ${addressPart ? `<span class="member-address">${escapeHTML(addressPart)}</span>` : ''}
        <span class="member-meta-visit">تاريخ آخر افتقاد - ${latest ? formatDMY(latest) : 'لم يتم الافتقاد بعد'}</span>
      </span>
    </a>`;
}

function renderVisitationListOrEmpty(list, emptyMessage) {
  if (!list.length) return `<div class="empty-state">${ICONS.empty}<p>${emptyMessage}</p></div>`;
  return `<div class="member-list">${list.map(visitationCardHTML).join('')}</div>`;
}

/* #/visitation — search box + "إضافة أسرة" / "الأسر" / "دليل الافتقاد" /
   "إدارة بيانات الافتقاد" entry buttons. The full registered list still
   lives on #/visitation/families (with its own filters) — this page only
   shows matches while the user is actively searching. */
async function renderVisitationHome() {
  renderVisitationChrome('/', 'رجوع للصفحة الرئيسية');
  const total = await VisitationDB.count();

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><span>خدمات الافتقاد</span></p>

      <div class="search-panel">
        <form id="visitationHomeSearchForm">
          <div class="search-box">
            ${ICONS.search}
            <input type="text" id="visitationHomeSearchInput" placeholder="ابحث بالاسم، الموبايل، الوظيفة، المدينة، الحي، الشارع..." autocomplete="off" />
          </div>
        </form>
        <p class="search-hint">${total} أسرة مسجّلة على هذا الجهاز</p>
      </div>

      <div class="visitation-home-actions">
        <a href="#/visitation/add" class="btn btn-primary">${ICONS.plus}<span>إضافة أسرة</span></a>
        <a href="#/visitation/families" class="btn btn-outline">${ICONS.users}<span>الأسر</span></a>
        <a href="#/visitation/guide" class="btn btn-outline">${ICONS.calendar}<span>دليل الافتقاد</span></a>
        <a href="#/visitation/data" class="btn btn-outline">${ICONS.download}<span>إدارة بيانات الافتقاد</span></a>
      </div>

      <div id="visitationHomeResults"></div>
    </div>
  `;

  const searchInput = document.getElementById('visitationHomeSearchInput');
  const resultsBox = document.getElementById('visitationHomeResults');

  async function runHomeSearch() {
    const val = searchInput.value.trim();
    if (!val) { resultsBox.innerHTML = ''; return; } // no query -> no full-list dump
    const results = await VisitationDB.searchAll(val);
    const emptyMsg = `لا توجد أسر مطابقة لـ "${escapeHTML(val)}"`;
    resultsBox.innerHTML = renderVisitationListOrEmpty(results, emptyMsg);
  }
  searchInput.addEventListener('input', debounce(runHomeSearch, 200));
  document.getElementById('visitationHomeSearchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runHomeSearch();
  });
}

/* #/visitation/families — complete registered list with search + filters
   (change 2). Reads straight from VisitationDB; no separate data store. */
function uniqueSortedValues(values) {
  const set = new Set(values.filter(Boolean).map((v) => v.toString().trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
}

function plainOptionsHTML(values, selected) {
  return values.map((v) => `<option value="${escapeHTML(v)}" ${v === selected ? 'selected' : ''}>${escapeHTML(v)}</option>`).join('');
}

function familyMatchesFilters(f, filters) {
  if (filters.neighborhood && (f.neighborhood || '') !== filters.neighborhood) return false;
  if (filters.job && (f.job || '') !== filters.job) return false;
  if (filters.service && (f.service || '') !== filters.service) return false;
  if (filters.confessionFather && (f.confessionFather || '') !== filters.confessionFather) return false;
  if (filters.birthMonth) {
    const parts = (f.birthDate || '').split('-');
    const month = parts.length === 3 ? Number(parts[1]) : null;
    if (month !== Number(filters.birthMonth)) return false;
  }
  return true;
}

async function renderVisitationFamilies() {
  renderVisitationChrome('/visitation', 'رجوع لخدمات الافتقاد');
  const all = await VisitationDB.getAll();

  const neighborhoods = uniqueSortedValues(all.map((f) => f.neighborhood));
  const jobs = uniqueSortedValues(all.map((f) => f.job));
  const services = uniqueSortedValues(all.map((f) => f.service));
  const confessionFathers = uniqueSortedValues(all.map((f) => f.confessionFather));

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/visitation">خدمات الافتقاد</a><span class="sep">/</span><span>الأسر</span></p>
      <h2 class="section-title">الأسر</h2>

      <div class="search-panel">
        <form id="visitationSearchForm">
          <div class="search-box">
            ${ICONS.search}
            <input type="text" id="visitationSearchInput" placeholder="ابحث بالاسم، الموبايل، الوظيفة، المدينة، الحي، الشارع..." autocomplete="off" />
          </div>
        </form>
        <p class="search-hint" id="visitationResultsHint">${all.length} أسرة مسجّلة على هذا الجهاز</p>
      </div>

      <div class="filter-bar">
        <div class="field">
          <label for="filterNeighborhood">الحي</label>
          <select id="filterNeighborhood"><option value="">الكل</option>${plainOptionsHTML(neighborhoods)}</select>
        </div>
        <div class="field">
          <label for="filterJob">الوظيفة</label>
          <select id="filterJob"><option value="">الكل</option>${plainOptionsHTML(jobs)}</select>
        </div>
        <div class="field">
          <label for="filterService">الخدمة</label>
          <select id="filterService"><option value="">الكل</option>${plainOptionsHTML(services)}</select>
        </div>
        <div class="field">
          <label for="filterConfessionFather">أب الاعتراف</label>
          <select id="filterConfessionFather"><option value="">الكل</option>${plainOptionsHTML(confessionFathers)}</select>
        </div>
        <div class="field">
          <label for="filterBirthMonth">شهر الميلاد</label>
          <select id="filterBirthMonth"><option value="">الكل</option>${ARABIC_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
        </div>
        <div class="field filter-clear-field">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-outline btn-sm" id="clearFiltersBtn">مسح الفلتر</button>
        </div>
        <div class="field filter-clear-field">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-outline btn-sm" id="visitationFamiliesPdfBtn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-inline-end:4px;"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>استخراج PDF
          </button>
        </div>
      </div>

      <div id="visitationResults"></div>
    </div>
  `;

  const searchInput = document.getElementById('visitationSearchInput');
  const resultsBox = document.getElementById('visitationResults');
  const hintEl = document.getElementById('visitationResultsHint');
  const filterEls = {
    neighborhood: document.getElementById('filterNeighborhood'),
    job: document.getElementById('filterJob'),
    service: document.getElementById('filterService'),
    confessionFather: document.getElementById('filterConfessionFather'),
    birthMonth: document.getElementById('filterBirthMonth'),
  };

  let currentFiltered = all; // kept in sync with the results currently shown, for PDF export (change 3)

  async function refresh() {
    const query = searchInput.value.trim();
    const base = query ? await VisitationDB.searchAll(query) : all;
    const filters = {
      neighborhood: filterEls.neighborhood.value,
      job: filterEls.job.value,
      service: filterEls.service.value,
      confessionFather: filterEls.confessionFather.value,
      birthMonth: filterEls.birthMonth.value,
    };
    const filtered = base.filter((f) => familyMatchesFilters(f, filters));
    currentFiltered = filtered;
    const anyFilterActive = query || Object.values(filters).some(Boolean);
    const emptyMsg = anyFilterActive ? 'لا توجد أسر مطابقة لهذا البحث/الفلاتر' : 'لا توجد أسر مسجلة بعد';
    resultsBox.innerHTML = renderVisitationListOrEmpty(filtered, emptyMsg);
    hintEl.textContent = anyFilterActive ? `${filtered.length} من ${all.length} أسرة` : `${all.length} أسرة مسجّلة على هذا الجهاز`;
  }

  searchInput.addEventListener('input', debounce(refresh, 200));
  document.getElementById('visitationSearchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    refresh();
  });
  Object.values(filterEls).forEach((el) => el.addEventListener('change', refresh));
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    searchInput.value = '';
    Object.values(filterEls).forEach((el) => { el.value = ''; });
    refresh();
  });
  document.getElementById('visitationFamiliesPdfBtn').addEventListener('click', () => {
    downloadVisitationFamiliesPDF(currentFiltered);
  });

  refresh();
}

/* #/visitation/guide — "دليل الافتقاد" (change 3): only people with at least
   one visitation date, sorted longest-overdue first, with a dynamically
   computed (never stored) elapsed-time string. */
function arabicUnitPhrase(n, singular, dual, plural) {
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${n} ${plural}`;
  return `${n} ${singular}`;
}

function formatElapsedSince(isoDateStr) {
  const start = new Date(`${isoDateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const totalDays = Math.floor((now - start) / 86400000);
  if (totalDays <= 0) return 'اليوم';

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [];
  if (years > 0) parts.push(arabicUnitPhrase(years, 'سنة', 'سنتين', 'سنوات'));
  if (months > 0) parts.push(arabicUnitPhrase(months, 'شهر', 'شهرين', 'أشهر'));
  if (days > 0 || parts.length === 0) parts.push(arabicUnitPhrase(days, 'يوم', 'يومين', 'أيام'));
  return parts.join(' و ');
}

function latestVisitationDate(f) {
  const dates = Array.isArray(f.visitationDates) ? f.visitationDates.slice().sort((a, b) => b.localeCompare(a)) : [];
  return dates[0] || null;
}

function guideCardHTML(item) {
  const f = item.family;
  const addressPart = [f.neighborhood, f.street].filter(Boolean).join(' - ');
  const firstName = (f.name || '').trim().split(/\s+/)[0] || f.name;
  return `
    <a href="#/visitation/member/${f.id}" class="member-card visitation-card">
      <span class="member-avatar">${escapeHTML(initials(f.name))}</span>
      <span class="member-info">
        <span class="member-name">${escapeHTML(f.name)}</span>
        ${f.job ? `<span class="member-job">${escapeHTML(f.job)}</span>` : ''}
        ${addressPart ? `<span class="member-address">${escapeHTML(addressPart)}</span>` : ''}
        <span class="member-meta-visit">لم يتم افتقاد ${escapeHTML(firstName)} منذ ${item.elapsedText}</span>
      </span>
    </a>`;
}

async function renderVisitationGuide() {
  renderVisitationChrome('/visitation', 'رجوع لخدمات الافتقاد');
  const all = await VisitationDB.getAll();

  const withLatest = all
    .map((f) => ({ family: f, latest: latestVisitationDate(f) }))
    .filter((x) => x.latest); // only people with at least one visitation date

  withLatest.sort((a, b) => a.latest.localeCompare(b.latest)); // oldest last-visit first = longest overdue first

  const items = withLatest.map((x) => ({ ...x, elapsedText: formatElapsedSince(x.latest) }));

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/visitation">خدمات الافتقاد</a><span class="sep">/</span><span>دليل الافتقاد</span></p>
      <h2 class="section-title">دليل الافتقاد</h2>
      <p class="section-sub">الأسر مرتبة من الأطول غيابًا عن الافتقاد إلى الأحدث افتقادًا</p>
      <div id="visitationGuideResults">
        ${items.length ? `<div class="member-list">${items.map(guideCardHTML).join('')}</div>` : `<div class="empty-state">${ICONS.empty}<p>لا توجد أسر لها تاريخ افتقاد مسجل بعد</p></div>`}
      </div>
    </div>
  `;
}

/* #/visitation/data — "إدارة بيانات الافتقاد": export/import for the
   Visitation store only. Completely separate from renderAdminPanel()'s
   "إدارة البيانات" (which manages MembersDB/"دليل الخدمات") — different
   store, different route, different backup file, never mixed together. */
async function renderVisitationDataManagement() {
  renderVisitationChrome('/visitation', 'رجوع لخدمات الافتقاد');
  const total = await VisitationDB.count();

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/visitation">خدمات الافتقاد</a><span class="sep">/</span><span>إدارة بيانات الافتقاد</span></p>
      <h2 class="section-title">إدارة بيانات الافتقاد</h2>
      <p class="section-sub">تخص بيانات "خدمات الافتقاد" فقط، منفصلة تمامًا عن بيانات "دليل الخدمات" (${total} أسرة مسجّلة على هذا الجهاز).</p>

      <div class="admin-panel">
        <h3>${ICONS.download.replace('width="19"', 'width="17"')} تصدير بيانات الافتقاد</h3>
        <p>يحمّل ملف JSON يحتوي على كل أسر الافتقاد المسجلة على هذا الجهاز، بما في ذلك تاريخ الافتقاد الكامل لكل أسرة. شارك هذا الملف مع خادم آخر لنقل البيانات.</p>
        <div class="admin-actions">
          <button id="visitationExportBtn" class="btn btn-gold">${ICONS.download}<span>تنزيل بيانات الافتقاد</span></button>
        </div>
      </div>

      <div class="admin-panel">
        <h3>${ICONS.upload} استيراد بيانات الافتقاد</h3>
        <p>ارفع ملف بيانات افتقاد تم تصديره سابقًا من هذا التطبيق (من خادم آخر مثلًا) لإضافة أسره إلى هذا الجهاز. يمكنك اختيار ملف واحد أو عدة ملفات دفعة واحدة.</p>
        <div class="admin-actions">
          <label class="btn btn-outline" for="visitationImportFile" style="cursor:pointer;">${ICONS.upload}<span>اختيار ملف / ملفات</span></label>
          <input type="file" id="visitationImportFile" accept=".json,application/json" multiple style="display:none;" />
          <select id="visitationImportMode" class="btn btn-outline" style="padding:11px 14px;">
            <option value="merge">دمج مع بيانات الافتقاد الحالية</option>
            <option value="replace">استبدال كل بيانات الافتقاد الحالية</option>
          </select>
        </div>
      </div>

      <div class="admin-panel">
        <h3>${ICONS.trash} حذف جميع بيانات الافتقاد</h3>
        <p>يحذف كل أسر "خدمات الافتقاد" المسجلة على هذا الجهاز فقط. لا يؤثر إطلاقًا على بيانات "دليل الخدمات". يفضّل تصدير نسخة احتياطية قبل الحذف.</p>
        <div class="admin-actions">
          <button id="visitationWipeBtn" class="btn btn-danger">${ICONS.trash}<span>حذف جميع البيانات</span></button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('visitationExportBtn').addEventListener('click', async () => {
    const json = await VisitationDB.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `visitation-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تنزيل بيانات الافتقاد', 'success');
  });

  document.getElementById('visitationImportFile').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const mode = document.getElementById('visitationImportMode').value;
    try {
      // Read + validate ALL selected files first; abort without touching the
      // database if any file is invalid, so a bad file can't partially corrupt data.
      const parsedFiles = [];
      for (const file of files) {
        let text;
        try {
          text = await file.text();
        } catch (readErr) {
          throw new Error(`تعذر قراءة الملف "${file.name}"`);
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (parseErr) {
          throw new Error(`الملف "${file.name}" غير صالح (ليس JSON صحيحًا)`);
        }
        if (!Array.isArray(parsed)) {
          throw new Error(`الملف "${file.name}" لا يحتوي على مصفوفة بيانات صحيحة`);
        }
        parsedFiles.push(parsed);
      }
      const combined = parsedFiles.flat();
      const result = await VisitationDB.importRecords(combined, mode);
      const imported = (result && typeof result === 'object') ? result.imported : result;
      const skipped = (result && typeof result === 'object') ? result.skipped : 0;
      if (imported > 0) {
        showToast(
          skipped > 0
            ? `تم استيراد ${imported} أسرة جديدة، وتخطي ${skipped} أسرة مكررة.`
            : `تم استيراد ${imported} أسرة بنجاح`,
          'success'
        );
      } else {
        showToast(`لم يتم استيراد أسر جديدة. تم تخطي ${skipped} أسرة مكررة.`, 'success');
      }
      router();
    } catch (err) {
      showToast('الملف غير صالح: ' + err.message, 'danger');
    }
    e.target.value = '';
  });

  document.getElementById('visitationWipeBtn').addEventListener('click', async () => {
    if (!confirm('هل أنت متأكد من حذف جميع بيانات خدمات الافتقاد؟ هذا الإجراء لا يؤثر على بيانات دليل الخدمات، ولا يمكن التراجع عنه.')) return;
    await VisitationDB.clearAll();
    showToast('تم حذف جميع بيانات خدمات الافتقاد', 'success');
    router();
  });
}

/* Husband/wife/children sub-fields (شخص الزوج/الزوجة + الأبناء) — new
   fields on the existing "إضافة أسرة" form. Small self-contained helpers,
   kept local to the visitation form/profile so nothing shared is touched. */

/* Field labels for each spouse section, so every label unambiguously names
   which spouse it belongs to (never generic "الاسم"/"الوظيفة" regardless of
   section) — "الخدمة" and "السن" stay unprefixed by design. */
const SPOUSE_FIELD_LABELS = {
  husband: {
    title: 'بيانات الزوج',
    name: 'اسم الزوج',
    job: 'وظيفة الزوج',
    phone: 'رقم هاتف الزوج',
    confessionFather: 'أب اعتراف الزوج',
    birthDate: 'تاريخ ميلاد الزوج',
    age: 'السن (لو التاريخ غير متاح)',
    educationStage: 'المرحلة التعليمية للزوج',
    notes: 'ملاحظات الزوج',
  },
  wife: {
    title: 'بيانات الزوجة',
    name: 'اسم الزوجة',
    job: 'وظيفة الزوجة',
    phone: 'رقم هاتف الزوجة',
    confessionFather: 'أب اعتراف الزوجة',
    birthDate: 'تاريخ ميلاد الزوجة',
    age: 'السن (لو التاريخ غير متاح)',
    educationStage: 'المرحلة التعليمية للزوجة',
    notes: 'ملاحظات الزوجة',
  },
};

function visitationSpouseFieldsHTML(prefix, s, kind) {
  s = s || {};
  const L = SPOUSE_FIELD_LABELS[kind] || SPOUSE_FIELD_LABELS.husband;
  return `
    <div class="field">
      <label for="f_${prefix}_name">${L.name}</label>
      <input type="text" id="f_${prefix}_name" value="${escapeHTML(s.name || '')}" />
    </div>
    <div class="field">
      <label for="f_${prefix}_job">${L.job}</label>
      <input type="text" id="f_${prefix}_job" value="${escapeHTML(s.job || '')}" />
    </div>
    <div class="field">
      <label for="f_${prefix}_phone">${L.phone}</label>
      <input type="tel" id="f_${prefix}_phone" value="${escapeHTML(s.phone || '')}" />
    </div>
    <div class="field">
      <label for="f_${prefix}_confessionFather">${L.confessionFather}</label>
      <input type="text" id="f_${prefix}_confessionFather" value="${escapeHTML(s.confessionFather || '')}" />
    </div>
    ${selectFieldHTML({ field: `${prefix}_service`, label: 'الخدمة' }, s.service, VISITATION_SERVICE_OPTIONS)}
    <div class="field">
      <label for="f_${prefix}_serviceOther">خدمة أخرى</label>
      <input type="text" id="f_${prefix}_serviceOther" value="${escapeHTML(s.serviceOther || '')}" />
    </div>
    <div class="field">
      <label for="f_${prefix}_birthDate">${L.birthDate}</label>
      <input type="date" id="f_${prefix}_birthDate" value="${s.birthDate || ''}" />
    </div>
    <div class="field">
      <label for="f_${prefix}_age">${L.age}</label>
      <input type="number" min="0" max="130" id="f_${prefix}_age" value="${s.age ?? ''}" />
    </div>
    <div class="field">
      <label for="f_${prefix}_educationStage">${L.educationStage}</label>
      <input type="text" id="f_${prefix}_educationStage" value="${escapeHTML(s.educationStage || '')}" />
    </div>
    <div class="field full">
      <label for="f_${prefix}_notes">${L.notes}</label>
      <textarea id="f_${prefix}_notes">${escapeHTML(s.notes || '')}</textarea>
    </div>`;
}

/* Incrementing counter so every child row's birth-date/age inputs get a
   unique id on the page (required by wireBirthDateAgeSync(), which looks
   elements up via document.getElementById()). Never reset mid-page. */
let _childRowSeq = 0;

function visitationChildRowHTML(child) {
  child = child || {};
  const type = (child.type === 'ابنة') ? 'ابنة' : 'ابن';
  const uid = ++_childRowSeq;
  const birthId = `f_child_${uid}_birthDate`;
  const ageId = `f_child_${uid}_age`;
  return `
    <div class="child-row" style="flex-wrap:wrap;align-items:flex-end;">
      <select class="child-type-select">
        <option value="ابن" ${type === 'ابن' ? 'selected' : ''}>ابن</option>
        <option value="ابنة" ${type === 'ابنة' ? 'selected' : ''}>ابنة</option>
      </select>
      <input type="text" class="child-name-input" placeholder="اسم الابن/الابنة" value="${escapeHTML(child.name || '')}" />
      <button type="button" class="btn btn-outline btn-sm remove-child-btn" aria-label="حذف">${ICONS.trash}</button>
      <div class="subform-grid" style="flex:1 0 100%;margin-top:8px;">
        <div class="field">
          <label for="f_child_${uid}_educationStage">المرحلة التعليمية</label>
          <input type="text" class="child-educationStage-input" id="f_child_${uid}_educationStage" value="${escapeHTML(child.educationStage || '')}" />
        </div>
        <div class="field">
          <label for="f_child_${uid}_confessionFather">أب الاعتراف</label>
          <input type="text" class="child-confessionFather-input" id="f_child_${uid}_confessionFather" value="${escapeHTML(child.confessionFather || '')}" />
        </div>
        <div class="field">
          <label for="f_child_${uid}_phone">رقم الهاتف</label>
          <input type="tel" class="child-phone-input" id="f_child_${uid}_phone" value="${escapeHTML(child.phone || '')}" />
        </div>
        <div class="field">
          <label for="${birthId}">تاريخ الميلاد</label>
          <input type="date" class="child-birthDate-input" id="${birthId}" value="${child.birthDate || ''}" />
        </div>
        <div class="field">
          <label for="${ageId}">السن</label>
          <input type="number" min="0" max="130" class="child-age-input" id="${ageId}" value="${child.age ?? ''}" />
        </div>
      </div>
    </div>`;
}

/* Wires the reused wireBirthDateAgeSync() logic for one child row's own
   birth-date/age inputs, using the unique ids visitationChildRowHTML()
   already gave them (found via the row-scoped classes, so callers don't
   need to know the generated ids). */
function wireChildRowAgeSync(rowEl) {
  const birthInput = rowEl.querySelector('.child-birthDate-input');
  const ageInput = rowEl.querySelector('.child-age-input');
  if (birthInput && ageInput) wireBirthDateAgeSync(birthInput.id, ageInput.id);
}

function wireBirthDateAgeSync(birthId, ageId) {
  const birthInput = document.getElementById(birthId);
  const ageInput = document.getElementById(ageId);
  if (!birthInput || !ageInput) return;
  function sync() {
    if (birthInput.value) {
      const computed = computeAge({ birthDate: birthInput.value });
      if (computed !== null) ageInput.value = computed;
      ageInput.readOnly = true;
    } else {
      ageInput.readOnly = false;
    }
  }
  birthInput.addEventListener('input', sync);
  birthInput.addEventListener('change', sync);
  sync();
}

/* One existing visitation date row inside the إضافة/تعديل أسرة form, with its
   own "حذف" button (change: deletable visitation dates). The date value is
   kept on data-date so the submit handler can re-collect whichever rows are
   still present (i.e. weren't deleted) without touching visitationDates'
   existing string[] shape. */
function visitDateRowHTML(dateStr) {
  return `
    <div class="visit-date-row" data-date="${escapeHTML(dateStr)}">
      <span>${formatDMY(dateStr)}</span>
      <button type="button" class="btn btn-outline btn-sm remove-date-btn" aria-label="حذف هذا التاريخ">${ICONS.trash}<span>حذف</span></button>
    </div>`;
}

/* #/visitation/add and #/visitation/edit/:id */
async function renderVisitationForm(idStr) {
  const isEdit = !!idStr;
  renderVisitationChrome(isEdit ? `/visitation/member/${idStr}` : '/visitation', 'رجوع لخدمات الافتقاد');

  const existing = isEdit ? await VisitationDB.getById(idStr) : null;
  if (isEdit && !existing) return navigate('/visitation');

  const v = existing || {};

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/visitation">خدمات الافتقاد</a><span class="sep">/</span><span>${isEdit ? 'تعديل بيانات أسرة' : 'إضافة أسرة'}</span></p>
      <h2 class="section-title">${isEdit ? 'تعديل بيانات: ' + escapeHTML(v.name || '') : 'إضافة أسرة جديدة'}</h2>
      <p class="section-sub">الحقول المطلوبة معلّم عليها بعلامة *</p>

      <div class="duplicate-warning" id="dupWarning"></div>

      <form class="form-card" id="visitationForm" novalidate>
        <div class="form-grid">
          <div class="field full">
            <label for="f_name">الاسم <span class="req">*</span></label>
            <input type="text" id="f_name" name="name" required value="${escapeHTML(v.name || '')}" />
            <div class="field-error"></div>
          </div>

          ${selectFieldHTML({ field: 'maritalStatus', label: 'الحالة الاجتماعية' }, v.maritalStatus, MARITAL_STATUS_OPTIONS)}

          <div class="form-section-divider full"><h4>البيانات الشخصية</h4></div>

          <div class="field">
            <label for="f_phone1">رقم الموبايل</label>
            <input type="tel" id="f_phone1" name="phone1" value="${escapeHTML(v.phone1 || '')}" />
          </div>
          <div class="field">
            <label for="f_phone2">رقم الموبايل (2)</label>
            <input type="tel" id="f_phone2" name="phone2" value="${escapeHTML(v.phone2 || '')}" />
          </div>

          <div class="field">
            <label for="f_birthDate">تاريخ الميلاد</label>
            <input type="date" id="f_birthDate" name="birthDate" value="${v.birthDate || ''}" />
          </div>
          <div class="field">
            <label for="f_age">السن (لو التاريخ غير متاح)</label>
            <input type="number" min="0" max="130" id="f_age" name="age" value="${v.age ?? ''}" />
          </div>

          ${textFieldHTML({ field: 'job', label: 'الوظيفة' }, v.job)}
          <div class="field" id="eduStageWrap" hidden>
            <label for="f_educationStage">المرحلة التعليمية</label>
            <input type="text" id="f_educationStage" value="${escapeHTML(v.educationStage || '')}" />
          </div>

          ${textFieldHTML({ field: 'confessionFather', label: 'أب الاعتراف' }, v.confessionFather)}
          ${selectFieldHTML({ field: 'service', label: 'الخدمة' }, v.service, VISITATION_SERVICE_OPTIONS)}
          ${textFieldHTML({ field: 'serviceOther', label: 'خدمة أخرى' }, v.serviceOther)}

          <div class="form-section-divider full"><h4>العنوان</h4></div>

          ${selectFieldHTML({ field: 'city', label: 'المدينة' }, v.city, CITY_OPTIONS)}
          ${selectFieldHTML({ field: 'neighborhood', label: 'الحي' }, v.neighborhood, NEIGHBORHOOD_OPTIONS)}

          <div class="field full">
            <label for="f_street">الشارع</label>
            <input type="text" id="f_street" name="street" value="${escapeHTML(v.street || '')}" />
          </div>

          <div class="field full">
            <label>اللوكيشن</label>
            <div class="location-cell">
              <span id="locationStatus">${v.locationLink ? `<a href="${escapeHTML(v.locationLink)}" target="_blank" rel="noopener noreferrer" class="location-link">${ICONS.location} عرض اللوكيشن على Google Maps</a>` : `<span class="muted">لم يتم تسجيل لوكيشن بعد</span>`}</span>
              <button type="button" class="btn btn-outline btn-sm" id="addLocationBtn">${ICONS.location}<span>إضافة اللوكيشن</span></button>
            </div>
            <input type="hidden" id="f_locationLink" value="${escapeHTML(v.locationLink || '')}" />
          </div>

          <div class="field full" id="spouseSectionsWrap" hidden>
            <div class="subform-section" id="husbandSection" hidden>
              <h4>بيانات الزوج</h4>
              <div class="subform-grid">
                ${visitationSpouseFieldsHTML('h', v.husband, 'husband')}
              </div>
            </div>
            <div class="subform-section" id="wifeSection" hidden>
              <h4>بيانات الزوجة</h4>
              <div class="subform-grid">
                ${visitationSpouseFieldsHTML('w', v.wife, 'wife')}
              </div>
            </div>
            <div class="subform-section" id="childrenSection" hidden>
              <h4>الأبناء (<span id="childrenCountLabel">${(v.children || []).length}</span>)</h4>
              <div id="childrenList">${(v.children || []).map(visitationChildRowHTML).join('')}</div>
              <button type="button" class="btn btn-outline btn-sm" id="addChildBtn">${ICONS.plus}<span>إضافة ابن/ابنة</span></button>
            </div>
          </div>

          <div class="form-section-divider full"><h4>الافتقاد</h4></div>

          <div class="field full" id="visitDatesWrap" ${(v.visitationDates || []).length ? '' : 'hidden'}>
            <label>تواريخ الافتقاد المسجّلة</label>
            <div id="visitDatesList" class="visit-dates-list">${(v.visitationDates || []).slice().sort((a, b) => b.localeCompare(a)).map(visitDateRowHTML).join('')}</div>
          </div>

          <div class="field">
            <label for="f_visitDate">تواريخ الافتقاد (إضافة تاريخ جديد)</label>
            <input type="date" id="f_visitDate" name="visitDate" />
          </div>

          <div class="field full">
            <label for="f_notes">الملاحظات</label>
            <textarea id="f_notes" name="notes">${escapeHTML(v.notes || '')}</textarea>
          </div>
        </div>

        <div class="form-actions">
          <a href="#${isEdit ? '/visitation/member/' + v.id : '/visitation'}" class="btn btn-outline">إلغاء</a>
          <button type="submit" class="btn btn-primary">${isEdit ? 'حفظ التعديلات' : 'إضافة الأسرة'}</button>
        </div>
      </form>
    </div>
  `;

  const nameInput = document.getElementById('f_name');
  const phone1Input = document.getElementById('f_phone1');

  const addLocationBtn = document.getElementById('addLocationBtn');
  const locationStatus = document.getElementById('locationStatus');
  const locationField = document.getElementById('f_locationLink');
  addLocationBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('المتصفح لا يدعم تحديد الموقع', 'error');
      return;
    }
    const originalHTML = addLocationBtn.innerHTML;
    addLocationBtn.disabled = true;
    addLocationBtn.innerHTML = '<span>جارٍ تحديد الموقع...</span>';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const link = `https://www.google.com/maps?q=${latitude},${longitude}`;
        locationField.value = link;
        locationStatus.innerHTML = `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" class="location-link">${ICONS.location} عرض اللوكيشن على Google Maps</a>`;
        addLocationBtn.disabled = false;
        addLocationBtn.innerHTML = originalHTML;
        showToast('تم تحديد اللوكيشن بنجاح', 'success');
      },
      (err) => {
        addLocationBtn.disabled = false;
        addLocationBtn.innerHTML = originalHTML;
        if (err.code === err.PERMISSION_DENIED) {
          showToast('لازم تسمح بالوصول للموقع عشان تقدر تسجل اللوكيشن', 'error');
        } else {
          showToast('تعذر تحديد الموقع، حاول تاني', 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  wireBirthDateAgeSync('f_birthDate', 'f_age');
  wireBirthDateAgeSync('f_h_birthDate', 'f_h_age');
  wireBirthDateAgeSync('f_w_birthDate', 'f_w_age');

  /* أعزب / متزوج / متزوجة / أرمل / أرملة conditional sections. */
  const maritalStatusSelect = document.getElementById('f_maritalStatus');
  const eduStageWrap = document.getElementById('eduStageWrap');
  const spouseSectionsWrap = document.getElementById('spouseSectionsWrap');
  const husbandSection = document.getElementById('husbandSection');
  const wifeSection = document.getElementById('wifeSection');
  const childrenSection = document.getElementById('childrenSection');
  function updateMaritalConditionalSections() {
    const status = maritalStatusSelect.value;
    const spouseKind = visitationSpouseSectionFor(status); // 'husband' | 'wife' | null
    eduStageWrap.hidden = status !== 'أعزب';
    spouseSectionsWrap.hidden = !spouseKind;
    husbandSection.hidden = spouseKind !== 'husband';
    wifeSection.hidden = spouseKind !== 'wife';
    childrenSection.hidden = !spouseKind;
  }
  maritalStatusSelect.addEventListener('change', updateMaritalConditionalSections);
  updateMaritalConditionalSections();

  /* الأبناء — simple dynamic add/remove list. */
  const childrenList = document.getElementById('childrenList');
  const childrenCountLabel = document.getElementById('childrenCountLabel');
  function refreshChildrenCount() {
    childrenCountLabel.textContent = String(childrenList.children.length);
  }
  document.getElementById('addChildBtn').addEventListener('click', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = visitationChildRowHTML(null);
    const newRow = wrapper.firstElementChild;
    childrenList.appendChild(newRow);
    wireChildRowAgeSync(newRow);
    refreshChildrenCount();
  });
  childrenList.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-child-btn');
    if (!btn) return;
    btn.closest('.child-row').remove();
    refreshChildrenCount();
  });
  /* Existing children (edit mode) were rendered server-side above —
     wire each one's own birth-date/age sync independently. */
  document.querySelectorAll('#childrenList .child-row').forEach(wireChildRowAgeSync);

  /* تواريخ الافتقاد — each existing date has its own "حذف" button (change 2).
     Deleting a row only removes it from this page's list; nothing is saved
     until the form is submitted, same as every other field here. */
  const visitDatesWrap = document.getElementById('visitDatesWrap');
  const visitDatesList = document.getElementById('visitDatesList');
  visitDatesList.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-date-btn');
    if (!btn) return;
    btn.closest('.visit-date-row').remove();
    if (!visitDatesList.children.length) visitDatesWrap.hidden = true;
  });

  const dupBox = document.getElementById('dupWarning');
  async function checkDuplicates() {
    const name = nameInput.value.trim();
    if (name.length < 2) { dupBox.classList.remove('show'); return; }
    const matches = await VisitationDB.searchByName(name);
    const relevant = matches.filter((m) => !isEdit || m.id !== v.id);
    if (relevant.length) {
      dupBox.innerHTML = `⚠️ يوجد بالفعل ${relevant.length} أسرة مشابهة في قاعدة البيانات: ` +
        relevant.slice(0, 4).map((m) => escapeHTML(m.name)).join('، ') +
        ' — تأكد إن الأسرة مش مسجلة قبل كده.';
      dupBox.classList.add('show');
    } else {
      dupBox.classList.remove('show');
    }
  }
  nameInput.addEventListener('input', debounce(checkDuplicates, 300));
  phone1Input.addEventListener('input', debounce(checkDuplicates, 300));

  document.getElementById('visitationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameField = document.getElementById('f_name');
    const nameErr = nameField.parentElement.querySelector('.field-error');
    if (!nameField.value.trim()) {
      nameField.parentElement.classList.add('invalid');
      nameErr.textContent = 'الاسم مطلوب';
      nameField.focus();
      return;
    }
    nameField.parentElement.classList.remove('invalid');
    nameErr.textContent = '';

    // Remaining dates come from whichever rows are still in #visitDatesList —
    // any the user deleted via "حذف" are simply no longer among them.
    const existingDates = Array.from(document.querySelectorAll('#visitDatesList .visit-date-row')).map((row) => row.dataset.date);
    const newDateVal = document.getElementById('f_visitDate').value;
    if (newDateVal && !existingDates.includes(newDateVal)) existingDates.push(newDateVal);

    const maritalStatusVal = document.getElementById('f_maritalStatus').value.trim() || null;
    const isSingle = maritalStatusVal === 'أعزب';
    const spouseKind = visitationSpouseSectionFor(maritalStatusVal); // 'husband' | 'wife' | null

    const educationStage = isSingle ? (document.getElementById('f_educationStage').value.trim() || null) : null;

    function readSpouseBlock(prefix) {
      const get = (id) => document.getElementById(id);
      const name = get(`f_${prefix}_name`).value.trim();
      const job = get(`f_${prefix}_job`).value.trim();
      const phone = get(`f_${prefix}_phone`).value.trim();
      const confessionFather = get(`f_${prefix}_confessionFather`).value.trim();
      const service = get(`f_${prefix}_service`).value.trim();
      const serviceOther = get(`f_${prefix}_serviceOther`).value.trim();
      const birthDate = get(`f_${prefix}_birthDate`).value;
      const age = get(`f_${prefix}_age`).value;
      const eduStage = get(`f_${prefix}_educationStage`).value.trim();
      const notes = get(`f_${prefix}_notes`).value.trim();
      const hasAny = name || job || phone || confessionFather || service || serviceOther || birthDate || age || eduStage || notes;
      if (!hasAny) return null;
      return {
        name: name || null,
        job: job || null,
        phone: phone || null,
        confessionFather: confessionFather || null,
        service: service || null,
        serviceOther: serviceOther || null,
        birthDate: birthDate || null,
        age: age ? Number(age) : null,
        educationStage: eduStage || null,
        notes: notes || null,
      };
    }
    const husband = spouseKind === 'husband' ? readSpouseBlock('h') : null;
    const wife = spouseKind === 'wife' ? readSpouseBlock('w') : null;
    const children = spouseKind
      ? Array.from(document.querySelectorAll('#childrenList .child-row'))
          .map((row) => {
            const eduStageInput = row.querySelector('.child-educationStage-input');
            const confessionFatherInput = row.querySelector('.child-confessionFather-input');
            const phoneInput = row.querySelector('.child-phone-input');
            const birthDateInput = row.querySelector('.child-birthDate-input');
            const ageInput = row.querySelector('.child-age-input');
            return {
              type: row.querySelector('.child-type-select').value,
              name: row.querySelector('.child-name-input').value.trim(),
              educationStage: eduStageInput.value.trim() || null,
              confessionFather: confessionFatherInput.value.trim() || null,
              phone: phoneInput.value.trim() || null,
              birthDate: birthDateInput.value || null,
              age: ageInput.value ? Number(ageInput.value) : null,
            };
          })
          .filter((c) => c.name)
      : [];

    const record = {
      id: isEdit ? v.id : await VisitationDB.nextId(),
      name: nameField.value.trim(),
      maritalStatus: maritalStatusVal,
      educationStage,
      husband,
      wife,
      children,
      phone1: document.getElementById('f_phone1').value.trim() || null,
      phone2: document.getElementById('f_phone2').value.trim() || null,
      city: document.getElementById('f_city').value.trim() || null,
      neighborhood: document.getElementById('f_neighborhood').value.trim() || null,
      street: document.getElementById('f_street').value.trim() || null,
      locationLink: document.getElementById('f_locationLink').value.trim() || v.locationLink || null,
      job: document.getElementById('f_job').value.trim() || null,
      confessionFather: document.getElementById('f_confessionFather').value.trim() || null,
      service: document.getElementById('f_service').value.trim() || null,
      serviceOther: document.getElementById('f_serviceOther').value.trim() || null,
      birthDate: document.getElementById('f_birthDate').value || null,
      birthDay: null, birthMonth: null, birthYear: null,
      age: document.getElementById('f_age').value ? Number(document.getElementById('f_age').value) : null,
      notes: document.getElementById('f_notes').value.trim() || null,
      visitationDates: existingDates,
    };
    if (record.birthDate) {
      const d = new Date(record.birthDate);
      if (!isNaN(d.getTime())) {
        record.birthDay = d.getDate();
        record.birthMonth = d.getMonth() + 1;
        record.birthYear = d.getFullYear();
      }
    }

    await VisitationDB.put(record);
    showToast(isEdit ? 'تم حفظ التعديلات' : 'تم إضافة الأسرة بنجاح', 'success');
    navigate(`/visitation/member/${record.id}`);
  });
}

/* Profile display for the husband/wife/children sub-fields (Part 1). */
function spouseInfoSectionHTML(title, s, kind) {
  const age = computeAge(s);
  const birth = formatBirthDate(s);
  const L = SPOUSE_FIELD_LABELS[kind] || SPOUSE_FIELD_LABELS.husband;
  return `
    <div class="info-section">
      <h3>${ICONS.church} ${title}</h3>
      <dl class="info-grid">
        <div class="info-item"><dt>${L.name}</dt><dd class="${s.name ? '' : 'muted'}">${fieldOrFallback(s.name)}</dd></div>
        <div class="info-item"><dt>${L.job}</dt><dd class="${s.job ? '' : 'muted'}">${fieldOrFallback(s.job)}</dd></div>
        <div class="info-item"><dt>${L.phone}</dt><dd>${phoneLinkHTML(s.phone)}</dd></div>
        <div class="info-item"><dt>${L.confessionFather}</dt><dd class="${s.confessionFather ? '' : 'muted'}">${fieldOrFallback(s.confessionFather)}</dd></div>
        <div class="info-item"><dt>الخدمة</dt><dd class="${s.service ? '' : 'muted'}">${fieldOrFallback(s.service)}</dd></div>
        ${s.serviceOther ? `<div class="info-item"><dt>خدمة أخرى</dt><dd>${escapeHTML(s.serviceOther)}</dd></div>` : ''}
        <div class="info-item"><dt>${L.birthDate}</dt><dd class="${birth ? '' : 'muted'}">${birth || 'غير متوفر'}</dd></div>
        <div class="info-item"><dt>السن</dt><dd class="${age !== null ? '' : 'muted'}">${age !== null ? age + ' سنة' : 'غير متوفر'}</dd></div>
        <div class="info-item"><dt>${L.educationStage}</dt><dd class="${s.educationStage ? '' : 'muted'}">${fieldOrFallback(s.educationStage)}</dd></div>
        ${s.notes ? `<div class="info-item full"><dt>${L.notes}</dt><dd>${escapeHTML(s.notes)}</dd></div>` : ''}
      </dl>
    </div>`;
}

function childrenInfoSectionHTML(children) {
  return `
    <div class="info-section">
      <h3>${ICONS.notes} الأبناء (${children.length})</h3>
      ${children.map((c, i) => {
        const age = computeAge(c);
        const birth = formatBirthDate(c);
        return `
        <div class="subform-section" style="margin-bottom:${i === children.length - 1 ? '0' : '12px'};">
          <h4>${i + 1}. ${escapeHTML(c.type)} — ${escapeHTML(c.name)}</h4>
          <dl class="info-grid">
            <div class="info-item"><dt>الاسم / النوع</dt><dd>${escapeHTML(c.type)} — ${escapeHTML(c.name)}</dd></div>
            <div class="info-item"><dt>المرحلة التعليمية</dt><dd class="${c.educationStage ? '' : 'muted'}">${fieldOrFallback(c.educationStage)}</dd></div>
            <div class="info-item"><dt>أب الاعتراف</dt><dd class="${c.confessionFather ? '' : 'muted'}">${fieldOrFallback(c.confessionFather)}</dd></div>
            <div class="info-item"><dt>رقم الهاتف</dt><dd>${phoneLinkHTML(c.phone)}</dd></div>
            <div class="info-item"><dt>تاريخ الميلاد</dt><dd class="${birth ? '' : 'muted'}">${birth || 'غير متوفر'}</dd></div>
            <div class="info-item"><dt>السن</dt><dd class="${age !== null ? '' : 'muted'}">${age !== null ? age + ' سنة' : 'غير متوفر'}</dd></div>
          </dl>
        </div>`;
      }).join('')}
    </div>`;
}

/* #/visitation/member/:id */
async function renderVisitationProfile(idStr) {
  renderVisitationChrome('/visitation', 'رجوع لخدمات الافتقاد');
  const fam = await VisitationDB.getById(idStr);
  if (!fam) {
    APP_ROOT.innerHTML = `<div class="container"><div class="empty-state">${ICONS.empty}<p>هذه الأسرة غير موجودة</p></div></div>`;
    return;
  }
  const age = computeAge(fam);
  const birth = formatBirthDate(fam);
  const dates = Array.isArray(fam.visitationDates) ? fam.visitationDates.slice().sort((a, b) => b.localeCompare(a)) : [];
  const latest = dates[0] || null;

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/visitation">خدمات الافتقاد</a><span class="sep">/</span><span>الملف الشخصي</span></p>

      <div class="profile-header">
        <span class="profile-avatar">${escapeHTML(initials(fam.name))}</span>
        <div>
          <h1 class="profile-name">${escapeHTML(fam.name)}</h1>
          <div class="profile-tags">
            ${fam.job ? `<span class="tag">${escapeHTML(fam.job)}</span>` : ''}
            ${fam.maritalStatus ? `<span class="tag">${escapeHTML(fam.maritalStatus)}</span>` : ''}
            ${fam.neighborhood ? `<span class="tag">${escapeHTML(fam.neighborhood)}</span>` : ''}
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-outline btn-sm" id="editBtn">${ICONS.edit}<span>تعديل</span></button>
          <button class="btn btn-danger btn-sm" id="deleteBtn">${ICONS.trash}<span>حذف</span></button>
        </div>
      </div>

      <div class="info-section">
        <h3>${ICONS.phone} بيانات التواصل</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>رقم الموبايل</dt><dd>${phoneLinkHTML(fam.phone1)}</dd></div>
          <div class="info-item"><dt>رقم الموبايل (2)</dt><dd>${phoneLinkHTML(fam.phone2)}</dd></div>
        </dl>
      </div>

      <div class="info-section">
        <h3>${ICONS.location} العنوان</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>المدينة</dt><dd class="${fam.city ? '' : 'muted'}">${fieldOrFallback(fam.city)}</dd></div>
          <div class="info-item"><dt>الحي</dt><dd class="${fam.neighborhood ? '' : 'muted'}">${fieldOrFallback(fam.neighborhood)}</dd></div>
          <div class="info-item full"><dt>الشارع</dt><dd class="${fam.street ? '' : 'muted'}">${streetFieldHTML(fam.street)}</dd></div>
          <div class="info-item full">
            <dt>اللوكيشن الحالي</dt>
            <dd class="location-cell">
              ${fam.locationLink ? `<a href="${escapeHTML(fam.locationLink)}" target="_blank" rel="noopener noreferrer" class="location-link">${ICONS.location} عرض اللوكيشن على Google Maps</a>` : `<span class="muted">لم يتم تسجيل لوكيشن بعد</span>`}
              <button type="button" class="btn btn-outline btn-sm" id="addLocationBtn">${ICONS.location}<span>إضافة اللوكيشن</span></button>
            </dd>
          </div>
        </dl>
      </div>

      <div class="info-section">
        <h3>${ICONS.church} بيانات الأسرة</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>الحالة الاجتماعية</dt><dd class="${fam.maritalStatus ? '' : 'muted'}">${fieldOrFallback(fam.maritalStatus)}</dd></div>
          <div class="info-item"><dt>الوظيفة</dt><dd class="${fam.job ? '' : 'muted'}">${fieldOrFallback(fam.job)}</dd></div>
          <div class="info-item"><dt>أب الاعتراف</dt><dd class="${fam.confessionFather ? '' : 'muted'}">${fieldOrFallback(fam.confessionFather)}</dd></div>
          <div class="info-item"><dt>الخدمة</dt><dd class="${fam.service ? '' : 'muted'}">${fieldOrFallback(fam.service)}</dd></div>
          ${fam.serviceOther ? `<div class="info-item"><dt>خدمة أخرى</dt><dd>${escapeHTML(fam.serviceOther)}</dd></div>` : ''}
        </dl>
      </div>

      ${fam.maritalStatus === 'أعزب' && fam.educationStage ? `
      <div class="info-section">
        <h3>${ICONS.notes} المرحلة التعليمية</h3>
        <dl class="info-grid"><div class="info-item full"><dd>${escapeHTML(fam.educationStage)}</dd></div></dl>
      </div>` : ''}

      ${fam.husband ? spouseInfoSectionHTML('بيانات الزوج', fam.husband, 'husband') : ''}
      ${fam.wife ? spouseInfoSectionHTML('بيانات الزوجة', fam.wife, 'wife') : ''}
      ${Array.isArray(fam.children) && fam.children.length ? childrenInfoSectionHTML(fam.children) : ''}

      <div class="info-section">
        <h3>${ICONS.calendar} بيانات الميلاد</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>تاريخ الميلاد</dt><dd class="${birth ? '' : 'muted'}">${birth || 'غير متوفر'}</dd></div>
          <div class="info-item"><dt>السن</dt><dd class="${age !== null ? '' : 'muted'}">${age !== null ? age + ' سنة' : 'غير متوفر'}</dd></div>
        </dl>
      </div>

      <div class="info-section">
        <h3>${ICONS.calendar} تواريخ الافتقاد</h3>
        <dl class="info-grid">
          <div class="info-item full"><dt>آخر افتقاد</dt><dd class="${latest ? '' : 'muted'}">${latest ? formatDMY(latest) : 'لا يوجد افتقاد مسجل بعد'}</dd></div>
        </dl>
        ${dates.length ? `<ul class="visitation-history">${dates.map((d) => `<li>${formatDMY(d)}</li>`).join('')}</ul>` : ''}
        <div class="form-actions" style="justify-content:flex-start;margin-top:10px;">
          <button type="button" class="btn btn-outline btn-sm" id="addVisitDateBtn">${ICONS.calendar}<span>إضافة تاريخ افتقاد</span></button>
        </div>
      </div>

      <div class="info-section">
        <h3>${ICONS.notes} ملاحظات إضافية</h3>
        <dl class="info-grid">
          <div class="info-item full"><dd class="${fam.notes ? '' : 'muted'}">${fieldOrFallback(fam.notes)}</dd></div>
        </dl>
      </div>
    </div>
  `;

  document.getElementById('editBtn').addEventListener('click', () => navigate(`/visitation/edit/${fam.id}`));
  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!confirm(`هل تريد حذف "${fam.name}" نهائيًا من قاعدة البيانات؟`)) return;
    await VisitationDB.remove(fam.id);
    showToast('تم الحذف', 'success');
    navigate('/visitation');
  });

  const addLocationBtn = document.getElementById('addLocationBtn');
  addLocationBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('المتصفح لا يدعم تحديد الموقع', 'error');
      return;
    }
    const originalHTML = addLocationBtn.innerHTML;
    addLocationBtn.disabled = true;
    addLocationBtn.innerHTML = '<span>جارٍ تحديد الموقع...</span>';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        fam.locationLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
        await VisitationDB.put(fam);
        showToast('تم حفظ اللوكيشن بنجاح', 'success');
        renderVisitationProfile(idStr);
      },
      (err) => {
        addLocationBtn.disabled = false;
        addLocationBtn.innerHTML = originalHTML;
        if (err.code === err.PERMISSION_DENIED) {
          showToast('لازم تسمح بالوصول للموقع عشان تقدر تسجل اللوكيشن', 'error');
        } else {
          showToast('تعذر تحديد الموقع، حاول تاني', 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  document.getElementById('addVisitDateBtn').addEventListener('click', async () => {
    const dateStr = await openDateModal({
      title: 'إضافة تاريخ افتقاد',
      message: 'اختر تاريخ الافتقاد. سيُضاف إلى السجل دون حذف التواريخ السابقة.',
      confirmLabel: 'إضافة',
    });
    if (!dateStr) return;
    const current = Array.isArray(fam.visitationDates) ? fam.visitationDates.slice() : [];
    if (!current.includes(dateStr)) current.push(dateStr);
    fam.visitationDates = current;
    await VisitationDB.put(fam);
    showToast('تم إضافة تاريخ الافتقاد', 'success');
    renderVisitationProfile(idStr);
  });
}

/* ---------------------------------------------------------------------- */
/*  Home view                                                              */
/* ---------------------------------------------------------------------- */
async function renderHome() {
  renderChrome(true, '/');
  const total = await MembersDB.count();
  APP_ROOT.innerHTML = `
    <div class="container">
      <div class="search-panel">
        <form id="homeSearchForm">
          <div class="search-box">
            ${ICONS.search}
            <input type="text" id="homeSearchInput" placeholder="ابحث بالاسم أو رقم الهاتف... مثال: فادي" autocomplete="off" />
          </div>
        </form>
        <p class="search-hint">ابحث في قاعدة بيانات الخدام والمخدومين كاملة (${total} اسم مسجَّل على هذا الجهاز)</p>
        <div id="homeSearchResults"></div>
      </div>

      <div class="add-member-cta">
        <a href="#/add" class="btn btn-primary">${ICONS.plus}<span>إضافة اسم</span></a>
      </div>

      <div class="cross-divider">${ICONS.cross}</div>

      <h2 class="section-title" style="text-align:center;">تصفّح حسب</h2>
      <div class="nav-grid">
        ${NAV_SECTIONS.map((s) => `
          <a href="#/browse/${s.key}" class="nav-card">
            <span class="icon-wrap">${ICONS[s.icon]}</span>
            <span>${s.label}</span>
          </a>`).join('')}
        <a href="#/birthdays" class="nav-card">
          <span class="icon-wrap">${ICONS.cake}</span>
          <span>أعياد الميلاد</span>
        </a>
      </div>
    </div>
  `;

  const homeSearchInput = document.getElementById('homeSearchInput');
  const homeSearchResults = document.getElementById('homeSearchResults');

  async function runHomeLiveSearch() {
    const val = homeSearchInput.value.trim();
    if (!val) { homeSearchResults.innerHTML = ''; return; }
    const results = await MembersDB.searchAll(val);
    homeSearchResults.innerHTML = renderMemberListOrEmpty(results, `لا يوجد أسماء مطابقة لـ "${escapeHTML(val)}"`);
  }
  homeSearchInput.addEventListener('input', debounce(runHomeLiveSearch, 200));

  document.getElementById('homeSearchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = homeSearchInput.value.trim();
    if (q) navigate(`/search?${qs({ q })}`);
  });
}

/* ---------------------------------------------------------------------- */
/*  Search results                                                        */
/* ---------------------------------------------------------------------- */
async function renderSearch(params) {
  renderChrome(true);
  const q = params.q || '';
  const results = q ? await MembersDB.searchAll(q) : [];

  APP_ROOT.innerHTML = `
    <div class="container">
      <div class="search-panel">
        <form id="searchForm">
          <div class="search-box">
            ${ICONS.search}
            <input type="text" id="searchInput" value="${escapeHTML(q)}" placeholder="ابحث بالاسم أو رقم الهاتف..." autocomplete="off" />
          </div>
        </form>
      </div>
      <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>نتائج البحث عن "${escapeHTML(q)}"</span></p>
      <div id="searchResultsContainer">${renderMemberListOrEmpty(results, `لا يوجد أسماء مطابقة لـ "${escapeHTML(q)}"`)}</div>
    </div>
  `;

  const searchInput = document.getElementById('searchInput');
  const searchResultsContainer = document.getElementById('searchResultsContainer');

  async function runLiveSearch() {
    const val = searchInput.value.trim();
    const liveResults = val ? await MembersDB.searchAll(val) : [];
    searchResultsContainer.innerHTML = renderMemberListOrEmpty(liveResults, `لا يوجد أسماء مطابقة لـ "${escapeHTML(val)}"`);
  }
  searchInput.addEventListener('input', debounce(runLiveSearch, 200));

  document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runLiveSearch();
  });
}

function renderMemberListOrEmpty(members, emptyMessage) {
  if (!members.length) {
    return `<div class="empty-state">${ICONS.empty}<p>${emptyMessage}</p></div>`;
  }
  return `<div class="member-list">${members.map(memberCardHTML).join('')}</div>`;
}

function memberCardHTML(m) {
  const metaParts = [m.neighborhood, cleanLabel(m.class || m.sector)].filter(Boolean);
  return `
    <a href="#/member/${m.id}" class="member-card">
      <span class="member-avatar">${escapeHTML(initials(m.name))}</span>
      <span class="member-info">
        <span class="member-name">${escapeHTML(m.name)}</span>
        <span class="member-meta">${escapeHTML(metaParts.join(' · ') || '—')}</span>
      </span>
    </a>`;
}

/* Resolves a member's birth {month (0-11), day} using the same field
   fallback chain as formatBirthDate(), for the Birthdays feature. Does not
   duplicate age/formatting logic — those still go through computeAge()/
   formatBirthDate() unchanged. Returns null when no valid date exists. */
function getBirthMonthDay(member) {
  if (member.birthDate) {
    const d = new Date(member.birthDate);
    if (!isNaN(d.getTime())) return { month: d.getMonth(), day: d.getDate() };
  }
  if (member.birthDay && member.birthMonth) {
    const mIdx = Number(member.birthMonth) - 1;
    const day = Number(member.birthDay);
    if (mIdx >= 0 && mIdx < 12 && day >= 1 && day <= 31) return { month: mIdx, day };
  }
  return null;
}

/* ---------------------------------------------------------------------- */
/*  Birthdays (أعياد الميلاد)                                             */
/* ---------------------------------------------------------------------- */
async function renderBirthdays() {
  renderChrome(true);
  const all = await MembersDB.getAll();
  const today = new Date();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();
  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  // Feb 29 birthdays: on non-leap years there is no Feb 29 to match, so
  // treat Feb 28 as their day so those birthdays are never skipped.
  const todayStandsInForFeb29 = todayMonth === 1 && todayDay === 28 && !isLeapYear(today.getFullYear());

  const withDates = [];
  for (const m of all) {
    const md = getBirthMonthDay(m);
    if (md) withDates.push({ member: m, month: md.month, day: md.day });
  }

  const isTodayBirthday = (x) =>
    (x.month === todayMonth && x.day === todayDay) ||
    (todayStandsInForFeb29 && x.month === 1 && x.day === 29);

  const todaysBirthdays = withDates.filter(isTodayBirthday);

  function birthdayCardHTML(m) {
    const dob = formatBirthDate(m) || '—';
    const age = computeAge(m);
    const metaLines = [`عيد الميلاد: ${dob}`];
    if (age !== null) metaLines.push(`السن: ${age} سنة`);
    return `
      <a href="#/member/${m.id}" class="member-card birthday-card">
        <span class="member-avatar">${escapeHTML(initials(m.name))}</span>
        <span class="member-info">
          <span class="member-name">${escapeHTML(m.name)}</span>
          <span class="member-meta">${metaLines.map((l) => `<span class="member-meta-line">${escapeHTML(l)}</span>`).join('')}</span>
        </span>
      </a>`;
  }

  const todaySectionHTML = todaysBirthdays.length
    ? `<div class="member-list">${todaysBirthdays.map((x) => birthdayCardHTML(x.member)).join('')}</div>`
    : `<div class="empty-state"><p>لا توجد أعياد ميلاد اليوم</p></div>`;

  /* Renders the ONE continuous chronological list (no day-by-day grouping)
     for a given month index (0-11). */
  function monthListHTML(monthIdx) {
    const monthMembers = withDates
      .filter((x) => x.month === monthIdx)
      .sort((a, b) => a.day - b.day);
    if (!monthMembers.length) {
      return `<div class="empty-state"><p>لا توجد أعياد ميلاد في هذا الشهر</p></div>`;
    }
    return `<div class="member-list">${monthMembers.map((x) => birthdayCardHTML(x.member)).join('')}</div>`;
  }

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>أعياد الميلاد</span></p>

      <div class="birthday-hero">
        <h2 class="birthday-hero-title">أعياد ميلاد اليوم</h2>
        <p class="birthday-verse">بَارِكِي يَا نَفْسِي الرَّبَّ، وَلَا تَنْسَيْ كُلَّ حَسَنَاتِهِ.</p>
        <p class="birthday-verse-ref">مزمور 103: 2</p>
        ${todaySectionHTML}
      </div>

      <div class="birthday-month-panel">
        <div class="birthday-filter-row">
          <label for="birthdayMonthSelect" class="birthday-filter-label">فلتر الشهر</label>
          <select id="birthdayMonthSelect" class="btn btn-outline birthday-month-select">
            ${ARABIC_MONTHS.map((name, idx) => `<option value="${idx}"${idx === todayMonth ? ' selected' : ''}>${name}</option>`).join('')}
          </select>
          <button type="button" id="birthdayPdfBtn" class="btn btn-outline birthday-month-select">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-inline-end:4px;"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>تنزيل PDF
          </button>
        </div>
        <h2 class="birthday-hero-title" style="text-align:start;">أعياد الميلاد في <span id="birthdayMonthLabel">${ARABIC_MONTHS[todayMonth]}</span></h2>
        <div id="birthdayMonthList">${monthListHTML(todayMonth)}</div>
      </div>
    </div>
  `;

  const monthSelect = document.getElementById('birthdayMonthSelect');
  const monthLabelEl = document.getElementById('birthdayMonthLabel');
  const monthListEl = document.getElementById('birthdayMonthList');
  monthSelect.addEventListener('change', () => {
    const idx = Number(monthSelect.value);
    monthLabelEl.textContent = ARABIC_MONTHS[idx];
    monthListEl.innerHTML = monthListHTML(idx);
  });

  const pdfBtn = document.getElementById('birthdayPdfBtn');
  pdfBtn.addEventListener('click', () => {
    downloadBirthdaysPDF(Number(monthSelect.value), withDates);
  });
}

/* ---------------------------------------------------------------------- */
/*  Birthdays PDF export ("تنزيل PDF")                                    */
/*  Renders an offscreen page mimicking the official template (two        */
/*  side-by-side tables per page, same 4 columns) then rasterizes each    */
/*  page with html2canvas and assembles a PDF with jsPDF. Everything is   */
/*  generated locally on-device; nothing is uploaded anywhere.            */
/* ---------------------------------------------------------------------- */
/* jsPDF/html2canvas are vendored locally under ./vendor so PDF export keeps
   working with no internet connection (this app is otherwise fully
   offline/local-only). A CDN copy is tried only as a fallback, in case the
   vendor files are ever missing from a deployment. */
let _pdfLibsPromise = null;
function _loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`تعذر تحميل الملف: ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error(`تعذر تحميل الملف: ${src}`));
    document.head.appendChild(s);
  });
}
async function _loadLibWithFallback(localSrc, cdnSrc, globalCheck) {
  try {
    await _loadScriptOnce(localSrc);
    if (globalCheck()) return;
    throw new Error(`الملف ${localSrc} تم تحميله لكنه لا يحتوي على المكتبة المتوقعة`);
  } catch (localErr) {
    try {
      await _loadScriptOnce(cdnSrc);
      if (globalCheck()) return;
      throw new Error(`الملف ${cdnSrc} تم تحميله لكنه لا يحتوي على المكتبة المتوقعة`);
    } catch (cdnErr) {
      throw new Error(`فشل تحميل مكتبة PDF محليًا (${localErr.message}) وعبر الإنترنت (${cdnErr.message})`);
    }
  }
}
function _loadPdfLibs() {
  if (!_pdfLibsPromise) {
    _pdfLibsPromise = Promise.all([
      _loadLibWithFallback(
        'vendor/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
        () => !!(window.jspdf && window.jspdf.jsPDF)
      ),
      _loadLibWithFallback(
        'vendor/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        () => typeof window.html2canvas === 'function'
      ),
    ]).catch((err) => { _pdfLibsPromise = null; throw err; });
  }
  return _pdfLibsPromise;
}

async function downloadBirthdaysPDF(monthIdx, withDates) {
  const btn = document.getElementById('birthdayPdfBtn');
  const rows = withDates
    .filter((x) => x.month === monthIdx)
    .sort((a, b) => a.day - b.day)
    .map((x) => ({
      name: x.member.name || '',
      monthNum: monthIdx + 1,
      className: cleanLabel(x.member.class) || '—',
      age: computeAge(x.member),
    }));

  if (!rows.length) {
    showToast('لا توجد أعياد ميلاد في هذا الشهر لتصديرها', 'error');
    return;
  }

  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'جاري التجهيز...';

  const cleanupEls = [];
  try {
    await _loadPdfLibs();
    const { jsPDF } = window.jspdf;

    /* Page geometry in pt (1pt == 1px in the offscreen build; html2canvas
       rasterizes it and jsPDF maps that raster onto a real A4 pt page). */
    const PAGE_W = 595, PAGE_H = 842;
    const MARGIN = 26;
    const GUTTER = 14;
    const HEADER_H = 96;
    const BLOCK_W = (PAGE_W - MARGIN * 2 - GUTTER) / 2;
    const BLOCK_H = PAGE_H - HEADER_H - MARGIN * 2;
    const HEAD_ROW_H = 24;
    const MIN_ROW_H = 20;
    const COLS = [
      { key: 'name', label: 'اسم المخدوم', w: 0.55 },
      { key: 'monthNum', label: 'الشهر', w: 0.13 },
      { key: 'className', label: 'الفصل', w: 0.17 },
      { key: 'age', label: 'السن', w: 0.15 },
    ];
    const nameColW = BLOCK_W * COLS[0].w - 2;
    const classColW = BLOCK_W * COLS[2].w - 2;
    const ageColW = BLOCK_W * COLS[3].w - 2;

    /* Measure wrapped height per row across every column that could wrap
       (name, class, age) so no row is ever split across a block/page
       boundary and no column can silently overflow into the next row. */
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;visibility:hidden;left:-9999px;top:0;font-family:'Cairo',system-ui,sans-serif;font-size:10.5px;line-height:1.4;padding:5px 6px;box-sizing:border-box;word-break:break-word;`;
    document.body.appendChild(probe);
    cleanupEls.push(probe);
    function measureH(text, width) {
      probe.style.width = `${width}px`;
      probe.textContent = text;
      return probe.offsetHeight;
    }
    const measured = rows.map((r, idx) => {
      const serial = idx + 1;
      const nameH = measureH(`${serial} - ${r.name}`, nameColW);
      const classH = measureH(r.className, classColW);
      const ageText = r.age !== null ? `${r.age} سنة` : '—';
      const ageH = measureH(ageText, ageColW);
      return { ...r, serial, rowH: Math.max(MIN_ROW_H, nameH, classH, ageH) };
    });

    /* Bin-pack rows into blocks that each fit within BLOCK_H. */
    const blocks = [];
    let current = [], currentH = HEAD_ROW_H;
    for (const r of measured) {
      if (currentH + r.rowH > BLOCK_H && current.length) {
        blocks.push(current);
        current = [];
        currentH = HEAD_ROW_H;
      }
      current.push(r);
      currentH += r.rowH;
    }
    if (current.length) blocks.push(current);

    function tableHTML(blockRows) {
      const colgroup = COLS.map((c) => `<col style="width:${c.w * 100}%;">`).join('');
      const th = COLS.map((c) => `<th style="border:1px solid #9AA7B2;background:#DCE6F1;color:#1F2A37;font-family:'Cairo',sans-serif;font-weight:700;font-size:10.5px;line-height:1.35;padding:5px 6px;text-align:center;vertical-align:middle;">${escapeHTML(c.label)}</th>`).join('');
      const trs = blockRows.map((r) => `
        <tr>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;word-break:break-word;text-align:right;vertical-align:middle;">${r.serial} - ${escapeHTML(r.name)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;text-align:center;vertical-align:middle;">${r.monthNum}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;text-align:center;vertical-align:middle;">${escapeHTML(r.className)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;text-align:center;vertical-align:middle;">${r.age !== null ? r.age + ' سنة' : '—'}</td>
        </tr>`).join('');
      return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup>${colgroup}</colgroup><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    }

    function pageHTML(pageBlocks) {
      const blocksHTML = pageBlocks.map((b) => `<div style="width:${BLOCK_W}px;">${tableHTML(b)}</div>`).join(`<div style="width:${GUTTER}px;"></div>`);
      return `
        <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:#FFFDF8;box-sizing:border-box;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;background-image:url('site-bg.jpg');background-size:cover;background-position:center;opacity:0.08;"></div>
          <div style="position:relative;padding:${MARGIN}px;direction:rtl;">
            <div style="text-align:center;margin-bottom:10px;">
              <div style="font-family:'Aref Ruqaa',serif;font-size:22px;color:#7C1F2C;font-weight:700;">أعياد الميلاد</div>
              <div style="font-family:'Cairo',sans-serif;font-size:10px;color:#AD8332;font-weight:700;margin-top:2px;">إيبارشية شرق المنيا للأقباط الأرثوذكس</div>
              <div style="font-family:'Cairo',sans-serif;font-size:11px;color:#591420;font-weight:700;margin-top:1px;">كنيسة الأنبا بيشوي بالمنيا الجديدة</div>
            </div>
            <div style="display:flex;flex-direction:row;">${blocksHTML}</div>
          </div>
        </div>`;
    }

    const pages = [];
    for (let i = 0; i < blocks.length; i += 2) {
      pages.push(blocks.slice(i, i + 2));
    }

    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-99999px;top:0;';
    document.body.appendChild(stage);
    cleanupEls.push(stage);

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    for (let i = 0; i < pages.length; i++) {
      stage.innerHTML = pageHTML(pages[i]);
      const pageEl = stage.firstElementChild;
      // eslint-disable-next-line no-await-in-loop
      const canvas = await window.html2canvas(pageEl, { scale: 2, backgroundColor: '#FFFDF8', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, PAGE_W, PAGE_H);
    }

    pdf.save(`اعياد_الميلاد_${ARABIC_MONTHS[monthIdx]}.pdf`);
  } catch (err) {
    // Full error kept in the console for diagnosis; the toast stays a
    // short, friendly Arabic message for end users.
    console.error('PDF generation failed:', err);
    showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
  } finally {
    cleanupEls.forEach((el) => el.remove());
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

/* ---------------------------------------------------------------------- */
/*  Visitation families PDF export ("استخراج PDF")                        */
/*  #/visitation/families — exports exactly the families currently shown  */
/*  (i.e. already narrowed down by the page's existing search + filters). */
/*  Reuses the same jsPDF/html2canvas pipeline and visual template as the */
/*  "أعياد الميلاد" PDF export above (_loadPdfLibs, same page geometry,   */
/*  header and table styling) — only the columns/data differ.            */
/* ---------------------------------------------------------------------- */
function visitationFamilyAddress(f) {
  return [f.city, f.neighborhood, f.street].filter(Boolean).join(' - ');
}

async function downloadVisitationFamiliesPDF(families) {
  const btn = document.getElementById('visitationFamiliesPdfBtn');
  const rows = families.map((f) => ({
    name: f.name || '',
    confessionFather: f.confessionFather || '—',
    phone: f.phone1 || f.phone2 || '—',
    address: visitationFamilyAddress(f) || '—',
  }));

  if (!rows.length) {
    showToast('لا توجد أسر مطابقة للفلاتر الحالية لتصديرها', 'error');
    return;
  }

  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'جاري التجهيز...';

  const cleanupEls = [];
  try {
    await _loadPdfLibs();
    const { jsPDF } = window.jspdf;

    /* Same page geometry convention as downloadBirthdaysPDF, but a single
       full-width table per page (4 columns need more horizontal room than
       the birthdays table). */
    const PAGE_W = 595, PAGE_H = 842;
    const MARGIN = 26;
    const HEADER_H = 96;
    const BLOCK_W = PAGE_W - MARGIN * 2;
    const BLOCK_H = PAGE_H - HEADER_H - MARGIN * 2;
    const HEAD_ROW_H = 24;
    const MIN_ROW_H = 20;
    const COLS = [
      { key: 'name', label: 'اسم الشخص', w: 0.30 },
      { key: 'confessionFather', label: 'أب الاعتراف', w: 0.22 },
      { key: 'phone', label: 'رقم الهاتف', w: 0.18 },
      { key: 'address', label: 'العنوان', w: 0.30 },
    ];
    const nameColW = BLOCK_W * COLS[0].w - 2;
    const fatherColW = BLOCK_W * COLS[1].w - 2;
    const phoneColW = BLOCK_W * COLS[2].w - 2;
    const addressColW = BLOCK_W * COLS[3].w - 2;

    /* Measure wrapped height per row across every column so no row is ever
       split across a block/page boundary (same technique as the birthdays
       export). */
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;visibility:hidden;left:-9999px;top:0;font-family:'Cairo',system-ui,sans-serif;font-size:10.5px;line-height:1.4;padding:5px 6px;box-sizing:border-box;word-break:break-word;`;
    document.body.appendChild(probe);
    cleanupEls.push(probe);
    function measureH(text, width) {
      probe.style.width = `${width}px`;
      probe.textContent = text;
      return probe.offsetHeight;
    }
    const measured = rows.map((r, idx) => {
      const serial = idx + 1;
      const nameH = measureH(`${serial} - ${r.name}`, nameColW);
      const fatherH = measureH(r.confessionFather, fatherColW);
      const phoneH = measureH(r.phone, phoneColW);
      const addressH = measureH(r.address, addressColW);
      return { ...r, serial, rowH: Math.max(MIN_ROW_H, nameH, fatherH, phoneH, addressH) };
    });

    /* Bin-pack rows into blocks that each fit within BLOCK_H. */
    const blocks = [];
    let current = [], currentH = HEAD_ROW_H;
    for (const r of measured) {
      if (currentH + r.rowH > BLOCK_H && current.length) {
        blocks.push(current);
        current = [];
        currentH = HEAD_ROW_H;
      }
      current.push(r);
      currentH += r.rowH;
    }
    if (current.length) blocks.push(current);

    function tableHTML(blockRows) {
      const colgroup = COLS.map((c) => `<col style="width:${c.w * 100}%;">`).join('');
      const th = COLS.map((c) => `<th style="border:1px solid #9AA7B2;background:#DCE6F1;color:#1F2A37;font-family:'Cairo',sans-serif;font-weight:700;font-size:10.5px;line-height:1.35;padding:5px 6px;text-align:center;vertical-align:middle;">${escapeHTML(c.label)}</th>`).join('');
      const trs = blockRows.map((r) => `
        <tr>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;word-break:break-word;text-align:right;vertical-align:middle;">${r.serial} - ${escapeHTML(r.name)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;word-break:break-word;text-align:center;vertical-align:middle;">${escapeHTML(r.confessionFather)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;text-align:center;vertical-align:middle;direction:ltr;">${escapeHTML(r.phone)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;word-break:break-word;text-align:right;vertical-align:middle;">${escapeHTML(r.address)}</td>
        </tr>`).join('');
      return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup>${colgroup}</colgroup><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    }

    function pageHTML(pageBlock) {
      return `
        <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:#FFFDF8;box-sizing:border-box;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;background-image:url('site-bg.jpg');background-size:cover;background-position:center;opacity:0.08;"></div>
          <div style="position:relative;padding:${MARGIN}px;direction:rtl;">
            <div style="text-align:center;margin-bottom:10px;">
              <div style="font-family:'Aref Ruqaa',serif;font-size:22px;color:#7C1F2C;font-weight:700;">الأسر</div>
              <div style="font-family:'Cairo',sans-serif;font-size:10px;color:#AD8332;font-weight:700;margin-top:2px;">إيبارشية شرق المنيا للأقباط الأرثوذكس</div>
              <div style="font-family:'Cairo',sans-serif;font-size:11px;color:#591420;font-weight:700;margin-top:1px;">كنيسة الأنبا بيشوي بالمنيا الجديدة</div>
            </div>
            <div style="width:${BLOCK_W}px;">${tableHTML(pageBlock)}</div>
          </div>
        </div>`;
    }

    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-99999px;top:0;';
    document.body.appendChild(stage);
    cleanupEls.push(stage);

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    for (let i = 0; i < blocks.length; i++) {
      stage.innerHTML = pageHTML(blocks[i]);
      const pageEl = stage.firstElementChild;
      // eslint-disable-next-line no-await-in-loop
      const canvas = await window.html2canvas(pageEl, { scale: 2, backgroundColor: '#FFFDF8', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, PAGE_W, PAGE_H);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    pdf.save(`الأسر_${stamp}.pdf`);
  } catch (err) {
    console.error('PDF generation failed:', err);
    showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
  } finally {
    cleanupEls.forEach((el) => el.remove());
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

/* ---------------------------------------------------------------------- */
/*  Sector members PDF export ("استخراج PDF")                             */
/*  #/browse/sector/:value — exports exactly the members currently shown  */
/*  (i.e. already narrowed down by الفصل + النوع filters). Reuses the     */
/*  same jsPDF/html2canvas pipeline and visual template as the existing    */
/*  exports above (_loadPdfLibs, same page geometry, header and table      */
/*  styling) — only the columns/data differ.                              */
/* ---------------------------------------------------------------------- */
function normalizeSectorGenderWord(w) {
  if (w === 'بنين' || w === 'شباب') return 'بنين';
  if (w === 'بنات' || w === 'شابات') return 'بنات';
  return null;
}

/* Gender derived from existing stored values only (no DB change):
   explicit stageGender/sectorGender/gender fields first, then the trailing
   gender word embedded in sector/stage text (e.g. 'اعدادي بنين'). */
function getSectorMemberGender(m) {
  const explicit = normalizeSectorGenderWord((m.stageGender || '').toString().trim())
    || normalizeSectorGenderWord((m.sectorGender || '').toString().trim())
    || normalizeSectorGenderWord((m.gender || '').toString().trim());
  if (explicit) return explicit;
  const fromSector = normalizeSectorGenderWord(deriveStageGender(m.sector || ''));
  if (fromSector) return fromSector;
  return normalizeSectorGenderWord(deriveStageGender(m.stage || ''));
}

async function downloadSectorMembersPDF(members, sectorLabel) {
  const btn = document.getElementById('sectorPdfBtn');
  const rows = members.map((m) => {
    const phoneRaw = m.phone1 || m.phone2 || '';
    return {
      name: m.name || '',
      phone: phoneRaw ? formatPhone(phoneRaw) : '—',
      className: cleanLabel(m.class) || '—',
      address: visitationFamilyAddress(m) || '—',
    };
  });

  if (!rows.length) {
    showToast('لا توجد أسماء مطابقة للفلاتر الحالية لتصديرها', 'error');
    return;
  }

  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'جاري التجهيز...';

  const cleanupEls = [];
  try {
    await _loadPdfLibs();
    const { jsPDF } = window.jspdf;

    /* Same page geometry convention as downloadVisitationFamiliesPDF:
       single full-width table per page with equal column widths. */
    const PAGE_W = 595, PAGE_H = 842;
    const MARGIN = 26;
    const HEADER_H = 96;
    const BLOCK_W = PAGE_W - MARGIN * 2;
    const BLOCK_H = PAGE_H - HEADER_H - MARGIN * 2;
    const HEAD_ROW_H = 24;
    const MIN_ROW_H = 20;
    const COLS = [
      { key: 'name', label: 'الاسم', w: 0.25 },
      { key: 'phone', label: 'رقم الهاتف', w: 0.25 },
      { key: 'className', label: 'الفصل', w: 0.25 },
      { key: 'address', label: 'العنوان', w: 0.25 },
    ];
    const nameColW = BLOCK_W * COLS[0].w - 2;
    const phoneColW = BLOCK_W * COLS[1].w - 2;
    const classColW = BLOCK_W * COLS[2].w - 2;
    const addressColW = BLOCK_W * COLS[3].w - 2;

    /* Measure wrapped height per row across every column so no row is ever
       split across a block/page boundary (same technique as the existing
       exports). */
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;visibility:hidden;left:-9999px;top:0;font-family:'Cairo',system-ui,sans-serif;font-size:10.5px;line-height:1.4;padding:5px 6px;box-sizing:border-box;word-break:break-word;`;
    document.body.appendChild(probe);
    cleanupEls.push(probe);
    function measureH(text, width) {
      probe.style.width = `${width}px`;
      probe.textContent = text;
      return probe.offsetHeight;
    }
    const measured = rows.map((r, idx) => {
      const serial = idx + 1;
      const nameH = measureH(`${serial} - ${r.name}`, nameColW);
      const phoneH = measureH(r.phone, phoneColW);
      const classH = measureH(r.className, classColW);
      const addressH = measureH(r.address, addressColW);
      return { ...r, serial, rowH: Math.max(MIN_ROW_H, nameH, phoneH, classH, addressH) };
    });

    /* Bin-pack rows into blocks that each fit within BLOCK_H. */
    const blocks = [];
    let current = [], currentH = HEAD_ROW_H;
    for (const r of measured) {
      if (currentH + r.rowH > BLOCK_H && current.length) {
        blocks.push(current);
        current = [];
        currentH = HEAD_ROW_H;
      }
      current.push(r);
      currentH += r.rowH;
    }
    if (current.length) blocks.push(current);

    function tableHTML(blockRows) {
      const colgroup = COLS.map((c) => `<col style="width:${c.w * 100}%;">`).join('');
      const th = COLS.map((c) => `<th style="border:1px solid #9AA7B2;background:#DCE6F1;color:#1F2A37;font-family:'Cairo',sans-serif;font-weight:700;font-size:10.5px;line-height:1.35;padding:5px 6px;text-align:center;vertical-align:middle;">${escapeHTML(c.label)}</th>`).join('');
      const trs = blockRows.map((r) => `
        <tr>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;word-break:break-word;text-align:right;vertical-align:middle;">${r.serial} - ${escapeHTML(r.name)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;text-align:center;vertical-align:middle;direction:ltr;">${escapeHTML(r.phone)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;word-break:break-word;text-align:center;vertical-align:middle;">${escapeHTML(r.className)}</td>
          <td style="border:1px solid #C7CDD3;padding:5px 6px;font-size:10.5px;line-height:1.35;font-family:'Cairo',sans-serif;word-break:break-word;text-align:right;vertical-align:middle;">${escapeHTML(r.address)}</td>
        </tr>`).join('');
      return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup>${colgroup}</colgroup><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    }

    function pageHTML(pageBlock) {
      return `
        <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:#FFFDF8;box-sizing:border-box;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;background-image:url('site-bg.jpg');background-size:cover;background-position:center;opacity:0.08;"></div>
          <div style="position:relative;padding:${MARGIN}px;direction:rtl;">
            <div style="text-align:center;margin-bottom:10px;">
              <div style="font-family:'Aref Ruqaa',serif;font-size:22px;color:#7C1F2C;font-weight:700;">قطاع ${escapeHTML(cleanLabel(sectorLabel))}</div>
              <div style="font-family:'Cairo',sans-serif;font-size:10px;color:#AD8332;font-weight:700;margin-top:2px;">إيبارشية شرق المنيا للأقباط الأرثوذكس</div>
              <div style="font-family:'Cairo',sans-serif;font-size:11px;color:#591420;font-weight:700;margin-top:1px;">كنيسة الأنبا بيشوي بالمنيا الجديدة</div>
            </div>
            <div style="width:${BLOCK_W}px;">${tableHTML(pageBlock)}</div>
          </div>
        </div>`;
    }

    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-99999px;top:0;';
    document.body.appendChild(stage);
    cleanupEls.push(stage);

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    for (let i = 0; i < blocks.length; i++) {
      stage.innerHTML = pageHTML(blocks[i]);
      const pageEl = stage.firstElementChild;
      // eslint-disable-next-line no-await-in-loop
      const canvas = await window.html2canvas(pageEl, { scale: 2, backgroundColor: '#FFFDF8', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, PAGE_W, PAGE_H);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    pdf.save(`قطاع_${cleanLabel(sectorLabel)}_${stamp}.pdf`);
  } catch (err) {
    console.error('PDF generation failed:', err);
    showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
  } finally {
    cleanupEls.forEach((el) => el.remove());
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

/* ---------------------------------------------------------------------- */
/*  Browse: category list -> (optional sub-filter) -> members             */
/* ---------------------------------------------------------------------- */
async function renderBrowse(key, valueRaw, params) {
  renderChrome(true);
  const section = NAV_SECTIONS.find((s) => s.key === key);
  if (!section) return navigate('/home');
  const value = valueRaw ? decodeURIComponent(valueRaw) : null;

  if (!value) {
    const values = await MembersDB.distinctValues(section.field);
    const all = await MembersDB.getAll();
    APP_ROOT.innerHTML = `
      <div class="container">
        <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>${section.label}</span></p>
        <h2 class="section-title">اختر ${section.label}</h2>
        <p class="section-sub">القيم معروضة تلقائيًا من البيانات الحالية</p>
        ${values.length ? `<div class="member-list">${values.map((v) => {
          const c = all.filter((m) => (m[section.field] || '') === v).length;
          const label = (section.field === 'stage' || section.field === 'sector') ? cleanLabel(v) : v;
          return `<a href="#/browse/${key}/${encodeURIComponent(v)}" class="member-card">
            <span class="icon-wrap" style="width:44px;height:44px;border-radius:50%;background:var(--color-maroon-tint);color:var(--color-maroon);display:flex;align-items:center;justify-content:center;flex:none;">${ICONS[section.icon]}</span>
            <span class="member-info"><span class="member-name">${escapeHTML(label)}</span><span class="member-meta">${c} اسم</span></span>
          </a>`;
        }).join('')}</div>` : `<div class="empty-state">${ICONS.empty}<p>لا توجد بيانات مسجلة بعد لـ ${section.label}</p></div>`}
      </div>`;
    return;
  }

  // value selected: fetch matching members, and if there's a meaningful sub-filter (class), show chips
  let members = await MembersDB.filterBy(section.field, value);
  const subField = params.class || '';
  const neighborhoodParam = section.key === 'sector' ? (params.neighborhood || '') : '';
  const stageParam = section.key === 'sector' ? (params.stage || '') : '';
  let classValues = [];
  let neighborhoodValues = [];
  let stageValues = [];
  let allSectors = [];
  if (section.key === 'sector') {
    classValues = Array.from(new Set(members.map((m) => (m.class || '').trim()).filter(Boolean)));
    neighborhoodValues = Array.from(new Set(members.map((m) => (m.neighborhood || '').trim()).filter(Boolean)));
    stageValues = Array.from(new Set(members.map((m) => (m.stage || '').trim()).filter(Boolean)));
    allSectors = await MembersDB.distinctValues('sector');
    if (value && !allSectors.includes(value)) allSectors.unshift(value);
  }

  // تصفية: broad category filter, available for sections other than sector
  // (sector already has its own finer-grained class chips above).
  const catParam = params.cat || '';
  const showCategoryFilter = section.key !== 'sector';
  const categoryCounts = showCategoryFilter
    ? CATEGORY_DEFS.map((cd) => ({ ...cd, count: members.filter(cd.match).length }))
    : [];

  let filtered = members;
  if (section.key === 'sector') {
    if (subField) filtered = filtered.filter((m) => (m.class || '') === subField);
    if (neighborhoodParam) filtered = filtered.filter((m) => (m.neighborhood || '') === neighborhoodParam);
    if (stageParam) filtered = filtered.filter((m) => (m.stage || '') === stageParam);
  } else if (showCategoryFilter && catParam) {
    const catDef = CATEGORY_DEFS.find((c) => c.label === catParam);
    if (catDef) filtered = members.filter(catDef.match);
  }

  const valueLabel = (section.field === 'stage' || section.field === 'sector') ? cleanLabel(value) : value;
  const isSectorFiltered = section.key === 'sector' && (!!subField || !!neighborhoodParam || !!stageParam);

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs">
        <a href="#/home">الرئيسية</a><span class="sep">/</span>
        <a href="#/browse/${key}">${section.label}</a><span class="sep">/</span>
        <span>${escapeHTML(valueLabel)}</span>
      </p>
      <h2 class="section-title">${escapeHTML(valueLabel)}</h2>
      <p class="section-sub">إجمالي المسجلين: ${(catParam || isSectorFiltered) ? filtered.length : members.length}</p>
      ${section.key === 'sector' ? `
        <div class="filter-bar">
          <div class="field">
            <label for="sectorFilterSelect">القطاع</label>
            <select id="sectorFilterSelect">${allSectors.map((s) => `<option value="${escapeHTML(s)}" ${s === value ? 'selected' : ''}>${escapeHTML(cleanLabel(s))}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="neighborhoodFilterSelect">الحي</label>
            <select id="neighborhoodFilterSelect"><option value="">الكل</option>${neighborhoodValues.map((n) => `<option value="${escapeHTML(n)}" ${n === neighborhoodParam ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}${neighborhoodParam && !neighborhoodValues.includes(neighborhoodParam) ? `<option value="${escapeHTML(neighborhoodParam)}" selected>${escapeHTML(neighborhoodParam)}</option>` : ''}</select>
          </div>
          <div class="field">
            <label for="stageFilterSelect">المرحلة</label>
            <select id="stageFilterSelect"><option value="">الكل</option>${stageValues.map((s) => `<option value="${escapeHTML(s)}" ${s === stageParam ? 'selected' : ''}>${escapeHTML(cleanLabel(s))}</option>`).join('')}${stageParam && !stageValues.includes(stageParam) ? `<option value="${escapeHTML(stageParam)}" selected>${escapeHTML(cleanLabel(stageParam))}</option>` : ''}</select>
          </div>
          <div class="field">
            <label for="classFilterSelect">الفصل</label>
            <select id="classFilterSelect"><option value="">الكل</option>${classValues.map((c) => `<option value="${escapeHTML(c)}" ${c === subField ? 'selected' : ''}>${escapeHTML(cleanLabel(c))}</option>`).join('')}${subField && !classValues.includes(subField) ? `<option value="${escapeHTML(subField)}" selected>${escapeHTML(cleanLabel(subField))}</option>` : ''}</select>
          </div>
        </div>
        <div style="margin:18px 0 24px;">
          <button type="button" id="sectorPdfBtn" class="btn btn-outline btn-sm">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-inline-end:4px;"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>استخراج PDF
          </button>
        </div>` : ''}
      ${showCategoryFilter && categoryCounts.some((c) => c.count > 0) ? `
        <p class="section-sub" style="margin-top:14px;">تصفية</p>
        <div class="chip-row">
          <a href="#/browse/${key}/${encodeURIComponent(value)}" class="chip${!catParam ? ' active' : ''}">الكل<span class="count">${members.length}</span></a>
          ${categoryCounts.map((c) => `<a href="#/browse/${key}/${encodeURIComponent(value)}?${qs({ cat: c.label })}" class="chip${catParam === c.label ? ' active' : ''}">${escapeHTML(c.label)}<span class="count">${c.count}</span></a>`).join('')}
        </div>` : ''}
      ${renderMemberListOrEmpty(filtered, 'لا يوجد أسماء في هذا التصنيف')}
    </div>`;

  const sectorFilterSelect = document.getElementById('sectorFilterSelect');
  if (sectorFilterSelect) {
    sectorFilterSelect.addEventListener('change', () => {
      const newSector = sectorFilterSelect.value;
      if (!newSector || newSector === value) return;
      const s = qs({ class: subField, neighborhood: neighborhoodParam, stage: stageParam });
      navigate(`/browse/sector/${encodeURIComponent(newSector)}${s ? `?${s}` : ''}`);
    });
  }
  const wireSectorSubFilter = (id, paramKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const next = { class: subField, neighborhood: neighborhoodParam, stage: stageParam };
      next[paramKey] = el.value;
      const s = qs(next);
      navigate(`/browse/${key}/${encodeURIComponent(value)}${s ? `?${s}` : ''}`);
    });
  };
  wireSectorSubFilter('neighborhoodFilterSelect', 'neighborhood');
  wireSectorSubFilter('stageFilterSelect', 'stage');
  wireSectorSubFilter('classFilterSelect', 'class');

  const sectorPdfBtn = document.getElementById('sectorPdfBtn');
  if (sectorPdfBtn) {
    sectorPdfBtn.addEventListener('click', () => downloadSectorMembersPDF(filtered, value));
  }
}

/* ---------------------------------------------------------------------- */
/*  Member profile                                                        */
/* ---------------------------------------------------------------------- */
async function renderProfile(idStr) {
  renderChrome(true);
  const member = await MembersDB.getById(idStr);
  if (!member) {
    APP_ROOT.innerHTML = `<div class="container"><div class="empty-state">${ICONS.empty}<p>هذا الاسم غير موجود</p></div></div>`;
    return;
  }
  const age = computeAge(member);
  const birth = formatBirthDate(member);

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>الملف الشخصي</span></p>

      <div class="profile-header">
        <span class="profile-avatar">${escapeHTML(initials(member.name))}</span>
        <div>
          <h1 class="profile-name">${escapeHTML(member.name)}</h1>
          <div class="profile-tags">
            ${member.sector ? `<span class="tag">${escapeHTML(cleanLabel(member.sector))}</span>` : ''}
            ${member.class ? `<span class="tag">${escapeHTML(cleanLabel(member.class))}</span>` : ''}
            ${member.neighborhood ? `<span class="tag">${escapeHTML(member.neighborhood)}</span>` : ''}
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-outline btn-sm" id="editBtn">${ICONS.edit}<span>تعديل</span></button>
          <button class="btn btn-danger btn-sm" id="deleteBtn">${ICONS.trash}<span>حذف</span></button>
        </div>
      </div>

      <div class="info-section">
        <h3>${ICONS.phone} بيانات التواصل</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>رقم الموبايل</dt><dd>${phoneLinkHTML(member.phone1)}</dd></div>
          <div class="info-item"><dt>رقم الموبايل (2)</dt><dd>${phoneLinkHTML(member.phone2)}</dd></div>
        </dl>
      </div>

      <div class="info-section">
        <h3>${ICONS.location} العنوان</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>المدينة</dt><dd class="${member.city ? '' : 'muted'}">${fieldOrFallback(member.city)}</dd></div>
          <div class="info-item"><dt>الحي</dt><dd class="${member.neighborhood ? '' : 'muted'}">${fieldOrFallback(member.neighborhood)}</dd></div>
          <div class="info-item full"><dt>الشارع</dt><dd class="${member.street ? '' : 'muted'}">${streetFieldHTML(member.street)}</dd></div>
          <div class="info-item full">
            <dt>اللوكيشن الحالي</dt>
            <dd class="location-cell">
              ${member.locationLink ? `<a href="${escapeHTML(member.locationLink)}" target="_blank" rel="noopener noreferrer" class="location-link">${ICONS.location} عرض اللوكيشن على Google Maps</a>` : `<span class="muted">لم يتم تسجيل لوكيشن بعد</span>`}
              <button type="button" class="btn btn-outline btn-sm" id="addLocationBtn">${ICONS.location}<span>إضافة اللوكيشن</span></button>
            </dd>
          </div>
        </dl>
      </div>

      <div class="info-section">
        <h3>${ICONS.church} الخدمة / المرحلة</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>الرحلة (مرحله)</dt><dd class="${member.stage ? '' : 'muted'}">${fieldOrFallback(cleanLabel(member.stage))}</dd></div>
          <div class="info-item"><dt>القطاع</dt><dd class="${member.sector ? '' : 'muted'}">${fieldOrFallback(cleanLabel(member.sector))}</dd></div>
          <div class="info-item"><dt>الفصل</dt><dd class="${member.class ? '' : 'muted'}">${fieldOrFallback(cleanLabel(member.class))}</dd></div>
        </dl>
      </div>

      <div class="info-section">
        <h3>${ICONS.calendar} بيانات الميلاد</h3>
        <dl class="info-grid">
          <div class="info-item"><dt>تاريخ الميلاد</dt><dd class="${birth ? '' : 'muted'}">${birth || 'غير متوفر'}</dd></div>
          <div class="info-item"><dt>السن</dt><dd class="${age !== null ? '' : 'muted'}">${age !== null ? age + ' سنة' : 'غير متوفر'}</dd></div>
        </dl>
      </div>

      <div class="info-section">
        <h3>${ICONS.notes} ملاحظات إضافية</h3>
        <dl class="info-grid">
          <div class="info-item full"><dd class="${member.notes ? '' : 'muted'}">${fieldOrFallback(member.notes)}</dd></div>
        </dl>
      </div>
    </div>
  `;

  document.getElementById('editBtn').addEventListener('click', async () => {
    if (await Admin.require()) navigate(`/edit/${member.id}`);
  });
  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!(await Admin.require())) return;
    if (!confirm(`هل تريد حذف "${member.name}" نهائيًا من قاعدة البيانات؟`)) return;
    await MembersDB.remove(member.id);
    showToast('تم الحذف', 'success');
    navigate('/home');
  });

  const addLocationBtn = document.getElementById('addLocationBtn');
  if (addLocationBtn) {
    addLocationBtn.addEventListener('click', async () => {
      if (!(await Admin.require())) return;
      if (!('geolocation' in navigator)) {
        showToast('المتصفح لا يدعم تحديد الموقع', 'error');
        return;
      }
      const originalHTML = addLocationBtn.innerHTML;
      addLocationBtn.disabled = true;
      addLocationBtn.innerHTML = '<span>جارٍ تحديد الموقع...</span>';
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          member.locationLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
          await MembersDB.put(member);
          showToast('تم حفظ اللوكيشن بنجاح', 'success');
          renderProfile(idStr);
        },
        (err) => {
          addLocationBtn.disabled = false;
          addLocationBtn.innerHTML = originalHTML;
          if (err.code === err.PERMISSION_DENIED) {
            showToast('لازم تسمح بالوصول للموقع عشان تقدر تسجل اللوكيشن', 'error');
          } else {
            showToast('تعذر تحديد الموقع، حاول تاني', 'error');
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }
}

/* ---------------------------------------------------------------------- */
/*  Add / Edit form                                                       */
/* ---------------------------------------------------------------------- */
const DROPDOWN_FIELDS = [
  { field: 'city', label: 'المدينة' },
  { field: 'neighborhood', label: 'الحي' },
  { field: 'stage', label: 'المرحلة' },
  { field: 'sector', label: 'القطاع' },
  { field: 'class', label: 'الفصل' },
];

const STAGE_OPTIONS = [
  'مدارس الأحد',
  'اعدادي',
  'ثانوي',
  'جامعة',
  'خريجين',
  'الاجتماع العام',
  'اجتماع الكرمة المثمرة',
  'اجتماع الصلاة',
];

/* المرحلة -> القطاع */
const SECTOR_MAP = {
  'مدارس الأحد': ['حضانه', 'ابتدائي_أ', 'ابتدائي_ب'],
  'اعدادي': ['اعدادي بنين', 'اعدادي بنات'],
  'ثانوي': ['ثانوي بنين', 'ثانوي بنات'],
  'جامعة': ['جامعة شباب', 'جامعة شابات'],
  'خريجين': ['خريجين شباب', 'خريجين شابات'],
};

/* القطاع -> الفصل */
const CLASS_MAP = {
  'حضانه': ['بيبي كلاس', 'KG1', 'KG2'],
  'ابتدائي_أ': ['أولي ابتدائي', 'ثانية ابتدائي', 'ثالثة ابتدائي'],
  'ابتدائي_ب': ['رابعة ابتدائي', 'خامسة ابتدائي', 'سادسة ابتدائي'],
  'اعدادي بنين': ['أولي إعدادي', 'ثانية إعدادي', 'ثالثة إعددي'],
  'اعدادي بنات': ['أولي إعدادي', 'ثانية إعدادي', 'ثالثة إعددي'],
  'ثانوي بنين': ['أولي ثانوي', 'ثانية ثانوي', 'ثالثة ثانوي'],
  'ثانوي بنات': ['أولي ثانوي', 'ثانية ثانوي', 'ثالثة ثانوي'],
  'جامعة شباب': ['اجتماع الشباب', 'اجتماع الشابات'],
  'جامعة شابات': ['اجتماع الشباب', 'اجتماع الشابات'],
  'خريجين شباب': ['اجتماع الشباب', 'اجتماع الشابات'],
  'خريجين شابات': ['اجتماع الشباب', 'اجتماع الشابات'],
};

/* Backward compatibility: old records stored the gender-combined value
   (e.g. 'اعدادي بنين') directly in the "stage" field, with the broad
   category in "sector". Map old stage -> new stage so existing records
   still restore correctly in Edit Mode. */
const LEGACY_STAGE_TO_NEW_STAGE = {
  'مدارس_الأحد': 'مدارس الأحد',
  'اعدادي بنين': 'اعدادي', 'اعدادي بنات': 'اعدادي',
  'ثانوي بنين': 'ثانوي', 'ثانوي بنات': 'ثانوي',
  'جامعة شباب': 'جامعة', 'جامعة شابات': 'جامعة',
  'خريجين شباب': 'خريجين', 'خريجين شابات': 'خريجين',
};

/* Normalizes a stored record's stage/sector/class into the new hierarchy
   for display in the Edit form. Does not touch the saved record itself;
   the new mapping is persisted only when the form is submitted. */
function normalizeLegacyStageSectorClass(v) {
  if (!v || !v.stage) return v;
  if (v.stage === 'مدارس_الأحد') {
    return { ...v, stage: 'مدارس الأحد' }; // sector/class already compatible
  }
  const newStage = LEGACY_STAGE_TO_NEW_STAGE[v.stage];
  if (!newStage) return v; // already new format or unrecognized, leave as-is
  return { ...v, stage: newStage, sector: v.stage };
}

/* Trailing gender word embedded in a Stage option's text (kept separate from
   the stored stage value logically, mirrored into stageGender for compat). */
const STAGE_GENDER_WORDS = ['بنين', 'بنات', 'شباب', 'شابات'];
function deriveStageGender(stageValue) {
  if (!stageValue) return null;
  const last = stageValue.trim().split(/\s+/).pop();
  return STAGE_GENDER_WORDS.includes(last) ? last : null;
}

const GENDER_OPTIONS = ['بنين', 'بنات'];

const CITY_OPTIONS = [
  'المنيا الجديدة',
];

const NEIGHBORHOOD_OPTIONS = [
  'الأول', 'الثانى', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع',
  'المتميز', 'منطقة الامتداد', 'منطقة الإسكان الاجتماعي', 'منطقة سكن مصر',
  'منطقة دار مصر', 'منطقة جنة مصر', 'كمين الصفا', 'ابني بيتك 1', 'ابني بيتك 2',
  'القرنفل', 'الزهراء',
];

async function renderForm(idStr) {
  renderChrome(true);
  const isEdit = !!idStr;

  if (isEdit && !Admin.isUnlocked()) {
    const ok = await Admin.require();
    if (!ok) return navigate(idStr ? `/member/${idStr}` : '/home');
  }

  const existing = isEdit ? await MembersDB.getById(idStr) : null;
  if (isEdit && !existing) return navigate('/home');

  const v = normalizeLegacyStageSectorClass(existing || {});

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>${isEdit ? 'تعديل بيانات' : 'إضافة اسم'}</span></p>
      <h2 class="section-title">${isEdit ? 'تعديل بيانات: ' + escapeHTML(v.name || '') : 'إضافة اسم جديد'}</h2>
      <p class="section-sub">الحقول المطلوبة معلّم عليها بعلامة *</p>

      <div class="duplicate-warning" id="dupWarning"></div>

      <form class="form-card" id="memberForm" novalidate>
        <div class="form-grid">
          <div class="field full">
            <label for="f_name">الاسم <span class="req">*</span></label>
            <input type="text" id="f_name" name="name" required value="${escapeHTML(v.name || '')}" />
            <div class="field-error"></div>
          </div>

          <div class="field">
            <label for="f_phone1">رقم الموبايل</label>
            <input type="tel" id="f_phone1" name="phone1" value="${escapeHTML(v.phone1 || '')}" />
            <div class="field-error"></div>
          </div>
          <div class="field">
            <label for="f_phone2">رقم الموبايل (2)</label>
            <input type="tel" id="f_phone2" name="phone2" value="${escapeHTML(v.phone2 || '')}" />
            <div class="field-error"></div>
          </div>

          ${selectFieldHTML(DROPDOWN_FIELDS[0], v.city, CITY_OPTIONS)}
          ${selectFieldHTML(DROPDOWN_FIELDS[1], v.neighborhood, NEIGHBORHOOD_OPTIONS)}

          <div class="field full">
            <label for="f_street">الشارع</label>
            <input type="text" id="f_street" name="street" value="${escapeHTML(v.street || '')}" />
          </div>

          <div class="field full">
            <label>اللوكيشن</label>
            <div class="location-cell">
              <span id="locationStatus">${v.locationLink ? `<a href="${escapeHTML(v.locationLink)}" target="_blank" rel="noopener noreferrer" class="location-link">${ICONS.location} عرض اللوكيشن على Google Maps</a>` : `<span class="muted">لم يتم تسجيل لوكيشن بعد</span>`}</span>
              <button type="button" class="btn btn-outline btn-sm" id="addLocationBtn">${ICONS.location}<span>إضافة اللوكيشن</span></button>
            </div>
            <input type="hidden" id="f_locationLink" value="${escapeHTML(v.locationLink || '')}" />
          </div>

          ${dependentSelectHTML('stage', DROPDOWN_FIELDS[2].label, STAGE_OPTIONS, v.stage, false)}
          ${dependentSelectHTML('sector', DROPDOWN_FIELDS[3].label, (v.stage && SECTOR_MAP[v.stage]) || [], v.sector, !v.stage)}
          ${dependentSelectHTML('class', DROPDOWN_FIELDS[4].label, (v.sector && CLASS_MAP[v.sector]) || [], v.class, !v.sector)}

          <div class="field">
            <label for="f_birthDate">تاريخ الميلاد</label>
            <input type="date" id="f_birthDate" name="birthDate" value="${v.birthDate || ''}" />
          </div>
          <div class="field">
            <label for="f_age">السن (لو التاريخ غير متاح)</label>
            <input type="number" min="0" max="130" id="f_age" name="age" value="${v.age ?? ''}" />
          </div>

          <div class="field full">
            <label for="f_notes">الملاحظات</label>
            <textarea id="f_notes" name="notes" placeholder="هنا يتم كتابه تاريخ اخر افتقاد للمخدوم واي ملاحظات اخري">${escapeHTML(v.notes || '')}</textarea>
          </div>
        </div>

        <div class="form-actions">
          <a href="#${isEdit ? '/member/' + v.id : '/'}" class="btn btn-outline">إلغاء</a>
          <button type="submit" class="btn btn-primary">${isEdit ? 'حفظ التعديلات' : 'إضافة الاسم'}</button>
        </div>
      </form>
    </div>
  `;

  const nameInput = document.getElementById('f_name');
  const phone1Input = document.getElementById('f_phone1');

  const addLocationBtn = document.getElementById('addLocationBtn');
  const locationStatus = document.getElementById('locationStatus');
  const locationField = document.getElementById('f_locationLink');
  addLocationBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('المتصفح لا يدعم تحديد الموقع', 'error');
      return;
    }
    const originalHTML = addLocationBtn.innerHTML;
    addLocationBtn.disabled = true;
    addLocationBtn.innerHTML = '<span>جارٍ تحديد الموقع...</span>';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const link = `https://www.google.com/maps?q=${latitude},${longitude}`;
        locationField.value = link;
        locationStatus.innerHTML = `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" class="location-link">${ICONS.location} عرض اللوكيشن على Google Maps</a>`;
        addLocationBtn.disabled = false;
        addLocationBtn.innerHTML = originalHTML;
        showToast('تم تحديد اللوكيشن بنجاح', 'success');
      },
      (err) => {
        addLocationBtn.disabled = false;
        addLocationBtn.innerHTML = originalHTML;
        if (err.code === err.PERMISSION_DENIED) {
          showToast('لازم تسمح بالوصول للموقع عشان تقدر تسجل اللوكيشن', 'error');
        } else {
          showToast('تعذر تحديد الموقع، حاول تاني', 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  const dupBox = document.getElementById('dupWarning');

  const birthDateInput = document.getElementById('f_birthDate');
  const ageInput = document.getElementById('f_age');
  function syncAgeFromBirthDate() {
    if (birthDateInput.value) {
      const computed = computeAge({ birthDate: birthDateInput.value });
      if (computed !== null) ageInput.value = computed;
      ageInput.readOnly = true;
    } else {
      ageInput.readOnly = false;
    }
  }
  birthDateInput.addEventListener('input', syncAgeFromBirthDate);
  birthDateInput.addEventListener('change', syncAgeFromBirthDate);
  syncAgeFromBirthDate();

  const stageSelect = document.getElementById('f_stage');
  const sectorSelect = document.getElementById('f_sector');
  const classSelect = document.getElementById('f_class');

  function fillSelect(select, options, selectedValue) {
    select.innerHTML = '<option value="">— اختر —</option>' + optionsHTML(options, selectedValue);
  }

  stageSelect.addEventListener('change', () => {
    fillSelect(sectorSelect, SECTOR_MAP[stageSelect.value] || [], '');
    sectorSelect.disabled = !stageSelect.value;
    fillSelect(classSelect, [], '');
    classSelect.disabled = true;
  });

  sectorSelect.addEventListener('change', () => {
    fillSelect(classSelect, CLASS_MAP[sectorSelect.value] || [], '');
    classSelect.disabled = !sectorSelect.value;
  });

  async function checkDuplicates() {
    const name = nameInput.value.trim();
    if (name.length < 2) { dupBox.classList.remove('show'); return; }
    const matches = await MembersDB.searchByName(name);
    const relevant = matches.filter((m) => !isEdit || m.id !== v.id);
    if (relevant.length) {
      dupBox.innerHTML = `⚠️ يوجد بالفعل ${relevant.length} اسم مشابه في قاعدة البيانات: ` +
        relevant.slice(0, 4).map((m) => escapeHTML(m.name)).join('، ') +
        ' — تأكد إن الاسم مش مسجل قبل كده.';
      dupBox.classList.add('show');
    } else {
      dupBox.classList.remove('show');
    }
  }
  nameInput.addEventListener('input', debounce(checkDuplicates, 300));
  phone1Input.addEventListener('input', debounce(checkDuplicates, 300));

  document.getElementById('memberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameField = document.getElementById('f_name');
    const nameErr = nameField.parentElement.querySelector('.field-error');
    if (!nameField.value.trim()) {
      nameField.parentElement.classList.add('invalid');
      nameErr.textContent = 'الاسم مطلوب';
      nameField.focus();
      return;
    }
    nameField.parentElement.classList.remove('invalid');
    nameErr.textContent = '';

    if (!(await Admin.require())) return;

    const record = {
      id: isEdit ? v.id : await MembersDB.nextId(),
      name: nameField.value.trim(),
      phone1: document.getElementById('f_phone1').value.trim() || null,
      phone2: document.getElementById('f_phone2').value.trim() || null,
      city: document.getElementById('f_city').value.trim() || null,
      neighborhood: document.getElementById('f_neighborhood').value.trim() || null,
      street: document.getElementById('f_street').value.trim() || null,
      stage: document.getElementById('f_stage').value.trim() || null,
      stageGender: deriveStageGender(document.getElementById('f_sector').value.trim()) || (v.stageGender || null),
      sector: document.getElementById('f_sector').value.trim() || null,
      sectorGender: v.sectorGender || null,
      class: document.getElementById('f_class').value.trim() || null,
      locationLink: document.getElementById('f_locationLink').value.trim() || v.locationLink || null,
      birthDate: document.getElementById('f_birthDate').value || null,
      birthDay: null, birthMonth: null, birthYear: null,
      age: document.getElementById('f_age').value ? Number(document.getElementById('f_age').value) : null,
      notes: document.getElementById('f_notes').value.trim() || null,
    };
    if (record.birthDate) {
      const d = new Date(record.birthDate);
      if (!isNaN(d.getTime())) {
        record.birthDay = d.getDate();
        record.birthMonth = d.getMonth() + 1;
        record.birthYear = d.getFullYear();
      }
    }

    await MembersDB.put(record);
    showToast(isEdit ? 'تم حفظ التعديلات' : 'تم إضافة الاسم بنجاح', 'success');
    navigate(`/member/${record.id}`);
  });
}

function textFieldHTML(df, currentValue) {
  return `
    <div class="field">
      <label for="f_${df.field}">${df.label}</label>
      <input type="text" id="f_${df.field}" value="${escapeHTML(currentValue || '')}" />
    </div>`;
}

function selectFieldHTML(df, currentValue, options) {
  const cleanFields = ['stage', 'sector', 'class'];
  const legacyLabel = cleanFields.includes(df.field) ? cleanLabel(currentValue) : currentValue;
  return `
    <div class="field">
      <label for="f_${df.field}">${df.label}</label>
      <select id="f_${df.field}">
        <option value="">— اختر —</option>
        ${options.map((o) => `<option value="${escapeHTML(o)}" ${o === currentValue ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
        ${currentValue && !options.includes(currentValue) ? `<option value="${escapeHTML(currentValue)}" selected>${escapeHTML(legacyLabel)}</option>` : ''}
      </select>
    </div>`;
}

/* Renders <option> tags: value keeps the raw stored value (e.g. مدارس_الأحد),
   label is the cleaned display text (e.g. مدارس الأحد). Display-only. */
function optionsHTML(list, selectedValue) {
  return list.map((o) => `<option value="${escapeHTML(o)}" ${o === selectedValue ? 'selected' : ''}>${escapeHTML(cleanLabel(o))}</option>`).join('');
}

function dependentSelectHTML(id, label, options, selectedValue, disabled) {
  return `
    <div class="field">
      <label for="f_${id}">${label}</label>
      <select id="f_${id}" ${disabled ? 'disabled' : ''}>
        <option value="">— اختر —</option>
        ${optionsHTML(options, selectedValue)}
        ${selectedValue && !options.includes(selectedValue) ? `<option value="${escapeHTML(selectedValue)}" selected>${escapeHTML(cleanLabel(selectedValue))}</option>` : ''}
      </select>
    </div>`;
}

function genderFieldHTML(fieldId, currentValue, visible) {
  return `
    <div class="field" id="${fieldId}Wrap" ${visible ? '' : 'style="display:none;"'}>
      <label for="f_${fieldId}">بنين / بنات</label>
      <select id="f_${fieldId}">
        <option value="">— اختر —</option>
        ${GENDER_OPTIONS.map((o) => `<option value="${escapeHTML(o)}" ${o === currentValue ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
      </select>
    </div>`;
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* ---------------------------------------------------------------------- */
/*  Admin panel (export / import / data tools)                            */
/* ---------------------------------------------------------------------- */
async function renderAdminPanel() {
  renderChrome(true);
  const total = await MembersDB.count();

  APP_ROOT.innerHTML = `
    <div class="container">
      <p class="breadcrumbs"><a href="#/home">الرئيسية</a><span class="sep">/</span><span>إدارة البيانات</span></p>
      <h2 class="section-title">إدارة البيانات</h2>
      <p class="section-sub">البيانات محفوظة داخل هذا المتصفح فقط على هذا الجهاز (${total} اسم). استخدم التصدير والاستيراد لنقل البيانات بين الأجهزة.</p>

      <div class="admin-panel">
        <h3>${ICONS.download.replace('width="19"','width="17"')} تصدير نسخة كاملة من البيانات</h3>
        <p>يحمّل ملف JSON يحتوي على كل الأسماء المسجلة على هذا الجهاز. احتفظ بنسخة بشكل دوري.</p>
        <div class="admin-actions">
          <button id="exportBtn" class="btn btn-gold">${ICONS.download}<span>تنزيل نسخة JSON</span></button>
        </div>
      </div>

      <div class="admin-panel">
        <h3>${ICONS.upload} استيراد بيانات</h3>
        <p>ارفع ملف JSON تم تصديره سابقًا من هذا التطبيق لنقل البيانات لجهاز جديد. يمكنك اختيار ملف واحد أو عدة ملفات دفعة واحدة.</p>
        <div class="admin-actions">
          <label class="btn btn-outline" for="importFile" style="cursor:pointer;">${ICONS.upload}<span>اختيار ملف / ملفات</span></label>
          <input type="file" id="importFile" accept=".json,application/json" multiple style="display:none;" />
          <select id="importMode" class="btn btn-outline" style="padding:11px 14px;">
            <option value="merge">دمج مع البيانات الحالية</option>
            <option value="replace">استبدال كل البيانات الحالية</option>
          </select>
        </div>
      </div>

      <div class="admin-panel" style="border-color:var(--color-danger);">
        <h3 style="color:var(--color-danger);">منطقة خطرة</h3>
        <p>حذف كل البيانات المخزّنة على هذا الجهاز نهائيًا. لا يمكن التراجع عن هذا الإجراء إلا بالاستيراد من نسخة احتياطية.</p>
        <div class="admin-actions">
          <button id="wipeBtn" class="btn btn-danger">${ICONS.trash}<span>حذف كل البيانات</span></button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const json = await MembersDB.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `church-members-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تنزيل النسخة الاحتياطية', 'success');
  });

  document.getElementById('importFile').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const mode = document.getElementById('importMode').value;
    try {
      // Read + validate ALL selected files first; abort without touching the
      // database if any file is invalid, so a bad file can't partially corrupt data.
      const parsedFiles = [];
      for (const file of files) {
        let text;
        try {
          text = await file.text();
        } catch (readErr) {
          throw new Error(`تعذر قراءة الملف "${file.name}"`);
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (parseErr) {
          throw new Error(`الملف "${file.name}" غير صالح (ليس JSON صحيحًا)`);
        }
        if (!Array.isArray(parsed)) {
          throw new Error(`الملف "${file.name}" لا يحتوي على مصفوفة بيانات صحيحة`);
        }
        parsedFiles.push(parsed);
      }
      const combined = parsedFiles.flat();
      const result = await MembersDB.importRecords(combined, mode);
      const imported = (result && typeof result === 'object') ? result.imported : result;
      const skipped = (result && typeof result === 'object') ? result.skipped : 0;
      if (imported > 0) {
        showToast(
          skipped > 0
            ? `تم استيراد ${imported} سجل جديد، وتخطي ${skipped} سجل مكرر.`
            : `تم استيراد ${imported} سجل بنجاح`,
          'success'
        );
      } else {
        showToast(`لم يتم استيراد سجلات جديدة. تم تخطي ${skipped} سجل مكرر.`, 'success');
      }
      router();
    } catch (err) {
      showToast('الملف غير صالح: ' + err.message, 'danger');
    }
    e.target.value = '';
  });

  document.getElementById('wipeBtn').addEventListener('click', async () => {
    if (!(await Admin.require())) return;
    if (!confirm('متأكد إنك عايز تمسح كل البيانات المخزنة على هذا الجهاز؟ يفضّل تصدير نسخة احتياطية الأول.')) return;
    await MembersDB.clearAll();
    showToast('تم حذف كل البيانات', 'success');
    navigate('/home');
  });
}

/* ---------------------------------------------------------------------- */
/*  Boot                                                                  */
/* ---------------------------------------------------------------------- */
(async function boot() {
  try {
    await openDatabase();
    const seedResult = await MembersDB.seedIfEmpty();
    if (seedResult.seeded) {
      console.info(`تم تحميل ${seedResult.count} اسم من ملف البيانات الأولي`);
    }
    router();
  } catch (err) {
    console.error('Boot failed:', err);
    APP_ROOT.innerHTML = `
      <div class="container" style="padding:50px 0;text-align:center;">
        <p style="font-weight:700;color:var(--color-danger, #A6362C);">
          حصل خطأ أثناء تحميل التطبيق: ${escapeHTML(err && err.message ? err.message : String(err))}
        </p>
        <p style="color:#6B5E4F;font-size:.9rem;">
          جرّب فتح الموقع من متصفح حديث (Chrome / Safari / Edge) وتأكد إن التصفح الخاص (Private/Incognito) غير مفعّل، لأنه أحيانًا يمنع تخزين البيانات محليًا.
        </p>
      </div>`;
  }
})();
