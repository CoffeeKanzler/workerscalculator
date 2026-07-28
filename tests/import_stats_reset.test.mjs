import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { statsStateForImport } from '../js/models/import_stats.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('a save with stats.ini becomes the price source', () => {
  const next = statsStateForImport({
    statsRecords: [{ year: 1979 }, { year: 1980 }, { year: 1981 }],
    statsFileName: 'stats.ini',
    previousPriceSource: 'default',
  });

  assert.equal(next.statsRecords.length, 3);
  assert.equal(next.statsName, 'stats.ini');
  assert.equal(next.recordIndex, 2, 'the newest record is the one shown');
  assert.equal(next.priceSource, 'stats');
});

// replaceSharedState only replaces SHARE_KEYS, and statsRecords is deliberately
// not one of them. So an import that finds no stats.ini has to clear them by
// hand, exactly as startManual does, or the previous republic's price history
// stays on screen under the new save's name.
test('a save without stats.ini clears the previous save records', () => {
  const next = statsStateForImport({
    statsRecords: [],
    statsFileName: null,
    previousPriceSource: 'stats',
  });

  assert.equal(next.statsRecords, null);
  assert.equal(next.statsName, null);
  assert.equal(next.recordIndex, 0);
  // Leaving this at 'stats' would price the new republic from the old save.
  assert.equal(next.priceSource, 'default');
});

test('a save without stats.ini keeps a price source that does not depend on stats', () => {
  for (const source of ['default', 'decade']) {
    const next = statsStateForImport({
      statsRecords: [],
      statsFileName: null,
      previousPriceSource: source,
    });
    assert.equal(next.priceSource, source, `${source} is not derived from stats.ini`);
  }
});

test('a missing or malformed stats result is treated as no stats', () => {
  for (const records of [null, undefined]) {
    const next = statsStateForImport({ statsRecords: records, previousPriceSource: 'stats' });
    assert.equal(next.statsRecords, null);
    assert.equal(next.priceSource, 'default');
  }
});

test('the import path resets stats state instead of letting it leak across saves', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const handler = app.slice(app.indexOf('async function handleSaveDirectory'));
  const body = handler.slice(0, handler.indexOf('\n}\n'));

  assert.match(body, /statsStateForImport\(/);
  // The bare conditional assignment left the previous save's records in place.
  assert.doesNotMatch(body, /if \(statsRecords\.length\) \{\s*state\.statsRecords = statsRecords;/);
});
