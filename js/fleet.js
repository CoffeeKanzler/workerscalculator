const clamp01 = value => Math.min(1, Math.max(0, value));

const VEHICLE_RUNTIME_CATEGORIES = new Map([
  ['VEHICLETYPE_NOTSPECIFIED', 0],
  ['VEHICLETYPE_ROAD', 1],
  ['VEHICLETYPE_ROAD_SERVICE', 2],
  ['VEHICLETYPE_RAIL_VAGON', 3],
  ['VEHICLETYPE_RAIL_LOCOMOTIVE', 4],
  ['VEHICLETYPE_RAIL_SERVICE', 5],
  ['VEHICLETYPE_SHIP', 6],
  ['VEHICLETYPE_CABIN', 7],
  ['VEHICLETYPE_AIRPLANE', 8],
  ['VEHICLETYPE_CONTAINER', 9],
  ['VEHICLETYPE_HELICOPTER', 10],
]);

const DEPRECIATION_EXCLUDED_CATEGORIES = new Set([3, 7, 9, 11]);
const RESOURCE_TRANSPORT_SUBTYPES = new Map([
  ['RESOURCE_TRANSPORT_COVERED', 0],
  ['RESOURCE_TRANSPORT_OPEN', 1],
  ['RESOURCE_TRANSPORT_GRAVEL', 2],
  ['RESOURCE_TRANSPORT_OIL', 3],
  ['RESOURCE_TRANSPORT_CEMENT', 4],
  ['RESOURCE_TRANSPORT_COOLER', 5],
  ['RESOURCE_TRANSPORT_LIVESTOCK', 6],
  ['RESOURCE_TRANSPORT_PASSANGER', 7],
  ['RESOURCE_TRANSPORT_CONCRETE', 8],
  ['RESOURCE_TRANSPORT_ELETRIC', 9],
  ['RESOURCE_TRANSPORT_VEHICLES', 10],
  ['RESOURCE_TRANSPORT_GENERAL', 11],
  ['RESOURCE_TRANSPORT_NUCLEAR1', 12],
  ['RESOURCE_TRANSPORT_NUCLEAR2', 13],
  ['RESOURCE_TRANSPORT_HEATING', 14],
  ['RESOURCE_TRANSPORT_WATER', 15],
  ['RESOURCE_TRANSPORT_SEWAGE', 16],
  ['RESOURCE_TRANSPORT_WASTE', 17],
]);

export function vehicleRuntimeCategory(type) {
  return VEHICLE_RUNTIME_CATEGORIES.get(type) ?? 11;
}

export function defaultVehicleLifespan(category) {
  if (category === 4 || category === 5) return 18262.5;
  if (category === 3) return 0;
  if (category === 6) return 21915;
  if (category === 8) return 9131.25;
  if (category === 10) return 5478.75;
  return 7305;
}

export function resourceTransportSubtype(type) {
  return RESOURCE_TRANSPORT_SUBTYPES.get(type) ?? null;
}

export function ownedVehicleDepreciationFactor({
  age, accumulatedUsage, lifespan, state,
}) {
  if (![age, accumulatedUsage, lifespan, state].every(Number.isFinite) || !(lifespan > 0)) {
    return null;
  }
  const ageRemaining = clamp01((lifespan - age) / lifespan);
  const condition = clamp01(1 - accumulatedUsage / lifespan);
  const wearFraction = 1 - condition;
  const factor = state < 0
    ? ageRemaining * 0.75 + wearFraction * 0.25
    : ageRemaining * 0.5 + wearFraction * 0.5 + 0.05;
  return Math.min(1, factor);
}

export function ownedVehicleExportMultiplier(record, {
  category, lifespan, saleAdjustmentLevel, depreciationLevel,
}) {
  if (!Number.isInteger(category)
      || !Number.isFinite(saleAdjustmentLevel)
      || !Number.isFinite(depreciationLevel)
      || !Number.isFinite(record?.state)
      || !Number.isFinite(record?.ownershipField)) return null;
  const stateAdjustment = record.state === 1 ? 1 : saleAdjustmentLevel < 2 ? 0.8 : 0.2;
  const depreciationEnabled = depreciationLevel > 0
    && record.ownershipField < 1
    && !DEPRECIATION_EXCLUDED_CATEGORIES.has(category);
  let depreciation = 1;
  if (depreciationEnabled) {
    depreciation = ownedVehicleDepreciationFactor({
      age: record.age,
      accumulatedUsage: record.accumulatedUsage,
      lifespan,
      state: record.state,
    });
    if (depreciation === null) return null;
  }
  return {
    multiplier: stateAdjustment * depreciation,
    stateAdjustment,
    depreciation,
    depreciationEnabled,
  };
}

