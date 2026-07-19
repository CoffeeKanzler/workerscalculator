const sum = (values) => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);

function weightedAverage(areas, key) {
  const eligible = areas.filter(area => Number.isFinite(area.population)
    && area.population > 0 && Number.isFinite(area[key]));
  const population = sum(eligible.map(area => area.population));
  return population ? sum(eligible.map(area => area[key] * area.population)) / population : null;
}

function productionByScope(rows = []) {
  const scopes = new Map();
  for (const row of rows) {
    const key = Number.isInteger(row.scopeId) ? row.scopeId : null;
    const item = scopes.get(key) ?? {
      configuredIndustryWorkers: 0, currentIndustryWorkers: 0,
      productionBuildingCount: 0, constructionBuildingCount: 0,
    };
    if ((row.constructionProgress ?? 1) < 1) {
      item.constructionBuildingCount += row.count ?? 0;
      scopes.set(key, item);
      continue;
    }
    item.configuredIndustryWorkers += ((row.configuredWorkers ?? 0)
      + (row.configuredWorkersHighEducation ?? 0)) * (row.count ?? 0);
    item.currentIndustryWorkers += (row.currentWorkers ?? 0) * (row.count ?? 0);
    item.productionBuildingCount += row.count ?? 0;
    scopes.set(key, item);
  }
  return scopes;
}

function actualProjection(observed = {}) {
  const production = productionByScope(observed.productionRows);
  const scopes = new Map((observed.scopes ?? []).map(scope => [scope.id, scope]));
  const regionalCrime = new Map((observed.regionalCrime ?? []).map(scope => [scope.scopeId, scope.crime]));
  const ids = new Set([...scopes.keys(), ...production.keys(), ...regionalCrime.keys()]);
  const areas = [...ids].map(scopeId => {
    const scope = scopes.get(scopeId);
    const citizens = scope?.citizens ?? null;
    const industry = production.get(scopeId) ?? {};
    const crime = regionalCrime.get(scopeId);
    return {
      scopeId,
      name: scope?.name ?? (scopeId === null ? 'Unassigned' : `Area ${scopeId}`),
      population: citizens?.residents ?? null,
      adults: citizens?.adults ?? null,
      productivity: citizens?.productivity ?? null,
      health: citizens?.health ?? null,
      criminality: citizens?.criminality ?? null,
      minorCrimes: crime?.minorCrimes ?? null,
      mediumCrimes: crime?.mediumCrimes ?? null,
      seriousCrimes: crime?.seriousCrimes ?? null,
      food: citizens?.food ?? null,
      happiness: citizens?.happiness ?? null,
      loyalty: citizens?.loyalty ?? null,
      configuredIndustryWorkers: industry.configuredIndustryWorkers ?? 0,
      currentIndustryWorkers: industry.currentIndustryWorkers ?? 0,
      productionBuildingCount: industry.productionBuildingCount ?? 0,
      constructionBuildingCount: industry.constructionBuildingCount ?? 0,
    };
  });
  const populated = areas.filter(area => Number.isFinite(area.population));
  const population = sum(populated.map(area => area.population));
  const liveQueue = observed.liveQueue?.available ? observed.liveQueue : null;
  return {
    totals: {
      population,
      occupiedNamedAreas: (observed.scopes ?? []).length,
      liveBuildingCount: observed.liveBuildingCount ?? null,
      configuredIndustryWorkers: sum(areas.map(area => area.configuredIndustryWorkers)),
      currentIndustryWorkers: sum(areas.map(area => area.currentIndustryWorkers)),
      productivity: weightedAverage(populated, 'productivity'),
      health: weightedAverage(populated, 'health'),
      criminality: weightedAverage(populated, 'criminality'),
      happiness: weightedAverage(populated, 'happiness'),
      loyalty: weightedAverage(populated, 'loyalty'),
      realizedProduction: observed.realizedProduction ?? null,
      medicalEmergencies: liveQueue?.medicalEmergencies ?? null,
      activeCrimes: liveQueue?.crimes ?? null,
      awaitingPolice: liveQueue?.awaitingPolice ?? null,
      underInvestigation: liveQueue?.underInvestigation ?? null,
      atCourt: liveQueue?.atCourt ?? null,
    },
    areas,
    evidence: { sourceStatus: observed.sourceStatus ?? {} },
  };
}

function observedMetadata(info = {}) {
  return {
    scopes: info.scopes ?? [],
    productionRows: info.observedProductionRows ?? [],
    liveBuildingCount: info.observedBuildings?.length ?? info.buildingCount ?? null,
    sourceStatus: info.sourceStatus ?? {},
    regionalCrime: info.operationalServices?.regional ?? [],
    liveQueue: info.operationalServices?.republic?.liveQueue ?? null,
  };
}

