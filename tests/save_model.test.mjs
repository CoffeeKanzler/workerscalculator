import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citizenProductivity, aggregateCitizensByScope, compactObservedBuildings,
  groupObservedProduction, latestProductivity, productionBufferStatus,
  inferObservedHousing,
} from '../js/save_model.js';

test('citizens aggregate through residence buildings without forced assignment', () => {
  const buildings = [{ index: 0, scopeId: 4, type: 'panelak' }];
  const citizens = [
    { residenceBuildingIndex: 0, age: 30, education: 2, happiness: 0.8, food: 1, health: 0.9, loyalty: 0.7 },
    { residenceBuildingIndex: 0, age: 10, education: 0.5, happiness: 0.7, food: 1, health: 0.8, loyalty: 0.6 },
    { residenceBuildingIndex: -1, age: 25, education: 1, happiness: 0.6, food: 1, health: 0.7, loyalty: 0.5 },
  ];

  const result = aggregateCitizensByScope(citizens, buildings);

  assert.equal(result.scopes.get(4).residents, 2);
  assert.equal(result.scopes.get(4).adults, 1);
  assert.equal(result.scopes.get(4).highEducation, 1);
  assert.equal(result.unassigned, 1);
  assert.equal(result.invalidResidenceRefs, 0);
  assert.equal(result.recordCount, 3);
  assert.ok(Math.abs(result.scopes.get(4).productivity -
    (citizenProductivity(citizens[0]) + citizenProductivity(citizens[1])) / 2) < 1e-12);
});

test('resident links identify unknown workshop housing without inventing capacity', () => {
  const buildings = [
    { index: 1, scopeId: 4, type: '2611814221/block3' },
    { index: 2, scopeId: 4, type: '2611814221/block3' },
    { index: 3, scopeId: 4, type: 'known_house' },
  ];
  const citizens = [1, 1, 1, 2, 2, 3].map(residenceBuildingIndex => ({ residenceBuildingIndex }));
  const rows = inferObservedHousing(citizens, buildings, building => building.type === 'known_house');
  assert.deepEqual(rows, [{
    scopeId: 4, type: '2611814221/block3', buildingCount: 2, residents: 5,
    maxObservedOccupancy: 3, buildingIndices: [1, 2],
  }]);
});

test('latest productivity walks backward past missing current values', () => {
  assert.equal(latestProductivity([
    { averageProductivity: 0.8 }, {}, { averageProductivity: 0.93 }, {},
  ]), 0.93);
  assert.equal(latestProductivity([], 0.75), 0.75);
});

test('invalid residence references remain accounted for', () => {
  const result = aggregateCitizensByScope([
    { residenceBuildingIndex: 99, age: 30, education: 1, happiness: 1, food: 1, health: 1, loyalty: 1 },
  ], []);
  assert.equal(result.invalidResidenceRefs, 1);
  assert.equal(result.unassigned, 0);
  assert.equal(result.scopes.size, 0);
});

test('observed building compaction retains unknown and temporary records', () => {
  const observed = compactObservedBuildings([{
    index: 9, type: 'temp', name: 'Building 9', scopeId: null,
    x: 1, y: 2, z: 3, currentWorkers: 4, configuredWorkers: 5,
    configuredWorkersHighEducation: 6, mineQuality: 0.7,
    storages: [{ storageIndex: 0, inputFlag: 1, outputFlag: 0, selector: -1,
      capacity: 20, mode: 3, resources: [{ resource: 'oil', amount: 21 }] }],
    ignored: 'large nested data',
  }]);
  assert.deepEqual(observed, [{
    index: 9, type: 'temp', name: 'Building 9', scopeId: null,
    x: 1, y: 2, z: 3, currentWorkers: 4, configuredWorkers: 5,
    configuredWorkersHighEducation: 6, mineQuality: 0.7,
    storages: [{ storageIndex: 0, inputFlag: 1, outputFlag: 0, selector: -1,
      capacity: 20, mode: 3, resources: [{ resource: 'oil', amount: 21 }] }],
  }]);
});

