/* ==========================================================================
   db.js — IndexedDB data layer for the Church Members app.
   Single object store "members" (keyPath: id) + "settings" (keyPath: key).
   No network, no backend — everything lives in the browser on this device.
   ========================================================================== */

const DB_NAME = 'churchMembersDB';
const DB_VERSION = 1;
const STORE_MEMBERS = 'members';
const STORE_SETTINGS = 'settings';

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
      const res = await fetch('data/seed.json');
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

  /* mode: 'merge' (put/overwrite by id) or 'replace' (clear then insert) */
  async importJSON(jsonText, mode = 'merge') {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) throw new Error('الملف لا يحتوي على مصفوفة بيانات صحيحة');
    if (mode === 'replace') await this.clearAll();
    await this.bulkPut(parsed);
    return parsed.length;
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
