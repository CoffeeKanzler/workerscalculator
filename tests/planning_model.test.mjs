import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlanningModel,
  createPlanningCompatibleState,
  refreshPlanningFromObservation,
  seedPlanningFromObservation,
  updatePlanningModel,
} from '../js/models/planning_model.js';
import {
  createPlanningStore,
  migrateLegacyPlannerState,
  restorePlannerState,
  serializePlannerState,
} from '../js/storage/planning_store.js';

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    identity: { id: 'save:kohleburg', name: 'Kohleburg' },
    generation: 4,
    observedAt: '2026-07-28T10:00:00Z',
    gameDate: { year: 1984, day: 123 },
    ...overrides,
  };
}

function memoryAdapter() {
  let value = null;
  return {
    get: async () => structuredClone(value),
    put: async (_key, next) => { value = structuredClone(next); },
    value: () => structuredClone(value),
  };
}

test('analytical map choices survive through the planning model boundary', () => {
  const defaults = createPlanningCompatibleState({}).state;
  assert.equal(defaults.mapMetric, 'category');
  assert.deepEqual(defaults.mapCategoryVisibility, {
    living: true, industry: true, services: true, support: true, other: true,
  });

  const restored = createPlanningCompatibleState({
    mapMetric: 'staffing',
    mapCategoryVisibility: { industry: false },
  }).state;
  assert.equal(restored.mapMetric, 'staffing');
  assert.equal(restored.mapCategoryVisibility.industry, false);
  assert.equal(restored.mapCategoryVisibility.living, true);
});

test('seeding a planning model gives hypothetical values PLAN evidence', () => {
  const model = seedPlanningFromObservation(observation(), {
    plan: { rows: [{ name: 'Steel mill', count: 2 }] },
    cities: [{ name: 'Kohleburg', rows: [] }],
  });

  assert.equal(model.evidence.source, 'plan');
  assert.deepEqual(model.evidence.gameDate, { year: 1984, day: 123 });
  assert.deepEqual(model.seededFrom, {
    identityId: 'save:kohleburg',
    generation: 4,
    observedAt: '2026-07-28T10:00:00Z',
    gameDate: { year: 1984, day: 123 },
  });
  assert.equal(model.plan.rows[0].count, 2);
  assert.equal(model.edited, false);
});

test('observation refresh records a newer source without overwriting planning edits', () => {
  const seeded = seedPlanningFromObservation(observation(), {
    plan: { rows: [{ name: 'Steel mill', count: 2 }] },
  });
  const edited = updatePlanningModel(seeded, {
    plan: { ...seeded.plan, rows: [{ name: 'Steel mill', count: 7 }] },
  });

  const refreshed = refreshPlanningFromObservation(edited, observation({
    generation: 5,
    observedAt: '2026-07-28T11:00:00Z',
    gameDate: { year: 1984, day: 124 },
  }), {
    plan: { rows: [{ name: 'Steel mill', count: 99 }] },
  });

  assert.equal(refreshed.plan.rows[0].count, 7);
  assert.equal(refreshed.edited, true);
  assert.equal(refreshed.lastObserved.generation, 5);
  assert.equal(refreshed.evidence.source, 'plan');
});

test('planner state storage keeps comparison observations separate from planning state', async () => {
  const seeded = seedPlanningFromObservation(observation(), {
    plan: { rows: [{ name: 'Steel mill', count: 3 }] },
  });
  const envelope = serializePlannerState({
    tab: 'republic',
    saveImport: { sourceName: 'Kohleburg', buildingCount: 10 },
    planning: seeded,
  });
  assert.equal(Object.hasOwn(envelope.observation, 'plan'), false);
  assert.equal(Object.hasOwn(envelope.observation, 'cities'), false);
  assert.equal(envelope.planning.plan.rows[0].count, 3);
  const restored = restorePlannerState({
    ...envelope,
    observation: {
      tab: 'republic',
      saveImport: { sourceName: 'Kohleburg', buildingCount: 11 },
    },
  });

  assert.equal(restored.saveImport.buildingCount, 11);
  assert.equal(restored.planning.plan.rows[0].count, 3);
  assert.equal(restored.planning.evidence.source, 'plan');

  const adapter = memoryAdapter();
  const store = createPlanningStore(adapter);
  await store.save(seeded);
  assert.equal((await store.load()).plan.rows[0].count, 3);
});

