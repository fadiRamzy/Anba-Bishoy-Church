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

  /* mode: 'merge' (append only genuinely-new names, never overwriting
     existing records) or 'replace' (clear then insert unique names).
     Root cause of the old data-loss bug: separately exported JSON files
     (one per class/stage) each restart their own "id" numbering from 1.
     Since bulkPut() uses store.put(), which is an upsert keyed on "id",
     importing a second file whose ids happened to overlap with an
     already-stored file silently overwrote those existing records.
     Fix: in merge mode, never reuse the "id" values from the incoming
     file — assign each incoming record a fresh id continuing on from the
     highest id already in the store, guaranteeing no existing record can
     ever be overwritten.
     Duplicate rule (merge): an incoming record is a duplicate when its
     Arabic-normalized name (normalizeArabic: trim, strip tashkeel/tatweel,
     unify alef/ya/ta-marbuta, collapse spaces) already exists in the store
     OR already appeared earlier in the same import batch. Duplicates are
     skipped — never imported, never overwritten, no new id. The JSON "id"
     is never used for duplicate detection.
     Replace mode: dedupes the incoming batch by normalized name (first
     occurrence wins) before replacing, so multi-file imports can't create
     duplicates. Old records are never preserved in replace mode.
     Returns { imported, skipped }. */
  async importJSON(jsonText, mode = 'merge') {
    const parsed = JSON.parse(jsonText);
    return this.importRecords(parsed, mode);
  },

  /* Batch import of already-parsed records (used for multi-file imports:
     the caller combines all selected files into one array first, so
     cross-file duplicates are detected). See importJSON docs for rules. */
  async importRecords(records, mode = 'merge') {
    if (!Array.isArray(records)) throw new Error('الملف لا يحتوي على مصفوفة بيانات صحيحة');
    for (const r of records) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('الملف لا يحتوي على مصفوفة بيانات صحيحة');
    }
    if (mode === 'replace') {
      const { unique, skipped } = dedupeRecordsByNormalizedName(records);
      const withIds = ensureUniqueNumericIds(unique);
      await this.clearAll();
      await this.bulkPut(withIds);
      return { imported: withIds.length, skipped };
    }
    const existing = await this.getAll();
    const knownNames = new Set();
    for (const m of existing) {
      const n = normalizeArabic(m.name || '');
      if (n) knownNames.add(n);
    }
    const toImport = [];
    let skipped = 0;
    for (const rec of records) {
      const norm = normalizeArabic(rec.name || '');
      if (norm && knownNames.has(norm)) { skipped += 1; continue; }
      if (norm) knownNames.add(norm);
      toImport.push(rec);
    }
    let nextId = await this.nextId();
    const remapped = toImport.map((m) => ({ ...m, id: nextId++ }));
    await this.bulkPut(remapped);
    return { imported: remapped.length, skipped };
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

  /* TRUE GLOBAL SEARCH — recursively scans every string/number value found
     anywhere inside the family record (including nested objects/arrays such
     as husband/wife sub-fields and the children array), so the caller never
     needs to know which field holds the match. Case-insensitive and
     Arabic-tolerant (via normalizeArabic) for text, plus digits-only
     matching for phone-like numbers. Does NOT modify the stored record —
     only the values are read and normalized in-memory for comparison. */
  async searchAll(query) {
    const raw = (query || '').toString().trim();
    if (!raw) return [];
    const all = await this.getAll();
    const norm = normalizeArabic(raw);
    const digits = raw.replace(/\D/g, '');
    return all.filter((f) => recordMatchesQuery(f, norm, digits));
  },

  async bulkPut(families) {
    const store = await tx(STORE_VISITATION, 'readwrite');
    return new Promise((resolve, reject) => {
      let remaining = families.length;
      if (remaining === 0) return resolve(0);
      families.forEach((f) => {
        const req = store.put(f);
        req.onsuccess = () => {
          remaining -= 1;
          if (remaining === 0) resolve(families.length);
        };
        req.onerror = () => reject(req.error);
      });
    });
  },

  async clearAll() {
    const store = await tx(STORE_VISITATION, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  /* Exports the full Visitation store (every field, including the complete
     visitationDates history — not just the latest date) as JSON. Entirely
     separate from MembersDB.exportJSON()/the "دليل الخدمات" export. */
  async exportJSON() {
    const all = await this.getAll();
    return JSON.stringify(all, null, 2);
  },

  /* mode: 'merge' (append only genuinely-new names, never overwriting
     existing records — incoming records get fresh ids continuing on from
     the highest id already in the store, same fix as MembersDB.importJSON)
     or 'replace' (clear then insert unique names). Only ever touches
     STORE_VISITATION. Duplicate rule: same as MembersDB — Arabic-normalized
     name already in this store (or earlier in the same batch) means skip;
     the JSON "id" is never used for duplicate detection.
     Returns { imported, skipped }. */
  async importJSON(jsonText, mode = 'merge') {
    const parsed = JSON.parse(jsonText);
    return this.importRecords(parsed, mode);
  },

  /* Batch import of already-parsed records (used for multi-file imports:
     the caller combines all selected files into one array first, so
     cross-file duplicates are detected). See importJSON docs for rules. */
  async importRecords(records, mode = 'merge') {
    if (!Array.isArray(records)) throw new Error('الملف لا يحتوي على مصفوفة بيانات صحيحة');
    for (const r of records) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('الملف لا يحتوي على مصفوفة بيانات صحيحة');
    }
    if (mode === 'replace') {
      const { unique, skipped } = dedupeRecordsByNormalizedName(records);
      const withIds = ensureUniqueNumericIds(unique);
      await this.clearAll();
      await this.bulkPut(withIds);
      return { imported: withIds.length, skipped };
    }
    const existing = await this.getAll();
    const knownNames = new Set();
    for (const f of existing) {
      const n = normalizeArabic(f.name || '');
      if (n) knownNames.add(n);
    }
    const toImport = [];
    let skipped = 0;
    for (const rec of records) {
      const norm = normalizeArabic(rec.name || '');
      if (norm && knownNames.has(norm)) { skipped += 1; continue; }
      if (norm) knownNames.add(norm);
      toImport.push(rec);
    }
    let nextId = await this.nextId();
    const remapped = toImport.map((f) => ({ ...f, id: nextId++ }));
    await this.bulkPut(remapped);
    return { imported: remapped.length, skipped };
  },
};

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

