import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRepublicModel, compareObservedSnapshots, republicAlerts, visibleRepublicAlerts,
  alertCategory, filterRepublicAlerts,
} from '../js/republic.js';

const observed = {
  scopes: [{
    id: 4, name: 'Kohleburg',
    citizens: { residents: 1000, adults: 720, productivity: 0.91, health: 0.82, food: 0.95 },
  }],
  productionRows: [{ scopeId: 4, count: 1, configuredWorkers: 100, currentWorkers: 70 }],
  liveBuildingCount: 30,
  sourceStatus: { workers: 'exact', buildings: 'exact' },
};
const planned = {
  totals: { population: 1100, configuredIndustryWorkers: 120, netWorkers: 50 },
  areas: [{ scopeId: 4, name: 'Kohleburg', population: 1100, configuredIndustryWorkers: 120, netWorkers: 50 }],
};

test('attention presentation reports every hidden alert and expands without loss', () => {
  const alerts = Array.from({ length: 11 }, (_, index) => ({ metric: `metric.${index}` }));
  const collapsed = visibleRepublicAlerts(alerts);
  assert.equal(collapsed.total, 11);
  assert.equal(collapsed.hiddenCount, 3);
  assert.deepEqual(collapsed.visible.map(alert => alert.metric), alerts.slice(0, 8).map(alert => alert.metric));
  const expanded = visibleRepublicAlerts(alerts, { expanded: true });
  assert.equal(expanded.hiddenCount, 0);
  assert.deepEqual(expanded.visible, alerts);
});

test('attention categories preserve every alert and isolate player-facing tracks', () => {
  const alerts = [
    { metric: 'staffing' }, { metric: 'netWorkers' }, { metric: 'health' },
    { metric: 'buffer.input' }, { metric: 'coverage.workshop' },
  ];
  assert.deepEqual(alerts.map(alertCategory), [
    'workforce', 'workforce', 'needs', 'buffers', 'coverage',
  ]);
  assert.deepEqual(filterRepublicAlerts(alerts, 'workforce'), alerts.slice(0, 2));
  assert.deepEqual(filterRepublicAlerts(alerts, 'all'), alerts);
});

test('projects actual plan and evidence-aware difference', () => {
  const model = buildRepublicModel({ observed, planned });
  assert.equal(model.actual.totals.population, 1000);
  assert.equal(model.actual.totals.configuredIndustryWorkers, 100);
  assert.equal(model.actual.totals.currentIndustryWorkers, 70);
  assert.equal(model.actual.totals.liveBuildingCount, 30);
  assert.equal(model.plan.totals.configuredIndustryWorkers, 120);
  assert.equal(model.difference.totals.configuredIndustryWorkers, 20);
  assert.equal(model.difference.totals.population, 100);
  assert.equal(model.difference.totals.realizedProduction, null);
  assert.equal(model.difference.totals.currentIndustryWorkers, null);
});

test('alerts prioritize critically understaffed areas and plan deficits', () => {
  const model = buildRepublicModel({
    observed: {
      ...observed,
      productionRows: [{ scopeId: 4, count: 1, configuredWorkers: 100, currentWorkers: 30 }],
    },
    planned: { ...planned, totals: { ...planned.totals, netWorkers: -10 } },
  });
  const alerts = republicAlerts(model);
  assert.equal(alerts[0].severity, 'critical');
  assert.ok(alerts.some(alert => alert.metric === 'staffing'));
  assert.ok(alerts.some(alert => alert.metric === 'netWorkers'));
});

test('missing citizen source produces coverage warning, not fake health failure', () => {
  const model = buildRepublicModel({
    observed: { scopes: [], productionRows: [], sourceStatus: { workers: 'missing', buildings: 'exact' } },
    planned: { totals: {}, areas: [] },
  });
  const alerts = republicAlerts(model);
  assert.deepEqual(alerts.map(alert => alert.metric), ['coverage.workers']);
});

test('production-only scope does not invent a local residential workforce deficit', () => {
  const model = buildRepublicModel({
    observed: { scopes: [], productionRows: [], sourceStatus: {} },
    planned: {
      totals: { netWorkers: 50 },
      areas: [{ scopeId: 9, name: 'Steel works', netWorkers: -200, workforceLinked: false }],
    },
  });
  assert.ok(!republicAlerts(model).some(alert => alert.metric === 'netWorkers'));
});

test('unresolved Workshop buildings surface as an area coverage warning', () => {
  const model = buildRepublicModel({
    observed: { scopes: [], productionRows: [], sourceStatus: {} },
    planned: {
      totals: {},
      areas: [{ scopeId: 40, name: 'Mühlheim', unresolvedBuildingCount: 48 }],
    },
  });
  const alert = republicAlerts(model).find(item => item.metric === 'coverage.workshop');
  assert.deepEqual(alert && {
    severity: alert.severity, scopeId: alert.scopeId, observed: alert.observed,
  }, { severity: 'warning', scopeId: 40, observed: 48 });
});

