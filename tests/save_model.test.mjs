import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citizenProductivity, aggregateCitizensByScope, compactObservedBuildings,
  groupObservedProduction, latestProductivity,
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
    configuredWorkersHighEducation: 6, mineQuality: 0.7, ignored: 'large nested data',
  }]);
  assert.deepEqual(observed, [{
    index: 9, type: 'temp', name: 'Building 9', scopeId: null,
    x: 1, y: 2, z: 3, currentWorkers: 4, configuredWorkers: 5,
    configuredWorkersHighEducation: 6, mineQuality: 0.7,
  }]);
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

  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    group: 'Mining', name: 'Coal mine', count: 2, quality: 0.5,
    qualityEstimated: false, scopeId: 7, sourceGameId: 'industry/coal_mine',
    observedBuildingIndices: [2, 3], currentWorkers: 175, configuredWorkers: 190,
    configuredWorkersHighEducation: 3, nominalWorkers: 240,
  });
  assert.deepEqual(result.unmatched, []);
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