function sameRepublicSource(current = {}, baseline = {}) {
  const currentPath = current.header?.savePath;
  const baselinePath = baseline.header?.savePath;
  if (currentPath && baselinePath) return currentPath === baselinePath;
  return !!current.sourceName && current.sourceName === baseline.sourceName;
}

const CRIME_HISTORY_KEYS = ['minorCrimes', 'mediumCrimes', 'seriousCrimes'];
const LIVE_QUEUE_KEYS = ['medicalEmergencies', 'activeCrimes', 'awaitingPolice',
  'underInvestigation', 'atCourt'];
const SNAPSHOT_RATE_KEYS = ['population', ...CRIME_HISTORY_KEYS];

function latestCrimeHistory(records = []) {
  const record = records.findLast?.(item => CRIME_HISTORY_KEYS.some(key => Number.isFinite(item?.[key])))
    ?? [...records].reverse().find(item => CRIME_HISTORY_KEYS.some(key => Number.isFinite(item?.[key])));
  return Object.fromEntries(CRIME_HISTORY_KEYS.map(key => [key,
    Number.isFinite(record?.[key]) ? record[key] : null]));
}

function latestDatedStatsRecord(records = []) {
  return records.findLast?.(record => Number.isFinite(record?.year) && record.year > 0
    && Number.isFinite(record?.day))
    ?? [...records].reverse().find(record => Number.isFinite(record?.year) && record.year > 0
      && Number.isFinite(record?.day)) ?? null;
}

export function compareObservedSnapshots(currentInfo, baselineInfo, currentStats = [], baselineStats = []) {
  const current = actualProjection(observedMetadata(currentInfo));
  const baseline = actualProjection(observedMetadata(baselineInfo));
  Object.assign(current.totals, latestCrimeHistory(currentStats));
  Object.assign(baseline.totals, latestCrimeHistory(baselineStats));
  current.totals.statsRecordCount = currentStats.length;
  baseline.totals.statsRecordCount = baselineStats.length;
  const currentDate = latestDatedStatsRecord(currentStats);
  const baselineDate = latestDatedStatsRecord(baselineStats);
  const keys = ['population', 'liveBuildingCount', 'configuredIndustryWorkers',
    'currentIndustryWorkers', 'productivity', 'health', 'criminality',
    'statsRecordCount', ...CRIME_HISTORY_KEYS, ...LIVE_QUEUE_KEYS];
  const deltas = Object.fromEntries(keys.map(key => [key,
    differenceValue(current.totals, baseline.totals, key)]));
  const sameRepublic = sameRepublicSource(currentInfo, baselineInfo);
  const dates = {
    current: currentDate ? { year: currentDate.year, day: currentDate.day } : null,
    baseline: baselineDate ? { year: baselineDate.year, day: baselineDate.day } : null,
  };
  const elapsedGameDays = sameRepublic && dates.current && dates.baseline
    ? (dates.current.year - dates.baseline.year) * 365 + dates.current.day - dates.baseline.day
    : null;
  const ratesPer30Days = elapsedGameDays > 0
    ? Object.fromEntries(SNAPSHOT_RATE_KEYS.flatMap(key => Number.isFinite(deltas[key])
      ? [[key, deltas[key] * 30 / elapsedGameDays]] : []))
    : {};
  if (!sameRepublic) {
    return { sameRepublic, current, baseline, deltas, dates, elapsedGameDays, ratesPer30Days, areas: [] };
  }

  const currentAreas = new Map(current.areas.map(area => [area.scopeId, area]));
  const baselineAreas = new Map(baseline.areas.map(area => [area.scopeId, area]));
  const areaKeys = ['population', 'configuredIndustryWorkers', 'currentIndustryWorkers',
    'productivity', 'health', 'criminality', ...CRIME_HISTORY_KEYS];
  const areas = [...new Set([...currentAreas.keys(), ...baselineAreas.keys()])].map(scopeId => {
    const currentArea = currentAreas.get(scopeId) ?? null;
    const baselineArea = baselineAreas.get(scopeId) ?? null;
    return {
      scopeId,
      name: currentArea?.name ?? baselineArea?.name,
      current: currentArea,
      baseline: baselineArea,
      deltas: Object.fromEntries(areaKeys.map(key => [key,
        differenceValue(currentArea, baselineArea, key)])),
    };
  });
  return { sameRepublic, current, baseline, deltas, dates, elapsedGameDays, ratesPer30Days, areas };
}

function differenceValue(plan, actual, key) {
  if (!Number.isFinite(plan?.[key]) || !Number.isFinite(actual?.[key])) return null;
  return plan[key] - actual[key];
}

