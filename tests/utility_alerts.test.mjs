import test from 'node:test';
import assert from 'node:assert/strict';

import { buildingNeedsUtility, missingUtilityAlerts, fullWasteStorageAlerts, UTILITIES } from '../js/models/utility_alerts.js';
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
  for (const metric of [...Object.values(UTILITIES), 'waste.full']) {
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

// Waste is the inverse reading, and the one that was easy to get wrong.
const wasteStore = (index, capacity, lines, extra = {}) => ({
  index, type: 'tartak', scopeId: 1,
  storages: [{ capacity, resources: lines.map(([resource, amount]) => ({ resource, amount })) }],
  ...extra,
});

test('capacity bounds one storage record, shared by the lines inside it', () => {
  // 60 + 15 of 100 is three quarters full, not two separate near-full stores.
  const alerts = fullWasteStorageAlerts({
    buildings: [wasteStore(1, 100, [['waste_bio', 60], ['waste_ash', 15]], { configuredWorkers: 2 })],
  });
  assert.deepEqual(alerts, []);
});

test('a store at capacity is reported, and says how full', () => {
  const alerts = fullWasteStorageAlerts({
    buildings: [wasteStore(1, 100, [['waste_bio', 96], ['waste_ash', 3]], { configuredWorkers: 2 })],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].metric, 'waste.full');
  assert.equal(alertCategory(alerts[0]), 'coverage');
  assert.equal(alerts[0].observed, 0.99);
});

test('a storage with no capacity recorded cannot be judged full', () => {
  // Dividing by a missing capacity is what reported buildings as 162% full.
  assert.deepEqual(fullWasteStorageAlerts({
    buildings: [wasteStore(1, 0, [['waste_bio', 500]], { configuredWorkers: 2 })],
  }), []);
});

test('only waste counts towards fullness', () => {
  assert.deepEqual(fullWasteStorageAlerts({
    buildings: [wasteStore(1, 100, [['wood', 99]], { configuredWorkers: 2 })],
  }), []);
});

// Clusters are what the overview shows, so the grouping is part of the contract.
test('alerts cluster by the kind of problem, not by filter category', async () => {
  const { alertGroup, groupRepublicAlerts } = await import('../js/republic.js');
  assert.equal(alertGroup({ metric: 'power.unpowered' }), 'power');
  assert.equal(alertGroup({ metric: 'water.missing' }), 'water');
  assert.equal(alertGroup({ metric: 'waste.full' }), 'waste');
  assert.equal(alertGroup({ metric: 'access.unreachable' }), 'access');
  assert.equal(alertGroup({ metric: 'buffer.input' }), 'buffers');
  // All four share the 'coverage' filter category, which is why the overview
  // cannot summarise with it: it would say "30 coverage" and name nothing.
  const category = (await import('../js/republic.js')).alertCategory;
  for (const metric of ['power.unpowered', 'water.missing', 'heat.missing', 'waste.full']) {
    assert.equal(category({ metric }), 'coverage');
  }
});

test('a cluster carries the worst severity in it and the biggest goes first', async () => {
  const { groupRepublicAlerts } = await import('../js/republic.js');
  const groups = groupRepublicAlerts([
    { metric: 'buffer.input', severity: 'warning' },
    { metric: 'buffer.output', severity: 'warning' },
    { metric: 'buffer.input', severity: 'warning' },
    { metric: 'water.missing', severity: 'warning' },
    { metric: 'water.missing', severity: 'critical' },
  ]);
  assert.deepEqual(groups, [
    { group: 'water', count: 2, severity: 'critical' },
    { group: 'buffers', count: 3, severity: 'warning' },
  ]);
});

test('every cluster is named in both languages', async () => {
  const { alertGroup } = await import('../js/republic.js');
  const metrics = ['power.unpowered', 'water.missing', 'heat.missing', 'waste.full',
    'access.unreachable', 'staffing', 'netWorkers', 'health', 'food',
    'buffer.input', 'trend.debt', 'coverage.workers', 'whatever'];
  for (const metric of metrics) {
    for (const [lang, table] of Object.entries(STRINGS)) {
      const key = `alertGroup.${alertGroup({ metric })}`;
      assert.ok(table[key], `${lang} is missing ${key}`);
    }
  }
});
