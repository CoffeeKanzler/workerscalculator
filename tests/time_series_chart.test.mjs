import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const chartModule = await import('../js/ui/time_series_chart.js').catch(() => ({}));

test('sparse series align to one sorted x column without inventing values', () => {
  assert.equal(typeof chartModule.alignTimeSeries, 'function');
  const aligned = chartModule.alignTimeSeries([
    { label: 'adults', points: [{ x: 20, y: 2 }, { x: 10, y: 1 }] },
    { label: 'children', points: [{ x: 10, y: 4 }, { x: 30, y: 6 }] },
  ]);
  assert.deepEqual(aligned.xValues, [10, 20, 30]);
  assert.deepEqual(aligned.valueColumns, [[1, 2, null], [4, null, 6]]);
});

test('game date formatting crosses a 366-day year without becoming Unix time', () => {
  assert.equal(typeof chartModule.gameDateParts, 'function');
  assert.deepEqual(chartModule.gameDateParts(1984 * 366 + 365), { year: 1984, day: 365 });
  assert.equal(chartModule.formatGameDateKey(1985 * 366 + 4), '1985 / 004');
});

test('series summaries expose exact first last minimum and maximum values', () => {
  assert.equal(typeof chartModule.seriesSummary, 'function');
  assert.deepEqual(chartModule.seriesSummary([
    { label: 'population', points: [{ x: 1, y: 20 }, { x: 2, y: 5 }, { x: 3, y: 14 }] },
  ]), [{
    label: 'population', first: 20, last: 14, min: 5, max: 20,
  }]);
});

test('one zoom range reaches every chart in a group and reset restores auto range', () => {
  assert.equal(typeof chartModule.createChartGroupState, 'function');
  const calls = [];
  const group = chartModule.createChartGroupState();
  group.add({ setScale: (key, range) => calls.push(['a', key, range]) });
  group.add({ setScale: (key, range) => calls.push(['b', key, range]) });

  group.setRange(10, 20);
  assert.deepEqual(calls.slice(-2), [
    ['a', 'x', { min: 10, max: 20 }],
    ['b', 'x', { min: 10, max: 20 }],
  ]);

  group.reset();
  assert.deepEqual(calls.slice(-2), [
    ['a', 'x', { min: null, max: null }],
    ['b', 'x', { min: null, max: null }],
  ]);
});

test('uPlot is pinned locally with its license and no CDN import', async () => {
  const files = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/vendor/uPlot.esm.js'), 'utf8').catch(() => ''),
    fs.readFile(path.join(ROOT, 'js/vendor/uPlot-LICENSE.txt'), 'utf8').catch(() => ''),
    fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
  ]);
  const [module, license, shell] = files;
  assert.match(module, /uPlot\.js[\s\S]*v1\.6\.32/);
  assert.match(license, /MIT License|MIT Licensed/);
  assert.match(shell, /css\/vendor\/uPlot\.min\.css\?v=\d+/);
  assert.doesNotMatch(shell, /(?:unpkg|jsdelivr|cdnjs)\./i);
});
