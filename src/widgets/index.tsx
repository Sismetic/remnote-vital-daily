import {
  AppEvents,
  WidgetLocation,
  renderWidget,
  type PluginRem as Rem,
  type ReactRNPlugin,
  usePlugin,
} from '@remnote/plugin-sdk';
import React, { useEffect } from 'react';
import {
  PRIORITIES,
  type PriorityKey,
  priorityFromText,
  richTextToPlainText,
} from '../priority_tags';
import { openDailyStudy } from './vital_daily';
import { popupDimensions, shouldReconcilePriorityTags } from '../mobile_layout';

const INITIAL_BACKFILL_KEY = 'priority-tags.initial-backfill-v5';
const EVENT_DEBOUNCE_MS = 700;
const SCAN_CONCURRENCY = 10;
const LEGACY_TAG_NAMES = ['Importante', 'Detalle'] as const;
const DECK_PAGE_LOCATION = WidgetLocation.DeckPage;
const LEARNING_PROGRESS_LOCATION = WidgetLocation.LearningProgressPage;

type TagMap = Record<PriorityKey, Rem>;

let cachedTags: TagMap | undefined;
let cachedLegacyTagIds: Set<string> | undefined;
let scanPromise: Promise<ScanResult> | undefined;
let eventTimer: ReturnType<typeof setTimeout> | undefined;
let periodicScan: ReturnType<typeof setInterval> | undefined;
const pendingRemIds = new Set<string>();
const inFlightRemIds = new Set<string>();

interface ScanResult {
  matched: number;
  added: number;
  removed: number;
  unchanged: number;
  errors: number;
}

interface TaggedTotals {
  vital: number;
  important: number;
  detail: number;
}

function emptyScanResult(): ScanResult {
  return { matched: 0, added: 0, removed: 0, unchanged: 0, errors: 0 };
}

function mergeResult(into: ScanResult, next: ScanResult): void {
  into.matched += next.matched;
  into.added += next.added;
  into.removed += next.removed;
  into.unchanged += next.unchanged;
  into.errors += next.errors;
}

async function findTagsByName(plugin: ReactRNPlugin, name: string, ignoreCase: boolean): Promise<Rem[]> {
  const topLevel = await plugin.rem.findByName([name], null);
  const searchMatches = await plugin.search.search([name], undefined, { numResults: 50 });
  const candidates = topLevel ? [topLevel, ...searchMatches] : searchMatches;
  const unique = [...new Map(candidates.map((rem) => [rem._id, rem])).values()];
  return unique.filter((rem) => {
    const actual = richTextToPlainText(rem.text).trim();
    return ignoreCase
      ? actual.toLocaleLowerCase() === name.toLocaleLowerCase()
      : actual === name;
  });
}

async function chooseMostUsedTag(matches: Rem[]): Promise<Rem | undefined> {
  if (matches.length === 0) return undefined;
  const ranked = await Promise.all(
    matches.map(async (rem) => ({ rem, taggedCount: (await rem.taggedRem()).length })),
  );
  ranked.sort((a, b) => b.taggedCount - a.taggedCount);
  return ranked[0].rem;
}

async function findOrCreateTag(plugin: ReactRNPlugin, name: string): Promise<Rem> {
  const exact = await chooseMostUsedTag(await findTagsByName(plugin, name, false));
  if (exact) return exact;

  // Reuse and normalize a case-only variant (for example Vital -> vital),
  // instead of creating a second tag that differs only by capitalization.
  const caseVariant = await chooseMostUsedTag(await findTagsByName(plugin, name, true));
  if (caseVariant) {
    await caseVariant.setText([name]);
    return caseVariant;
  }

  // Tags in RemNote are ordinary Rems. Create a top-level tag only when no
  // exact or case-only existing tag can be reused.
  const created = await plugin.rem.createRem();
  if (!created) throw new Error(`Could not create the ${name} tag Rem.`);

  await created.setText([name]);
  return created;
}

