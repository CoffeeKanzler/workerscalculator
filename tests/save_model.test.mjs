import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citizenProductivity, aggregateCitizensByScope, compactObservedBuildings,
  groupObservedProduction, latestProductivity, productionBufferStatus, productionBufferAlerts,
  inferObservedHousing, summarizeDistributionOffices, summarizeVehicleLines,
  evaluateDistributionResourceRule,
  summarizeCriminalityOutliers,
  buildSchematicMap,
  isNonPlannerSupportType,
  isBorderPostType, isExternalAirLinkType,
} from '../js/save_model.js';

test('known support and decorative save types do not masquerade as planner coverage failures', () => {
  for (const type of [
    'containerstand_big_pede',
    'CWC_ElectricSubstationFootpath',
    'MIRRORZ_CWC_HeatingEndstationSmallFootpath',
    '2190194724/Engels_Poster',
    '3282359449/opticontainer_transfer_2',
    'muddy_distribution',
    'water_reservoir_big',
  ]) assert.equal(isNonPlannerSupportType(type), true, type);

  for (const type of [
    '1893637213/Doorse_10_1',
    '2737076777/sad',
    'CWC_SecretPoliceSmall',
    'MIRRORZ_1865226599/VFD',
    'storage_meat',
  ]) assert.equal(isNonPlannerSupportType(type), false, type);
});

test('border posts remain a distinct exact map type', () => {
  assert.equal(isBorderPostType('zoll_siatre'), true);
  assert.equal(isBorderPostType('MIRRORZ_zoll_air_west'), false);
  assert.equal(isExternalAirLinkType('MIRRORZ_zoll_air_west'), true);
  assert.equal(isExternalAirLinkType('zoll_siatre'), false);
  assert.equal(isBorderPostType('CWC_SecretPoliceSmall'), false);
  assert.equal(isBorderPostType('eletric_transformator_customin'), false);
});

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
    configuredWithoutFleetOfficeCount: 0, unrestrictedRuleCount: 0,
    resolvedThresholdCount: 0, conditionMetCount: 0, conditionNotMetCount: 0,
    pickupConditionMetCount: 0, deliveryConditionMetCount: 0,
    unresolvedThresholdCount: 1, resourceNotDirectlyStoredCount: 1,
    ambiguousStorageRoleCount: 0,
    invalidTargetReferenceCount: 1, invalidVehicleReferenceCount: 0,
  });
  assert.equal(result.offices[0].associatedVehicles[0].name, 'Truck T');
  assert.equal(result.offices[0].assignments[0].target.name, 'Sawmill');
  assert.equal(result.offices[0].assignments[1].target, null);
});

test('distribution diagnostics use allocation-aware capacity and literal direction thresholds', () => {
  const target = {
    index: 1, type: 'warehouse', name: 'Allocated store', storages: [{
      storageIndex: 0, inputFlag: 1, outputFlag: 0, selector: -1, mode: 1, capacity: 4300,
      resources: [
        { resource: 'boards', amount: 3010 },
        { resource: 'wood', amount: 655.5507202148438 },
      ],
      controls: [
        { resource: 'wood', amount: 0.30000001192092896 },
        { resource: 'boards', amount: 0.699999988079071 },
      ],
    }],
  };
  const office = {
    index: 0, type: 'office', name: 'No trucks', distributionKind: 'road',
    associatedVehicleIds: [],
    distributionAssignments: [
      { targetBuildingIndex: 1,
        load: { enabled: true, threshold: 0.10000000149011612, resources: ['boards'] },
        unload: { enabled: true, threshold: 0.30000001192092896, resources: ['wood'] } },
      { targetBuildingIndex: 1,
        load: { enabled: false, threshold: 0, resources: [] },
        unload: { enabled: false, threshold: 1, resources: [] } },
      { targetBuildingIndex: 1,
        load: { enabled: true, threshold: 0, resources: [] },
        unload: { enabled: false, threshold: 1, resources: [] } },
    ],
  };
  const result = summarizeDistributionOffices([office, target]);
  const [boards, wood] = result.offices[0].assignments[0].thresholdStates;
  assert.equal(boards.status, 'resolved');
  assert.equal(boards.capacity, 4300 * 0.699999988079071);
  assert.equal(boards.conditionMet, true);
  assert.equal(wood.status, 'resolved');
  assert.equal(wood.capacity, 4300 * 0.30000001192092896);
  assert.equal(wood.conditionMet, false);
  assert.equal(result.offices[0].configuredWithoutFleet, true);
  assert.deepEqual(result.summary, {
    officeCount: 1, roadCount: 1, railCount: 0, targetCount: 3,
    associatedVehicleReferenceCount: 0, officesWithoutTargets: 0,
    officesWithoutAssociatedVehicles: 1, configuredWithoutFleetOfficeCount: 1,
    neitherActionCount: 1, unrestrictedRuleCount: 1,
    resolvedThresholdCount: 2, conditionMetCount: 1, conditionNotMetCount: 1,
    pickupConditionMetCount: 1, deliveryConditionMetCount: 0,
    unresolvedThresholdCount: 0, resourceNotDirectlyStoredCount: 0,
    ambiguousStorageRoleCount: 0, invalidTargetReferenceCount: 0,
    invalidVehicleReferenceCount: 0,
  });
});