test('buildings under construction are not reported as critically understaffed', () => {
  const model = buildRepublicModel({
    observed: {
      scopes: [{ id: 8, name: 'New works', citizens: null }],
      productionRows: [{ scopeId: 8, count: 2, configuredWorkers: 100,
        currentWorkers: 0, constructionProgress: 0.4 }],
      sourceStatus: { buildings: 'exact' },
    },
    planned: { totals: {}, areas: [] },
  });
  assert.equal(model.actual.areas[0].constructionBuildingCount, 2);
  assert.equal(model.actual.areas[0].configuredIndustryWorkers, 0);
  assert.ok(!republicAlerts(model).some(alert => alert.metric === 'staffing'));
});

test('compares observed totals and stable areas current minus baseline', () => {
  const baseline = {
    sourceName: 'Republic', header: { savePath: 'save/republic' }, buildingCount: 30,
    scopes: [{ id: 4, name: 'Kohleburg', citizens: {
      residents: 1000, productivity: 0.8, health: 0.75, criminality: 0.01,
    } }],
    operationalServices: {
      regional: [{ scopeId: 4, crime: {
        minorCrimes: 10, mediumCrimes: 3, seriousCrimes: 1,
      } }],
      republic: { liveQueue: {
        available: true, medicalEmergencies: 1, crimes: 4,
        awaitingPolice: 2, underInvestigation: 1, atCourt: 1,
      } },
    },
    observedProductionRows: [{ scopeId: 4, count: 1, configuredWorkers: 100, currentWorkers: 60 }],
  };
  const current = {
    ...baseline, buildingCount: 35,
    scopes: [{ id: 4, name: 'Kohleburg', citizens: {
      residents: 1120, productivity: 0.9, health: 0.8, criminality: 0.015,
    } }],
    operationalServices: {
      regional: [{ scopeId: 4, crime: {
        minorCrimes: 13, mediumCrimes: 5, seriousCrimes: 1,
      } }],
      republic: { liveQueue: {
        available: true, medicalEmergencies: 3, crimes: 7,
        awaitingPolice: 4, underInvestigation: 2, atCourt: 1,
      } },
    },
    observedProductionRows: [{ scopeId: 4, count: 1, configuredWorkers: 120, currentWorkers: 90 }],
  };
  const currentStats = [
    { year: 1980, minorCrimes: 22, mediumCrimes: 7, seriousCrimes: 3 },
    { current: true },
  ];
  const baselineStats = [{ year: 1979, minorCrimes: 18, mediumCrimes: 4, seriousCrimes: 2 }];
  const comparison = compareObservedSnapshots(current, baseline, currentStats, baselineStats);
  assert.equal(comparison.sameRepublic, true);
  assert.equal(comparison.deltas.population, 120);
  assert.equal(comparison.deltas.liveBuildingCount, 5);
  assert.equal(comparison.deltas.currentIndustryWorkers, 30);
  assert.equal(comparison.deltas.minorCrimes, 4);
  assert.equal(comparison.deltas.mediumCrimes, 3);
  assert.equal(comparison.deltas.seriousCrimes, 1);
  assert.equal(comparison.deltas.medicalEmergencies, 2);
  assert.equal(comparison.deltas.activeCrimes, 3);
  assert.equal(comparison.deltas.awaitingPolice, 2);
  assert.equal(comparison.deltas.underInvestigation, 1);
  assert.equal(comparison.deltas.atCourt, 0);
  assert.equal(comparison.current.totals.minorCrimes, 22);
  assert.ok(Math.abs(comparison.deltas.productivity - 0.1) < 1e-9);
  assert.equal(comparison.areas[0].deltas.population, 120);
  assert.equal(comparison.areas[0].deltas.minorCrimes, 3);
  assert.equal(comparison.areas[0].deltas.mediumCrimes, 2);
  assert.equal(comparison.areas[0].deltas.seriousCrimes, 0);
  assert.ok(Math.abs(comparison.areas[0].deltas.criminality - 0.005) < 1e-9);
});

test('leaves unavailable cumulative crime snapshot changes unknown', () => {
  const current = { sourceName: 'Republic', header: { savePath: 'save/republic' } };
  const baseline = { ...current };
  const comparison = compareObservedSnapshots(current, baseline,
    [{ current: true, minorCrimes: 9 }], []);
  assert.equal(comparison.current.totals.minorCrimes, 9);
  assert.equal(comparison.baseline.totals.minorCrimes, null);
  assert.equal(comparison.deltas.minorCrimes, null);
  assert.equal(comparison.current.totals.activeCrimes, null);
});

test('does not match area IDs across different republics', () => {
  const current = { sourceName: 'A', header: { savePath: 'save/a' }, scopes: [{ id: 1, name: 'Same ID' }] };
  const baseline = { sourceName: 'B', header: { savePath: 'save/b' }, scopes: [{ id: 1, name: 'Same ID' }] };
  const comparison = compareObservedSnapshots(current, baseline);
  assert.equal(comparison.sameRepublic, false);
  assert.deepEqual(comparison.areas, []);
});