async function getLegacyTagIds(plugin: ReactRNPlugin): Promise<Set<string>> {
  if (cachedLegacyTagIds) return cachedLegacyTagIds;
  const matches = await Promise.all(
    LEGACY_TAG_NAMES.map((name) => findTagsByName(plugin, name, false)),
  );
  cachedLegacyTagIds = new Set(matches.flat().map((rem) => rem._id));
  return cachedLegacyTagIds;
}

async function getPriorityTags(plugin: ReactRNPlugin): Promise<TagMap> {
  if (cachedTags) return cachedTags;

  const entries = await Promise.all(
    PRIORITIES.map(async ({ key, tagName }) => [key, await findOrCreateTag(plugin, tagName)] as const),
  );
  cachedTags = Object.fromEntries(entries) as TagMap;
  return cachedTags;
}

async function getTaggedTotals(plugin: ReactRNPlugin): Promise<TaggedTotals> {
  const tags = await getPriorityTags(plugin);
  const [vital, important, detail] = await Promise.all([
    tags.VITAL.taggedRem().then((rems) => rems.length),
    tags.IMPORTANT.taggedRem().then((rems) => rems.length),
    tags.DETAIL.taggedRem().then((rems) => rems.length),
  ]);
  return { vital, important, detail };
}

async function showTaggedTotals(plugin: ReactRNPlugin): Promise<void> {
  const totals = await getTaggedTotals(plugin);
  await plugin.app.toast(
    `Priority Tags totals — vital: ${totals.vital}; ` +
      `important: ${totals.important}; detail: ${totals.detail}.`,
  );
}

async function reconcileRem(
  plugin: ReactRNPlugin,
  rem: Rem,
  knownPriority?: PriorityKey,
): Promise<ScanResult> {
  const result = emptyScanResult();
  const priority = knownPriority ?? priorityFromText(richTextToPlainText(rem.text));
  if (!priority) return result;

  result.matched = 1;
  // Imported/basic cards are not always represented as RemNote "card items".
  // The reliable test is whether the Rem actually generates at least one card.
  if ((await rem.getCards()).length === 0) {
    result.unchanged = 1;
    return result;
  }

  const tags = await getPriorityTags(plugin);
  const legacyTagIds = await getLegacyTagIds(plugin);
  const currentTags = await rem.getTagRems();
  const currentTagIds = new Set(currentTags.map((tag) => tag._id));
  const desiredTag = tags[priority];

  if (!currentTagIds.has(desiredTag._id)) {
    await rem.addTag(desiredTag);
    result.added += 1;
  }

  for (const { key } of PRIORITIES) {
    const conflictingTag = tags[key];
    if (key !== priority && currentTagIds.has(conflictingTag._id)) {
      await rem.removeTag(conflictingTag._id);
      result.removed += 1;
    }
  }

  for (const legacyTagId of legacyTagIds) {
    if (currentTagIds.has(legacyTagId)) {
      await rem.removeTag(legacyTagId);
      result.removed += 1;
    }
  }

  if (result.added === 0 && result.removed === 0) result.unchanged = 1;
  return result;
}

async function reconcileRemById(plugin: ReactRNPlugin, remId: string): Promise<void> {
  if (inFlightRemIds.has(remId)) return;
  inFlightRemIds.add(remId);

  try {
    const rem = await plugin.rem.findOne(remId);
    if (rem) await reconcileRem(plugin, rem);
  } catch (error) {
    console.error('[Priority Tags] Could not reconcile changed Rem', remId, error);
  } finally {
    inFlightRemIds.delete(remId);
  }
}

function extractRemIds(event: unknown): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 3 || value == null) return;
    if (typeof value === 'string') {
      ids.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['_id', 'remId', 'remIds', 'id', 'rem']) {
        if (key in record) visit(record[key], depth + 1);
      }
    }
  };
  visit(event, 0);
  return [...ids];
}