test('distribution resource resolution ignores production direction flags and refuses unsafe aliases or role merges', () => {
  const inputStore = { storages: [{
    storageIndex: 0, inputFlag: 1, outputFlag: 0, selector: -1, mode: 3, capacity: 80,
    resources: [{ resource: 'plastics', amount: 20 }], controls: [],
  }] };
  const load = evaluateDistributionResourceRule(
    inputStore, { threshold: 0.1 }, 'load', 'plastics');
  assert.equal(load.status, 'resolved');
  assert.equal(load.conditionMet, true);

  assert.equal(evaluateDistributionResourceRule(
    inputStore, { threshold: 0.1 }, 'load', 'waste_mixed').status,
  'resource-not-directly-stored');

  const conflictingRoles = { storages: [
    { storageIndex: 0, selector: -1, mode: 17, capacity: 10,
      resources: [{ resource: 'waste_steel', amount: 1 }], controls: [] },
    { storageIndex: 1, selector: 4, mode: 17, capacity: 10,
      resources: [{ resource: 'waste_steel', amount: 1 }], controls: [] },
  ] };
  assert.equal(evaluateDistributionResourceRule(
    conflictingRoles, { threshold: 0.5 }, 'unload', 'waste_steel').status,
  'ambiguous-storage-role');
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
    [{ id: 4, model: 'tanker', modelFacts: { name: 'Tanker' },
      routeTargetBuildingIndices: [1, -1], currentScheduleCursor: 0,
      hasValidScheduleCursor: true, currentLineIntervalRaw: 75.5,
      currentBuildingIndex: 1, homeWorkplaceBuildingIndex: 1,
      stationBuildingIndex: 1, stationEnteringBuildingIndex: -1,
      shouldExitStationTargetBuildingIndex: -1, movingInsideBuildingIndex: -1,
      parentVehicleId: -1, schedulePairCount: 2 }],
    [{ index: 1, type: 'harbor', name: 'Oil Harbor' }]);
  assert.deepEqual(result.summary, {
    lineCount: 2, assignedLineCount: 2, vehicleReferenceCount: 2,
    stopReferenceCount: 3, nullStopReferenceCount: 1, completeObservedCycleCount: 1,
    validScheduleCursorVehicleCount: 1, positiveCurrentIntervalVehicleCount: 1,
    routeSequenceMatchCount: 1, routeSequenceMismatchCount: 0,
    duplicateVehicleAssignmentCount: 0,
    invalidVehicleReferenceCount: 1, invalidStopReferenceCount: 1,
    invalidOperationalBuildingReferenceCount: 0,
  });
  assert.equal(result.lines[0].completeObservedCycle, 30);
  assert.equal(result.lines[0].largestObservedInterval, 20);
  assert.equal(result.lines[0].assignedVehicles[0].name, 'Tanker');
  assert.equal(result.lines[0].assignedVehicles[0].operational.currentScheduleCursor, 0);
  assert.equal(result.lines[0].assignedVehicles[0].operational.currentScheduleTarget.building.name, 'Oil Harbor');
  assert.equal(result.lines[0].assignedVehicles[0].operational.currentLineIntervalRaw, 75.5);
  assert.equal(result.lines[0].assignedVehicles[0].operational.routeMatchesLine, true);
  assert.equal(result.lines[0].stops[0].building.name, 'Oil Harbor');
  assert.equal(result.lines[1].completeObservedCycle, null);
});

test('criminality outliers resolve exact residence and scope locations', () => {
  const citizens = [
    { index: 0, id: 100, residenceBuildingIndex: 4, criminality: 0.01 },
    { index: 1, id: 101, residenceBuildingIndex: 5, criminality: 0.02 },
    { index: 2, id: 102, residenceBuildingIndex: 4, criminality: 0.3 },
    { index: 3, id: 103, residenceBuildingIndex: -1, criminality: 0.28 },
  ];
  const buildings = [
    { index: 4, scopeId: 7, type: 'panelak', name: 'House A' },
    { index: 5, scopeId: 8, type: 'flat', name: 'House B' },
  ];
  const result = summarizeCriminalityOutliers(citizens, buildings, { multiplier: 1.5, minAbsolute: 0.1 });
  assert.equal(result.averageCriminality, 0.1525);
  assert.equal(result.threshold, 0.22875);
  assert.equal(result.unlocatedOutlierCount, 1);
  assert.equal(result.locatedOutlierCount, 1);
  assert.deepEqual(result.residents, [{
    citizenIndex: 2, citizenId: 102, criminality: 0.3,
    residenceBuildingIndex: 4,
    residence: { index: 4, scopeId: 7, type: 'panelak', name: 'House A' },
  }]);
});

