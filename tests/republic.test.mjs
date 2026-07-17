import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRepublicModel, republicAlerts } from '../js/republic.js';

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
