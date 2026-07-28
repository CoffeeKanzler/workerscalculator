import { test } from 'node:test';
import assert from 'node:assert/strict';

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