export function usedVehicleOfferFactor({ age, accumulatedUsage, lifespan, modifier }) {
  if (![age, accumulatedUsage, lifespan, modifier].every(Number.isFinite) || !(lifespan > 0)) {
    return null;
  }
  const ageRemaining = clamp01((lifespan - age) / lifespan);
  const wearFraction = 1 - clamp01(1 - accumulatedUsage / lifespan);
  const base = ageRemaining * 0.75 + wearFraction * 0.25;
  return modifier === 0 ? base : base * (1 + modifier);
}

export function shipProductionRecipe({
  emptyWeight, powerKW, year, transportSubtype, capacity = 0, electric,
}) {
  if (![emptyWeight, powerKW, year, transportSubtype, capacity].every(Number.isFinite)
      || emptyWeight < 0 || powerKW < 0 || capacity < 0 || typeof electric !== 'boolean') return null;
  const f32 = Math.fround;
  const weight = f32(emptyWeight);
  const power = f32(powerKW);
  const p100 = f32(power / f32(100));
  return [
    ['workers', f32(f32(25) * weight)],
    ['steel', f32(f32(0.5) * weight)],
    ...(year > 1944 ? [['plastics', f32(f32(0.01) * weight)]] : []),
    ['fabric', transportSubtype === 7
      ? f32(f32(0.0035) * f32(capacity)) : f32(0.002)],
    ['mcomponents', f32(f32(0.06) * weight)],
    ['ecomponents', f32(f32(0.005) * weight)],
    ['workers', f32(power / f32(10))],
    ['steel', f32(p100 * f32(electric ? 0.5 : 0.6))],
    ['mcomponents', f32(p100 * f32(electric ? 0.35 : 0.65))],
    ['ecomponents', f32(p100 * f32(0.01))],
  ];
}

export function vehicleComponentBaseValue(recipe, originCurrency, currency, economy) {
  if (!Array.isArray(recipe) || !['RUB', 'USD'].includes(originCurrency)
      || !['RUB', 'USD'].includes(currency)) return null;
  const crossMarketFactor = originCurrency === currency ? 1
    : currency === 'USD' ? 0.65 : 1.27;
  let value = 0;
  for (const [resource, amount] of recipe) {
    if (!Number.isFinite(amount) || !(amount > 0)) continue;
    let price = resource === 'workers' ? economy.workday(currency) : economy.sell(resource, currency);
    if (!Number.isFinite(price)) return null;
    if (currency === 'RUB' && resource === 'workers') price *= 0.45;
    value = (value + amount * price) * crossMarketFactor;
  }
  return value;
}

export function ownedVehicleExportValue(baseValue, multiplier) {
  if (!Number.isFinite(baseValue) || !multiplier) return null;
  let value = Math.fround(baseValue);
  if (multiplier.stateAdjustment !== 1) {
    value = Math.fround(value * Math.fround(multiplier.stateAdjustment));
  }
  if (multiplier.depreciation < 1) {
    value = Math.fround(value * Math.fround(multiplier.depreciation));
  }
  return value;
}

export function shipEconomicOpportunity(record, {
  year, currency, saleAdjustmentLevel, depreciationLevel, economy,
}) {
  const facts = record?.modelFacts;
  if (facts?.runtimeCategory !== 6 || !Number.isFinite(year)) return null;
  const recipe = shipProductionRecipe({
    emptyWeight: facts.emptyWeight,
    powerKW: facts.powerKW,
    year,
    transportSubtype: facts.transportSubtype,
    capacity: facts.capacity ?? 0,
    electric: facts.electric,
  });
  if (!recipe) return null;
  const baseExportValue = vehicleComponentBaseValue(recipe, facts.originCurrency, currency, economy);
  const exportMultiplier = ownedVehicleExportMultiplier(record, {
    category: facts.runtimeCategory,
    lifespan: facts.lifespanDays,
    saleAdjustmentLevel,
    depreciationLevel,
  });
  const recycling = shipRecyclingTargets({
    emptyWeight: facts.emptyWeight,
    powerKW: facts.powerKW,
    year,
    transportSubtype: facts.transportSubtype,
    capacity: facts.capacity ?? 0,
    electric: facts.electric,
    cargo: record.cargo,
  });
  if (!Number.isFinite(baseExportValue) || !exportMultiplier || !recycling) return null;
  const recoveredValue = valueRecoveredMaterials(recycling.materials, currency, economy);
  const workdayPrice = economy.workday(currency);
  const laborOpportunityCost = Number.isFinite(workdayPrice) ? recycling.workdays * workdayPrice : null;
  const exportValue = ownedVehicleExportValue(baseExportValue, exportMultiplier);
  const recycleAfterLabor = Number.isFinite(recoveredValue.immediateExportValue)
      && Number.isFinite(laborOpportunityCost)
    ? recoveredValue.immediateExportValue - laborOpportunityCost : null;
  const cashOutAction = Number.isFinite(recycleAfterLabor) && recycleAfterLabor > exportValue
    ? 'recycle' : 'export';
  return {
    record,
    baseExportValue,
    exportMultiplier,
    exportValue,
    recycling,
    recoveredValue,
    laborOpportunityCost,
    recycleAfterLabor,
    cashOutAction,
    advantage: cashOutAction === 'recycle' ? recycleAfterLabor - exportValue
      : Number.isFinite(recycleAfterLabor) ? exportValue - recycleAfterLabor : null,
  };
}

