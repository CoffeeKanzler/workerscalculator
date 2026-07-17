import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownedVehicleDepreciationFactor,
  containerRecyclingTargets,
  valueRecoveredMaterials,
  resolveVehicleModels,
  shareSafeSaveImport,
} from '../js/fleet.js';

test('owned depreciation follows the signed-state age and saved-usage branches', () => {
  const common = { age: 250, accumulatedUsage: 100, lifespan: 1000 };

  assert.equal(ownedVehicleDepreciationFactor({ ...common, state: -1 }), 0.5875);
  assert.equal(ownedVehicleDepreciationFactor({ ...common, state: 0 }), 0.475);
});

test('owned depreciation clamps age and usage extremes without inventing value', () => {
  assert.equal(ownedVehicleDepreciationFactor({
    age: 2000, accumulatedUsage: 2000, lifespan: 1000, state: -1,
  }), 0.25);
  assert.equal(ownedVehicleDepreciationFactor({
    age: -10, accumulatedUsage: -10, lifespan: 1000, state: 0,
  }), 0.55);
  assert.equal(ownedVehicleDepreciationFactor({
    age: 1, accumulatedUsage: 1, lifespan: 0, state: 0,
  }), null);
});

test('container recycling produces exact base targets and work requirement', () => {
  const result = containerRecyclingTargets({ emptyWeight: 8780.2 });

  assert.ok(Math.abs(result.materials.steel - 878.02) < 1e-9);
  assert.ok(Math.abs(result.materials.waste_steel - 1756.04) < 1e-9);
  assert.ok(Math.abs(result.materials.waste_other - 6146.14) < 1e-9);
  assert.equal(result.workdays, 87802);
  assert.equal(result.cargoIncluded, false);
});

test('container transport subtype 12/13 doubles work but not recovered materials', () => {
  const normal = containerRecyclingTargets({ emptyWeight: 100 });
  const doubled = containerRecyclingTargets({ emptyWeight: 100, subtype: 12 });

  assert.deepEqual(doubled.materials, normal.materials);
  assert.equal(doubled.workdays, normal.workdays * 2);
});

test('verified mixed-waste cargo is separate from the empty container-vehicle targets', () => {
  const result = containerRecyclingTargets({
    emptyWeight: 100,
    cargo: [{ resource: 'oil', amount: 25 }],
    cargoConversions: { oil: { waste_other: 1 } },
  });

  assert.deepEqual(result.materials, { steel: 10, waste_steel: 20, waste_other: 95 });
  assert.equal(result.workdays, 1250);
  assert.equal(result.cargoIncluded, true);
  assert.deepEqual(result.unresolvedCargo, []);
});

test('unverified cargo is reported and excluded instead of guessed', () => {
  const result = containerRecyclingTargets({
    emptyWeight: 100,
    cargo: [{ resource: 'mystery', amount: 7 }],
  });

  assert.deepEqual(result.materials, { steel: 10, waste_steel: 20, waste_other: 70 });
  assert.deepEqual(result.unresolvedCargo, [{ resource: 'mystery', amount: 7 }]);
  assert.equal(result.cargoIncluded, false);
});

test('recovered materials keep avoided-purchase value distinct from export value', () => {
  const economy = {
    buy: key => ({ steel: 100, waste_steel: 20, waste_other: -5 })[key],
    sell: key => ({ steel: 50, waste_steel: 8, waste_other: -10 })[key],
  };

  assert.deepEqual(valueRecoveredMaterials({ steel: 10, waste_steel: 20, waste_other: 70 }, 'RUB', economy), {
    avoidedPurchaseValue: 1050,
    immediateExportValue: -40,
    missingPurchasePrices: [],
    missingSellPrices: [],
  });
});

test('missing recovery prices remain unavailable instead of becoming zero', () => {
  const economy = { buy: () => undefined, sell: () => undefined };

  assert.deepEqual(valueRecoveredMaterials({ steel: 10 }, 'RUB', economy), {
    avoidedPurchaseValue: null,
    immediateExportValue: null,
    missingPurchasePrices: ['steel'],
    missingSellPrices: ['steel'],
  });
});

test('fleet model resolution prefers exact authoritative game IDs', () => {
  const records = [{ model: 'tanker' }, { model: '1945481818/UAZ_452' }, { model: 'unknown' }];
  const game = [{ id: 'tanker', en: 'The Pride', type: 'VEHICLETYPE_SHIP', emptyWeight: 8780.2 }];
  const workshop = [{ id: '1945481818/UAZ_452', type: 'VEHICLETYPE_ROAD', emptyWeight: 1.85 }];
  const resolved = resolveVehicleModels(records, { game, workshop });

  assert.deepEqual(resolved.records.map(record => record.modelFacts), [
    { id: 'tanker', name: 'The Pride', type: 'VEHICLETYPE_SHIP', category: null,
      emptyWeight: 8780.2, source: 'game-file' },
    { id: '1945481818/UAZ_452', name: '1945481818/UAZ_452', type: 'VEHICLETYPE_ROAD',
      category: null, emptyWeight: 1.85, source: 'workshop-catalog' },
    null,
  ]);
  assert.deepEqual(resolved.summary, {
    recordCount: 3, resolvedCount: 2, unresolvedCount: 1,
    modelCount: 3, resolvedModelCount: 2,
  });
});

test('numeric Workshop models never resolve by basename', () => {
  const resolved = resolveVehicleModels([{ model: '9999999999/UAZ_452' }], {
    game: [], workshop: [{ id: '1945481818/UAZ_452', type: 'VEHICLETYPE_ROAD' }],
  });
  assert.equal(resolved.records[0].modelFacts, null);
});

test('shared plans retain fleet coverage but omit per-vehicle save facts', () => {
  const source = {
    sourceName: 'Republic', vehicleFileSummary: { recordCount: 1294 },
    vehicleModelCoverage: { resolvedCount: 1241 },
    ownedVehicles: [{ id: 1, model: 'tanker' }],
    usedVehicleOffers: [{ model: 'c401' }],
  };
  const shared = shareSafeSaveImport(source);

  assert.equal(shared.sourceName, 'Republic');
  assert.equal(shared.vehicleFileSummary.recordCount, 1294);
  assert.equal(shared.vehicleModelCoverage.resolvedCount, 1241);
  assert.equal('ownedVehicles' in shared, false);
  assert.equal('usedVehicleOffers' in shared, false);
  assert.equal(source.ownedVehicles.length, 1);
});
