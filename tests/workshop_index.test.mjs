import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  readWorkshopIndex, writeWorkshopIndex, catalogPathFor, WORKSHOP_INDEX_VERSION,
} from '../js/models/workshop_index.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('an item path is derived from its id, not stored', () => {
  assert.equal(catalogPathFor('2114329588'), 'items/88/2114329588.json');
  assert.equal(catalogPathFor('1893637213'), 'items/13/1893637213.json');
});

// A browser holding a cached copy of the old format has to keep working until
// its marker moves, so version 1 is still read.
test('the previous format is still readable', () => {
  const v1 = { schemaVersion: 1, items: { 111: { path: 'items/11/111.json', buildingCount: 2 } } };
  const index = readWorkshopIndex(v1);

  assert.equal(index.has('111'), true);
  assert.equal(index.has(111), true, 'a numeric id must resolve the same as a string');
  assert.equal(index.has('222'), false);
  assert.equal(index.pathFor('111'), 'items/11/111.json');
});

test('an explicit path in an old index still wins over the convention', () => {
  const v1 = { schemaVersion: 1, items: { 999: { path: 'items/legacy/999.json' } } };
  assert.equal(readWorkshopIndex(v1).pathFor('999'), 'items/legacy/999.json');
});

test('the compact format answers existence and derives the path', () => {
  const written = writeWorkshopIndex({ appId: '784150', ids: ['222', '111', '111'] });
  assert.equal(written.schemaVersion, WORKSHOP_INDEX_VERSION);
  assert.deepEqual(written.ids, ['111', '222'], 'sorted and de-duplicated');
  assert.equal(written.itemCount, 2);

  const index = readWorkshopIndex(written);
  assert.equal(index.has('222'), true);
  assert.equal(index.has('333'), false);
  assert.equal(index.pathFor('222'), 'items/22/222.json');
});

test('a missing or malformed index answers nothing rather than throwing', () => {
  for (const raw of [null, undefined, {}, { items: null }, { ids: null }]) {
    const index = readWorkshopIndex(raw);
    assert.equal(index.size, 0);
    assert.equal(index.has('1'), false);
  }
});

// The point of the change: this file is fetched on every page load.
test('the compact format is far smaller than the one it replaces', () => {
  const ids = Array.from({ length: 3000 }, (_, i) => String(2000000000 + i));
  const compact = JSON.stringify(writeWorkshopIndex({ appId: '784150', ids }));
  const verbose = JSON.stringify({
    schemaVersion: 1,
    items: Object.fromEntries(ids.map(id =>
      [id, { path: catalogPathFor(id), buildingCount: 1, vehicleCount: 0 }])),
  });
  assert.ok(compact.length * 3 < verbose.length,
    `compact ${compact.length} vs verbose ${verbose.length}: expected a large saving`);
});

test('the shipped index is readable and covers what the app asks of it', () => {
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/workshop/index.json'), 'utf8'));
  const index = readWorkshopIndex(raw);
  assert.ok(index.size > 2000, `expected a populated catalog, got ${index.size}`);
  const sample = index.ids()[0];
  assert.ok(index.has(sample));
  assert.match(index.pathFor(sample), /^items\/\d{2}\/\d+\.json$/);
});