/* Recursively collects every string/number value found anywhere inside a
   record (including nested objects like husband/wife and arrays like
   children) into a flat list of strings, so a global search can scan the
   COMPLETE record without needing to know which field holds a match.
   Skips "id" (internal identifier, not user-facing data). Read-only: never
   mutates the record it walks. */
function flattenSearchableValues(value, acc) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number') {
    acc.push(value.toString());
  } else if (Array.isArray(value)) {
    value.forEach((item) => flattenSearchableValues(item, acc));
  } else if (typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      if (key === 'id') return;
      flattenSearchableValues(value[key], acc);
    });
  }
}

/* True deep/global match: does ANY value anywhere inside the record
   (top-level or nested — husband/wife sub-fields, children array, etc.)
   match the search text (Arabic-normalized) or the digits-only query
   (for phone-like numbers)? */
function recordMatchesQuery(record, norm, digits) {
  if (!norm && !digits) return false;
  const values = [];
  flattenSearchableValues(record, values);
  for (const val of values) {
    if (norm && normalizeArabic(val).includes(norm)) return true;
    if (digits) {
      const onlyDigits = val.replace(/\D/g, '');
      if (onlyDigits && onlyDigits.includes(digits)) return true;
    }
  }
  return false;
}

/* Dedupe an import batch by Arabic-normalized name (first occurrence wins).
   Conservative exact match on normalizeArabic() only — no fuzzy matching,
   so two genuinely different people are never merged. Records with an empty
   normalized name are never treated as duplicates (always kept). */
function dedupeRecordsByNormalizedName(records) {
  const seen = new Set();
  const unique = [];
  let skipped = 0;
  for (const rec of records) {
    const norm = normalizeArabic(rec.name || '');
    if (norm && seen.has(norm)) { skipped += 1; continue; }
    if (norm) seen.add(norm);
    unique.push(rec);
  }
  return { unique, skipped };
}

/* Ensure every record in a replace-batch has a unique positive integer id.
   Preserves original ids when they are already valid + unique (single-file
   replace keeps its ids); reassigns only missing/duplicate/invalid ids so
   combined multi-file batches (which may restart numbering from 1) can't
   overwrite each other via store.put() upsert. */
function ensureUniqueNumericIds(records) {
  const out = records.map((r) => ({ ...r }));
  const used = new Set();
  for (const r of out) {
    const n = Number(r.id);
    if (Number.isInteger(n) && n > 0 && !used.has(n)) {
      r.id = n;
      used.add(n);
    } else {
      r.id = null;
    }
  }
  let next = used.size ? Math.max(...used) + 1 : 1;
  for (const r of out) {
    if (r.id === null || r.id === undefined) {
      while (used.has(next)) next += 1;
      r.id = next;
      used.add(next);
      next += 1;
    }
  }
  return out;
}

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