function scheduleEventReconcile(plugin: ReactRNPlugin, event: unknown): void {
  extractRemIds(event).forEach((id) => pendingRemIds.add(id));
  if (eventTimer) clearTimeout(eventTimer);

  eventTimer = setTimeout(async () => {
    const ids = [...pendingRemIds];
    pendingRemIds.clear();

    if (ids.length > 0) {
      await Promise.all(ids.map((id) => reconcileRemById(plugin, id)));
      return;
    }

    // Some RemNote editor events do not include an ID. The focused Rem is the
    // precise and inexpensive fallback for interactive edits.
    const focusedRem = await plugin.focus.getFocusedRem();
    if (focusedRem) await reconcileRemById(plugin, focusedRem._id);
  }, EVENT_DEBOUNCE_MS);
}

async function scanAllCards(plugin: ReactRNPlugin, announce = true): Promise<ScanResult> {
  if (scanPromise) return scanPromise;

  scanPromise = (async () => {
    if (announce) await plugin.app.toast('Priority Tags: scanning cards with a priority prefix…');

    await getPriorityTags(plugin);
    await getLegacyTagIds(plugin);
    const allRem = await plugin.rem.getAll();
    const candidates = allRem
      .map((rem) => ({ rem, priority: priorityFromText(richTextToPlainText(rem.text)) }))
      .filter((item): item is { rem: Rem; priority: PriorityKey } => item.priority !== undefined);

    const total = emptyScanResult();
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < candidates.length) {
        const current = candidates[nextIndex++];
        try {
          mergeResult(total, await reconcileRem(plugin, current.rem, current.priority));
        } catch (error) {
          total.errors += 1;
          console.error('[Priority Tags] Could not reconcile Rem', current.rem._id, error);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(SCAN_CONCURRENCY, candidates.length || 1) }, () => worker()),
    );

    if (announce) {
      const totals = await getTaggedTotals(plugin);
      await plugin.app.toast(
        `Priority Tags: ${total.matched} matched; ${total.added} tags added; ` +
          `${total.removed} conflicts removed; ${total.errors} errors. ` +
          `Tagged totals — vital: ${totals.vital}; important: ${totals.important}; ` +
          `detail: ${totals.detail}.`,
      );
    }
    return total;
  })();

  try {
    return await scanPromise;
  } finally {
    scanPromise = undefined;
  }
}