export function buildRepublicModel({ observed = {}, planned = {} }) {
  const actual = actualProjection(observed);
  const plan = {
    totals: { ...(planned.totals ?? {}) },
    areas: (planned.areas ?? []).map(area => ({ ...area })),
    evidence: { kind: 'editable-plan' },
  };
  const actualAreas = new Map(actual.areas.map(area => [area.scopeId, area]));
  const planAreas = new Map(plan.areas.map(area => [area.scopeId, area]));
  const comparable = ['population', 'configuredIndustryWorkers', 'netWorkers', 'power', 'water', 'waste'];
  const differenceAreas = [...new Set([...actualAreas.keys(), ...planAreas.keys()])].map(scopeId => {
    const result = { scopeId, name: planAreas.get(scopeId)?.name ?? actualAreas.get(scopeId)?.name };
    for (const key of comparable) result[key] = differenceValue(planAreas.get(scopeId), actualAreas.get(scopeId), key);
    result.currentIndustryWorkers = null;
    result.realizedProduction = null;
    return result;
  });
  const differenceTotals = {};
  for (const key of comparable) differenceTotals[key] = differenceValue(plan.totals, actual.totals, key);
  differenceTotals.currentIndustryWorkers = null;
  differenceTotals.realizedProduction = null;
  return {
    actual,
    plan,
    difference: {
      totals: differenceTotals,
      areas: differenceAreas,
      evidence: { kind: 'plan-minus-actual' },
    },
  };
}

export function republicAlerts(model) {
  const alerts = [];
  const add = (severity, area, metric, observed, threshold, evidence) => alerts.push({
    severity, scopeId: area?.scopeId ?? null, scopeName: area?.name ?? '',
    metric, observed, threshold, evidence,
  });

  for (const area of model.actual.areas) {
    if (area.configuredIndustryWorkers > 0) {
      const ratio = area.currentIndustryWorkers / area.configuredIndustryWorkers;
      if (ratio < 0.4) add('critical', area, 'staffing', ratio, 0.4, 'buildings_game.bin');
      else if (ratio < 0.7) add('warning', area, 'staffing', ratio, 0.7, 'buildings_game.bin');
    }
    if (Number.isFinite(area.health) && area.health < 0.6) {
      add('critical', area, 'health', area.health, 0.6, 'workers.bin');
    } else if (Number.isFinite(area.health) && area.health < 0.75) {
      add('warning', area, 'health', area.health, 0.75, 'workers.bin');
    }
    if (Number.isFinite(area.food) && area.food < 0.9) {
      add('warning', area, 'food', area.food, 0.9, 'workers.bin');
    }
  }
  for (const area of model.plan.areas) {
    if ((area.unresolvedBuildingCount ?? 0) > 0) {
      add('warning', area, 'coverage.workshop', area.unresolvedBuildingCount, 0, 'Workshop catalog');
    }
    if (area.workforceLinked !== false && Number.isFinite(area.netWorkers) && area.netWorkers < 0) {
      add('critical', area, 'netWorkers', area.netWorkers, 0, 'editable plan');
    }
  }
  if (Number.isFinite(model.plan.totals.netWorkers) && model.plan.totals.netWorkers < 0) {
    add('critical', null, 'netWorkers', model.plan.totals.netWorkers, 0, 'editable plan');
  }
  const status = model.actual.evidence.sourceStatus;
  for (const key of ['workers', 'buildings']) {
    if (status[key] === 'missing' || status[key] === 'failed') {
      add('warning', null, `coverage.${key}`, null, null, key);
    }
  }
  const order = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]
    || a.scopeName.localeCompare(b.scopeName) || a.metric.localeCompare(b.metric));
}

export function visibleRepublicAlerts(alerts, { expanded = false, limit = 8 } = {}) {
  const source = Array.isArray(alerts) ? alerts : [];
  const visible = expanded ? source : source.slice(0, Math.max(0, limit));
  return { visible, total: source.length, hiddenCount: source.length - visible.length };
}

export function alertCategory(alert) {
  const metric = String(alert?.metric ?? '');
  if (metric === 'staffing' || metric === 'netWorkers') return 'workforce';
  if (metric === 'health' || metric === 'food') return 'needs';
  if (metric.startsWith('buffer.')) return 'buffers';
  if (metric.startsWith('coverage.')) return 'coverage';
  return 'other';
}

export function filterRepublicAlerts(alerts, category = 'all') {
  const source = Array.isArray(alerts) ? alerts : [];
  return category === 'all' ? source : source.filter(alert => alertCategory(alert) === category);
}
