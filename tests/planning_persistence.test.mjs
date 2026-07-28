import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningCompatibleState, createPlanningModel } from '../js/models/planning_model.js';
import { createPlanningStore } from '../js/storage/planning_store.js';
import { createPlanningPersistence } from '../js/storage.js';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = String(next); },
    removeItem: () => { value = null; },
    value: () => value,
  };
}

function memoryAdapter(initial = null, { failGet = null, failPut = null } = {}) {
  let value = initial;
  return {
    get: async () => {
      if (failGet) throw failGet;
      return structuredClone(value);
    },
    put: async (_key, next) => {
      if (failPut) throw failPut;
      value = structuredClone(next);
    },
    value: () => structuredClone(value),
  };
}

test('app persistence stores canonical planning only in the planning store', async () => {
  const storage = memoryStorage();
  const adapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(adapter),
    storage,
  });
  const compatible = createPlanningCompatibleState({
    tab: 'republic',
    saveImport: { sourceName: 'Kohleburg' },
    planning: createPlanningModel({ plan: { rows: [] } }),
  });

  compatible.state.plan.rows.push({ name: 'Steel mill', count: 3 });
  await persistence.save(compatible.state);

  const persistedObservation = JSON.parse(storage.value());
  assert.equal(Object.hasOwn(persistedObservation, 'planning'), false);
  assert.equal(Object.hasOwn(persistedObservation.observation, 'plan'), false);
  assert.equal(adapter.value().planning.plan.rows[0].count, 3);
  assert.equal(adapter.value().planning.revision, 1);

  const restored = await persistence.load();
  assert.equal(restored.state.planning.revision, 1);
  assert.equal(restored.state.planning.edited, true);
});

test('app persistence migrates legacy localStorage planning into the planning store', async () => {
  const legacy = JSON.stringify({
    schemaVersion: 1,
    observation: { tab: 'republic', saveImport: { sourceName: 'Kohleburg' } },
    planning: createPlanningModel({ plan: { rows: [{ count: 4 }] } }),
  });
  const storage = memoryStorage(legacy);
  const adapter = memoryAdapter();
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(adapter),
    storage,
  });

  const loaded = await persistence.load();

  assert.equal(loaded.migrated, true);
  assert.equal(loaded.state.saveImport.sourceName, 'Kohleburg');
  assert.equal(loaded.state.planning.plan.rows[0].count, 4);
  assert.equal(adapter.value().planning.plan.rows[0].count, 4);
  const migratedObservation = JSON.parse(storage.value());
  assert.equal(Object.hasOwn(migratedObservation, 'planning'), false);
});

test('app persistence propagates planning storage failures', async () => {
  const failure = new Error('IndexedDB quota exceeded');
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(memoryAdapter(null, { failPut: failure })),
    storage: memoryStorage(),
  });
  const state = createPlanningCompatibleState({
    planning: createPlanningModel({ plan: { rows: [{ count: 1 }] } }),
  }).state;

  await assert.rejects(() => persistence.save(state), failure);
});
