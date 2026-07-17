import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownedVehicleDepreciationFactor,
  ownedVehicleExportMultiplier,
  usedVehicleOfferFactor,
  vehicleRuntimeCategory,
  defaultVehicleLifespan,
  containerRecyclingTargets,
  shipRecyclingTargets,
  shipProductionRecipe,
  normalVehicleProductionRecipe,
  normalVehicleRecyclingTargets,
  vehicleComponentBaseValue,
  vehicleEconomicOpportunity,
  vehicleUsedMarketQuote,
  rankUsedVehicleReplacements,
  shipEconomicOpportunity,
  shipUsedMarketQuote,
  ownedVehicleExportValue,
  valueRecoveredMaterials,
  resolveVehicleModels,
  shareSafeSaveImport,
} from '../js/fleet.js';

test('runtime vehicle categories and default lifespans follow the executable type table', () => {
  assert.equal(vehicleRuntimeCategory('VEHICLETYPE_SHIP'), 6);
  assert.equal(vehicleRuntimeCategory('VEHICLETYPE_CONTAINER'), 9);
  assert.equal(vehicleRuntimeCategory('VEHICLETYPE_HELICOPTER'), 10);
  assert.equal(vehicleRuntimeCategory('unrecognized'), 11);
  assert.equal(defaultVehicleLifespan(6), 21915);
  assert.equal(defaultVehicleLifespan(4), 18262.5);
  assert.equal(defaultVehicleLifespan(3), 0);
  assert.equal(defaultVehicleLifespan(10), 5478.75);
  assert.equal(defaultVehicleLifespan(1), 7305);
});

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

test('owned export combines saved state adjustment and gated depreciation', () => {
  const tanker = {
    age: 630.9812399897511,
    accumulatedUsage: 21772.365181054876,
    state: 0,
    ownershipField: -1,
  };
  assert.deepEqual(ownedVehicleExportMultiplier(tanker, {
    category: 6, lifespan: 21915, saleAdjustmentLevel: 2, depreciationLevel: 1,
  }), {
    multiplier: 0.2,
    stateAdjustment: 0.2,
    depreciation: 1,
    depreciationEnabled: true,
  });

  const worn = ownedVehicleExportMultiplier({
    age: 500, accumulatedUsage: 100, state: -1, ownershipField: 0,
  }, { category: 1, lifespan: 1000, saleAdjustmentLevel: 0, depreciationLevel: 1 });
  assert.deepEqual(worn, {
    multiplier: 0.32000000000000006,
    stateAdjustment: 0.8,
    depreciation: 0.4,
    depreciationEnabled: true,
  });
});

test('owned export skips depreciation for excluded categories and saved gates', () => {
  const record = { age: 900, accumulatedUsage: 0, state: 1, ownershipField: -1 };
  assert.deepEqual(ownedVehicleExportMultiplier(record, {
    category: 9, lifespan: null, saleAdjustmentLevel: 2, depreciationLevel: 1,
  }), {
    multiplier: 1,
    stateAdjustment: 1,
    depreciation: 1,
    depreciationEnabled: false,
  });
  assert.equal(ownedVehicleExportMultiplier(record, {
    category: 1, lifespan: null, saleAdjustmentLevel: 2, depreciationLevel: 1,
  }), null);
});

