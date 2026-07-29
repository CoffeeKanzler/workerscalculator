import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordDateKey, filterRange, seriesFromRecords, downsampleMinMax,
} from '../js/timeseries.js';

test('record date keys and range filters use game-year days', () => {
  assert.equal(recordDateKey({ year: 2001, day: 116 }), 2001 * 366 + 116);
  const records = [
    { year: 1999, day: 300 }, { year: 2000, day: 200 },
    { year: 2001, day: 100 }, { year: 2001, day: 116 },
  ];
  assert.deepEqual(filterRange(records, 'year'), records.slice(1));
  assert.deepEqual(filterRange(records, 'month'), records.slice(2));
  assert.deepEqual(filterRange(records, 'all'), records);
});

test('series extraction omits non-finite values', () => {
  const points = seriesFromRecords([
    { year: 2000, day: 1, value: 2 }, { year: 2000, day: 2 },
    { year: 2000, day: 3, value: 4 },
  ], record => record.value);
  assert.deepEqual(points.map(point => point.y), [2, 4]);
});

test('undated current snapshots do not flatten history or defeat recent ranges', () => {
  const records = [
    { year: 2024, day: 300, value: 2 },
    { year: 2025, day: 200, value: 4 },
    { year: 0, day: 0, current: true, value: 5 },
  ];
  assert.deepEqual(seriesFromRecords(records, record => record.value).map(point => point.y), [2, 4]);
  assert.deepEqual(filterRange(records, 'year'), records.slice(0, 2));
  assert.deepEqual(filterRange(records, 'month'), records.slice(1, 2));
});

test('downsampling preserves first last minimum and maximum', () => {
  const points = Array.from({ length: 1000 }, (_, x) => ({
    x, y: x === 501 ? 9000 : Math.sin(x),
  }));
  const sampled = downsampleMinMax(points, 80);
  assert.deepEqual(sampled[0], points[0]);
  assert.deepEqual(sampled.at(-1), points.at(-1));
  assert.ok(sampled.some(point => point.x === 501));
  assert.ok(sampled.length <= 80);
});
