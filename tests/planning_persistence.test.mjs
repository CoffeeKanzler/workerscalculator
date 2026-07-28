import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningCompatibleState, createPlanningModel } from '../js/models/planning_model.js';
import { createPlanningStore } from '../js/storage/planning_store.js';
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
      if (failPut) throw failPut;
      onPut?.(_key, next);
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

test('app persistence saves planning before observation and reports observation failure separately', async () => {
  const failure = new Error('localStorage quota exceeded');
  const order = [];
  const storage = memoryStorage(null, {
    failSet: failure,
    onSet: () => order.push('observation'),
  });
  const adapter = memoryAdapter(null, {
    onPut: () => order.push('planning'),
  });
  const persistence = createPlanningPersistence({
    planningStore: createPlanningStore(adapter),
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
