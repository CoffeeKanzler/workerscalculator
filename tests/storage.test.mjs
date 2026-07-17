import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotStore, migrateLegacySnapshots } from '../js/storage.js';

function memoryAdapter() {
  const rows = new Map();
  return {
    rows,
    adapter: {
      get: async key => structuredClone(rows.get(key)),
      put: async (key, value) => rows.set(key, structuredClone(value)),
      delete: async key => rows.delete(key),
      entries: async () => [...rows.entries()].map(([key, value]) => [key, structuredClone(value)]),
    },
  };
}

test('named snapshots round-trip private history without object aliasing', async () => {
  const { adapter } = memoryAdapter();
  const store = createSnapshotStore(adapter);
  const state = {
    plan: { rows: [{ count: 2 }] },
    statsRecords: [{ year: 2001 }],
    saveImport: { version: 2 },
  };

  await store.save('Republic 2001', state);
  state.plan.rows[0].count = 99;

  const loaded = await store.load('Republic 2001');
  assert.equal(loaded.plan.rows[0].count, 2);
  assert.equal(loaded.statsRecords[0].year, 2001);
  assert.deepEqual(await store.names(), ['Republic 2001']);
});

test('legacy localStorage snapshots migrate without replacing newer entries', async () => {
  const { adapter } = memoryAdapter();
  const store = createSnapshotStore(adapter);
  await store.save('Keep', { marker: 'new' });
  const legacy = JSON.stringify({
    Keep: { state: { marker: 'old' } },
    Legacy: { state: { marker: 'migrated' } },
    Broken: null,
  });

  const result = await migrateLegacySnapshots(store, legacy);

  assert.deepEqual(result, { migrated: 1, skipped: 2 });
  assert.equal((await store.load('Keep')).marker, 'new');
  assert.equal((await store.load('Legacy')).marker, 'migrated');
});
