import { projectLiveSnapshot } from './live_projection.js';

export const LIVE_SOURCE_IDS = Object.freeze([
  'lifecycle', 'game_state', 'republic', 'cities', 'buildings',
  'building_identities', 'building_asset_metadata', 'building_recipes',
  'building_storage', 'building_resource_amounts', 'citizens', 'citizen_wellbeing',
  'citizen_activity', 'resources', 'resource_flows', 'vehicles', 'vehicle_catalog',
  'used_vehicle_offers', 'research', 'research_unlock_edges', 'global_events',
  'sdk_events', 'audit', 'used_market_events',
]);

const CURSOR_SOURCES = Object.freeze(['sdk_events', 'audit', 'used_market_events']);

function generationOf(response) {
  const item = response?.items?.[0];
  return item?.sessionGeneration ?? item?.generation ?? null;
}

function sequenceOf(item) {
  return Number.isSafeInteger(item?.sequence) ? item.sequence : null;
}

function cursorIssue(sourceId, response, after) {
  const batch = response?.batch;
  if (!batch) return null;
  if (batch.droppedBeforeCursor > 0 || (after > 0 && batch.oldestAvailableSequence > after + 1)) {
    return `cursor overflow for ${sourceId}`;
  }
  let previous = after;
  for (const item of response.items ?? []) {
    const sequence = sequenceOf(item);
    if (sequence === null || sequence <= previous) return `non-monotonic ${sourceId} cursor`;
    previous = sequence;
  }
  return null;
}

function nextCursor(response, fallback) {
  const batch = response?.batch;
  if (batch && Number.isSafeInteger(batch.newestAvailableSequence)) return batch.newestAvailableSequence;
  const last = response?.items?.at(-1);
  return sequenceOf(last) ?? fallback;
}

export function createLiveSdkAdapter({
  client,
  now = () => new Date().toISOString(),
  initialCursors = {},
  maxAttempts = 2,
} = {}) {
  if (!client || typeof client.catalog !== 'function' || typeof client.data !== 'function') {
    throw new TypeError('live SDK adapter requires a client');
  }
  let cursors = { ...initialCursors };
  let state = { status: 'idle', model: null, generation: null, cursors: { ...cursors } };

  async function collect(catalog, startCursors) {
    const available = new Set(catalog.sources);
    const readLifecycle = async () => available.has('lifecycle')
      ? client.data('lifecycle') : null;
    const before = await readLifecycle();
    const sourceIds = LIVE_SOURCE_IDS.filter(id => id !== 'lifecycle' && available.has(id));
    const entries = await Promise.all(sourceIds.map(async id => [
      id, await client.data(id, CURSOR_SOURCES.includes(id) ? { after: startCursors[id] ?? 0 } : {}),
    ]));
    const after = await readLifecycle();
    const beforeGeneration = generationOf(before) ?? 0;
    const afterGeneration = generationOf(after) ?? beforeGeneration;
    if (beforeGeneration !== afterGeneration) return { coherent: false, reason: 'game generation changed during snapshot' };

    const data = new Map(entries);
    if (before) data.set('lifecycle', before);
    const next = { ...startCursors };
    for (const sourceId of CURSOR_SOURCES) {
      const response = data.get(sourceId);
      if (!response) continue;
      const issue = cursorIssue(sourceId, response, startCursors[sourceId] ?? 0);
      if (issue) return { coherent: false, reason: issue };
      next[sourceId] = nextCursor(response, startCursors[sourceId] ?? 0);
    }
    return {
      coherent: true,
      generation: afterGeneration,
      data,
      cursors: next,
      model: projectLiveSnapshot({ catalog, data, observedAt: now(), generation: afterGeneration }),
    };
  }

  async function refresh() {
    let catalog;
    try {
      catalog = await client.catalog();
    } catch (error) {
      state = { status: 'unavailable', model: null, generation: null, cursors: { ...cursors }, error };
      return state;
    }
    let start = { ...cursors };
    let lastReason = 'live snapshot was not coherent';
    for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
      const result = await collect(catalog, start);
      if (result.coherent) {
        cursors = result.cursors;
        state = {
          status: 'ready', model: result.model, generation: result.generation,
          cursors: { ...cursors }, resynchronized: attempt > 0,
        };
        return state;
      }
      lastReason = result.reason;
      state = {
        status: 'resynchronizing', model: null, generation: null,
        cursors: { ...cursors }, reason: lastReason,
      };
      start = Object.fromEntries(Object.keys(start).map(key => [key, 0]));
    }
    return state;
  }

  return {
    get state() { return { ...state, cursors: { ...state.cursors } }; },
    refresh,
  };
}

export { cursorIssue, generationOf, nextCursor };
