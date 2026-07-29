import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

import { createPlanningCompatibleState, createPlanningModel } from '../js/models/planning_model.js';
import {
  createObservationStore, createPlanningStore, restorePlannerState, serializePlannerState,
} from '../js/storage/planning_store.js';
import { createPlanningPersistence, createPlanningSaveCoordinator } from '../js/storage.js';

function memoryStorage(initial = null, { failSet = null, onSet = null } = {}) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (key, next) => {
      onSet?.(key, next);
      if (failSet) throw failSet;
      value = String(next);
    },
    removeItem: () => { value = null; },
    value: () => value,
  };
}

function memoryAdapter(initial = null, { failGet = null, failPut = null, onPut = null } = {}) {
  let value = initial;
  return {
    get: async () => {
      if (failGet) throw failGet;
      return structuredClone(value);
    },
    put: async (_key, next) => {
      // Record the attempt before failing, so ordering stays observable.
      onPut?.(_key, next);
      if (failPut) throw failPut;
      value = structuredClone(next);
    },
    // The IndexedDB adapter supports deletion, so the double must too, or a
    // store that clears a record looks like a store that ignores the request.
    delete: async () => { value = null; },
    value: () => structuredClone(value),
  };
}

test('app persistence stores canonical planning only in the planning store', async () => {
  const storage = memoryStorage();
  const adapter = memoryAdapter();
  const observationAdapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(adapter),
    observationStore: createObservationStore(observationAdapter),
    storage,
  });
  const compatible = createPlanningCompatibleState({
    tab: 'republic',
    saveImport: { sourceName: 'Kohleburg' },
    planning: createPlanningModel({ plan: { rows: [] } }),
  });

  compatible.state.plan.rows.push({ name: 'Steel mill', count: 3 });
  await persistence.save(compatible.state);

  const persistedObservation = observationAdapter.value();
  assert.equal(Object.hasOwn(persistedObservation, 'planning'), false);
  assert.equal(Object.hasOwn(persistedObservation.observation, 'plan'), false);
  assert.equal(adapter.value().planning.plan.rows[0].count, 3);
  assert.equal(adapter.value().planning.revision, 1);

  const restored = await persistence.load();
  assert.equal(restored.state.planning.revision, 1);
  assert.equal(restored.state.planning.edited, true);
  // The observation has to come back too, or a reload silently drops the save
  // and leaves the restored plan describing a republic that is no longer there.
  assert.equal(restored.state.saveImport.sourceName, 'Kohleburg');
  assert.equal(restored.state.tab, 'republic');
});

// The observation is written without planning on purpose: planning is canonical
// in IndexedDB. Restoring must not depend on planning being in the envelope.
test('a reload restores the imported save, not just the plan', async () => {
  const storage = memoryStorage();
  const adapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(adapter),
    observationStore: createObservationStore(memoryAdapter()),
    storage,
  });
  const compatible = createPlanningCompatibleState({
    tab: 'republic',
    saveImport: {
      sourceName: '2001_Kohle_Tanker2',
      buildingCount: 1812,
      scopes: [
        { id: 0, name: 'Tabarz', city: true },
        { id: 1, name: 'VEB Stoff&Bau', production: true },
      ],
    },
    planning: createPlanningModel({ cities: [{ name: 'Tabarz', scopeId: 0, rows: [] }] }),
  });

  await persistence.save(compatible.state);
  const reloaded = await persistence.load();

  assert.equal(reloaded.state.saveImport.sourceName, '2001_Kohle_Tanker2');
  assert.equal(reloaded.state.saveImport.buildingCount, 1812);
  assert.equal(reloaded.state.saveImport.scopes.length, 2);
  assert.equal(reloaded.state.saveImport.scopes[1].name, 'VEB Stoff&Bau');
  // Plan and observation must come back together, describing the same republic.
  assert.equal(reloaded.state.planning.cities[0].scopeId, 0);
  assert.equal(reloaded.error, null);
});

test('restoring tolerates an envelope that carries no planning of its own', () => {
  const state = {
    tab: 'map',
    saveImport: { sourceName: 'Kohleburg', scopes: [{ id: 0, name: 'Kohleburg', city: true }] },
    planning: createPlanningModel({}),
  };
  const envelope = serializePlannerState(state, { includePlanning: false });
  assert.equal(Object.hasOwn(envelope, 'planning'), false);

  const restored = restorePlannerState(envelope);

  assert.equal(restored.saveImport.scopes.length, 1);
  assert.equal(restored.tab, 'map');
  assert.equal(restored.planning.schemaVersion, 1);
});

