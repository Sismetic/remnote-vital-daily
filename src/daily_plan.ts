/** Pure selection rules; no RemNote writes or scheduling changes. */
export const DAILY_LIMIT = 35;
export interface PlanCard {
  id: string; bookId: string; bookName: string; createdAt: number;
  dueAt?: number; isNew: boolean; practicedToday: boolean;
}
export interface SavedDay {
  version: 1; day: string; selectedIds: string[]; practicedIds: string[];
}
/** Merge already-synced device snapshots without losing consumed places. */
export function mergeSavedDays(day: string, ...values: unknown[]): SavedDay | undefined {
  const states = values.filter((value): value is SavedDay => {
    if (!value || typeof value !== 'object') return false;
    const state = value as SavedDay;
    return state.version === 1 && state.day === day &&
      Array.isArray(state.selectedIds) && Array.isArray(state.practicedIds) &&
      [...state.selectedIds, ...state.practicedIds].every((id) => typeof id === 'string' && id.length > 0);
  });
  if (!states.length) return undefined;
  const practicedIds = [...new Set(states.flatMap((state) => state.practicedIds))];
  const practiced = new Set(practicedIds);
  return { version: 1, day, practicedIds,
    selectedIds: [...new Set(states.flatMap((state) => state.selectedIds))]
      .filter((id) => !practiced.has(id)).slice(0, Math.max(0, DAILY_LIMIT - practiced.size)),
  };
}
export function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function milliseconds(value: number | Date | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n < 10_000_000_000 ? n * 1000 : n;
}
export function eligible(card: PlanCard, now: number): boolean {
  return card.isNew || (card.dueAt !== undefined && card.dueAt <= now);
}
/** Round-robin across books, rotating the first book by local date. */
export function balanced(cards: PlanCard[], count: number, day: string): PlanCard[] {
  const groups = new Map<string, PlanCard[]>();
  for (const card of cards) {
    const group = groups.get(card.bookId) ?? [];
    group.push(card); groups.set(card.bookId, group);
  }
  const ids = [...groups.keys()].sort();
  if (!ids.length || count <= 0) return [];
  const offset = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000) % ids.length;
  const ordered = [...ids.slice(offset), ...ids.slice(0, offset)];
  const result: PlanCard[] = [];
  for (let round = 0; result.length < count; round++) {
    let added = false;
    for (const id of ordered) {
      const card = groups.get(id)![round];
      if (card) { result.push(card); added = true; if (result.length === count) break; }
    }
    if (!added) break;
  }
  return result;
}
export function selectDay(cards: PlanCard[], now: number, previous?: SavedDay) {
  const day = localDay(now);
  const saved = previous?.version === 1 && previous.day === day ? previous : undefined;
  const byId = new Map(cards.map((card) => [card.id, card]));
  // Real history includes practice outside this plugin. Removing a tag must
  // not erase an already consumed place in the daily budget.
  const practicedIds = [...new Set([
    ...(saved?.practicedIds ?? []),
    ...cards.filter((card) => card.practicedToday).map((card) => card.id),
  ])];
  const practiced = new Set(practicedIds);
  const retained = (saved?.selectedIds ?? []).filter((id) => {
    const card = byId.get(id);
    return !practiced.has(id) && card && eligible(card, now);
  });
  const places = Math.max(0, DAILY_LIMIT - practiced.size);
  const selected = [...new Set(retained)].slice(0, places);
  const excluded = new Set([...selected, ...practicedIds]);
  const candidates = cards.filter((card) => !excluded.has(card.id) && eligible(card, now));
  const due = candidates.filter((card) => !card.isNew)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.id.localeCompare(b.id));
  const fresh = candidates.filter((card) => card.isNew)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const reviews = balanced(due, places - selected.length, day);
  const newCards = balanced(fresh, places - selected.length - reviews.length, day);
  selected.push(...reviews.map((card) => card.id), ...newCards.map((card) => card.id));
  // Due-again cards consume no extra place; the native queue manages retries.
  const retries = cards.filter((card) => practiced.has(card.id) && eligible(card, now));
  const state: SavedDay = { version: 1, day, selectedIds: selected, practicedIds };
  return { state, cardIds: [...retries.map((card) => card.id), ...selected], practicedCount: practiced.size };
}
