import test from 'node:test';
import assert from 'node:assert/strict';

import { workerAccessAlerts } from '../js/models/access_alerts.js';
import { alertCategory } from '../js/republic.js';

function evidenceWith(rows) {
  return {
    completeness: 'complete',
    catchment: new Map(rows.map(row => [row.buildingIndex, {
      walkAdults: 0, transitAdults: 0, walkResidences: 0, transitResidences: 0,
      transitLineSlots: new Set(), ...row,
    }])),
  };
}

const networkWith = (...indices) => ({ buildingEdges: new Map(indices.map(index => [index, [0]])) });

test('a building nobody can fill in full is reported with the exact shortfall', () => {
  const alerts = workerAccessAlerts({
    evidence: evidenceWith([{ buildingIndex: 1, walkAdults: 6, transitAdults: 3 }]),
    walkingNetwork: networkWith(1),
    buildings: [{ index: 1, type: 'mine', scopeId: 4, configuredWorkers: 20 }],
    labelFor: () => 'Coal mine',
    scopeNameFor: () => 'Valley',
  });

  assert.equal(alerts.length, 1);
  assert.deepEqual({ ...alerts[0], evidence: undefined }, {
    severity: 'critical',
    metric: 'access.understaffed',
    buildingIndex: 1,
    scopeId: 4,
    scopeName: 'Coal mine',
    areaName: 'Valley',
    observed: 9 / 20,
    threshold: 1,
    slots: 20,
    reachableAdults: 9,
    walkAdults: 6,
    transitAdults: 3,
    evidence: undefined,
  });
  assert.equal(alertCategory(alerts[0]), 'workforce');
});

test('a shortfall of less than half the establishment is a warning, not a crisis', () => {
  const alerts = workerAccessAlerts({
    evidence: evidenceWith([{ buildingIndex: 1, walkAdults: 8 }]),
    walkingNetwork: networkWith(1),
    buildings: [{ index: 1, type: 'mine', configuredWorkers: 10 }],
  });

  assert.equal(alerts[0].severity, 'warning');
  assert.equal(alerts[0].observed, 0.8);
});

test('enough adults to fill it raises nothing', () => {
  const alerts = workerAccessAlerts({
    evidence: evidenceWith([{ buildingIndex: 1, walkAdults: 10, transitAdults: 1 }]),
    walkingNetwork: networkWith(1),
    buildings: [{ index: 1, type: 'mine', configuredWorkers: 10 }],
  });

  assert.deepEqual(alerts, []);
});

// The exclusion the reader asked for by name: a field needs nobody, so a field
// with nobody near it is not a problem to report.
test('a building with no establishment is never reported', () => {
  const alerts = workerAccessAlerts({
    evidence: evidenceWith([]),
    walkingNetwork: networkWith(),
    buildings: [
      { index: 1, type: 'field', configuredWorkers: 0 },
      { index: 2, type: 'field' },
      { index: 3, type: 'monument', configuredWorkers: 0, configuredWorkersHighEducation: 0 },
    ],
  });

  assert.deepEqual(alerts, []);
});

test('a site still being built is not judged on the staff it does not need yet', () => {
  const alerts = workerAccessAlerts({
    evidence: evidenceWith([{ buildingIndex: 1, walkAdults: 0 }]),
    walkingNetwork: networkWith(1),
    buildings: [{ index: 1, type: 'mine', configuredWorkers: 10, constructionProgress: 0.4 }],
  });

  assert.deepEqual(alerts, []);
});

test('a building bound to no path at all is a different problem and says so', () => {
  const alerts = workerAccessAlerts({
    evidence: evidenceWith([]),
    walkingNetwork: networkWith(9),
    buildings: [{ index: 1, type: 'mine', configuredWorkers: 10 }],
  });

  assert.equal(alerts[0].metric, 'access.unreachable');
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[0].reachableAdults, 0);
});

test('a silenced building stays silent', () => {
  const options = {
    evidence: evidenceWith([{ buildingIndex: 1, walkAdults: 1 }]),
    walkingNetwork: networkWith(1),
    buildings: [{ index: 1, type: 'mine', configuredWorkers: 10 }],
  };

  assert.equal(workerAccessAlerts(options).length, 1);
  assert.deepEqual(workerAccessAlerts({ ...options, muted: [1] }), []);
});

test('the worst shortfall comes first, and the larger building breaks a tie', () => {
  const alerts = workerAccessAlerts({
    evidence: evidenceWith([
      { buildingIndex: 1, walkAdults: 9 },
      { buildingIndex: 2, walkAdults: 1 },
      { buildingIndex: 3, walkAdults: 2 },
    ]),
    walkingNetwork: networkWith(1, 2, 3),
    buildings: [
      { index: 1, type: 'a', configuredWorkers: 10 },
      { index: 2, type: 'b', configuredWorkers: 10 },
      { index: 3, type: 'c', configuredWorkers: 20 },
    ],
  });

  // 2 and 3 are both a tenth staffed; the twenty-place building loses more.
  assert.deepEqual(alerts.map(alert => alert.buildingIndex), [3, 2, 1]);
});

test('walking evidence that is not complete raises nothing rather than guessing', () => {
  assert.deepEqual(workerAccessAlerts({ evidence: null, buildings: [] }), []);
  assert.deepEqual(workerAccessAlerts({
    evidence: { completeness: 'unavailable', catchment: new Map() },
    buildings: [{ index: 1, type: 'mine', configuredWorkers: 10 }],
  }), []);
});