export function shipUsedMarketQuote(offer, { year, currency, economy }) {
  const facts = offer?.modelFacts;
  if (facts?.runtimeCategory !== 6 || !Number.isFinite(year)) return null;
  const recipe = shipProductionRecipe({
    emptyWeight: facts.emptyWeight,
    powerKW: facts.powerKW,
    year,
    transportSubtype: facts.transportSubtype,
    capacity: facts.capacity ?? 0,
    electric: facts.electric,
  });
  const baseValue = vehicleComponentBaseValue(recipe, facts.originCurrency, currency, economy);
  const factor = usedVehicleOfferFactor({ ...offer, lifespan: facts.lifespanDays });
  if (!Number.isFinite(baseValue) || !Number.isFinite(factor)) return null;
  return { offer, baseValue, factor, purchaseValue: Math.fround(baseValue * factor) };
}

const NORMAL_RECYCLE_CONVERSIONS = {
  steel: [['waste_steel', 0.9], ['waste_other', 0.1]],
  plastics: [['waste_plastic', 0.9], ['waste_other', 0.1]],
  fabric: [['waste_bio', 0.2], ['waste_burnable', 0.6], ['waste_other', 0.2]],
  mcomponents: [['waste_steel', 0.7], ['waste_other', 0.3]],
  ecomponents: [['waste_steel', 0.2], ['waste_plastic', 0.2], ['waste_other', 0.6]],
};

export function shipRecyclingTargets({
  emptyWeight, powerKW, year, transportSubtype, capacity = 0, electric, cargo = [],
}) {
  if (![emptyWeight, powerKW, year, transportSubtype, capacity].every(Number.isFinite)
      || emptyWeight < 0 || powerKW < 0 || capacity < 0 || typeof electric !== 'boolean') return null;
  const f32 = Math.fround;
  const rows = shipProductionRecipe({ emptyWeight, powerKW, year, transportSubtype, capacity, electric });
  const materials = {
    waste_steel: f32(0), waste_plastic: f32(0), waste_bio: f32(0),
    waste_burnable: f32(0), waste_other: f32(0),
  };
  let workdays = f32(0);
  for (const [resource, amount] of rows) {
    if (resource === 'workers') {
      const rowTarget = Math.trunc(f32(f32(f32(0.15) * amount) + f32(1)));
      workdays = f32(workdays + f32(rowTarget));
      continue;
    }
    for (const [target, ratio] of NORMAL_RECYCLE_CONVERSIONS[resource]) {
      materials[target] = f32(materials[target] + f32(amount * f32(ratio)));
    }
  }
  return {
    materials,
    workdays,
    ignoredCargo: cargo.filter(item => Number.isFinite(item?.amount) && item.amount > 0)
      .map(item => ({ resource: item.resource, amount: item.amount })),
  };
}

// Exact only for the VEHICLETYPE_CONTAINER path (runtime category 9).
// Ships are category 6 and use the separate normal-vehicle conversion path.
export function containerRecyclingTargets({
  emptyWeight, subtype = null, cargo = [], cargoConversions = {},
}) {
  if (!Number.isFinite(emptyWeight) || emptyWeight < 0) return null;
  const materials = {
    steel: emptyWeight * 0.1,
    waste_steel: emptyWeight * 0.2,
    waste_other: emptyWeight * 0.7,
  };
  const unresolvedCargo = [];
  let includedCargoAmount = 0;

  for (const item of cargo) {
    if (!Number.isFinite(item?.amount) || !(item.amount > 0)) continue;
    const conversion = cargoConversions[item.resource];
    if (!conversion || !Object.keys(conversion).length) {
      unresolvedCargo.push({ resource: item.resource, amount: item.amount });
      continue;
    }
    let converted = false;
    for (const [resource, ratio] of Object.entries(conversion)) {
      if (!Number.isFinite(ratio) || !(ratio > 0)) continue;
      materials[resource] = (materials[resource] ?? 0) + item.amount * ratio;
      converted = true;
    }
    if (converted) includedCargoAmount += item.amount;
    else unresolvedCargo.push({ resource: item.resource, amount: item.amount });
  }

  const total = Object.values(materials).reduce((sum, amount) => sum + amount, 0);
  const subtypeFactor = subtype === 12 || subtype === 13 ? 2 : 1;
  return {
    materials,
    workdays: Math.max(3, total) * 10 * subtypeFactor,
    cargoIncluded: includedCargoAmount > 0,
    unresolvedCargo,
  };
}