test('schematic map projects exact x/z positions and marks outlier residences', () => {
  const result = buildSchematicMap([
    { index: 4, scopeId: 7, x: -10, y: 2, z: -20 },
    { index: 5, scopeId: 8, x: 30, y: 3, z: 20 },
  ], [{ id: 7, name: 'A', position: { x: 0, y: 2, z: 0 } }], {
    residents: [{ citizenIndex: 2, residenceBuildingIndex: 4, criminality: 0.3 }],
  }, { width: 100, height: 60, padding: 10, focusBuildingIndex: 4 });
  assert.deepEqual(result.bounds, { minX: -10, maxX: 30, minZ: -20, maxZ: 20 });
  assert.equal(result.buildings[0].mapX, 10);
  assert.equal(result.buildings[0].mapY, 50);
  assert.equal(result.buildings[0].criminalityOutlier.citizenIndex, 2);
  assert.equal(result.buildings[0].focused, true);
  assert.equal(result.buildings[1].criminalityOutlier, null);
  assert.equal(result.buildings[1].focused, false);
  assert.equal(result.scopes[0].mapX, 30);
  assert.equal(result.scopes[0].mapY, 30);
});

test('schematic map projects exact saved road centerlines with shared bounds', () => {
  const result = buildSchematicMap([
    { index: 1, x: 0, y: 0, z: 0 },
  ], [], null, { width: 100, height: 100, padding: 10, roadNetwork: {
    nodes: [{ id: 0, x: -10, y: 1, z: -20 }, { id: 1, x: 30, y: 2, z: 20 }],
    edges: [{ id: 7, from: 0, to: 1, points: [{ x: 10, y: 1.5, z: 0 }] }],
  } });
  assert.deepEqual(result.bounds, { minX: -10, maxX: 30, minZ: -20, maxZ: 20 });
  assert.deepEqual(result.roads, [{ id: 7, points: [
    { mapX: 10, mapY: 90 }, { mapX: 50, mapY: 50 }, { mapX: 90, mapY: 10 },
  ] }]);
  assert.equal(result.buildings[0].mapX, 30);
  assert.equal(result.buildings[0].mapY, 50);
});

test('schematic map projects exact saved rail centerlines with shared bounds', () => {
  const result = buildSchematicMap([{ index: 1, x: 0, z: 0 }], [], null, {
    width: 100, height: 100, padding: 10,
    railNetwork: {
      nodes: [{ id: 0, x: -20, y: 1, z: -10 }, { id: 1, x: 20, y: 2, z: 30 }],
      edges: [{ id: 4, from: 0, to: 1, points: [{ x: 0, y: 1.5, z: 10 }] }],
    },
  });
  assert.deepEqual(result.bounds, { minX: -20, maxX: 20, minZ: -10, maxZ: 30 });
  assert.deepEqual(result.rails, [{ id: 4, points: [
    { mapX: 10, mapY: 90 }, { mapX: 50, mapY: 50 }, { mapX: 90, mapY: 10 },
  ] }]);
  assert.equal(result.roads.length, 0);
});

test('schematic map places heightmap-derived water in the shared world projection', () => {
  const terrainWater = {
    width: 2, height: 2, packed: 'Yw==',
    worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  };
  const pollutionLayer = {
    width: 2, height: 2, airPacked: 'AAEC/w==', airNonzero: 3,
    worldBounds: { ...terrainWater.worldBounds },
  };
  const result = buildSchematicMap([{ index: 1, x: 0, z: 0 }], [], null, {
    width: 120, height: 80, padding: 10, terrainWater, pollutionLayer,
    railNetwork: {
      nodes: [{ id: 0, x: -1000, z: -1000 }, { id: 1, x: 1000, z: 1000 }],
      edges: [{ id: 0, from: 0, to: 1, points: [] }],
    },
  });
  assert.deepEqual(result.bounds, { minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
  assert.deepEqual(result.water, {
    ...terrainWater, mapX: 10, mapY: 10, mapWidth: 100, mapHeight: 60,
  });
  assert.deepEqual(result.pollution, {
    ...pollutionLayer, mapX: 10, mapY: 10, mapWidth: 100, mapHeight: 60,
  });
});
