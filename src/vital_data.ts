import type { Card, ReactRNPlugin, Rem } from '@remnote/plugin-sdk';
import { richTextToPlainText } from './priority_tags';
import { localDay, mergeSavedDays, milliseconds, selectDay, type PlanCard, type SavedDay } from './daily_plan';
export const DAY_STORAGE_KEY = 'priority-tags.vital-day-v1';

export type DailyPriority = 'vital' | 'important';

export async function mapConcurrent<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(10, items.length) }, async () => {
    while (index < items.length) { const current = index++; results[current] = await work(items[current]); }
  }));
  return results;
}
export function practicedOnDay(card: Card, day: string): boolean {
  return (card.repetitionHistory ?? []).some((review) => {
    const time = milliseconds(review.date);
    return time !== undefined && localDay(time) === day;
  });
}
async function loadPriorityCards(plugin: ReactRNPlugin, priority: DailyPriority) {
  const top = await plugin.rem.findByName([priority], null);
  const matches = await plugin.search.search([priority], undefined, { numResults: 100 });
  const tags = [...new Map((top ? [top, ...matches] : matches).map((rem) => [rem._id, rem])).values()]
    .filter((rem) => richTextToPlainText(rem.text).trim().toLocaleLowerCase() === priority);
  // Tag IDs are stable and unique to a knowledge base. Synced storage is at
  // user level, so using a bare key would mix quotas from unrelated KBs.
  const namespace = tags.find((tag) => tag._id === top?._id)?._id ?? tags.map((tag) => tag._id).sort()[0];
  if (!namespace) throw new Error(`No encontré el tag ${priority}. Espera a que termine la sincronización y reintenta.`);
  const rems = [...new Map((await Promise.all(tags.map((tag) => tag.taggedRem()))).flat()
    .map((rem) => [rem._id, rem])).values()];
  const cards = (await mapConcurrent(rems, async (rem) => {
    if (!(await rem.getEnablePractice())) return [];
    return rem.getCards();
  })).flat();
  return { cards: [...new Map(cards.map((card) => [card._id, card])).values()],
    // Keep the existing VITAL key stable; IMPORTANT receives an independent
    // namespace and therefore an independent daily quota on every device.
    storageKey: `priority-tags.${priority}-day-v2:${namespace}` };
}
async function readDayState(plugin: ReactRNPlugin, key: string, day: string) {
  const [synced, cached] = await Promise.all([
    plugin.storage.getSynced<SavedDay>(key), plugin.storage.getLocal<SavedDay>(key),
  ]);
  return mergeSavedDays(day, synced, cached);
}
async function saveDayState(plugin: ReactRNPlugin, key: string, state: SavedDay) {
  // Do not silently fall back to a new local quota when syncing fails.
  const [synced, cached] = await Promise.all([
    plugin.storage.getSynced<SavedDay>(key), plugin.storage.getLocal<SavedDay>(key),
  ]);
  const serialized = JSON.stringify(state);
  if (JSON.stringify(synced) !== serialized) await plugin.storage.setSynced(key, state);
  if (JSON.stringify(cached) !== serialized) await plugin.storage.setLocal(key, state);
}
function bookResolver(plugin: ReactRNPlugin) {
  const rems = new Map<string, Promise<Rem | undefined>>();
  const books = new Map<string, Promise<{ bookId: string; bookName: string }>>();
  const find = (id: string) => {
    if (!rems.has(id)) rems.set(id, plugin.rem.findOne(id));
    return rems.get(id)!;
  };
  const resolve = (id: string, depth = 0): Promise<{ bookId: string; bookName: string }> => {
    if (!books.has(id)) books.set(id, (async () => {
      const rem = await find(id);
      if (!rem) return { bookId: id, bookName: 'Sin documento' };
      const name = richTextToPlainText(rem.text).trim();
      if (await rem.isDocument()) return { bookId: rem._id, bookName: name || 'Documento sin título' };
      if (rem.parent && depth < 40) return resolve(rem.parent, depth + 1);
      return { bookId: rem._id, bookName: name || 'Sin documento' };
    })());
    return books.get(id)!;
  };
  return resolve;
}
export async function buildDailyPlan(plugin: ReactRNPlugin, priority: DailyPriority = 'vital') {
  const now = Date.now(), day = localDay(now);
  const { cards, storageKey } = await loadPriorityCards(plugin, priority);
  const resolve = bookResolver(plugin);
  const prepared: PlanCard[] = await mapConcurrent(cards, async (card) => ({
    id: card._id, ...(await resolve(card.remId)),
    createdAt: milliseconds(card.createdAt) ?? 0, dueAt: milliseconds(card.nextRepetitionTime),
    isNew: !card.repetitionHistory?.length, practicedToday: practicedOnDay(card, day),
  }));
  let previous = await readDayState(plugin, storageKey, day);
  if (!previous && priority === 'vital') {
    // One-time migration. Only import IDs in this KB's vital pool: the old
    // unscoped key may have been written in a different knowledge base.
    const legacy = mergeSavedDays(day, await plugin.storage.getLocal<SavedDay>(DAY_STORAGE_KEY));
    const current = new Set(cards.map((card) => card._id));
    if (legacy) previous = { ...legacy, selectedIds: legacy.selectedIds.filter((id) => current.has(id)),
      practicedIds: legacy.practicedIds.filter((id) => current.has(id)) };
  }
  const result = selectDay(prepared, now, previous);
  await saveDayState(plugin, storageKey, result.state);
  const selected = new Set(result.cardIds), planned = prepared.filter((card) => selected.has(card.id));
  const books = [...new Set(planned.map((card) => card.bookId))].map((id) => ({
    id, name: planned.find((card) => card.bookId === id)!.bookName,
    count: planned.filter((card) => card.bookId === id).length,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { ...result, priority, storageKey, books, totalCards: cards.length,
    newCount: planned.filter((card) => card.isNew).length,
    dueCount: planned.filter((card) => !card.isNew).length,
    trackedIds: [...new Set([...result.cardIds, ...result.state.practicedIds])],
  };
}
export type DailyPlan = Awaited<ReturnType<typeof buildDailyPlan>>;
/** Only real repetitions consume a place; revealing an answer never does. */
export async function recordProgress(plugin: ReactRNPlugin, trackedIds: string[], day: string, storageKey: string) {
  const [cards, stored] = await Promise.all([
    plugin.card.findMany(trackedIds), readDayState(plugin, storageKey, day),
  ]);
  if (!stored || stored.day !== day) return undefined;
  const ids = [...new Set([...stored.practicedIds, ...cards.filter((card) => practicedOnDay(card, day)).map((card) => card._id)])];
  await saveDayState(plugin, storageKey, { ...stored, practicedIds: ids,
    selectedIds: stored.selectedIds.filter((id) => !ids.includes(id)) });
  return ids.length;
}
