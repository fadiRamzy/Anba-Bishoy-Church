/* ==========================================================================
   db.js — IndexedDB data layer for the Church Members app.
   Single object store "members" (keyPath: id) + "settings" (keyPath: key).
   No network, no backend — everything lives in the browser on this device.
   ========================================================================== */

const DB_NAME = 'churchMembersDB';
const DB_VERSION = 2;
const STORE_MEMBERS = 'members';
const STORE_SETTINGS = 'settings';
const STORE_VISITATION = 'visitationFamilies';

let dbInstance = null;

function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_MEMBERS)) {
        const store = db.createObjectStore(STORE_MEMBERS, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('city', 'city', { unique: false });
        store.createIndex('neighborhood', 'neighborhood', { unique: false });
        store.createIndex('stage', 'stage', { unique: false });
        store.createIndex('sector', 'sector', { unique: false });
        store.createIndex('class', 'class', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }

      // Visitation Services (خدمات الافتقاد): a separate store so the
      // existing "members" data/schema is never touched.
      if (!db.objectStoreNames.contains(STORE_VISITATION)) {
        const vStore = db.createObjectStore(STORE_VISITATION, { keyPath: 'id' });
        vStore.createIndex('name', 'name', { unique: false });
        vStore.createIndex('city', 'city', { unique: false });
        vStore.createIndex('neighborhood', 'neighborhood', { unique: false });
      }
    };

    req.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    req.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function tx(storeName, mode) {
  return openDatabase().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

/* ---------------------------- members CRUD ---------------------------- */

const MembersDB = {
  async getAll() {
    const store = await tx(STORE_MEMBERS, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getById(id) {
    const store = await tx(STORE_MEMBERS, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(Number(id));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async count() {
    const store = await tx(STORE_MEMBERS, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async nextId() {
    const all = await this.getAll();
    return all.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0) + 1;
  },

  async put(member) {
    const store = await tx(STORE_MEMBERS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(member);
      req.onsuccess = () => resolve(member);
      req.onerror = () => reject(req.error);
    });
  },

  async remove(id) {
    const store = await tx(STORE_MEMBERS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(Number(id));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async bulkPut(members) {
    const store = await tx(STORE_MEMBERS, 'readwrite');
    return new Promise((resolve, reject) => {
      let remaining = members.length;
      if (remaining === 0) return resolve(0);
      members.forEach((m) => {
        const req = store.put(m);
        req.onsuccess = () => {
          remaining -= 1;
          if (remaining === 0) resolve(members.length);
        };
        req.onerror = () => reject(req.error);
      });
    });
  },

  async clearAll() {
    const store = await tx(STORE_MEMBERS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  /* Seed from data/seed.json only if the store is currently empty. */
  async seedIfEmpty() {
    const existing = await this.count();
    if (existing > 0) return { seeded: false, count: existing };
    try {
      const res = await fetch('seed.json');
      const seed = await res.json();
      await this.bulkPut(seed);
      return { seeded: true, count: seed.length };
    } catch (err) {
      console.error('Seed load failed:', err);
      return { seeded: false, count: 0, error: err };
    }
  },

  /* Case/spacing-tolerant Arabic-friendly substring search over name. */
  async searchByName(query) {
    const all = await this.getAll();
    const norm = normalizeArabic(query);
    if (!norm) return [];
    return all.filter((m) => normalizeArabic(m.name || '').includes(norm));
  },

  /* Real-time search across name, phone (partial/full digits), address
     (city/neighborhood/street) and stage/sector/class. Case-insensitive and
     Arabic-tolerant (via normalizeArabic). Always scans the FULL stored
     dataset (getAll()), so records with duplicate phone numbers/addresses
     are all returned — nothing is deduplicated or used as a lookup key. */
  async searchAll(query) {
    const raw = (query || '').toString().trim();
    if (!raw) return [];
    const all = await this.getAll();
    const norm = normalizeArabic(raw);
    const digits = raw.replace(/\D/g, '');
    return all.filter((m) => {
      if (norm && normalizeArabic(m.name || '').includes(norm)) return true;
      if (digits) {
        const p1 = (m.phone1 || '').toString().replace(/\D/g, '');
        const p2 = (m.phone2 || '').toString().replace(/\D/g, '');
        if ((p1 && p1.includes(digits)) || (p2 && p2.includes(digits))) return true;
      }
      if (norm) {
        const otherFields = [m.city, m.neighborhood, m.street, m.stage, m.sector, m.class];
        if (otherFields.some((f) => f && normalizeArabic(f.toString()).includes(norm))) return true;
      }
      return false;
    });
  },

  async filterBy(field, value) {
    const all = await this.getAll();
    return all.filter((m) => (m[field] || '') === value);
  },

  async distinctValues(field) {
    const all = await this.getAll();
    const set = new Set();
    all.forEach((m) => {
      const v = (m[field] || '').toString().trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  },

  async exportJSON() {
    const all = await this.getAll();
    return JSON.stringify(all, null, 2);
  },

  /* mode: 'merge' (append, never overwriting existing records) or
     'replace' (clear then insert).
     Root cause of the old data-loss bug: separately exported JSON files
     (one per class/stage) each restart their own "id" numbering from 1.
     Since bulkPut() uses store.put(), which is an upsert keyed on "id",
     importing a second file whose ids happened to overlap with an
     already-stored file silently overwrote those existing records.
     Fix: in merge mode, never reuse the "id" values from the incoming
     file — assign each incoming record a fresh id continuing on from the
     highest id already in the store, guaranteeing no existing record can
     ever be overwritten. */
  async importJSON(jsonText, mode = 'merge') {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) throw new Error('الملف لا يحتوي على مصفوفة بيانات صحيحة');
    if (mode === 'replace') {
      await this.clearAll();
      await this.bulkPut(parsed);
      return parsed.length;
    }
    let nextId = await this.nextId();
    const remapped = parsed.map((m) => ({ ...m, id: nextId++ }));
    await this.bulkPut(remapped);
    return remapped.length;
  },
};

/* ------------------------- visitation families CRUD --------------------- */
/* Separate store from "members" — existing directory data/schema is never
   touched. Mirrors MembersDB's patterns (getAll/getById/put/remove/search)
   so the Visitation Services section reuses the same data-access shape. */

const VisitationDB = {
  async getAll() {
    const store = await tx(STORE_VISITATION, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getById(id) {
    const store = await tx(STORE_VISITATION, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(Number(id));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async count() {
    const store = await tx(STORE_VISITATION, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async nextId() {
    const all = await this.getAll();
    return all.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0) + 1;
  },

  async put(family) {
    const store = await tx(STORE_VISITATION, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(family);
      req.onsuccess = () => resolve(family);
      req.onerror = () => reject(req.error);
    });
  },

  async remove(id) {
    const store = await tx(STORE_VISITATION, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(Number(id));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  /* Case/spacing-tolerant Arabic-friendly substring search over name, for
     the duplicate-warning check on the add/edit form (same pattern as
     MembersDB.searchByName). */
  async searchByName(query) {
    const all = await this.getAll();
    const norm = normalizeArabic(query);
    if (!norm) return [];
    return all.filter((f) => normalizeArabic(f.name || '').includes(norm));
  },

  /* Flexible/partial matching across name, spouse name, both mobile numbers
     (digits-only), city, حي/neighborhood, street, job/profession, أب
     الاعتراف, الخدمة and الحالة الاجتماعية. Case-insensitive and
     Arabic-tolerant (via normalizeArabic), same behavior as
     MembersDB.searchAll. */
  async searchAll(query) {
    const raw = (query || '').toString().trim();
    if (!raw) return [];
    const all = await this.getAll();
    const norm = normalizeArabic(raw);
    const digits = raw.replace(/\D/g, '');
    return all.filter((f) => {
      if (norm && normalizeArabic(f.name || '').includes(norm)) return true;
      if (norm && normalizeArabic(f.spouseName || '').includes(norm)) return true;
      if (digits) {
        const p1 = (f.phone1 || '').toString().replace(/\D/g, '');
        const p2 = (f.phone2 || '').toString().replace(/\D/g, '');
        if ((p1 && p1.includes(digits)) || (p2 && p2.includes(digits))) return true;
      }
      if (norm) {
        const otherFields = [f.city, f.neighborhood, f.street, f.job, f.confessionFather, f.service, f.maritalStatus];
        if (otherFields.some((v) => v && normalizeArabic(v.toString()).includes(norm))) return true;
      }
      return false;
    });
  },
};

/* ---------------------------- settings store --------------------------- */

const SettingsDB = {
  async get(key) {
    const store = await tx(STORE_SETTINGS, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  },
  async set(key, value) {
    const store = await tx(STORE_SETTINGS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
};

/* Normalize Arabic text for tolerant search: strip tashkeel, unify alef/ya/ta-marbuta, collapse spaces. */
function normalizeArabic(str) {
  return (str || '')
    .toString()
    .trim()
    .replace(/[\u064B-\u0652\u0640]/g, '') // tashkeel + tatweel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
