import test from 'node:test';
import assert from 'node:assert/strict';

import { buildingNeedsUtility, missingUtilityAlerts, UTILITIES } from '../js/models/utility_alerts.js';
import { unpoweredBuildingAlerts } from '../js/models/power_alerts.js';
import { alertCategory } from '../js/republic.js';
import { STRINGS } from '../js/i18n.js';

const carrying = (index, resource, amount, extra = {}) => ({
  index, type: 'panelak', scopeId: 1,
  storages: [{ capacity: 1, resources: [{ resource, amount }] }],
  ...extra,
});

test('a building is only asked about a utility it is plumbed for', () => {
  assert.equal(buildingNeedsUtility(carrying(1, 'water', 0), 'water'), true);
  assert.equal(buildingNeedsUtility(carrying(1, 'water', 0), 'heat'), false);
  assert.equal(buildingNeedsUtility({ index: 2, storages: [] }, 'water'), false);
});

test('holding none is the alert; holding any is not', () => {
  for (const resource of ['water', 'heat']) {
    const alerts = missingUtilityAlerts({
      resource,
      buildings: [carrying(1, resource, 0, { configuredWorkers: 4 }),
        carrying(2, resource, 0.05, { configuredWorkers: 4 }),
        carrying(3, resource, 30, { configuredWorkers: 4 })],
    });
    assert.deepEqual(alerts.map(alert => alert.buildingIndex), [1], resource);
    assert.equal(alerts[0].metric, UTILITIES[resource]);
    assert.equal(alertCategory(alerts[0]), 'coverage');
  }
});

// The reason the alert is worth anything: it says what the save said, at the
// moment the save was written, and claims nothing about whether supply is
// possible. Both languages have to keep that tense.
test('every utility alert is worded as an instant, in both languages', () => {
  for (const metric of Object.values(UTILITIES)) {
    for (const [lang, table] of Object.entries(STRINGS)) {
      const text = table[`alert.${metric}`];
      assert.ok(text, `${lang} is missing alert.${metric}`);
      assert.match(text, lang === 'de' ? /beim Speichern/ : /when the game was saved/,
        `${lang} alert.${metric} must say when it was true`);
    }
  }
});

test('a building still under construction is not yet news', () => {
  const alerts = missingUtilityAlerts({
    resource: 'water',
    buildings: [carrying(1, 'water', 0, { configuredWorkers: 4, constructionProgress: 0.5 })],
  });
  assert.deepEqual(alerts, []);
});

test('something nobody works in and nobody lives in is not reported', () => {
  const pylon = carrying(1, 'water', 0);
  assert.deepEqual(missingUtilityAlerts({ resource: 'water', buildings: [pylon] }), []);
  assert.equal(missingUtilityAlerts({
    resource: 'water', buildings: [pylon], occupiedResidences: [1],
  }).length, 1);
});

test('silencing a building silences it for every utility', () => {
  for (const resource of ['water', 'heat', 'eletric']) {
    assert.deepEqual(missingUtilityAlerts({
      resource,
      buildings: [carrying(7, resource, 0, { configuredWorkers: 2 })],
      muted: [7],
    }), []);
  }
});

// power_alerts is now a door onto the shared reader; it must still behave.
test('the electricity door still reports electricity', () => {
  const alerts = unpoweredBuildingAlerts({
    buildings: [carrying(1, 'eletric', 0, { configuredWorkers: 3 })],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].metric, 'power.unpowered');
});

test('an unknown utility is refused rather than silently reporting nothing', () => {
  assert.throws(() => missingUtilityAlerts({ resource: 'beer', buildings: [] }), /beer/);
});