test('used-market factor applies the saved random modifier after age and usage', () => {
  assert.ok(Math.abs(usedVehicleOfferFactor({
    age: 250, accumulatedUsage: 100, lifespan: 1000, modifier: 0.1,
  }) - 0.64625) < 1e-12);
  assert.equal(usedVehicleOfferFactor({
    age: 1, accumulatedUsage: 1, lifespan: 0, modifier: 0,
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

test('normal ship recycling reproduces exact float32 targets for owned ships', () => {
  const cases = [
    [{ emptyWeight: 674, powerKW: 1342 }, [2549, 345.6617126464844, 6.766839504241943, 52.03102111816406]],
    [{ emptyWeight: 8780.2, powerKW: 18000 }, [33197, 4508.0986328125, 88.16199493408203, 679.15478515625]],
    [{ emptyWeight: 1170.1, powerKW: 736 }, [4400, 584.197265625, 11.715719223022461, 86.16856384277344]],
  ];
  for (const [facts, expected] of cases) {
    const result = shipRecyclingTargets({ ...facts, year: 2001, transportSubtype: 3, capacity: 0, electric: false });
    assert.equal(result.workdays, expected[0]);
    assert.equal(result.materials.waste_steel, expected[1]);
    assert.equal(result.materials.waste_plastic, expected[2]);
    assert.equal(result.materials.waste_bio, 0.0004000000189989805);
    assert.equal(result.materials.waste_burnable, 0.0012000000569969416);
    assert.equal(result.materials.waste_other, expected[3]);
  }
});

test('normal vehicle recycling reproduces rail and aircraft float32 oracles', () => {
  const cases = [
    [{ runtimeCategory: 3, emptyWeight: 22, powerKW: 0, introductionYear: 1971,
      transportSubtype: 0, capacity: 68, electric: null },
    { workdays: 100, steel: 17.79800033569336, other: 2.4870002269744873 }],
    [{ runtimeCategory: 4, emptyWeight: 64, powerKW: 736, introductionYear: 1966,
      transportSubtype: 0, capacity: 0, electric: false },
    { workdays: 308, steel: 59.18751907348633, other: 9.374759674072266 }],
    [{ runtimeCategory: 10, emptyWeight: 7.2, powerKW: 1120, introductionYear: 1959,
      transportSubtype: 7, capacity: 22, electric: null },
    { workdays: 144, steel: 1.8240000009536743, other: 1.1770200729370117 }],
  ];
  for (const [facts, expected] of cases) {
    const result = normalVehicleRecyclingTargets(facts);
    assert.equal(result.workdays, expected.workdays);
    assert.equal(result.materials.waste_steel, expected.steel);
    assert.equal(result.materials.waste_other, expected.other);
  }
});

test('aircraft recipe keeps aluminium and electronics in executable row order', () => {
  const recipe = normalVehicleProductionRecipe({
    runtimeCategory: 8, emptyWeight: 1.6, powerKW: 308, introductionYear: 1957,
    transportSubtype: 7, capacity: 4, electric: null,
  });
  assert.deepEqual(recipe.map(([resource]) => resource), [
    'workers', 'steel', 'aluminium', 'plastics', 'fabric', 'mcomponents',
    'ecomponents', 'eletronics', 'workers', 'mcomponents', 'ecomponents', 'eletronics',
  ]);
  const targets = normalVehicleRecyclingTargets({
    runtimeCategory: 8, emptyWeight: 1.6, powerKW: 308, introductionYear: 1957,
    transportSubtype: 7, capacity: 4, electric: null,
  });
  assert.equal(targets.workdays, 34);
  assert.equal(targets.materials.waste_aluminium, 1.1399999856948853);
  assert.equal(targets.materials.waste_plastic, 0.04979200288653374);
});

test('ordinary road category stays unavailable without the two branch facts', () => {
  assert.equal(normalVehicleProductionRecipe({
    runtimeCategory: 1, emptyWeight: 6, powerKW: 118, introductionYear: 1958,
    transportSubtype: 3, capacity: 7, electric: null,
  }), null);
});

test('ship cargo is reported but never added to recycling targets', () => {
  const base = { emptyWeight: 8780.2, powerKW: 18000, year: 2001,
    transportSubtype: 3, capacity: 19250, electric: false };
  const empty = shipRecyclingTargets(base);
  const loaded = shipRecyclingTargets({ ...base, cargo: [{ resource: 'oil', amount: 4338.07470703125 }] });

  assert.deepEqual(loaded.materials, empty.materials);
  assert.equal(loaded.workdays, empty.workdays);
  assert.deepEqual(loaded.ignoredCargo, [{ resource: 'oil', amount: 4338.07470703125 }]);
});

test('passenger and electric ship recipe branches stay explicit', () => {
  const diesel = shipRecyclingTargets({ emptyWeight: 100, powerKW: 1000, year: 1940,
    transportSubtype: 7, capacity: 200, electric: false });
  const electric = shipRecyclingTargets({ emptyWeight: 100, powerKW: 1000, year: 1940,
    transportSubtype: 7, capacity: 200, electric: true });

  assert.equal(diesel.materials.waste_plastic > 0, true); // electronic components still recover plastic
  assert.equal(electric.materials.waste_steel < diesel.materials.waste_steel, true);
  assert.equal(electric.workdays, diesel.workdays);
});

test('ship component base value preserves ordered cross-market recurrence', () => {
  const recipe = shipProductionRecipe({ emptyWeight: 10, powerKW: 100, year: 2001,
    transportSubtype: 3, capacity: 0, electric: false });
  const economy = { workday: () => 10, sell: key => ({
    steel: 20, plastics: 30, fabric: 40, mcomponents: 50, ecomponents: 60,
  })[key] };
  let expected = 0;
  for (const [resource, amount] of recipe) {
    const price = resource === 'workers' ? 10 : economy.sell(resource, 'USD');
    expected = (expected + amount * price) * 0.65;
  }
  assert.equal(vehicleComponentBaseValue(recipe, 'RUB', 'USD', economy), expected);
  assert.equal(vehicleComponentBaseValue(recipe, null, 'USD', economy), null);
});

test('ship opportunity compares exact export with derived recycling labor view', () => {
  const economy = {
    workday: () => 10,
    sell: key => ({ steel: 20, plastics: 30, fabric: 40, mcomponents: 50,
      ecomponents: 60, waste_steel: 8, waste_plastic: 4, waste_bio: 1,
      waste_burnable: -2, waste_other: -5 })[key],
    buy: key => ({ waste_steel: 12, waste_plastic: 7, waste_bio: 2,
      waste_burnable: -1, waste_other: -3 })[key],
  };
  const record = {
    age: 630.9812399897511, accumulatedUsage: 21772.365181054876,
    state: 0, ownershipField: -1, cargo: [{ resource: 'oil', amount: 4338 }],
    modelFacts: {
      runtimeCategory: 6, emptyWeight: 8780.2, powerKW: 18000,
      transportSubtype: 3, capacity: 19250, electric: false,
      availableFrom: 1979, originCurrency: 'RUB', lifespanDays: 21915,
    },
  };
  const result = shipEconomicOpportunity(record, {
    year: 2001, currency: 'RUB', saleAdjustmentLevel: 2, depreciationLevel: 1, economy,
  });

  assert.equal(result.exportMultiplier.multiplier, 0.2);
  assert.equal(result.recycling.workdays, 33197);
  assert.deepEqual(result.recycling.ignoredCargo, [{ resource: 'oil', amount: 4338 }]);
  assert.equal(result.laborOpportunityCost, 331970);
  assert.equal(result.cashOutAction, result.recycleAfterLabor > result.exportValue ? 'recycle' : 'export');
  assert.equal(result.advantage, Math.abs(result.exportValue - result.recycleAfterLabor));
});

test('vehicle opportunity applies aircraft export doubling only to payout', () => {
  const economy = {
    workday: () => 10,
    sell: () => 20,
    buy: () => 30,
  };
  const record = {
    age: 100, accumulatedUsage: 50, state: 1, ownershipField: -1,
    modelFacts: {
      runtimeCategory: 10, emptyWeight: 7.2, powerKW: 1120,
      transportSubtype: 7, capacity: 22, electric: null, availableFrom: 1959,
      originCurrency: 'RUB', lifespanDays: 5478.75, hasHardAttachments: false,
    },
  };
  const recipe = normalVehicleProductionRecipe({
    runtimeCategory: 10, emptyWeight: 7.2, powerKW: 1120,
    introductionYear: 1959, transportSubtype: 7, capacity: 22, electric: null,
  });
  const componentValue = vehicleComponentBaseValue(recipe, 'RUB', 'RUB', economy);
  const result = vehicleEconomicOpportunity(record, {
    currency: 'RUB', saleAdjustmentLevel: 2, depreciationLevel: 0, economy,
  });

  assert.equal(result.baseExportValue, componentValue * 2);
  assert.equal(result.exportValue, Math.fround(componentValue * 2));
  assert.equal(result.recycling.workdays, 144);
  assert.equal(result.recycling.materials.waste_aluminium, 5.12999963760376);
});

test('vehicle opportunities use model introduction year and reject hard attachments', () => {
  const economy = { workday: () => 1, sell: () => 1, buy: () => 1 };
  const record = {
    age: 1, accumulatedUsage: 1, state: 1, ownershipField: -1,
    modelFacts: {
      runtimeCategory: 6, emptyWeight: 100, powerKW: 1000, transportSubtype: 0,
      capacity: 0, electric: false, availableFrom: 1930, originCurrency: 'RUB',
      lifespanDays: 21915, hasHardAttachments: false,
    },
  };
  const result = vehicleEconomicOpportunity(record, {
    year: 2001, currency: 'RUB', saleAdjustmentLevel: 2, depreciationLevel: 1, economy,
  });
  const { waste_aluminium, ...materials } = result.recycling.materials;
  void waste_aluminium;
  assert.deepEqual(materials, shipRecyclingTargets({
    emptyWeight: 100, powerKW: 1000, year: 1930,
    transportSubtype: 0, capacity: 0, electric: false,
  }).materials);
  assert.equal(vehicleEconomicOpportunity({
    ...record, modelFacts: { ...record.modelFacts, hasHardAttachments: true },
  }, { currency: 'RUB', saleAdjustmentLevel: 2, depreciationLevel: 1, economy }), null);
});

test('owned payout preserves float32 adjustment order', () => {
  const multiplier = { stateAdjustment: 0.8, depreciation: 0.4 };
  const expected = Math.fround(Math.fround(Math.fround(12345678.9) * Math.fround(0.8)) * Math.fround(0.4));
  assert.equal(ownedVehicleExportValue(12345678.9, multiplier), expected);
});

test('ship opportunity remains unavailable without exact model facts', () => {
  assert.equal(shipEconomicOpportunity({ modelFacts: null }, {
    year: 2001, currency: 'RUB', saleAdjustmentLevel: 2, depreciationLevel: 1,
    economy: { workday: () => 1, sell: () => 1, buy: () => 1 },
  }), null);
});

test('used ship quote applies age usage and offer modifier to current component value', () => {
  const economy = { workday: () => 10, sell: () => 20 };
  const offer = {
    age: 250, accumulatedUsage: 100, modifier: 0.1,
    modelFacts: {
      runtimeCategory: 6, emptyWeight: 100, powerKW: 1000,
      transportSubtype: 11, capacity: 200, electric: false,
      availableFrom: 1979, originCurrency: 'RUB', lifespanDays: 1000,
    },
  };
  const result = shipUsedMarketQuote(offer, { year: 2001, currency: 'RUB', economy });
  assert.ok(result.baseValue > 0);
  assert.ok(Math.abs(result.factor - 0.64625) < 1e-12);
  assert.equal(result.purchaseValue, Math.fround(result.baseValue * result.factor));
});

test('used aircraft quote includes the exact export-market aircraft factor', () => {
  const economy = { workday: () => 10, sell: () => 20 };
  const offer = {
    age: 250, accumulatedUsage: 100, modifier: 0,
    modelFacts: {
      runtimeCategory: 10, emptyWeight: 7.2, powerKW: 1120,
      transportSubtype: 7, capacity: 22, electric: null, availableFrom: 1959,
      originCurrency: 'RUB', lifespanDays: 1000, hasHardAttachments: false,
    },
  };
  const result = vehicleUsedMarketQuote(offer, { currency: 'RUB', economy });
  const recipe = normalVehicleProductionRecipe({
    runtimeCategory: 10, emptyWeight: 7.2, powerKW: 1120,
    introductionYear: 1959, transportSubtype: 7, capacity: 22, electric: null,
  });
  assert.equal(result.baseValue, vehicleComponentBaseValue(recipe, 'RUB', 'RUB', economy) * 2);
});

test('used replacement ranking requires exact role match and no capacity downgrade', () => {
  const owned = [
    { record: { modelFacts: { name: 'Small bus', runtimeCategory: 2,
      transportSubtype: 7, capacity: 40 } }, cashOutAction: 'export',
    exportValue: 80, recycleAfterLabor: 70 },
    { record: { modelFacts: { name: 'Large bus', runtimeCategory: 2,
      transportSubtype: 7, capacity: 80 } }, cashOutAction: 'recycle',
    exportValue: 90, recycleAfterLabor: 120 },
    { record: { modelFacts: { name: 'Oil truck', runtimeCategory: 2,
      transportSubtype: 3, capacity: 20 } }, cashOutAction: 'export',
    exportValue: 60, recycleAfterLabor: 40 },
  ];
  const quotes = [
    { offer: { modelFacts: { name: 'Used bus 90', runtimeCategory: 2,
      transportSubtype: 7, capacity: 90 } }, purchaseValue: 150 },
    { offer: { modelFacts: { name: 'Used bus 60', runtimeCategory: 2,
      transportSubtype: 7, capacity: 60 } }, purchaseValue: 100 },
    { offer: { modelFacts: { name: 'Used oil truck', runtimeCategory: 2,
      transportSubtype: 3, capacity: 25 } }, purchaseValue: 70 },
    { offer: { modelFacts: { name: 'Wrong category', runtimeCategory: 1,
      transportSubtype: 7, capacity: 100 } }, purchaseValue: 1 },
  ];

  const ranked = rankUsedVehicleReplacements(owned, quotes);
  assert.deepEqual(ranked.map(item => [
    item.quote.offer.modelFacts.name,
    item.targetOpportunity.record.modelFacts.name,
    item.compatibleOwnedCount,
    item.capacityGain,
    item.netCashRequired,
  ]), [
    ['Used oil truck', 'Oil truck', 1, 5, 10],
    ['Used bus 60', 'Small bus', 1, 20, 20],
    ['Used bus 90', 'Large bus', 2, 10, 30],
  ]);
});

test('used replacement ranking excludes missing capacity and non-finite cash routes', () => {
  assert.deepEqual(rankUsedVehicleReplacements([
    { record: { modelFacts: { runtimeCategory: 3, transportSubtype: 0, capacity: 0 } },
      cashOutAction: 'export', exportValue: 10 },
  ], [
    { offer: { modelFacts: { runtimeCategory: 3, transportSubtype: 0, capacity: 10 } },
      purchaseValue: 20 },
  ]), []);
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
  const game = [{ id: 'tanker', en: 'The Pride', type: 'VEHICLETYPE_SHIP', emptyWeight: 8780.2,
    powerKW: 18000, capacity: 19250, transportType: 'RESOURCE_TRANSPORT_OIL', from: 1979, costRUB: 4300 }];
  const workshop = [{ id: '1945481818/UAZ_452', type: 'VEHICLETYPE_ROAD', emptyWeight: 1.85,
    lifespanYears: 12 }];
  const resolved = resolveVehicleModels(records, { game, workshop });

  assert.deepEqual(resolved.records.map(record => record.modelFacts), [
    { id: 'tanker', name: 'The Pride', type: 'VEHICLETYPE_SHIP', category: null,
      runtimeCategory: 6, emptyWeight: 8780.2, powerKW: 18000, capacity: 19250,
      transportType: 'RESOURCE_TRANSPORT_OIL', transportSubtype: 3, availableFrom: 1979,
      originCurrency: 'RUB', lifespanDays: 21915, electric: false,
      hasHardAttachments: false, source: 'game-file' },
    { id: '1945481818/UAZ_452', name: '1945481818/UAZ_452', type: 'VEHICLETYPE_ROAD',
      category: null, runtimeCategory: 1, emptyWeight: 1.85, powerKW: null, capacity: null,
      transportType: null, transportSubtype: 0, availableFrom: null,
      originCurrency: null, lifespanDays: 4383,
      electric: null, hasHardAttachments: false, source: 'workshop-catalog' },
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

test('legacy Workshop facts without lifespan presence stay unavailable', () => {
  const resolved = resolveVehicleModels([{ model: '1945481818/UAZ_452' }], {
    workshop: [{ id: '1945481818/UAZ_452', type: 'VEHICLETYPE_ROAD' }],
  });
  assert.equal(resolved.records[0].modelFacts.lifespanDays, null);
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