test('production grouping aggregates only equivalent storage roles', () => {
  const catalog = [{ de: 'Fabric', gameId: 'fabric', workers: 100, group: { de: 'Other' } }];
  const storage = (inputFlag, outputFlag, resource, amount, capacity) => ({
    storageIndex: 0, inputFlag, outputFlag, selector: -1, mode: 3, capacity,
    resources: [{ resource, amount, secondary: 0 }],
  });
  const result = groupObservedProduction([
    { index: 1, type: 'fabric', scopeId: 2, currentWorkers: 100, configuredWorkers: 100,
      configuredWorkersHighEducation: 0, mineQuality: 0,
      storages: [storage(1, 0, 'plants', 3, 10), storage(0, 1, 'fabric', 4, 15)] },
    { index: 2, type: 'fabric', scopeId: 2, currentWorkers: 100, configuredWorkers: 100,
      configuredWorkersHighEducation: 0, mineQuality: 0,
      storages: [storage(1, 0, 'plants', 5, 10), storage(0, 1, 'fabric', 6, 15)] },
  ], catalog);
  assert.deepEqual(result.rows[0].inventoryStores, [
    { inputFlag: 1, outputFlag: 0, selector: -1, mode: 3, capacity: 20,
      storageCount: 2, buildingIndices: [1, 2], resources: [{ resource: 'plants', amount: 8 }] },
    { inputFlag: 0, outputFlag: 1, selector: -1, mode: 3, capacity: 30,
      storageCount: 2, buildingIndices: [1, 2], resources: [{ resource: 'fabric', amount: 10 }] },
  ]);
});

test('production buffers distinguish exact fill from configured-rate estimates', () => {
  const row = {
    count: 1, configuredWorkers: 100, configuredWorkersHighEducation: 0,
    productivity: 1, quality: 1,
    inventoryStores: [
      { inputFlag: 1, outputFlag: 0, selector: -1, mode: 3, capacity: 40,
        resources: [{ resource: 'plants', amount: 10 }, { resource: 'chemicals', amount: 0 }] },
      { inputFlag: 0, outputFlag: 1, selector: -1, mode: 3, capacity: 15,
        resources: [{ resource: 'fabric', amount: 10.5 }] },
    ],
  };
  const building = {
    workers: 100, production: [{ de: 'Fabric', rate: 5 }],
    consumption: [{ de: 'Plants', rate: 20 }, { de: 'Chemicals', rate: 0.5 }],
  };
  const keyForName = name => ({ Fabric: 'fabric', Plants: 'plants', Chemicals: 'chemicals' })[name];
  const status = productionBufferStatus(row, building, { calendarFlow: 1 }, keyForName);
  assert.equal(status[0].fillRatio, 0.25);
  assert.equal(status[0].resources[0].daysRemaining, 0.5);
  assert.equal(status[0].resources[1].daysRemaining, 0);
  assert.equal(status[1].fillRatio, 0.7);
  assert.equal(status[1].daysUntilFull, 0.9);
});

test('production grouping preserves configured staffing and exact mine quality', () => {
  const catalog = [{
    de: 'Coal mine', gameId: 'industry/coal_mine', workers: 120,
    group: { de: 'Mining' },
  }];
  const result = groupObservedProduction([
    { index: 2, type: 'industry/coal_mine', scopeId: 7, currentWorkers: 95,
      configuredWorkers: 100, configuredWorkersHighEducation: 2, mineQuality: 0.6 },
    { index: 3, type: 'industry/coal_mine', scopeId: 7, currentWorkers: 80,
      configuredWorkers: 90, configuredWorkersHighEducation: 1, mineQuality: 0.4 },
  ], catalog);

  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], {
    group: 'Mining', name: 'Coal mine', count: 1, quality: 0.6,
    qualityEstimated: false, scopeId: 7, sourceGameId: 'industry/coal_mine',
    observedBuildingIndices: [2], currentWorkers: 95, configuredWorkers: 100,
    configuredWorkersHighEducation: 2, nominalWorkers: 120, constructionProgress: 1,
  });
  assert.deepEqual(result.unmatched, []);
});

test('production grouping combines only identical saved configurations', () => {
  const catalog = [{ de: 'Fabric', gameId: 'fabric', workers: 100, group: { de: 'Other' } }];
  const result = groupObservedProduction([
    { index: 1, type: 'fabric', scopeId: 2, currentWorkers: 93, configuredWorkers: 100,
      configuredWorkersHighEducation: 0, mineQuality: 0 },
    { index: 2, type: 'fabric', scopeId: 2, currentWorkers: 93, configuredWorkers: 100,
      configuredWorkersHighEducation: 0, mineQuality: 0 },
  ], catalog);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].count, 2);
  assert.equal(result.rows[0].configuredWorkers, 100);
  assert.deepEqual(result.rows[0].observedBuildingIndices, [1, 2]);
});

test('production grouping returns every unmatched record', () => {
  const result = groupObservedProduction([
    { index: 4, type: 'unknown/a', scopeId: null },
    { index: 5, type: 'unknown/a', scopeId: null },
  ], []);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.unmatched, [
    { scopeId: null, type: 'unknown/a', count: 2, buildingIndices: [4, 5] },
  ]);
});
