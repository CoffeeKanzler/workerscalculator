import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveStatsFile } from '../js/live_stats.js';

const valid = `$BLUEPRINT_OWNED bus_cav11m3\n$STAT_RECORD 0\n$DATE_YEAR 2001\n$DATE_DAY 116\n`
  + `$Economy_SellCostRUB\n  steel 42 1\n$end\n`;

test('live stats parsing returns a stable revision and the newest record', () => {
  const first = parseLiveStatsFile(valid, { name: 'stats.ini', size: 91, lastModified: 1234 });
  const second = parseLiveStatsFile(valid, { name: 'stats.ini', size: 91, lastModified: 1234 });
  assert.equal(first.revision, second.revision);
  assert.equal(first.name, 'stats.ini');
  assert.equal(first.records.length, 1);
  assert.equal(first.records[0].year, 2001);
  assert.equal(first.records[0].day, 116);
  assert.deepEqual(first.blueprintOwned, ['bus_cav11m3']);
});

test('live stats revision changes when content changes despite identical file metadata', () => {
  const before = parseLiveStatsFile(valid, { size: 91, lastModified: 1234 });
  const after = parseLiveStatsFile(valid.replace('116', '117'), { size: 91, lastModified: 1234 });
  assert.notEqual(before.revision, after.revision);
});

test('live stats parsing rejects empty or incomplete writes', () => {
  assert.throws(() => parseLiveStatsFile('', { size: 0, lastModified: 1234 }), /price data/i);
  assert.throws(() => parseLiveStatsFile('$STAT_RECORD\n$DATE_YEAR 2001', { size: 28, lastModified: 1234 }), /price data/i);
});
