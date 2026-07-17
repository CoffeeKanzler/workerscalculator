const sum = (values) => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);

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
  const ids = new Set([...scopes.keys(), ...production.keys()]);
  const areas = [...ids].map(scopeId => {
    const scope = scopes.get(scopeId);
    const citizens = scope?.citizens ?? null;
    const industry = production.get(scopeId) ?? {};
    return {
      scopeId,
      name: scope?.name ?? (scopeId === null ? 'Unassigned' : `Area ${scopeId}`),
      population: citizens?.residents ?? null,
      adults: citizens?.adults ?? null,
      productivity: citizens?.productivity ?? null,
      health: citizens?.health ?? null,
      criminality: citizens?.criminality ?? null,
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
  const weightedProductivity = sum(populated.map(area => area.productivity * area.population));
  return {
    totals: {
      population,
      occupiedNamedAreas: (observed.scopes ?? []).length,
      liveBuildingCount: observed.liveBuildingCount ?? null,
      configuredIndustryWorkers: sum(areas.map(area => area.configuredIndustryWorkers)),
      currentIndustryWorkers: sum(areas.map(area => area.currentIndustryWorkers)),
      productivity: population ? weightedProductivity / population : null,
      realizedProduction: observed.realizedProduction ?? null,
    },
    areas,
    evidence: { sourceStatus: observed.sourceStatus ?? {} },
  };
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