test('app persistence migrates legacy localStorage planning into the planning store', async () => {
  const legacy = JSON.stringify({
    schemaVersion: 1,
    observation: { tab: 'republic', saveImport: { sourceName: 'Kohleburg' } },
    planning: createPlanningModel({ plan: { rows: [{ count: 4 }] } }),
  });
  const storage = memoryStorage(legacy);
  const adapter = memoryAdapter();
  const observationAdapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(adapter),
    observationStore: createObservationStore(observationAdapter),
    storage,
  });

  const loaded = await persistence.load();

  assert.equal(loaded.migrated, true);
  assert.equal(loaded.state.saveImport.sourceName, 'Kohleburg');
  assert.equal(loaded.state.planning.plan.rows[0].count, 4);
  assert.equal(adapter.value().planning.plan.rows[0].count, 4);
  // Both halves land in IndexedDB and the legacy slot is released.
  assert.equal(observationAdapter.value().observation.saveImport.sourceName, 'Kohleburg');
  assert.equal(Object.hasOwn(observationAdapter.value(), 'planning'), false);
  assert.equal(storage.value(), null);
});

test('app persistence propagates planning storage failures', async () => {
  const failure = new Error('IndexedDB quota exceeded');
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(memoryAdapter(null, { failPut: failure })),
    observationStore: createObservationStore(memoryAdapter()),
    storage: memoryStorage(),
  });
  const state = createPlanningCompatibleState({
    planning: createPlanningModel({ plan: { rows: [{ count: 1 }] } }),
  }).state;

  await assert.rejects(() => persistence.save(state), failure);
});

test('app persistence saves planning before observation and reports observation failure separately', async () => {
  const failure = new Error('IndexedDB observation write failed');
  const order = [];
  const storage = memoryStorage();
  const adapter = memoryAdapter(null, {
    onPut: () => order.push('planning'),
  });
  const observationAdapter = memoryAdapter(null, {
    failPut: failure,
    onPut: () => order.push('observation'),
  });
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(adapter),
    observationStore: createObservationStore(observationAdapter),
    storage,
  });
  const state = createPlanningCompatibleState({
    planning: createPlanningModel({ plan: { rows: [{ count: 7 }] } }),
  }).state;

  const result = await persistence.save(state);

  assert.deepEqual(order, ['planning', 'observation']);
  assert.equal(result.planningSaved, true);
  assert.equal(result.observationSaved, false);
  assert.equal(result.observationError, failure);
  assert.equal(adapter.value().planning.plan.rows[0].count, 7);
});

test('persistence coordinator renders a planning failure immediately without saving again', async () => {
  const failure = new Error('IndexedDB unavailable');
  let saveCalls = 0;
  let renderCalls = 0;
  let errors = null;
  const coordinator = createPlanningSaveCoordinator({
    persistence: {
      save: async () => {
        saveCalls += 1;
        throw failure;
      },
    },
    onErrors: next => { errors = next; return true; },
    render: () => { renderCalls += 1; },
  });

  await coordinator.save({ planning: createPlanningModel({}) });

  assert.equal(saveCalls, 1);
  assert.equal(renderCalls, 1);
  assert.deepEqual(errors, {
    planning: 'Planning state was not saved: IndexedDB unavailable',
    observation: '',
  });
});

// The observation outgrew localStorage: a real save serialises to ~4MB against
// a ~5MB quota, and the quota failure is swallowed, so a bigger save would look
// exactly like a lost import. It belongs in IndexedDB next to the plan.
test('the observation is written to IndexedDB, not to localStorage', async () => {
  const storage = memoryStorage();
  const planningAdapter = memoryAdapter();
  const observationAdapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(planningAdapter),
    observationStore: createObservationStore(observationAdapter),
    storage,
  });
  const state = createPlanningCompatibleState({
    tab: 'republic',
    saveImport: { sourceName: 'Kohleburg', scopes: [{ id: 0, name: 'Kohleburg', city: true }] },
    planning: createPlanningModel({ plan: { rows: [] } }),
  }).state;

  const result = await persistence.save(state);

  assert.equal(result.observationSaved, true);
  assert.equal(storage.value(), null, 'localStorage must no longer carry the observation');
  assert.equal(observationAdapter.value().observation.saveImport.sourceName, 'Kohleburg');

  const reloaded = await persistence.load();
  assert.equal(reloaded.state.saveImport.scopes.length, 1);
  assert.equal(reloaded.state.tab, 'republic');
});

