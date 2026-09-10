/* Verification harness for the JSON-import change.
 * Mocks IndexedDB in-memory, loads the REAL /home/user/db.js, and runs the
 * task's verification matrix against BOTH MembersDB and VisitationDB.
 * Also runs static checks against /home/user/app.js (multiple attr, handlers).
 */
const fs = require('fs');
const vm = require('vm');

// ---------- in-memory IndexedDB mock (just enough for db.js) ----------
const _maps = {
  members: new Map(),
  settings: new Map(),
  visitationFamilies: new Map(),
};
function keyOf(store, v, keyPath) {
  if (store === 'settings') return v[keyPath];
  const n = Number(v[keyPath]);
  return Number.isNaN(n) ? v[keyPath] : n;
}
class FakeStore {
  constructor(name, keyPath) { this._name = name; this._kp = keyPath; }
  createIndex() {}
  _async(result, error) {
    const req = { result, error };
    setTimeout(() => {
      if (error) { if (req.onerror) req.onerror({ target: req }); }
      else if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
  getAll() { return this._async(Array.from(_maps[this._name].values())); }
  get(k) {
    const m = _maps[this._name];
    let v = m.get(k);
    if (v === undefined && typeof k === 'number') v = m.get(String(k));
    if (v === undefined && typeof k === 'string') v = m.get(Number(k));
    return this._async(v === undefined ? undefined : v);
  }
  count() { return this._async(_maps[this._name].size); }
  put(v) {
    try {
      const k = keyOf(this._name, v, this._kp);
      if (k === undefined || k === null || (typeof k === 'number' && Number.isNaN(k))) {
        return this._async(undefined, new Error('missing key'));
      }
      _maps[this._name].set(k, JSON.parse(JSON.stringify(v)));
      return this._async(undefined);
    } catch (e) { return this._async(undefined, e); }
  }
  delete(k) {
    const m = _maps[this._name];
    m.delete(k);
    if (typeof k === 'number') m.delete(String(k));
    if (typeof k === 'string') m.delete(Number(k));
    return this._async(undefined);
  }
  clear() { _maps[this._name].clear(); return this._async(undefined); }
}
const fakeIndexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      if (req.onupgradeneeded) {
        try {
          req.onupgradeneeded({ target: { result: {
            objectStoreNames: { contains: () => false },
            createObjectStore: () => ({ createIndex: () => {} }),
          }}});
        } catch (e) { /* ignore */ }
      }
      req.result = {
        transaction: (storeName) => ({
          objectStore: () => new FakeStore(storeName, storeName === 'settings' ? 'key' : 'id'),
        }),
      };
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  },
};

// ---------- load real db.js ----------
const dbCode = fs.readFileSync('/home/user/db.js', 'utf8');
const sandbox = { console, setTimeout, indexedDB: fakeIndexedDB };
vm.createContext(sandbox);
vm.runInContext(
  dbCode + '\n;globalThis.__T__ = { MembersDB, VisitationDB, normalizeArabic, DB_VERSION };',
  sandbox
);
const { MembersDB, VisitationDB, normalizeArabic, DB_VERSION } = sandbox.__T__;

// ---------- tiny assert/report ----------
let pass = 0, fail = 0;
const lines = [];
function ok(cond, name, extra = '') {
  if (cond) { pass++; lines.push(`PASS  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; lines.push(`FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
}
function names(list) { return list.map(r => r.name); }

(async () => {
  // ===== 0. versioning untouched =====
  ok(DB_VERSION === 2, 'DB_VERSION unchanged (=2)');

  // ================================================================
  // MEMBERSDB
  // ================================================================
  await MembersDB.clearAll();
  await VisitationDB.clearAll();

  // --- 1. single-file import works (merge, fresh names) ---
  let r = await MembersDB.importJSON(JSON.stringify([
    { id: 1, name: 'أحمد محمد علي', phone1: '0100000001' },
    { id: 2, name: 'مينا فوزي' },
  ]), 'merge');
  ok(r.imported === 2 && r.skipped === 0, 'Members: single-file merge imports 2', JSON.stringify(r));
  ok((await MembersDB.count()) === 2, 'Members: count=2 after single import');

  // --- export still works ---
  const exp = await MembersDB.exportJSON();
  let expOk = false;
  try { const arr = JSON.parse(exp); expOk = Array.isArray(arr) && arr.length === 2; } catch (e) {}
  ok(expOk, 'Members: exportJSON returns valid array of 2');

  // --- 2/3/4/5/6. multi-file merge per task example ---
  const file1 = [
    { id: 1, name: 'أحمد محمد علي' },
    { id: 2, name: 'مينا فوزي' },
    { id: 3, name: 'مارك جرجس' },
  ];
  const file2 = [
    { id: 1, name: 'مارك جرجس' },
    { id: 2, name: 'بيتر عادل' },
    { id: 3, name: 'أحمد محمد علي' },
  ];
  const before = await MembersDB.getAll();
  const beforeById = Object.fromEntries(before.map(m => [m.id, { ...m }]));
  r = await MembersDB.importRecords([...file1, ...file2], 'merge');
  ok(r.imported === 2 && r.skipped === 4,
    'Members: task example merge → imported=2 skipped=4', JSON.stringify(r));
  const after = await MembersDB.getAll();
  ok(after.length === 4, 'Members: total=4 after example merge', `got ${after.length}`);
  // existing untouched
  const a1 = await MembersDB.getById(1);
  ok(a1 && a1.name === 'أحمد محمد علي' && a1.phone1 === '0100000001',
    'Members: existing record id=1 untouched (name+phone preserved)');
  ok(JSON.stringify(await MembersDB.getById(2)) === JSON.stringify(beforeById[2]),
    'Members: existing record id=2 byte-identical');
  // new names present exactly once
  const nms = names(after);
  ok(nms.filter(n => n === 'مارك جرجس').length === 1, 'Members: مارك جرجس imported exactly once');
  ok(nms.filter(n => n === 'بيتر عادل').length === 1, 'Members: بيتر عادل imported exactly once');
  // fresh ids (3,4) — no overwrite, no id reuse
  const ids = after.map(m => Number(m.id)).sort((a, b) => a - b);
  ok(JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4]), 'Members: ids are [1,2,3,4] (fresh, no collision)', JSON.stringify(ids));

  // --- id is NOT used for dup detection ---
  r = await MembersDB.importRecords([{ id: 1, name: 'شخص مختلف تماما عن الكل' }], 'merge');
  ok(r.imported === 1 && r.skipped === 0, 'Members: same id + different name → imported (id ignored)', JSON.stringify(r));
  const still1 = await MembersDB.getById(1);
  ok(still1.name === 'أحمد محمد علي', 'Members: id=1 NOT overwritten by overlapping incoming id');

  // --- 8. Arabic normalization: tashkeel + spacing + alef variants ---
  r = await MembersDB.importRecords([{ id: 99, name: '  أَحْمَد   محمد  عَلِي ' }], 'merge');
  ok(r.imported === 0 && r.skipped === 1, 'Members: tashkeel/spacing variant skipped', JSON.stringify(r));
  r = await MembersDB.importRecords([{ id: 99, name: 'احمد محمد علي' }], 'merge'); // bare alef
  ok(r.imported === 0 && r.skipped === 1, 'Members: alef-variant (احمد) skipped', JSON.stringify(r));
  // ta-marbuta: seed then variant
  await MembersDB.importRecords([{ id: 50, name: 'فاطمة الزهراء' }], 'merge');
  r = await MembersDB.importRecords([{ id: 51, name: 'فاطمه الزهراء' }], 'merge'); // ه instead of ة
  ok(r.imported === 0 && r.skipped === 1, 'Members: ta-marbuta variant (ة/ه) skipped', JSON.stringify(r));
  // ya/alef-maqsura
  await MembersDB.importRecords([{ id: 52, name: 'عيسي المشهور' }], 'merge');
  r = await MembersDB.importRecords([{ id: 53, name: 'عيسي المشهور' }], 'merge');
  ok(r.imported === 0 && r.skipped === 1, 'Members: identical re-import skipped', JSON.stringify(r));
  // conservative: different people NOT merged
  r = await MembersDB.importRecords([{ id: 60, name: 'مارك جرجس عادل' }], 'merge');
  ok(r.imported === 1 && r.skipped === 0, 'Members: longer distinct name NOT merged (imported)', JSON.stringify(r));
  r = await MembersDB.importRecords([{ id: 61, name: 'مارك' }], 'merge');
  ok(r.imported === 1 && r.skipped === 0, 'Members: shorter distinct name NOT merged (imported)', JSON.stringify(r));

  // --- invalid JSON handled safely, no data loss ---
  const countBefore = await MembersDB.count();
  let threw = false;
  try { await MembersDB.importJSON('this is not json', 'merge'); } catch (e) { threw = true; }
  ok(threw, 'Members: malformed JSON throws');
  threw = false;
  try { await MembersDB.importJSON(JSON.stringify({ a: 1 }), 'merge'); } catch (e) { threw = true; }
  ok(threw, 'Members: non-array JSON throws');
  threw = false;
  try { await MembersDB.importRecords([{ name: 'x' }, 42], 'merge'); } catch (e) { threw = true; }
  ok(threw, 'Members: non-object item throws');
  ok((await MembersDB.count()) === countBefore, 'Members: failed imports leave DB unchanged (no data loss)');

  // --- 7. replace mode: multi-file, dedup within batch, old data gone ---
  await MembersDB.clearAll();
  await MembersDB.bulkPut([{ id: 99, name: 'سجل قديم يجب حذفه' }]);
  const rA = [{ id: 1, name: 'ألفا' }, { id: 2, name: 'بيتا' }];
  const rB = [{ id: 1, name: 'بيتا' }, { id: 2, name: 'جاما' }]; // overlapping ids + dup name
  r = await MembersDB.importRecords([...rA, ...rB], 'replace');
  ok(r.imported === 3 && r.skipped === 1, 'Members: replace multi-file → imported=3 skipped=1', JSON.stringify(r));
  const rep = await MembersDB.getAll();
  ok(rep.length === 3, 'Members: replace total=3 (old record gone)', `got ${rep.length}`);
  ok(!names(rep).includes('سجل قديم يجب حذفه'), 'Members: replace removed old record');
  ok(new Set(names(rep)).size === 3 && names(rep).includes('ألفا') && names(rep).includes('بيتا') && names(rep).includes('جاما'),
    'Members: replace kept unique names ألفا/بيتا/جاما', JSON.stringify(names(rep)));
  ok(new Set(rep.map(x => x.id)).size === 3, 'Members: replace ids unique despite overlapping input ids', JSON.stringify(rep.map(x => x.id)));

  // --- replace single-file preserves ids ---
  r = await MembersDB.importRecords([{ id: 10, name: 'س' }, { id: 20, name: 'ص' }], 'replace');
  const repIds = (await MembersDB.getAll()).map(x => Number(x.id)).sort((a, b) => a - b);
  ok(r.imported === 2 && JSON.stringify(repIds) === JSON.stringify([10, 20]),
    'Members: single-file replace preserves ids [10,20]', JSON.stringify(repIds));

  // ================================================================
  // VISITATIONDB (independent repeat)
  // ================================================================
  await MembersDB.clearAll();
  await VisitationDB.clearAll();
  // seed members to prove separation later
  await MembersDB.bulkPut([{ id: 1, name: 'عضو دليل الخدمات' }]);

  r = await VisitationDB.importJSON(JSON.stringify([
    { id: 1, name: 'أسرة أبونا بيشوي' },
    { id: 2, name: 'أسرة مارجرجس' },
  ]), 'merge');
  ok(r.imported === 2 && r.skipped === 0, 'Visitation: single-file merge imports 2', JSON.stringify(r));

  const vexp = await VisitationDB.exportJSON();
  let vexpOk = false;
  try { const arr = JSON.parse(vexp); vexpOk = Array.isArray(arr) && arr.length === 2; } catch (e) {}
  ok(vexpOk, 'Visitation: exportJSON returns valid array of 2');

  const vf1 = [
    { id: 1, name: 'أسرة أبونا بيشوي' },
    { id: 2, name: 'أسرة مارجرجس' },
    { id: 3, name: 'أسرة الأنبا أنطونيوس' },
  ];
  const vf2 = [
    { id: 1, name: 'أسرة الأنبا أنطونيوس' },
    { id: 2, name: 'أسرة السيدة العذراء' },
    { id: 3, name: 'أسرة أبونا بيشوي' },
  ];
  const vBefore = await VisitationDB.getById(1);
  r = await VisitationDB.importRecords([...vf1, ...vf2], 'merge');
  ok(r.imported === 2 && r.skipped === 4, 'Visitation: multi-file merge → imported=2 skipped=4', JSON.stringify(r));
  ok((await VisitationDB.count()) === 4, 'Visitation: total=4 after merge');
  const vAfter1 = await VisitationDB.getById(1);
  ok(JSON.stringify(vAfter1) === JSON.stringify(vBefore), 'Visitation: existing record untouched');
  const vNames = names(await VisitationDB.getAll());
  ok(vNames.filter(n => n === 'أسرة الأنبا أنطونيوس').length === 1, 'Visitation: cross-file dup imported once');
  ok(vNames.filter(n => n === 'أسرة السيدة العذراء').length === 1, 'Visitation: new family imported once');

  // normalization in visitation store
  r = await VisitationDB.importRecords([{ name: '  أُسْرَة  أبونا  بيشوي ' }], 'merge');
  ok(r.imported === 0 && r.skipped === 1, 'Visitation: tashkeel/spacing variant skipped', JSON.stringify(r));

  // invalid safety
  const vCountBefore = await VisitationDB.count();
  threw = false;
  try { await VisitationDB.importJSON('{{{bad', 'merge'); } catch (e) { threw = true; }
  ok(threw, 'Visitation: malformed JSON throws');
  ok((await VisitationDB.count()) === vCountBefore, 'Visitation: failed import leaves DB unchanged');

  // replace in visitation
  const vrA = [{ id: 1, name: 'عائلة أ' }, { id: 2, name: 'عائلة ب' }];
  const vrB = [{ id: 1, name: 'عائلة ب' }, { id: 2, name: 'عائلة ج' }];
  r = await VisitationDB.importRecords([...vrA, ...vrB], 'replace');
  ok(r.imported === 3 && r.skipped === 1, 'Visitation: replace multi-file → imported=3 skipped=1', JSON.stringify(r));
  ok((await VisitationDB.count()) === 3, 'Visitation: replace total=3');

  // --- separation ---
  const mAll = await MembersDB.getAll();
  const vAll = await VisitationDB.getAll();
  ok(mAll.length === 1 && mAll[0].name === 'عضو دليل الخدمات',
    'Separation: MembersDB unaffected by visitation imports', JSON.stringify(names(mAll)));
  ok(!names(vAll).includes('عضو دليل الخدمات'),
    'Separation: VisitationDB contains no members data', JSON.stringify(names(vAll)));

  // ================================================================
  // APP.JS static checks
  // ================================================================
  const app = fs.readFileSync('/home/user/app.js', 'utf8');
  const has = (s) => app.includes(s);
  ok(has('id="importFile" accept=".json,application/json" multiple'), 'app.js: Members import input has multiple');
  ok(has('id="visitationImportFile" accept=".json,application/json" multiple'), 'app.js: Visitation import input has multiple');
  ok(has('Array.from(e.target.files'), 'app.js: handlers read all selected files');
  ok(has('MembersDB.importRecords(combined, mode)'), 'app.js: Members handler combines + importRecords');
  ok(has('VisitationDB.importRecords(combined, mode)'), 'app.js: Visitation handler combines + importRecords');
  ok(has('parsedFiles.flat()'), 'app.js: files combined via flat()');
  ok(has('ليس JSON صحيحًا'), 'app.js: per-file invalid JSON error names the file');
  ok(has('تم استيراد ${imported} سجل جديد، وتخطي ${skipped} سجل مكرر.'), 'app.js: Members toast shows imported+skipped');
  ok(has('لم يتم استيراد سجلات جديدة. تم تخطي ${skipped} سجل مكرر.'), 'app.js: Members zero-new toast');
  ok(has('تم استيراد ${imported} أسرة جديدة، وتخطي ${skipped} أسرة مكررة.'), 'app.js: Visitation toast shows imported+skipped');
  ok(has('لم يتم استيراد أسر جديدة. تم تخطي ${skipped} أسرة مكررة.'), 'app.js: Visitation zero-new toast');

  console.log(lines.join('\n'));
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
