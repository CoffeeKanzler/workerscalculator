import test from 'node:test';
import assert from 'node:assert/strict';

import { buildingNeedsElectricity, unpoweredBuildingAlerts } from '../js/models/power_alerts.js';
import { alertCategory } from '../js/republic.js';

const withPower = (index, amount, extra = {}) => ({
  index, type: 'panelak', scopeId: 1,
  storages: [{ capacity: 1, resources: [{ resource: 'eletric', amount }] }],
  ...extra,
});

test('a building that carries no electricity line is not asked about', () => {
  assert.equal(buildingNeedsElectricity({ index: 1, type: 'fence', storages: [] }), false);
  assert.equal(buildingNeedsElectricity({
    index: 2, storages: [{ resources: [{ resource: 'water', amount: 0 }] }],
  }), false);
  assert.equal(buildingNeedsElectricity(withPower(3, 0)), true);
});

test('holding none is the alert; holding any is not', () => {
  const alerts = unpoweredBuildingAlerts({
    buildings: [withPower(1, 0, { configuredWorkers: 1 }),
      withPower(2, 0.05, { configuredWorkers: 1 }), withPower(3, 19, { configuredWorkers: 1 })],
  });

  assert.deepEqual(alerts.map(alert => alert.buildingIndex), [1]);
  assert.equal(alerts[0].metric, 'power.unpowered');
  assert.equal(alertCategory(alerts[0]), 'coverage');
});

// A workplace nobody can power is a worse problem than a shed, and the list
// should say so before the reader has read a word.
test('a workplace with places to fill outranks one without', () => {
  const alerts = unpoweredBuildingAlerts({
    buildings: [
      withPower(1, 0, { configuredWorkers: 1 }),
      withPower(2, 0, { configuredWorkers: 12 }),
      withPower(3, 0, { configuredWorkers: 40 }),
    ],
  });

  assert.deepEqual(alerts.map(alert => alert.buildingIndex), [3, 2, 1]);
  assert.deepEqual(alerts.map(alert => alert.severity), ['critical', 'critical', 'critical']);
});

test('a site still being built has not been connected yet, and that is not news', () => {
  assert.deepEqual(unpoweredBuildingAlerts({
    buildings: [withPower(1, 0, { constructionProgress: 0.4, configuredWorkers: 5 })],
  }), []);
});

test('a field is never asked about', () => {
  assert.deepEqual(unpoweredBuildingAlerts({
    buildings: [withPower(1, 0, { savedTypePlusOne: 9, configuredWorkers: 150 })],
  }), []);
});

test('a silenced building stays silent', () => {
  const buildings = [withPower(1, 0, { configuredWorkers: 3 })];
  assert.equal(unpoweredBuildingAlerts({ buildings }).length, 1);
  assert.deepEqual(unpoweredBuildingAlerts({ buildings, muted: [1] }), []);
});

test('the name the reader knows is used when one is supplied', () => {
  const alerts = unpoweredBuildingAlerts({
    buildings: [withPower(1, 0, { configuredWorkers: 3 })],
    labelFor: () => 'Panel block',
    scopeNameFor: () => 'Bilytske',
  });

  assert.equal(alerts[0].scopeName, 'Panel block');
  assert.equal(alerts[0].areaName, 'Bilytske');
});

// A pylon carries an electricity line and never draws on it. Forty of them would
// bury the one workplace that cannot run.
test('only a building that does work with electricity is worth reporting', () => {
  const alerts = unpoweredBuildingAlerts({
    buildings: [
      withPower(1, 0, { type: 'cableway_pole_heavy_4' }),
      withPower(2, 0, { configuredWorkers: 5 }),
      withPower(3, 0, { type: 'panelak' }),
    ],
    occupiedResidences: [3],
  });

  assert.deepEqual(alerts.map(alert => alert.buildingIndex), [2, 3],
    'the workplace and the lived-in block, not the pylon');
});