test('wr-planner-v1 flat state migrates planning fields into the canonical model', () => {
  const migrated = migrateLegacyPlannerState(JSON.stringify({
    lang: 'en',
    saveImport: { sourceName: 'Kohleburg' },
    plan: { rows: [{ name: 'Steel mill', count: 4 }] },
    cities: [{ name: 'Kohleburg', rows: [] }],
    chain: { goal: 'steel' },
    vehicleProduction: { productivity: 1, timeUnit: 'year', rows: [] },
    train: { cargo: 'Kohle', length: 450 },
    lowtech: { population: 2500 },
    calcOpts: { inputPriceMode: 'sell', includeDelivery: false },
    customBuildings: [{ gameId: 'custom-1' }],
  }));

  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.lang, 'en');
  assert.equal(migrated.state.planning.plan.rows[0].count, 4);
  assert.equal(migrated.state.planning.chains[0].goal, 'steel');
  assert.equal(migrated.state.planning.evidence.source, 'plan');
  assert.equal(Object.hasOwn(migrated.state, 'plan'), false);
  assert.equal(Object.hasOwn(migrated.state, 'chain'), false);
});

test('new planning models preserve defaults while accepting partial values', () => {
  const model = createPlanningModel({ plan: { rows: [{ count: 1 }] } });
  assert.equal(model.schemaVersion, 1);
  assert.equal(model.plan.settings.productivity, 1);
  assert.deepEqual(model.plan.rows, [{ count: 1 }]);
  assert.equal(model.evidence.source, 'plan');
});

test('compatibility proxy marks nested planning mutations without touching observation', () => {
  const compatible = createPlanningCompatibleState({
    observed: { population: 1200 },
    planning: createPlanningModel({ plan: { rows: [] } }),
  });

  compatible.state.plan.rows.push({ name: 'Steel mill', count: 1 });

  assert.deepEqual(compatible.state.observed, { population: 1200 });
  assert.equal(compatible.state.plan.rows.length, 1);
  assert.equal(compatible.state.planning.edited, true);
  assert.equal(compatible.state.planning.revision, 1);

  compatible.state.plan.rows[0].count = 2;
  assert.equal(compatible.state.planning.revision, 2);
  assert.equal(compatible.state.plan.rows[0].count, 2);
  assert.deepEqual(compatible.state.observed, { population: 1200 });
});

test('compatibility proxy reads frozen evidence seeded from a save observation', () => {
  // Evidence is deep-frozen by createEvidence, and a save import supplies a
  // real gameDate object. A proxy get trap must return the identical value for
  // a non-configurable, non-writable property, so the frozen nested object
  // cannot be wrapped on the way out.
  const compatible = createPlanningCompatibleState({
    planning: seedPlanningFromObservation(observation()),
  });

  assert.deepEqual(compatible.state.planning.evidence.gameDate, { year: 1984, day: 123 });
  assert.equal(Object.isFrozen(compatible.state.planning.evidence.gameDate), true);
  assert.equal(compatible.state.planning.evidence.source, 'plan');
});

test('compatibility proxy still tracks mutations after reading frozen evidence', () => {
  const compatible = createPlanningCompatibleState({
    planning: seedPlanningFromObservation(observation(), { plan: { rows: [] } }),
  });

  assert.equal(compatible.state.planning.evidence.gameDate.year, 1984);
  compatible.state.plan.rows.push({ name: 'Steel mill', count: 1 });

  assert.equal(compatible.state.planning.edited, true);
  assert.equal(compatible.state.planning.revision, 1);
});

test('compatibility proxy batches one revision for an array operation', () => {
  const compatible = createPlanningCompatibleState({
    planning: createPlanningModel({ plan: { rows: [{ count: 1 }, { count: 2 }] } }),
  });

  compatible.state.plan.rows.splice(0, 1, { count: 9 }, { count: 10 });

  assert.equal(compatible.state.planning.revision, 1);
  assert.deepEqual(compatible.state.plan.rows.map(row => row.count), [9, 10, 2]);
});