test('an observation too large for localStorage still saves', async () => {
  const quota = new DOMException('quota', 'QuotaExceededError');
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(memoryAdapter()),
    observationStore: createObservationStore(memoryAdapter()),
    // Any localStorage write would throw; nothing may depend on one.
    storage: memoryStorage(null, { failSet: quota }),
  });
  const state = createPlanningCompatibleState({
    saveImport: { sourceName: 'Big', observedBuildings: Array.from({ length: 500 }, (_, i) => ({ i })) },
    planning: createPlanningModel({}),
  }).state;

  const result = await persistence.save(state);

  assert.equal(result.observationSaved, true);
  assert.equal(result.observationError, null);
  assert.equal((await persistence.load()).state.saveImport.observedBuildings.length, 500);
});

test('an existing localStorage observation migrates into IndexedDB and frees the slot', async () => {
  const legacy = JSON.stringify({
    schemaVersion: 1,
    observation: { tab: 'map', saveImport: { sourceName: 'Kohleburg', scopes: [{ id: 0, name: 'A', city: true }] } },
  });
  const storage = memoryStorage(legacy);
  const observationAdapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(memoryAdapter()),
    observationStore: createObservationStore(observationAdapter),
    storage,
  });

  const loaded = await persistence.load();

  assert.equal(loaded.state.saveImport.sourceName, 'Kohleburg');
  assert.equal(loaded.state.tab, 'map');
  assert.equal(observationAdapter.value().observation.saveImport.sourceName, 'Kohleburg');
  assert.equal(storage.value(), null, 'the migrated localStorage slot must be released');
});

test('the observation records when it was last saved so the app can spot a resumed session', async () => {
  const observationAdapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(memoryAdapter()),
    observationStore: createObservationStore(observationAdapter),
    storage: memoryStorage(),
  });
  const state = createPlanningCompatibleState({
    saveImport: { sourceName: 'Kohleburg' },
    planning: createPlanningModel({}),
  }).state;

  const before = Date.now();
  await persistence.save(state);

  const savedAt = observationAdapter.value().savedAt;
  assert.ok(savedAt >= before && savedAt <= Date.now());
  assert.equal((await persistence.load()).lastSavedAt, savedAt);
});

// Every keystroke calls update() -> saveState(), and the observation is
// megabytes. Without coalescing, typing "1234" queues four full serialise +
// IndexedDB write cycles when only the last one can matter.
test('saves that arrive while one is in flight collapse to a single later write', async () => {
  const seen = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const coordinator = createPlanningSaveCoordinator({
    persistence: {
      save: async state => {
        seen.push(state.mark);
        if (first) { first = false; await gate; }
        return { planningSaved: true, observationSaved: true, observationError: null };
      },
    },
    onErrors: () => false,
    render: () => {},
  });

  const inFlight = coordinator.save({ mark: 'a' });
  // These all arrive while 'a' is still being written.
  coordinator.save({ mark: 'b' });
  coordinator.save({ mark: 'c' });
  const last = coordinator.save({ mark: 'd' });
  release();
  await Promise.all([inFlight, last]);

  assert.deepEqual(seen, ['a', 'd'], 'only the first and the newest state are written');
});

test('a coalesced save still reports the failure of the write that ran', async () => {
  let errors = null;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const coordinator = createPlanningSaveCoordinator({
    persistence: {
      save: async () => {
        if (first) { first = false; await gate; return { planningSaved: true, observationSaved: true, observationError: null }; }
        throw new Error('IndexedDB unavailable');
      },
    },
    onErrors: next => { errors = next; return true; },
    render: () => {},
  });

  const inFlight = coordinator.save({ mark: 'a' });
  const last = coordinator.save({ mark: 'b' });
  release();
  await Promise.all([inFlight, last]);

  assert.deepEqual(errors, {
    planning: 'Planning state was not saved: IndexedDB unavailable',
    observation: '',
  });
});

test('a save that arrives after the queue drains still runs', async () => {
  const seen = [];
  const coordinator = createPlanningSaveCoordinator({
    persistence: {
      save: async state => { seen.push(state.mark); return { planningSaved: true, observationSaved: true, observationError: null }; },
    },
    onErrors: () => false,
    render: () => {},
  });

  await coordinator.save({ mark: 'a' });
  await coordinator.save({ mark: 'b' });

  assert.deepEqual(seen, ['a', 'b']);
});