async function onActivate(plugin: ReactRNPlugin) {
  const reconcilePriorityTags = shouldReconcilePriorityTags(
    window.screen.width,
    navigator.userAgent,
  );
  // Index is a hidden lifecycle iframe. The visible daily queue belongs only
  // in a popup, never in this widget or a skinny sidebar.
  await Promise.all(
    [
      plugin.app.unregisterWidget('vital_daily_entry', WidgetLocation.RightSidebar),
      plugin.app.unregisterWidget('vital_daily_entry', WidgetLocation.Popup),
      plugin.app.unregisterWidget('vital_daily_popup', WidgetLocation.Popup),
      plugin.app.unregisterWidget('important_daily_popup', WidgetLocation.Popup),
      plugin.app.unregisterWidget('vital_daily_session', WidgetLocation.Pane),
      plugin.app.unregisterWidget('vital_daily_entry', WidgetLocation.Pane),
      plugin.app.unregisterWidget('vital_daily_floating', WidgetLocation.FloatingWidget),
      plugin.app.unregisterWidget('mobile_launcher', DECK_PAGE_LOCATION),
      plugin.app.unregisterWidget('mobile_launcher', LEARNING_PROGRESS_LOCATION),
    ].map((operation) => operation.catch(() => undefined)),
  );

  await plugin.app.unregisterWidget('vital_launcher', WidgetLocation.SidebarEnd);

  await plugin.app.registerWidget('vital_daily_popup', WidgetLocation.Popup, {
    dimensions: popupDimensions(window.screen.width, window.screen.height, navigator.userAgent),
  });
  await plugin.app.registerWidget('important_daily_popup', WidgetLocation.Popup, {
    dimensions: popupDimensions(window.screen.width, window.screen.height, navigator.userAgent),
  });
  await plugin.app.registerWidget('mobile_launcher', DECK_PAGE_LOCATION, {
    dimensions: { width: '100%', height: 'auto' },
  });
  await plugin.app.registerWidget('mobile_launcher', LEARNING_PROGRESS_LOCATION, {
    dimensions: { width: '100%', height: 'auto' },
  });

  await plugin.app.registerSidebarButton({
    id: 'priority-tags.vital-daily',
    name: 'Práctica Diaria de Vital',
    description: 'Abrir la sesión diaria de hasta 35 tarjetas vital de todos tus libros.',
    keywords: 'vital estudiar tarjetas flashcards diario 35',
    icon: '🔥',
    action: async () => {
      await openDailyStudy(plugin, 'vital');
    },
  });

  await plugin.app.registerSidebarButton({
    id: 'priority-tags.important-daily',
    name: 'Práctica Diaria de Importante',
    description: 'Abrir la sesión diaria de hasta 35 tarjetas importantes de todos tus libros.',
    keywords: 'important importante estudiar tarjetas flashcards diario 35',
    icon: '⭐',
    action: async () => {
      await openDailyStudy(plugin, 'important');
    },
  });

  await plugin.app.registerCommand({
    id: 'priority-tags.practice-vital',
    name: 'Práctica Diaria de Vital',
    description: 'Abrir la misma práctica diaria que el botón de la barra lateral.',
    keywords: 'vital diario practicar estudiar 35',
    action: async () => { await openDailyStudy(plugin, 'vital'); },
  });

  await plugin.app.registerCommand({
    id: 'priority-tags.practice-important',
    name: 'Práctica Diaria de Importante',
    description: 'Abrir la práctica diaria de tarjetas importantes.',
    keywords: 'important importante diario practicar estudiar 35',
    action: async () => { await openDailyStudy(plugin, 'important'); },
  });

  if (!reconcilePriorityTags) return;

  await plugin.app.registerCommand({
    id: 'priority-tags.scan-all',
    name: 'Priority Tags: tag all existing cards',
    description: 'Apply vital, important, or detail tags from card-front prefixes.',
    keywords: 'priority vital important detail tag cards',
    action: async () => {
      await scanAllCards(plugin, true);
    },
  });

  await plugin.app.registerCommand({
    id: 'priority-tags.show-counts',
    name: 'Priority Tags: show tagged totals',
    description: 'Show the number of Rems currently tagged vital, important, and detail.',
    keywords: 'priority vital important detail tag totals counts',
    action: async () => {
      await showTaggedTotals(plugin);
    },
  });

  const changeHandler = (event: unknown) => scheduleEventReconcile(plugin, event);
  plugin.event.addListener(AppEvents.GlobalRemChanged, undefined, changeHandler);
  plugin.event.addListener(AppEvents.EditorTextEdited, undefined, changeHandler);

  // Imports and sync batches don't always deliver individual editor events.
  // Reconcile on every startup and periodically, without requiring a manual
  // command after a new book. The existing scan lock prevents overlapping work.
  const backgroundScan = async () => {
    try {
      const result = await scanAllCards(plugin, false);
      if (result.errors === 0) await plugin.storage.setLocal(INITIAL_BACKFILL_KEY, true);
    } catch (error) { console.error('[Priority Tags] Background reconciliation failed', error); }
  };
  void backgroundScan();
  periodicScan = setInterval(() => { void backgroundScan(); }, 5 * 60 * 1000);
}

async function onDeactivate(plugin: ReactRNPlugin) {
  if (eventTimer) clearTimeout(eventTimer);
  if (periodicScan) clearInterval(periodicScan);
  plugin.event.removeListener(AppEvents.GlobalRemChanged, undefined);
  plugin.event.removeListener(AppEvents.EditorTextEdited, undefined);
  pendingRemIds.clear();
  cachedTags = undefined;
  cachedLegacyTagIds = undefined;
}

function IndexWidget() {
  const plugin = usePlugin() as ReactRNPlugin;

  useEffect(() => {
    void onActivate(plugin);
    return () => {
      void onDeactivate(plugin);
    };
  }, [plugin]);

  return null;
}

renderWidget(IndexWidget);
