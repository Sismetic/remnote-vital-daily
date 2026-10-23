const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const compiled = esbuild.transformSync(fs.readFileSync(path.join(__dirname, '../src/daily_plan.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const moduleObject = { exports: {} };
new Function('module', 'exports', compiled)(moduleObject, moduleObject.exports);
const { DAILY_LIMIT, selectDay, balanced, localDay, mergeSavedDays, milliseconds } = moduleObject.exports;
const now = new Date(2026, 9, 3, 16).getTime();
const day = localDay(now);
const card = (id, bookId = 'A', fields = {}) => ({ id, bookId, bookName: bookId, createdAt: 1, isNew: true, practicedToday: false, ...fields });
const all = Array.from({ length: 600 }, (_, i) => card(`c${i}`, `B${i % 6}`, { createdAt: i }));
let tests = 0;
function test(name, work) { work(); tests++; console.log(`PASS ${name}`); }
test('35 distinct cards, mixed across all six books', () => {
  const p = selectDay(all, now);
  assert.equal(p.cardIds.length, DAILY_LIMIT); assert.equal(new Set(p.cardIds).size, DAILY_LIMIT);
  assert.equal(new Set(p.cardIds.map((id) => all.find((c) => c.id === id).bookId)).size, 6);
  const counts = Array.from({ length: 6 }, (_, i) => p.cardIds.filter((id) => all.find((c) => c.id === id).bookId === `B${i}`).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});
test('reopening retains the same daily allocation', () => {
  const first = selectDay(all, now); assert.deepEqual(selectDay(all, now, first.state).cardIds, first.cardIds);
});
test('practice elsewhere consumes daily places', () => {
  const p = selectDay(all.map((c, i) => ({ ...c, practicedToday: i < 12, isNew: i >= 12, dueAt: i < 12 ? now + 86400000 : undefined })), now);
  assert.equal(p.practicedCount, 12); assert.equal(p.cardIds.length, DAILY_LIMIT - 12);
});
test('no fresh batch after completing 35', () => {
  const p = selectDay(all, now); p.state.practicedIds = [...p.cardIds];
  const done = all.map((c) => p.cardIds.includes(c.id) ? { ...c, practicedToday: true, isNew: false, dueAt: now + 86400000 } : c);
  assert.equal(selectDay(done, now, p.state).cardIds.length, 0);
});
test('due reviews precede new intake', () => {
  const due = Array.from({ length: 80 }, (_, i) => card(`r${i}`, `B${i % 4}`, { isNew: false, dueAt: now - i }));
  assert.ok(selectDay([...all, ...due], now).cardIds.every((id) => id.startsWith('r')));
});
test('future reviews are not pulled forward', () => {
  assert.equal(selectDay([card('future', 'A', { isNew: false, dueAt: now + 100000 })], now).cardIds.length, 0);
});
test('next local day starts a new quota', () => {
  const p = selectDay(all, now); p.state.practicedIds = [...p.cardIds];
  assert.equal(selectDay(all, now + 86400000, p.state).cardIds.length, DAILY_LIMIT);
});
test('new books join automatically when quota has room', () => {
  const p = selectDay(all.slice(0, 5), now);
  const next = selectDay([...all.slice(0, 5), card('new-book', 'NEW')], now, p.state);
  assert.ok(next.cardIds.includes('new-book')); assert.equal(next.cardIds.length, 6);
});
test('removing an unstudied tag frees a place, studied tags do not', () => {
  const p = selectDay(all, now), removed = p.cardIds[0];
  const next = selectDay(all.filter((c) => c.id !== removed), now, p.state);
  assert.equal(next.cardIds.length, DAILY_LIMIT); assert.ok(!next.cardIds.includes(removed));
  p.state.practicedIds = [removed];
  assert.equal(selectDay(all.filter((c) => c.id !== removed), now, p.state).cardIds.length, DAILY_LIMIT - 1);
});
test('forgotten/due-again card does not consume a second place', () => {
  const p = selectDay(all, now), retryId = p.cardIds[0];
  const changed = all.map((c) => c.id === retryId ? { ...c, practicedToday: true, isNew: false, dueAt: now - 1 } : c);
  const next = selectDay(changed, now, p.state);
  assert.equal(next.cardIds.length, DAILY_LIMIT); assert.equal(next.practicedCount, 1); assert.ok(next.cardIds.includes(retryId));
});
test('duplicate saved IDs cannot inflate quota', () => {
  assert.equal(selectDay(all, now, { version: 1, day, selectedIds: ['c0', 'c0'], practicedIds: ['c1', 'c1'] }).state.selectedIds.length, DAILY_LIMIT - 1);
});
test('rotation prevents starving books when more than 35 exist', () => {
  const many = Array.from({ length: 100 }, (_, i) => card(`b${i}`, `book${String(i).padStart(3, '0')}`));
  const first = balanced(many, DAILY_LIMIT, day), next = balanced(many, DAILY_LIMIT, localDay(now + 86400000));
  assert.ok(next.some((c) => !first.includes(c)));
});
test('timestamp normalization tolerates seconds, milliseconds, Date', () => {
  assert.equal(milliseconds(now), now); assert.equal(milliseconds(Math.floor(now / 1000)), Math.floor(now / 1000) * 1000); assert.equal(milliseconds(new Date(now)), now);
});
test('synced/local snapshots union practice without granting another 35', () => {
  const merged = mergeSavedDays(day,
    { version: 1, day, selectedIds: ['c2', 'c3'], practicedIds: ['c0'] },
    { version: 1, day, selectedIds: ['c1', 'c4'], practicedIds: ['c1'] });
  assert.deepEqual(merged.practicedIds, ['c0', 'c1']);
  assert.deepEqual(merged.selectedIds, ['c2', 'c3', 'c4']);
  const updated = all.map((c) => merged.practicedIds.includes(c.id)
    ? { ...c, isNew: false, practicedToday: true, dueAt: now + 86400000 } : c);
  assert.equal(selectDay(updated, now, merged).cardIds.length, DAILY_LIMIT - 2);
});
test('stale and malformed synced snapshots cannot corrupt the quota', () => {
  assert.equal(mergeSavedDays(day, { version: 1, day: '1999-01-01', selectedIds: [], practicedIds: [] }), undefined);
  assert.equal(mergeSavedDays(day, { version: 1, day, selectedIds: 'not an array', practicedIds: [] }), undefined);
});
test('mobile popup uses the device width, desktop keeps the verified dimensions', () => {
  const source = esbuild.transformSync(fs.readFileSync(path.join(__dirname, '../src/mobile_layout.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const layout = { exports: {} };
  new Function('module', 'exports', source)(layout, layout.exports);
  const { isMobileDevice, popupDimensions, shouldReconcilePriorityTags } = layout.exports;
  assert.equal(isMobileDevice(390, 'iPhone'), true);
  assert.equal(isMobileDevice(1024, 'iPad'), true);
  assert.equal(isMobileDevice(1440, 'Macintosh'), false);
  assert.equal(shouldReconcilePriorityTags(390, 'iPhone'), false);
  assert.equal(shouldReconcilePriorityTags(1024, 'iPad'), false);
  assert.equal(shouldReconcilePriorityTags(1440, 'Macintosh'), true);
  assert.deepEqual(popupDimensions(390, 844, 'iPhone'), { width: '100%', height: 720 });
  assert.deepEqual(popupDimensions(360, 640, 'Android'), { width: '100%', height: 540 });
  assert.deepEqual(popupDimensions(1024, 1366, 'iPad'), { width: '100%', height: 720 });
  assert.deepEqual(popupDimensions(1440, 900, 'Macintosh'), { width: 1000, height: 720 });
});
console.log(`${tests} daily-plan checks passed; no real cards modified.`);

async function integration() {
  const output = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/vital_data.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
  const apiModule = { exports: {} };
  new Function('module', 'exports', output.outputFiles[0].text)(apiModule, apiModule.exports);
  const { buildDailyPlan, recordProgress, DAY_STORAGE_KEY } = apiModule.exports;
  const storage = new Map();
  const synced = new Map();
  const today = Date.now();
  const apiCards = Array.from({ length: 90 }, (_, i) => ({ _id: `api${i}`, remId: `rem${i}`, type: 'f', createdAt: today - 1000, repetitionHistory: [] }));
  const importantCards = Array.from({ length: 50 }, (_, i) => ({ _id: `important${i}`, remId: `important-rem${i}`, type: 'f', createdAt: today - 500, repetitionHistory: [] }));
  apiCards[0].repetitionHistory = [{ date: today - 100, score: 1, responseTime: 2000 }];
  apiCards[0].nextRepetitionTime = today + 86400000;
  const rems = new Map();
  for (let i = 0; i < 3; i++) rems.set(`book${i}`, { _id: `book${i}`, text: [`Libro ${i}`], isDocument: async () => true });
  const cardRems = apiCards.map((c, i) => ({ _id: c.remId, text: ['[VITAL] Prueba'], parent: `book${i % 3}`, isDocument: async () => false, getEnablePractice: async () => i !== 1, getCards: async () => [c] }));
  const importantRems = importantCards.map((c, i) => ({ _id: c.remId, text: ['[IMPORTANT] Prueba'], parent: `book${i % 3}`, isDocument: async () => false, getEnablePractice: async () => true, getCards: async () => [c] }));
  cardRems.forEach((r) => rems.set(r._id, r));
  importantRems.forEach((r) => rems.set(r._id, r));
  const tag = { _id: 'tag', text: ['vital'], taggedRem: async () => cardRems };
  const importantTag = { _id: 'important-tag', text: ['important'], taggedRem: async () => importantRems };
  const plugin = {
    rem: { findByName: async ([name]) => name === 'important' ? importantTag : tag, findOne: async (id) => rems.get(id) },
    search: { search: async ([name]) => [name === 'important' ? importantTag : tag] },
    card: { findMany: async (ids) => [...apiCards, ...importantCards].filter((c) => ids.includes(c._id)) },
    storage: { getLocal: async (key) => storage.get(key), setLocal: async (key, value) => storage.set(key, value),
      getSynced: async (key) => synced.get(key), setSynced: async (key, value) => synced.set(key, value) },
  };
  storage.set(DAY_STORAGE_KEY, { version: 1, day: localDay(today), selectedIds: ['api4', 'foreign-kb-card'], practicedIds: ['api0', 'foreign-kb-practiced'] });
  const first = await buildDailyPlan(plugin);
  assert.equal(first.totalCards, 89); assert.equal(first.practicedCount, 1);
  assert.equal(first.cardIds.length, DAILY_LIMIT - 1); assert.equal(first.books.length, 3);
  assert.equal(first.cardIds[0], 'api4', 'legacy desktop selection migrates');
  assert.ok(!first.state.practicedIds.includes('foreign-kb-practiced'));
  assert.equal(first.storageKey, 'priority-tags.vital-day-v2:tag');
  assert.ok(!first.cardIds.includes('api1'), 'disabled card excluded');
  const repeated = await buildDailyPlan(plugin);
  assert.deepEqual(repeated.cardIds, first.cardIds);
  // Revealing nothing changes no histories, so count must remain unchanged.
  assert.equal(await recordProgress(plugin, first.trackedIds, first.state.day, first.storageKey), 1);
  const answered = apiCards.find((c) => c._id === first.cardIds[0]);
  answered.repetitionHistory = [{ date: Date.now(), score: 1, responseTime: 4000 }];
  answered.nextRepetitionTime = Date.now() + 86400000;
  assert.equal(await recordProgress(plugin, first.trackedIds, first.state.day, first.storageKey), 2);
  const resumed = await buildDailyPlan(plugin);
  assert.equal(resumed.cardIds.length, DAILY_LIMIT - 2); assert.ok(!resumed.cardIds.includes(answered._id));
  console.log('PASS API integration: disabled filter, book ancestors, persistence, real-answer progress, resume');
  const phoneCache = new Map();
  const phone = { ...plugin, storage: { ...plugin.storage,
    getLocal: async (key) => phoneCache.get(key), setLocal: async (key, value) => phoneCache.set(key, value) } };
  const phonePlan = await buildDailyPlan(phone);
  assert.deepEqual(phonePlan.cardIds, resumed.cardIds, 'second device resumes synced selection');
  const onPhone = apiCards.find((c) => c._id === phonePlan.cardIds[0]);
  onPhone.repetitionHistory = [{ date: Date.now(), score: 1, responseTime: 2000 }];
  onPhone.nextRepetitionTime = Date.now() + 86400000;
  assert.equal(await recordProgress(phone, phonePlan.trackedIds, phonePlan.state.day, phonePlan.storageKey), 3);
  const desktopAgain = await buildDailyPlan(plugin);
  assert.equal(desktopAgain.cardIds.length, DAILY_LIMIT - 3);
  assert.equal(desktopAgain.practicedCount, 3);
  assert.ok(!desktopAgain.cardIds.includes(onPhone._id));
  console.log('PASS two-device simulation: shared allocation and quota, separate local caches, no real phone claimed');
  for (const id of desktopAgain.cardIds) {
    const finished = apiCards.find((c) => c._id === id);
    finished.repetitionHistory = [{ date: Date.now(), score: 1, responseTime: 3000 }];
    finished.nextRepetitionTime = Date.now() + 86400000;
  }
  assert.equal(await recordProgress(plugin, desktopAgain.trackedIds, desktopAgain.state.day, desktopAgain.storageKey), DAILY_LIMIT);
  const phoneDone = await buildDailyPlan(phone);
  assert.equal(phoneDone.practicedCount, DAILY_LIMIT);
  assert.equal(phoneDone.cardIds.length, 0);
  assert.equal((await buildDailyPlan(plugin)).cardIds.length, 0);
  console.log('PASS shared daily completion: 35 real mock repetitions, both devices stop, reopening never grants another batch');
  const important = await buildDailyPlan(plugin, 'important');
  assert.equal(important.priority, 'important');
  assert.equal(important.totalCards, 50);
  assert.equal(important.cardIds.length, DAILY_LIMIT);
  assert.equal(important.practicedCount, 0);
  assert.equal(important.storageKey, 'priority-tags.important-day-v2:important-tag');
  assert.ok(important.cardIds.every((id) => id.startsWith('important')));
  console.log('PASS VITAL and IMPORTANT use independent card pools, storage keys, and daily quotas');
  const otherTag = { ...tag, _id: 'another-kb-tag' };
  const anotherKB = { ...plugin, rem: { ...plugin.rem, findByName: async () => otherTag },
    search: { search: async () => [otherTag] } };
  const separate = await buildDailyPlan(anotherKB);
  assert.equal(separate.storageKey, 'priority-tags.vital-day-v2:another-kb-tag');
  console.log('PASS independent knowledge bases use separate synced keys');
  const failedSync = { ...plugin, storage: { ...plugin.storage, getSynced: async () => { throw new Error('Sync unavailable'); } } };
  await assert.rejects(buildDailyPlan(failedSync), /Sync unavailable/);
  console.log('PASS sync failure is surfaced, never replaced with a fresh local quota');
}
integration().catch((error) => { console.error(error); process.exitCode = 1; });
