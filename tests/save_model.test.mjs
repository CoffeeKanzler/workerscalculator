import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citizenProductivity, aggregateCitizensByScope, compactObservedBuildings,
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
