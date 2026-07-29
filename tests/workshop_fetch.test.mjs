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

// Items already catalogued are skipped on a re-run, which is right — but they
// were being skipped past the pruning that happens alongside cataloguing, so
// their raw downloads accumulated across runs. This was first written as a
// check on the source text, which passed for the wrong reason and then failed
// the moment the code was reshaped without its behaviour changing. It now
// exercises the sweep against a real directory.
test('the sweep deletes downloads whose definitions are already catalogued', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const nodePath = await import('node:path');
  const { reclaimCataloguedDownloads } = await import('../tools/workshop_fetch.mjs');

  const content = mkdtempSync(nodePath.join(tmpdir(), 'workshop-sweep-'));
  try {
    for (const id of ['111', '222', '333']) {
      mkdirSync(nodePath.join(content, id), { recursive: true });
      writeFileSync(nodePath.join(content, id, 'big.dds'), 'x'.repeat(1024));
    }
    // 111 and 333 are catalogued; 222 has not been extracted yet.
    const index = { items: { 111: { path: 'a' }, 333: { path: 'b' } } };

    assert.equal(reclaimCataloguedDownloads(index, content), 2);
    assert.equal(existsSync(nodePath.join(content, '111')), false);
    assert.equal(existsSync(nodePath.join(content, '333')), false);
    // The uncatalogued download must survive: deleting it would lose the only
    // copy of something whose definitions were never extracted.
    assert.equal(existsSync(nodePath.join(content, '222')), true);

    // A second sweep has nothing left to do rather than failing on the
    // directories it already removed.
    assert.equal(reclaimCataloguedDownloads(index, content), 0);
  } finally {
    rmSync(content, { recursive: true, force: true });
  }
});

test('the sweep sees downloads left by a run with a different id list', async () => {
  // Scoped to the current run's ids, it could not see these at all, which is
  // how 33 GB accumulated while --prune was on and appeared to be working.
  const { mkdtempSync, mkdirSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const nodePath = await import('node:path');
  const { reclaimCataloguedDownloads } = await import('../tools/workshop_fetch.mjs');

  const content = mkdtempSync(nodePath.join(tmpdir(), 'workshop-sweep-'));
  try {
    mkdirSync(nodePath.join(content, '999'), { recursive: true });
    assert.equal(reclaimCataloguedDownloads({ items: { 999: { path: 'c' } } }, content), 1);
    assert.equal(existsSync(nodePath.join(content, '999')), false);
  } finally {
    rmSync(content, { recursive: true, force: true });
  }
});

test('the sweep is safe when nothing has been downloaded', async () => {
  const { reclaimCataloguedDownloads } = await import('../tools/workshop_fetch.mjs');
  assert.equal(reclaimCataloguedDownloads({ items: {} }, '/nonexistent-content-dir'), 0);
});