export function valueRecoveredMaterials(materials, currency, economy) {
  let avoidedPurchaseValue = 0;
  let immediateExportValue = 0;
  const missingPurchasePrices = [];
  const missingSellPrices = [];

  for (const [resource, amount] of Object.entries(materials)) {
    if (!Number.isFinite(amount) || !(amount > 0)) continue;
    const purchasePrice = economy.buy(resource, currency);
    const sellPrice = economy.sell(resource, currency);
    if (Number.isFinite(purchasePrice)) avoidedPurchaseValue += amount * purchasePrice;
    else missingPurchasePrices.push(resource);
    if (Number.isFinite(sellPrice)) immediateExportValue += amount * sellPrice;
    else missingSellPrices.push(resource);
  }

  return {
    avoidedPurchaseValue: missingPurchasePrices.length ? null : avoidedPurchaseValue,
    immediateExportValue: missingSellPrices.length ? null : immediateExportValue,
    missingPurchasePrices,
    missingSellPrices,
  };
}

export function resolveVehicleModels(records, { game = [], workshop = [] } = {}) {
  const gameById = new Map(game.map(entry => [String(entry.id).toLowerCase(), entry]));
  const workshopById = new Map(workshop.map(entry => [String(entry.id).toLowerCase(), entry]));
  const modelIds = new Set();
  const resolvedModelIds = new Set();
  let resolvedCount = 0;
  const resolvedRecords = records.map(record => {
    const modelId = String(record.model ?? '');
    const key = modelId.toLowerCase();
    modelIds.add(key);
    const gameEntry = gameById.get(key);
    const workshopEntry = workshopById.get(key);
    const entry = gameEntry ?? workshopEntry;
    if (!entry) return { ...record, modelFacts: null };
    resolvedCount += 1;
    resolvedModelIds.add(key);
    return {
      ...record,
      modelFacts: {
        id: entry.id,
        name: entry.en ?? entry.de ?? entry.nameStr ?? entry.id,
        type: entry.type ?? null,
        category: entry.category ?? null,
        runtimeCategory: entry.type ? vehicleRuntimeCategory(entry.type) : null,
        emptyWeight: Number.isFinite(entry.emptyWeight) ? entry.emptyWeight : null,
        powerKW: Number.isFinite(entry.powerKW) ? entry.powerKW : null,
        capacity: Number.isFinite(entry.capacity) ? entry.capacity : null,
        transportType: entry.transportType ?? null,
        transportSubtype: resourceTransportSubtype(entry.transportType),
        availableFrom: Number.isFinite(entry.from) ? entry.from : null,
        originCurrency: Number.isFinite(entry.costUSD) ? 'USD'
          : Number.isFinite(entry.costRUB) ? 'RUB' : null,
        lifespanDays: Number.isFinite(entry.lifespanYears) && entry.lifespanYears > 0
          ? entry.lifespanYears * 365.25
          : entry.type && (gameEntry || entry.lifespanYears === 0)
            ? defaultVehicleLifespan(vehicleRuntimeCategory(entry.type)) : null,
        electric: typeof entry.electric === 'boolean' ? entry.electric
          : gameEntry && entry.type === 'VEHICLETYPE_SHIP' ? false : null,
        source: gameEntry ? 'game-file' : 'workshop-catalog',
      },
    };
  });
  return {
    records: resolvedRecords,
    summary: {
      recordCount: records.length,
      resolvedCount,
      unresolvedCount: records.length - resolvedCount,
      modelCount: modelIds.size,
      resolvedModelCount: resolvedModelIds.size,
    },
  };
}

export function shareSafeSaveImport(saveImport) {
  if (!saveImport) return saveImport;
  const { ownedVehicles, usedVehicleOffers, ...summary } = saveImport;
  return summary;
}
