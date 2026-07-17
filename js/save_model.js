export function citizenProductivity(citizen) {
  const base = 0.5 * (
    0.6 * citizen.food
    + 0.5 * citizen.health
    + 1.8 * citizen.happiness
    - 0.675
  );
  return Math.max(0.3, base * (0.65 + 0.7 * citizen.loyalty));
}

function average(total, count) {
  return count ? total / count : 0;
}

export function aggregateCitizensByScope(citizens, buildings) {
  const buildingsByIndex = new Map(buildings.map((building) => [building.index, building]));
  const scopes = new Map();
  let unassigned = 0;
  let invalidResidenceRefs = 0;

  for (const citizen of citizens) {
    if (citizen.residenceBuildingIndex < 0) {
      unassigned += 1;
      continue;
    }

    const residence = buildingsByIndex.get(citizen.residenceBuildingIndex);
    if (!residence) {
      invalidResidenceRefs += 1;
      continue;
    }
    if (!Number.isInteger(residence.scopeId)) {
      unassigned += 1;
      continue;
    }

    const aggregate = scopes.get(residence.scopeId) || {
      residents: 0,
      adults: 0,
      highEducation: 0,
      productivity: 0,
      happiness: 0,
      food: 0,
      health: 0,
      loyalty: 0,
      criminality: 0,
    };
    aggregate.residents += 1;
    aggregate.adults += citizen.age > 21 ? 1 : 0;
    aggregate.highEducation += citizen.education >= 2 ? 1 : 0;
    aggregate.productivity += citizenProductivity(citizen);
    aggregate.happiness += citizen.happiness;
    aggregate.food += citizen.food;
    aggregate.health += citizen.health;
    aggregate.loyalty += citizen.loyalty;
    aggregate.criminality += citizen.criminality ?? 0;
    scopes.set(residence.scopeId, aggregate);
  }

  for (const aggregate of scopes.values()) {
    const count = aggregate.residents;
    aggregate.productivity = average(aggregate.productivity, count);
    aggregate.happiness = average(aggregate.happiness, count);
    aggregate.food = average(aggregate.food, count);
    aggregate.health = average(aggregate.health, count);
    aggregate.loyalty = average(aggregate.loyalty, count);
    aggregate.criminality = average(aggregate.criminality, count);
  }

  return {
    scopes,
    unassigned,
    invalidResidenceRefs,
    recordCount: citizens.length,
  };
}

export function compactObservedBuildings(buildings) {
  const keys = [
    'index', 'type', 'name', 'scopeId', 'x', 'y', 'z', 'currentWorkers',
    'configuredWorkers', 'configuredWorkersHighEducation', 'mineQuality',
    'constructionProgress', 'storages',
  ];
  return buildings.map((building) => Object.fromEntries(
    keys.filter((key) => building[key] !== undefined && (key !== 'storages' || building[key].some(
      storage => storage.resources?.length,
    ))).map((key) => [key, key === 'storages'
      ? building[key].filter(storage => storage.resources?.length).map(storage => ({
        storageIndex: storage.storageIndex, inputFlag: storage.inputFlag, outputFlag: storage.outputFlag,
        selector: storage.selector, capacity: storage.capacity, mode: storage.mode,
        resources: storage.resources.map(item => ({ resource: item.resource, amount: item.amount })),
      })) : building[key]]),
  ));
}

function saveTypeCandidates(type) {
  const clean = String(type).replace(/^MIRRORZ_/, '');
  const candidates = [type, clean];
  if (clean.startsWith('CWC_')) candidates.push(`cwc/${clean.slice(4)}`);
  const aliases = {
    concrete_plant_v2: 'concrete_plant',
    brick_factory_v2: 'brick_factory',
    oil_rafinery_v2: 'oil_rafinery',
  };
  if (aliases[clean]) candidates.push(aliases[clean]);
  return [...new Set(candidates.map((value) => String(value).toLowerCase()))];
}

