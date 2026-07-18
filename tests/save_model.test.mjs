import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citizenProductivity, aggregateCitizensByScope, compactObservedBuildings,
  groupObservedProduction, latestProductivity, productionBufferStatus, productionBufferAlerts,
  inferObservedHousing, summarizeDistributionOffices, summarizeVehicleLines,
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

test('production grouping exposes first-output throughput only behind the exact factory gate', () => {
  const catalog = [{ de: 'Fabric', gameId: 'fabric_factory', workers: 100, group: { de: 'Other' } }];
  const assets = [{ id: 'fabric_factory', types: ['TYPE_FACTORY'], production: { fabric: 5 } }];
  const base = { type: 'fabric_factory', scopeId: 2, currentWorkers: 100, configuredWorkers: 100,
    configuredWorkersHighEducation: 0, mineQuality: 0,
    polymorphicRolling: { currentRate: 0, previousQuantity: 0.75, partialQuantity: 0.25, dayProgress: 0.5 } };
  const safe = groupObservedProduction([
    { ...base, index: 1, savedTypePlusOne: 7 },
    { ...base, index: 2, savedTypePlusOne: 7 },
  ], catalog, assets);
  assert.deepEqual(safe.rows[0].firstOutputThroughput, {
    resource: 'fabric', instanceCount: 2, currentRate: 0,
    previousQuantity: 1.5, partialQuantity: 0.5, dayProgressMin: 0.5, dayProgressMax: 0.5,
  });

  const wrongType = groupObservedProduction([
    { ...base, index: 3, savedTypePlusOne: 8 },
  ], catalog, assets);
  assert.equal(wrongType.rows[0].firstOutputThroughput, undefined);
  const unresolved = groupObservedProduction([
    { ...base, index: 4, savedTypePlusOne: 7 },
  ], catalog, []);
  assert.equal(unresolved.rows[0].firstOutputThroughput, undefined);
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

test('production buffer alerts rank sub-day input and output constraints', () => {
  const rows = [{
    name: 'Fabric', scopeId: 4, count: 1, configuredWorkers: 100, productivity: 1,
    inventoryStores: [
      { inputFlag: 1, outputFlag: 0, selector: -1, capacity: 40,
        resources: [{ resource: 'plants', amount: 10 }] },
      { inputFlag: 0, outputFlag: 1, selector: -1, capacity: 15,
        resources: [{ resource: 'fabric', amount: 10.5 }] },
    ],
  }];
  const catalog = [{ de: 'Fabric', workers: 100, production: [{ de: 'Fabric', rate: 5 }],
    consumption: [{ de: 'Plants', rate: 20 }] }];
  const keyForName = name => ({ Fabric: 'fabric', Plants: 'plants' })[name];
  assert.deepEqual(productionBufferAlerts(rows, catalog, { calendarFlow: 1 }, keyForName), [
    { severity: 'warning', scopeId: 4, metric: 'buffer.input', observed: 0.5,
      building: 'Fabric', resource: 'plants', evidence: 'buildings_game.bin + configured rate' },
    { severity: 'warning', scopeId: 4, metric: 'buffer.output', observed: 0.9,
      building: 'Fabric', resource: null, evidence: 'buildings_game.bin + configured rate' },
  ]);
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

test('distribution office summary resolves exact targets and associated fleets without claiming ownership', () => {
  const buildings = [
    { index: 0, type: 'office', name: 'Road DO', distributionKind: 'road',
      associatedVehicleIds: [2], distributionAssignments: [
        { targetBuildingIndex: 1,
          load: { enabled: true, threshold: 0.2, resources: ['wood'] },
          unload: { enabled: false, threshold: 0.8, resources: [] } },
        { targetBuildingIndex: 99,
          load: { enabled: false, threshold: 0, resources: [] },
          unload: { enabled: false, threshold: 1, resources: ['boards'] } },
      ] },
    { index: 1, type: 'sawmill', name: 'Sawmill' },
    { index: 2, type: 'rail_office', name: 'Rail DO', distributionKind: 'rail',
      associatedVehicleIds: [], distributionAssignments: [] },
  ];
  const result = summarizeDistributionOffices(buildings, [
    { id: 2, model: 'truck', modelFacts: { name: 'Truck T' } },
  ]);
  assert.deepEqual(result.summary, {
    officeCount: 2, roadCount: 1, railCount: 1, targetCount: 2,
    associatedVehicleReferenceCount: 1, officesWithoutTargets: 1,
    officesWithoutAssociatedVehicles: 1, neitherActionCount: 1,
    invalidTargetReferenceCount: 1, invalidVehicleReferenceCount: 0,
  });
  assert.equal(result.offices[0].associatedVehicles[0].name, 'Truck T');
  assert.equal(result.offices[0].assignments[0].target.name, 'Sawmill');
  assert.equal(result.offices[0].assignments[1].target, null);
});

test('vehicle line summary resolves references and labels only complete raw observed cycles', () => {
  const lines = [{
    slot: 3, name: 'Oil', rawField00: -2, rawField04: 3, rawField08: 0,
    stopIds: [1, -1], schedules: [
      { primary: { entries: [{ key: 'oil', valueA: 1, valueB: 2 }] }, secondary: { entries: [] } },
      { primary: { entries: [] }, secondary: { entries: [] } },
    ], vehicleIds: [4], observedIntervals: [10, 20],
  }, {
    slot: 4, name: 'Incomplete', rawField00: 1, rawField04: 0, rawField08: 0,
    stopIds: [99], schedules: [], vehicleIds: [88], observedIntervals: [0],
  }];
  const result = summarizeVehicleLines(lines,
    [{ id: 4, model: 'tanker', modelFacts: { name: 'Tanker' } }],
    [{ index: 1, type: 'harbor', name: 'Oil Harbor' }]);
  assert.deepEqual(result.summary, {
    lineCount: 2, assignedLineCount: 2, vehicleReferenceCount: 2,
    stopReferenceCount: 3, nullStopReferenceCount: 1, completeObservedCycleCount: 1,
    invalidVehicleReferenceCount: 1, invalidStopReferenceCount: 1,
  });
  assert.equal(result.lines[0].completeObservedCycle, 30);
  assert.equal(result.lines[0].largestObservedInterval, 20);
  assert.equal(result.lines[0].assignedVehicles[0].name, 'Tanker');
  assert.equal(result.lines[0].stops[0].building.name, 'Oil Harbor');
  assert.equal(result.lines[1].completeObservedCycle, null);
});
