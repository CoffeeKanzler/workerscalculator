import { test } from 'node:test';
import assert from 'node:assert/strict';

import { trendOf, windowMean, republicTrendAlerts } from '../js/models/republic_trends.js';

// One record per in-game day, the shape stats.ini actually has.
function series(values, { startYear = 1960 } = {}) {
  return values.map((value, index) => ({
    year: startYear + Math.floor(index / 366),
    day: index % 366,
    value,
  }));
}
const valueOf = record => record.value;

test('a sustained decline is reported as falling, with its length in years', () => {
  // Four years, each a fifth lower than the last.
  const values = [];
  for (let year = 0; year < 4; year += 1) {
    for (let day = 0; day < 366; day += 1) values.push(1000 - year * 200);
  }
  const trend = trendOf(series(values), valueOf);

  assert.equal(trend.direction, 'falling');
  assert.ok(trend.change < -0.03, `change ${trend.change} should be a real drop`);
  assert.ok(trend.years >= 3, `expected a multi-year run, got ${trend.years}`);
});

test('a sustained climb is reported as rising', () => {
  const values = [];
  for (let year = 0; year < 3; year += 1) {
    for (let day = 0; day < 366; day += 1) values.push(500 + year * 300);
  }
  assert.equal(trendOf(series(values), valueOf).direction, 'rising');
});

// Game series wobble day to day. Ordinary noise is not a trend, and calling it
// one would bury the real alerts under chatter.
test('drift inside the deadband is stable, not a trend', () => {
  const values = [];
  for (let index = 0; index < 366 * 3; index += 1) {
    values.push(1000 + (index % 7) - 3);
  }
  const trend = trendOf(series(values), valueOf);
  assert.equal(trend.direction, 'stable');
  assert.equal(trend.years, 0);
});

test('too little history is unknown rather than guessed', () => {
  assert.equal(trendOf(series([1, 2, 3]), valueOf).direction, 'unknown');
  assert.equal(trendOf([], valueOf).direction, 'unknown');
  assert.equal(trendOf(null, valueOf).direction, 'unknown');
  // A year and a half cannot be compared against a previous year.
  assert.equal(trendOf(series(new Array(500).fill(10)), valueOf).direction, 'unknown');
});

test('records with no value for the field are skipped, not counted as zero', () => {
  const records = [
    { year: 1960, day: 0, value: 100 },
    { year: 1960, day: 1 },
    { year: 1960, day: 2, value: 200 },
  ];
  assert.equal(windowMean(records, valueOf, { from: 0, to: 1e9 }), 150);
});

test('an empty window has no mean rather than a zero', () => {
  assert.equal(windowMean(series([1, 2, 3]), valueOf, { from: 1e8, to: 1e9 }), null);
});

// Only directions worth acting on: a growing population is good news and does
// not belong in a list of things needing attention.
test('only concerning directions become alerts', () => {
  const rising = [];
  for (let year = 0; year < 4; year += 1) {
    for (let day = 0; day < 366; day += 1) rising.push(year);
  }
  const growing = series(rising).map(r => ({ ...r, adults: 1000 + r.value * 500, unemployed: 10 }));
  const alerts = republicTrendAlerts(growing);
  assert.equal(alerts.some(alert => alert.metric === 'trend.population'), false,
    'a growing population is not an alert');
});

test('a falling population and rising unemployment both raise alerts', () => {
  const records = [];
  for (let year = 0; year < 4; year += 1) {
    for (let day = 0; day < 366; day += 1) {
      records.push({
        year: 1960 + year, day,
        adults: 5000 - year * 900,
        unemployed: 100 + year * 90,
      });
    }
  }
  const alerts = republicTrendAlerts(records);
  const metrics = alerts.map(alert => alert.metric);

  assert.ok(metrics.includes('trend.population'));
  assert.ok(metrics.includes('trend.unemployed'));
  // A multi-year run is critical; a single bad year is a warning.
  assert.equal(alerts.find(a => a.metric === 'trend.population').severity, 'critical');
  assert.equal(alerts[0].scopeId, null, 'these are republic-wide, never per area');
  assert.equal(alerts[0].evidence, 'stats.ini');
});

test('a save with no history raises nothing', () => {
  assert.deepEqual(republicTrendAlerts([]), []);
  assert.deepEqual(republicTrendAlerts(null), []);
});