export function matchObservedBuilding(type, catalog, idOf = (entry) => entry.gameId) {
  const candidates = saveTypeCandidates(type);
  const exact = new Map(catalog.map((entry) => [String(idOf(entry) ?? '').toLowerCase(), entry]));
  for (const candidate of candidates) if (exact.has(candidate)) return exact.get(candidate);

  // A Workshop path's numeric prefix is its authoritative item identity.
  // Never resolve an unavailable mod to an unrelated mod that happens to use
  // the same generic basename (hospital, sad, block1, ...).
  if (/^\d{6,20}\//.test(candidates.at(-1))) return null;
  const basename = candidates.at(-1).split('/').at(-1);
  const matches = catalog.filter((entry) =>
    String(idOf(entry) ?? '').toLowerCase().split('/').at(-1) === basename);
  return matches.length === 1 ? matches[0] : null;
}

export function groupObservedProduction(buildings, catalog) {
  const grouped = new Map();
  const unmatched = new Map();

  for (const record of buildings) {
    const building = matchObservedBuilding(record.type, catalog);
    if (!building) {
      const key = `${record.scopeId ?? 'none'}\0${record.type}`;
      const item = unmatched.get(key) ?? {
        scopeId: record.scopeId, type: record.type, count: 0, buildingIndices: [],
      };
      item.count += 1;
      item.buildingIndices.push(record.index);
      unmatched.set(key, item);
      continue;
    }

    const constructionProgress = record.constructionProgress ?? 1;
    const key = [record.scopeId ?? 'none', building.de, record.configuredWorkers,
      record.configuredWorkersHighEducation, record.currentWorkers, record.mineQuality,
      constructionProgress].join('\0');
    const row = grouped.get(key) ?? {
      group: building.group?.de ?? '', name: building.de, count: 0,
      quality: Number.isFinite(record.mineQuality) && record.mineQuality > 0 ? record.mineQuality : 1,
      qualityEstimated: !(Number.isFinite(record.mineQuality) && record.mineQuality > 0), scopeId: record.scopeId,
      sourceGameId: record.type, observedBuildingIndices: [], currentWorkers: 0,
      configuredWorkers: 0, configuredWorkersHighEducation: 0, nominalWorkers: 0,
      constructionProgress,
      _storageBuildings: [],
    };
    row.count += 1;
    row.observedBuildingIndices.push(record.index);
    row.currentWorkers = record.currentWorkers ?? 0;
    row.configuredWorkers = record.configuredWorkers ?? building.workers ?? 0;
    row.configuredWorkersHighEducation = record.configuredWorkersHighEducation ?? 0;
    row.nominalWorkers = building.workers ?? 0;
    if (record.storages?.length) {
      row._storageBuildings.push({ index: record.index, storages: record.storages });
    }
    grouped.set(key, row);
  }

  const rows = [...grouped.values()].map(row => {
    const inventoryStores = aggregateObservedStorages(row._storageBuildings);
    const { _storageBuildings, ...clean } = row;
    void _storageBuildings;
    return inventoryStores.length ? { ...clean, inventoryStores } : clean;
  });
  return { rows, unmatched: [...unmatched.values()] };
}

export function aggregateObservedStorages(buildings) {
  const grouped = new Map();
  for (const building of buildings ?? []) for (const storage of building.storages ?? []) {
    const resourceKeys = (storage.resources ?? []).map(row => row.resource).sort();
    const key = [storage.inputFlag, storage.outputFlag, storage.selector, storage.mode,
      ...resourceKeys].join('\0');
    const aggregate = grouped.get(key) ?? {
      inputFlag: storage.inputFlag, outputFlag: storage.outputFlag,
      selector: storage.selector, mode: storage.mode, capacity: 0,
      storageCount: 0, buildingIndices: [], resources: new Map(),
    };
    aggregate.capacity += Number.isFinite(storage.capacity) ? storage.capacity : 0;
    aggregate.storageCount += 1;
    if (!aggregate.buildingIndices.includes(building.index)) aggregate.buildingIndices.push(building.index);
    for (const row of storage.resources ?? []) {
      aggregate.resources.set(row.resource,
        (aggregate.resources.get(row.resource) ?? 0) + (Number.isFinite(row.amount) ? row.amount : 0));
    }
    grouped.set(key, aggregate);
  }
  return [...grouped.values()].map(store => ({
    ...store,
    resources: [...store.resources].map(([resource, amount]) => ({ resource, amount })),
  })).sort((a, b) => b.inputFlag - a.inputFlag || b.outputFlag - a.outputFlag
    || a.mode - b.mode || a.selector - b.selector);
}

export function productionBufferStatus(row, building, settings, keyForName) {
  if (!building || !Array.isArray(row?.inventoryStores) || typeof keyForName !== 'function') return [];
  const count = row.count ?? 0;
  const configured = Number.isFinite(row.configuredWorkers)
    ? row.configuredWorkers + (row.configuredWorkersHighEducation ?? 0) : building.workers;
  const staffing = building.workers > 0 ? Math.max(0, Math.min(1, configured / building.workers)) : 1;
  const productivity = Number.isFinite(row.productivity) ? row.productivity : 1;
  const activity = staffing * productivity * (settings?.calendarFlow || 1);
  const inputRates = new Map((building.consumption ?? []).map(item => [
    keyForName(item.de ?? item.en), item.rate * count * activity,
  ]));
  const quality = row.quality ?? 1;
  const outputScale = building.usesQuality ? quality : 1;
  const outputRates = new Map((building.production ?? []).map(item => [
    keyForName(item.de ?? item.en), item.rate * count * activity * outputScale,
  ]));
  return row.inventoryStores.map(store => {
    const amount = (store.resources ?? []).reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const resources = (store.resources ?? []).map(item => {
      const dailyRate = store.selector === -1
        ? (store.inputFlag ? inputRates.get(item.resource) : outputRates.get(item.resource)) : null;
      return {
        ...item,
        dailyRate: Number.isFinite(dailyRate) ? dailyRate : null,
        daysRemaining: store.inputFlag && dailyRate > 0 ? item.amount / dailyRate : null,
      };
    });
    const outputRate = store.outputFlag ? resources.reduce((sum, item) => sum + (item.dailyRate ?? 0), 0) : 0;
    return {
      ...store,
      resources,
      amount,
      fillRatio: store.capacity > 0 ? amount / store.capacity : null,
      daysUntilFull: outputRate > 0 && Number.isFinite(store.capacity)
        ? Math.max(0, store.capacity - amount) / outputRate : null,
    };
  });
}

export function latestProductivity(records, fallback = 1) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const value = records[index]?.averageProductivity;
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

export function inferObservedHousing(citizens, buildings, isKnownHousing = () => false) {
  const residentsByBuilding = new Map();
  for (const citizen of citizens) {
    if (citizen.residenceBuildingIndex >= 0) {
      residentsByBuilding.set(citizen.residenceBuildingIndex,
        (residentsByBuilding.get(citizen.residenceBuildingIndex) ?? 0) + 1);
    }
  }
  const grouped = new Map();
  for (const building of buildings) {
    const residents = residentsByBuilding.get(building.index) ?? 0;
    if (!residents || isKnownHousing(building)) continue;
    const key = `${building.scopeId ?? 'none'}\0${building.type}`;
    const row = grouped.get(key) ?? {
      scopeId: building.scopeId, type: building.type, buildingCount: 0,
      residents: 0, maxObservedOccupancy: 0, buildingIndices: [],
    };
    row.buildingCount += 1;
    row.residents += residents;
    row.maxObservedOccupancy = Math.max(row.maxObservedOccupancy, residents);
    row.buildingIndices.push(building.index);
    grouped.set(key, row);
  }
  return [...grouped.values()];
}
