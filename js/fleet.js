const clamp01 = value => Math.min(1, Math.max(0, value));

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

// Exact only for FUN_1401af390's VEHICLETYPE_CONTAINER path (category 9).
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
        emptyWeight: Number.isFinite(entry.emptyWeight) ? entry.emptyWeight : null,
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
