import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { shardFor, catalogPathFor, buildingFoldersIn, extractItem } from '../tools/workshop_fetch.mjs';

test('items shard by their last two digits', () => {
  assert.equal(shardFor('2114329588'), '88');
  assert.equal(shardFor('1893637213'), '13');
  assert.equal(catalogPathFor('2114329588'), 'items/88/2114329588.json');
});

// A mod ships shared models, a preview image and a workshopconfig.ini beside
// its building folders. Only the folders that declare a building count.
test('only folders that declare a building are read', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ws-'));
  for (const folder of ['tower_a', 'tower_b']) {
    mkdirSync(path.join(dir, folder));
    writeFileSync(path.join(dir, folder, 'building.ini'), '$TYPE_ENGINE\n');
  }
  mkdirSync(path.join(dir, 'textures'));
  writeFileSync(path.join(dir, 'workshopconfig.ini'), '$ITEM_ID 1\n');
  writeFileSync(path.join(dir, 'model.nmf'), 'binary');

  assert.deepEqual(buildingFoldersIn(dir), ['tower_a', 'tower_b']);
  assert.deepEqual(buildingFoldersIn(path.join(dir, 'nope')), []);
});

test('an extracted item carries ids the save can be matched against', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ws-'));
  mkdirSync(path.join(dir, 'conveyortower1to1noroad'));
  writeFileSync(path.join(dir, 'conveyortower1to1noroad', 'building.ini'),
    '$TYPE_ENGINE\n$WORKERS_NEEDED 4\n');

  const item = extractItem('2114329588', dir, { now: '2026-07-29T00:00:00Z' });

  assert.equal(item.schemaVersion, 1);
  assert.equal(item.workshopId, '2114329588');
  assert.equal(item.buildings.length, 1);
  // The save writes "<id>/<folder>", so that is what has to be stored.
  assert.equal(item.buildings[0].id, '2114329588/conveyortower1to1noroad');
  assert.equal(item.buildings[0].workshopId, '2114329588');
  assert.equal(item.buildings[0].modPath, 'conveyortower1to1noroad');
});

test('a mod with no building folders extracts to an empty but valid item', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ws-'));
  writeFileSync(path.join(dir, 'workshopconfig.ini'), '$ITEM_ID 1\n');
  const item = extractItem('123456789', dir);
  assert.deepEqual(item.buildings, []);
  assert.equal(item.workshopId, '123456789');
});

// The original catalogue run spawned one steamcmd login per item: 7,478
// logins, of which 5,026 failed and were abandoned after three attempts. A
// sample of those failures downloaded first time when batched into a single
// login, so the batch size is the fix, not the retry count.
test('a backlog is split into bounded batches that lose no ids', async () => {
  const { batches } = await import('../tools/workshop_fetch.mjs');
  const ids = Array.from({ length: 250 }, (_, i) => String(i));

  const groups = batches(ids, 100);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(g => g.length), [100, 100, 50]);
  assert.deepEqual(groups.flat(), ids, 'every id survives the split, in order');
});

test('a backlog smaller than one batch is a single batch', async () => {
  const { batches } = await import('../tools/workshop_fetch.mjs');
  assert.deepEqual(batches(['a', 'b'], 100), [['a', 'b']]);
  assert.deepEqual(batches([], 100), []);
});
