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

export function summarizeCriminalityOutliers(citizens, buildings, {
  multiplier = 5, minAbsolute = 0.1, limit = 10,
} = {}) {
  const measured = (citizens ?? []).filter(citizen => Number.isFinite(citizen.criminality));
  const averageCriminality = measured.length
    ? measured.reduce((sum, citizen) => sum + citizen.criminality, 0) / measured.length : null;
  const threshold = averageCriminality == null ? null
    : Math.max(minAbsolute, averageCriminality * multiplier);
  const buildingsByIndex = new Map((buildings ?? []).map(building => [building.index, building]));
  const outliers = threshold == null ? [] : measured
    .filter(citizen => citizen.criminality >= threshold)
    .sort((a, b) => b.criminality - a.criminality || a.index - b.index);
  const located = outliers.filter(citizen => buildingsByIndex.has(citizen.residenceBuildingIndex));
  const residents = located
    .slice(0, limit)
    .map(citizen => {
      const building = buildingsByIndex.get(citizen.residenceBuildingIndex);
      return {
        citizenIndex: citizen.index,
        citizenId: citizen.id,
        criminality: citizen.criminality,
        residenceBuildingIndex: citizen.residenceBuildingIndex,
        residence: building ? {
          index: building.index, scopeId: building.scopeId ?? null,
          type: building.type, name: building.name,
        } : null,
      };
    });
  return {
    averageCriminality, threshold, measuredCitizenCount: measured.length,
    outlierCount: outliers.length,
    locatedOutlierCount: located.length,
    unlocatedOutlierCount: outliers.length - located.length,
    residents,
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

export function buildSchematicMap(buildings, scopes, criminalityOutliers, {
  width = 760, height = 480, padding = 18, focusBuildingIndex = null,
} = {}) {
  const located = (buildings ?? []).filter(building =>
    Number.isFinite(building.x) && Number.isFinite(building.z));
  if (!located.length) return null;
  const minX = Math.min(...located.map(building => building.x));
  const maxX = Math.max(...located.map(building => building.x));
  const minZ = Math.min(...located.map(building => building.z));
  const maxZ = Math.max(...located.map(building => building.z));
  const projectX = value => padding + (width - 2 * padding) * ((value - minX) / ((maxX - minX) || 1));
  const projectY = value => height - padding
    - (height - 2 * padding) * ((value - minZ) / ((maxZ - minZ) || 1));
  const outliers = new Map((criminalityOutliers?.residents ?? [])
    .map(resident => [resident.residenceBuildingIndex, resident]));
  return {
    width, height, bounds: { minX, maxX, minZ, maxZ },
    buildings: located.map(building => ({
      ...building, mapX: projectX(building.x), mapY: projectY(building.z),
      criminalityOutlier: outliers.get(building.index) ?? null,
      focused: building.index === focusBuildingIndex,
    })),
    scopes: (scopes ?? []).filter(scope =>
      Number.isFinite(scope.position?.x) && Number.isFinite(scope.position?.z)).map(scope => ({
      ...scope, mapX: projectX(scope.position.x), mapY: projectY(scope.position.z),
    })),
  };
}

function savedVehicleMap(vehicles) {
  const map = new Map();
  for (const vehicle of vehicles ?? []) {
    if (Number.isInteger(vehicle.id)) map.set(vehicle.id, vehicle);
    else if (Number.isInteger(vehicle.index)) map.set(vehicle.index, vehicle);
  }
  return map;
}

function compactResolvedVehicle(id, vehicle) {
  if (!vehicle) return null;
  return {
    id,
    model: vehicle.model ?? null,
    name: vehicle.modelFacts?.name ?? vehicle.modelFacts?.nameStr ?? vehicle.model ?? null,
    cargo: vehicle.cargo ?? [],
  };
}

export function evaluateDistributionResourceRule(target, rule, direction, resource) {
  if (!target) return { status: 'invalid-target', resource };
  const candidates = [];
  for (const storage of target.storages ?? []) {
    const entry = storage.resources?.find(item => item.resource === resource);
    if (!entry) continue;
    candidates.push({ storage, entry, controls: storage.controls ?? [] });
  }
  if (!candidates.length) return { status: 'resource-not-directly-stored', resource };

  let selected = candidates;
  if (selected.every(candidate => candidate.storage.mode === 17)) {
    const explicit = selected.filter(candidate => candidate.controls.some(item =>
      item.resource === resource && item.amount > 0));
    if (explicit.length) selected = explicit;
    else {
      const unspecialized = selected.filter(candidate =>
        !candidate.controls.some(item => item.amount > 0));
      if (unspecialized.length) selected = unspecialized;
    }
  }

  const roles = new Map();
  for (const candidate of selected) {
    const key = `${candidate.storage.selector}/${candidate.storage.mode}`;
    const group = roles.get(key) ?? [];
    group.push(candidate);
    roles.set(key, group);
  }
  if (roles.size !== 1) {
    return { status: 'ambiguous-storage-role', resource, roles: [...roles.keys()] };
  }

  let amount = 0;
  let capacity = 0;
  const storageIndexes = [];
  for (const candidate of [...roles.values()][0]) {
    const { storage, controls } = candidate;
    amount += candidate.entry.amount;
    storageIndexes.push(storage.storageIndex);
    const allocationApplies = storage.selector === -1 && storage.mode <= 6;
    const positiveTotal = allocationApplies ? controls.reduce((sum, item) =>
      sum + (Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0), 0) : 0;
    if (allocationApplies && positiveTotal > 0) {
      const resourceShare = controls.reduce((sum, item) =>
        sum + (item.resource === resource && Number.isFinite(item.amount) && item.amount > 0
          ? item.amount : 0), 0);
      capacity += storage.capacity * resourceShare;
    } else capacity += storage.capacity;
  }
  if (!Number.isFinite(amount) || !Number.isFinite(capacity) || capacity <= 0) {
    return { status: 'no-finite-capacity', resource, amount, capacity, storageIndexes };
  }
  const ratio = amount / capacity;
  return {
    status: 'resolved', resource, amount, capacity, ratio, threshold: rule.threshold,
    conditionMet: direction === 'load' ? ratio > rule.threshold : ratio < rule.threshold,
    storageIndexes,
  };
}

export function summarizeDistributionOffices(buildings, vehicles = []) {
  const buildingMap = new Map((buildings ?? []).map(building => [building.index, building]));
  const vehicleMap = savedVehicleMap(vehicles);
  let invalidTargetReferenceCount = 0;
  let invalidVehicleReferenceCount = 0;
  const offices = (buildings ?? []).filter(building => building.distributionKind).map(building => {
    const associatedVehicles = (building.associatedVehicleIds ?? []).map(id => {
      const resolved = compactResolvedVehicle(id, vehicleMap.get(id));
      if (!resolved) invalidVehicleReferenceCount += 1;
      return resolved ?? { id, model: null, name: null, cargo: [] };
    });
    const assignments = (building.distributionAssignments ?? []).map(assignment => {
      const targetBuilding = buildingMap.get(assignment.targetBuildingIndex);
      if (!targetBuilding) invalidTargetReferenceCount += 1;
      const thresholdStates = [];
      for (const direction of ['load', 'unload']) {
        const rule = assignment[direction];
        if (!rule.enabled) continue;
        const resources = [...new Set(rule.resources ?? [])];
        if (!resources.length) {
          thresholdStates.push({ direction, status: 'unrestricted', threshold: rule.threshold });
          continue;
        }
        for (const resource of resources) {
          thresholdStates.push({
            direction,
            ...evaluateDistributionResourceRule(targetBuilding, rule, direction, resource),
          });
        }
      }
      return {
        targetBuildingIndex: assignment.targetBuildingIndex,
        target: targetBuilding ? {
          index: targetBuilding.index, type: targetBuilding.type,
          name: targetBuilding.name, scopeId: targetBuilding.scopeId ?? null,
        } : null,
        load: assignment.load,
        unload: assignment.unload,
        inactive: !assignment.load.enabled && !assignment.unload.enabled,
        thresholdStates,
      };
    });
    const thresholdStates = assignments.flatMap(assignment => assignment.thresholdStates);
    return {
      buildingIndex: building.index, name: building.name, type: building.type,
      scopeId: building.scopeId ?? null, kind: building.distributionKind,
      associatedVehicleIds: building.associatedVehicleIds ?? [], associatedVehicles, assignments,
      configuredWithoutFleet: assignments.length > 0 && !(building.associatedVehicleIds ?? []).length,
      operational: {
        inactiveAssignmentCount: assignments.filter(assignment => assignment.inactive).length,
        pickupConditionMetCount: thresholdStates.filter(state =>
          state.direction === 'load' && state.status === 'resolved' && state.conditionMet).length,
        deliveryConditionMetCount: thresholdStates.filter(state =>
          state.direction === 'unload' && state.status === 'resolved' && state.conditionMet).length,
        unresolvedThresholdCount: thresholdStates.filter(state =>
          !['resolved', 'unrestricted'].includes(state.status)).length,
        unrestrictedRuleCount: thresholdStates.filter(state => state.status === 'unrestricted').length,
      },
    };
  });
  const assignments = offices.flatMap(office => office.assignments);
  const thresholdStates = assignments.flatMap(assignment => assignment.thresholdStates);
  const resolvedThresholds = thresholdStates.filter(state => state.status === 'resolved');
  const unresolvedThresholds = thresholdStates.filter(state =>
    !['resolved', 'unrestricted'].includes(state.status));
  return {
    offices,
    summary: {
      officeCount: offices.length,
      roadCount: offices.filter(office => office.kind === 'road').length,
      railCount: offices.filter(office => office.kind === 'rail').length,
      targetCount: assignments.length,
      associatedVehicleReferenceCount: offices.reduce((sum, office) =>
        sum + office.associatedVehicleIds.length, 0),
      officesWithoutTargets: offices.filter(office => !office.assignments.length).length,
      officesWithoutAssociatedVehicles: offices.filter(office => !office.associatedVehicleIds.length).length,
      configuredWithoutFleetOfficeCount: offices.filter(office => office.configuredWithoutFleet).length,
      neitherActionCount: assignments.filter(assignment =>
        !assignment.load.enabled && !assignment.unload.enabled).length,
      unrestrictedRuleCount: thresholdStates.filter(state => state.status === 'unrestricted').length,
      resolvedThresholdCount: resolvedThresholds.length,
      conditionMetCount: resolvedThresholds.filter(state => state.conditionMet).length,
      conditionNotMetCount: resolvedThresholds.filter(state => !state.conditionMet).length,
      pickupConditionMetCount: resolvedThresholds.filter(state =>
        state.direction === 'load' && state.conditionMet).length,
      deliveryConditionMetCount: resolvedThresholds.filter(state =>
        state.direction === 'unload' && state.conditionMet).length,
      unresolvedThresholdCount: unresolvedThresholds.length,
      resourceNotDirectlyStoredCount: unresolvedThresholds.filter(state =>
        state.status === 'resource-not-directly-stored').length,
      ambiguousStorageRoleCount: unresolvedThresholds.filter(state =>
        state.status === 'ambiguous-storage-role').length,
      invalidTargetReferenceCount,
      invalidVehicleReferenceCount,
    },
  };
}

export function summarizeVehicleLines(lines, vehicles = [], buildings = []) {
  const vehicleMap = savedVehicleMap(vehicles);
  const buildingMap = new Map((buildings ?? []).map(building => [building.index, building]));
  let invalidVehicleReferenceCount = 0;
  let invalidStopReferenceCount = 0;
  let invalidOperationalBuildingReferenceCount = 0;
  const lineAssignmentCounts = new Map();
  for (const line of lines ?? []) for (const id of line.vehicleIds ?? []) {
    lineAssignmentCounts.set(id, (lineAssignmentCounts.get(id) ?? 0) + 1);
  }
  const buildingRef = index => {
    if (!Number.isInteger(index) || index < 0) return null;
    const building = buildingMap.get(index);
    if (!building) {
      invalidOperationalBuildingReferenceCount += 1;
      return { buildingIndex: index, building: null };
    }
    return {
      buildingIndex: index,
      building: { index, type: building.type, name: building.name, scopeId: building.scopeId ?? null },
    };
  };
  let routeSequenceMatchCount = 0;
  let routeSequenceMismatchCount = 0;
  const resolvedLines = (lines ?? []).map(line => {
    const assignedVehicles = (line.vehicleIds ?? []).map(id => {
      const record = vehicleMap.get(id);
      const resolved = compactResolvedVehicle(id, record);
      if (!resolved) invalidVehicleReferenceCount += 1;
      if (!resolved) return { id, model: null, name: null, cargo: [], operational: null };
      const routeTargets = (record.routeTargetBuildingIndices ?? []).map(buildingRef);
      const routeMatchesLine = Array.isArray(record.routeTargetBuildingIndices)
        && record.routeTargetBuildingIndices.length === (line.stopIds ?? []).length
        && record.routeTargetBuildingIndices.every((target, index) => target === line.stopIds[index]);
      if (routeMatchesLine) routeSequenceMatchCount += 1;
      else routeSequenceMismatchCount += 1;
      const cursor = record.currentScheduleCursor;
      const validCursor = record.hasValidScheduleCursor === true
        || (Number.isInteger(cursor) && cursor >= 0 && cursor < routeTargets.length);
      return {
        ...resolved,
        operational: {
          parentVehicleId: record.parentVehicleId ?? -1,
          schedulePairCount: record.schedulePairCount ?? 0,
          routeTargets,
          currentScheduleCursor: cursor ?? -1,
          hasValidScheduleCursor: validCursor,
          currentScheduleTarget: validCursor ? routeTargets[cursor] : null,
          routeMatchesLine,
          currentLineIntervalRaw: Number.isFinite(record.currentLineIntervalRaw)
            ? record.currentLineIntervalRaw : null,
          currentBuilding: buildingRef(record.currentBuildingIndex),
          homeWorkplace: buildingRef(record.homeWorkplaceBuildingIndex),
          stationBuilding: buildingRef(record.stationBuildingIndex),
          stationEnteringBuilding: buildingRef(record.stationEnteringBuildingIndex),
          shouldExitStationTarget: buildingRef(record.shouldExitStationTargetBuildingIndex),
          movingInsideBuilding: buildingRef(record.movingInsideBuildingIndex),
        },
      };
    });
    const stops = (line.stopIds ?? []).map((buildingIndex, index) => {
      const resolved = buildingIndex >= 0 ? buildingMap.get(buildingIndex) : null;
      if (buildingIndex >= 0 && !resolved) invalidStopReferenceCount += 1;
      return {
        buildingIndex,
        building: resolved ? {
          index: resolved.index, type: resolved.type, name: resolved.name,
          scopeId: resolved.scopeId ?? null,
        } : null,
        observedInterval: line.observedIntervals?.[index] ?? null,
        primary: line.schedules?.[index]?.primary ?? null,
        secondary: line.schedules?.[index]?.secondary ?? null,
      };
    });
    const intervals = line.observedIntervals ?? [];
    const completeObservedCycle = line.stopIds?.length > 0
      && intervals.length === line.stopIds.length
      && intervals.every(value => Number.isFinite(value) && value > 0)
      ? intervals.reduce((sum, value) => sum + value, 0) : null;
    const finiteIntervals = intervals.filter(Number.isFinite);
    return {
      ...line,
      assignedVehicles,
      stops,
      completeObservedCycle,
      largestObservedInterval: finiteIntervals.length ? Math.max(...finiteIntervals) : null,
    };
  });
  return {
    lines: resolvedLines,
    summary: {
      lineCount: resolvedLines.length,
      assignedLineCount: resolvedLines.filter(line => line.vehicleIds?.length).length,
      vehicleReferenceCount: resolvedLines.reduce((sum, line) => sum + (line.vehicleIds?.length ?? 0), 0),
      stopReferenceCount: resolvedLines.reduce((sum, line) => sum + (line.stopIds?.length ?? 0), 0),
      nullStopReferenceCount: resolvedLines.reduce((sum, line) =>
        sum + (line.stopIds ?? []).filter(id => id < 0).length, 0),
      completeObservedCycleCount: resolvedLines.filter(line => line.completeObservedCycle != null).length,
      validScheduleCursorVehicleCount: resolvedLines.reduce((sum, line) => sum
        + line.assignedVehicles.filter(vehicle => vehicle.operational?.hasValidScheduleCursor).length, 0),
      positiveCurrentIntervalVehicleCount: resolvedLines.reduce((sum, line) => sum
        + line.assignedVehicles.filter(vehicle => vehicle.operational?.currentLineIntervalRaw > 0).length, 0),
      routeSequenceMatchCount,
      routeSequenceMismatchCount,
      duplicateVehicleAssignmentCount: [...lineAssignmentCounts.values()].filter(count => count > 1).length,
      invalidVehicleReferenceCount,
      invalidStopReferenceCount,
      invalidOperationalBuildingReferenceCount,
    },
  };
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

export function groupObservedProduction(buildings, catalog, assetCatalog = []) {
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
      _throughputRecords: [],
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
    const asset = matchObservedBuilding(record.type, assetCatalog, entry => entry.id);
    const firstOutput = Object.entries(asset?.production ?? {})[0] ?? null;
    const rollingValues = ['currentRate', 'previousQuantity', 'partialQuantity', 'dayProgress']
      .map(key => record.polymorphicRolling?.[key]);
    if (record.savedTypePlusOne === 7 && asset?.types?.includes('TYPE_FACTORY')
        && firstOutput && rollingValues.every(Number.isFinite)
        && record.polymorphicRolling.dayProgress >= 0 && record.polymorphicRolling.dayProgress <= 1) {
      row._throughputRecords.push({ resource: firstOutput[0], ...record.polymorphicRolling });
    }
    grouped.set(key, row);
  }

  const rows = [...grouped.values()].map(row => {
    const inventoryStores = aggregateObservedStorages(row._storageBuildings);
    const throughput = aggregateFirstOutputThroughput(row._throughputRecords);
    const { _storageBuildings, _throughputRecords, ...clean } = row;
    void _storageBuildings; void _throughputRecords;
    return {
      ...clean,
      ...(inventoryStores.length ? { inventoryStores } : {}),
      ...(throughput ? { firstOutputThroughput: throughput } : {}),
    };
  });
  return { rows, unmatched: [...unmatched.values()] };
}

function aggregateFirstOutputThroughput(records) {
  if (!records?.length) return null;
  const resource = records[0].resource;
  if (records.some(record => record.resource !== resource)) return null;
  return {
    resource,
    instanceCount: records.length,
    currentRate: records.reduce((sum, record) => sum + record.currentRate, 0),
    previousQuantity: records.reduce((sum, record) => sum + record.previousQuantity, 0),
    partialQuantity: records.reduce((sum, record) => sum + record.partialQuantity, 0),
    dayProgressMin: Math.min(...records.map(record => record.dayProgress)),
    dayProgressMax: Math.max(...records.map(record => record.dayProgress)),
  };
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

export function productionBufferAlerts(rows, catalog, settings, keyForName, thresholdDays = 1) {
  const alerts = [];
  for (const row of rows ?? []) {
    if ((row.constructionProgress ?? 1) < 1 || !(row.count > 0)) continue;
    const building = catalog.find(item => item.de === row.name);
    if (!building) continue;
    for (const store of productionBufferStatus(row, building, settings, keyForName)) {
      for (const resource of store.resources) {
        if (store.inputFlag && Number.isFinite(resource.daysRemaining)
            && resource.daysRemaining < thresholdDays) {
          alerts.push({
            severity: 'warning', scopeId: row.scopeId ?? null, metric: 'buffer.input',
            observed: resource.daysRemaining, building: row.name, resource: resource.resource,
            evidence: 'buildings_game.bin + configured rate',
          });
        }
      }
      if (store.outputFlag && Number.isFinite(store.daysUntilFull)
          && store.daysUntilFull < thresholdDays) {
        alerts.push({
          severity: 'warning', scopeId: row.scopeId ?? null, metric: 'buffer.output',
          observed: store.daysUntilFull, building: row.name, resource: null,
          evidence: 'buildings_game.bin + configured rate',
        });
      }
    }
  }
  return alerts.sort((a, b) => a.observed - b.observed
    || String(a.building).localeCompare(String(b.building)) || a.metric.localeCompare(b.metric));
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