// Measured in the browser on a 2.77MB observation: a keystroke costs ~115ms
// with a save loaded against ~35ms with none, so the autosave is the dominant
// term while typing. Holding the write until typing pauses removes it from the
// keystroke path without changing what ends up on disk.
function manualTimer() {
  let queued = null;
  return {
    schedule: (fn, ms) => { queued = { fn, ms }; return 1; },
    cancel: () => { queued = null; },
    pending: () => queued,
    fire: () => { const job = queued; queued = null; job.fn(); },
  };
}

test('a burst of edits results in one write after the burst', async () => {
  const seen = [];
  const timer = manualTimer();
  const coordinator = createPlanningSaveCoordinator({
    persistence: {
      save: async state => {
        seen.push(state.mark);
        return { planningSaved: true, observationSaved: true, observationError: null };
      },
    },
    onErrors: () => false,
    render: () => {},
    delayMs: 350,
    schedule: timer.schedule,
    cancel: timer.cancel,
  });

  coordinator.save({ mark: 'a' });
  coordinator.save({ mark: 'b' });
  coordinator.save({ mark: 'c' });
  assert.deepEqual(seen, [], 'nothing is written while the user is still typing');
  assert.equal(timer.pending().ms, 350);

  timer.fire();
  await coordinator.flush();

  assert.deepEqual(seen, ['c'], 'only the state the user finished on is written');
});

// A debounce that can lose the last edit is worse than no debounce, so leaving
// the page has to write immediately rather than wait out the delay.
test('flush writes a pending edit immediately instead of waiting for the delay', async () => {
  const seen = [];
  const timer = manualTimer();
  const coordinator = createPlanningSaveCoordinator({
    persistence: {
      save: async state => {
        seen.push(state.mark);
        return { planningSaved: true, observationSaved: true, observationError: null };
      },
    },
    onErrors: () => false,
    render: () => {},
    delayMs: 350,
    schedule: timer.schedule,
    cancel: timer.cancel,
  });

  coordinator.save({ mark: 'unsaved' });
  await coordinator.flush();

  assert.deepEqual(seen, ['unsaved']);
  assert.equal(timer.pending(), null, 'the pending timer is cleared, not left to fire twice');
});

test('flush with nothing pending is harmless', async () => {
  let calls = 0;
  const timer = manualTimer();
  const coordinator = createPlanningSaveCoordinator({
    persistence: { save: async () => { calls += 1; return { planningSaved: true, observationSaved: true, observationError: null }; } },
    onErrors: () => false,
    render: () => {},
    delayMs: 350,
    schedule: timer.schedule,
    cancel: timer.cancel,
  });

  await coordinator.flush();
  assert.equal(calls, 0);
});

test('with no delay configured a save still writes straight away', async () => {
  const seen = [];
  const coordinator = createPlanningSaveCoordinator({
    persistence: {
      save: async state => { seen.push(state.mark); return { planningSaved: true, observationSaved: true, observationError: null }; },
    },
    onErrors: () => false,
    render: () => {},
  });

  await coordinator.save({ mark: 'now' });
  assert.deepEqual(seen, ['now']);
});

// stats.ini history is 27 MB parsed for a modest save and 74 MB for a large
// one, and it never changes once imported. It was excluded from the autosave
// for that reason, but nothing else stored it, so a reloaded republic showed
// an empty history asking to be given a stats.ini its save had supplied.
test('stats history survives a reload without riding on the autosave', async () => {
  const { createStatsStore } = await import('../js/storage/planning_store.js');
  const adapter = memoryAdapter();
  const store = createStatsStore(adapter);
  const records = [{ year: 1960, day: 1 }, { year: 1960, day: 2 }, { year: 1961, day: 0 }];

  await store.save(records, { name: 'stats.ini' });
  const loaded = await store.load();

  assert.equal(loaded.records.length, 3);
  assert.equal(loaded.name, 'stats.ini');
  // Its own record, so the per-edit autosave never carries the weight.
  assert.equal(adapter.value().records.length, 3);
});

test('a save with no history clears the stored history rather than keeping the last', async () => {
  const { createStatsStore } = await import('../js/storage/planning_store.js');
  const adapter = memoryAdapter();
  const store = createStatsStore(adapter);

  await store.save([{ year: 1960, day: 1 }], { name: 'stats.ini' });
  await store.save([], { name: null });

  assert.equal(await store.load(), null, 'the previous republic history must not linger');
});

test('the app restores stats at startup and writes them at import', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.match(app, /const storedStats = await statsStore\.load\(\)/);
  assert.match(app, /await statsStore\.save\(statsState\.statsRecords/);
});
