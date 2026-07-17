// Named planning snapshots can include several megabytes of save history.
// IndexedDB provides the quota and structured-clone semantics that localStorage
// cannot, while this small adapter boundary keeps the behavior testable in Node.

export function createSnapshotStore(adapter) {
  return {
    async names() {
      const entries = await adapter.entries();
      return entries.map(([name]) => name).sort((a, b) => a.localeCompare(b));
    },

    async save(name, state) {
      const clean = name?.trim();
      if (!clean) throw new Error('Snapshot name is empty');
      await adapter.put(clean, {
        name: clean,
        savedAt: Date.now(),
        state: structuredClone(state),
      });
    },

    async load(name) {
      const entry = await adapter.get(name);
      return entry?.state ? structuredClone(entry.state) : null;
    },

    async remove(name) {
      await adapter.delete(name);
    },
  };
}

export async function migrateLegacySnapshots(store, legacyJson) {
  if (!legacyJson) return { migrated: 0, skipped: 0 };
  let parsed;
  try {
    parsed = JSON.parse(legacyJson);
  } catch {
    return { migrated: 0, skipped: 1 };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { migrated: 0, skipped: 1 };
  }

  const existing = new Set(await store.names());
  let migrated = 0;
  let skipped = 0;
  for (const [name, entry] of Object.entries(parsed)) {
    if (!entry?.state || typeof entry.state !== 'object' || Array.isArray(entry.state) || existing.has(name)) {
      skipped += 1;
      continue;
    }
    await store.save(name, entry.state);
    existing.add(name);
    migrated += 1;
  }
  return { migrated, skipped };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIndexedDbSnapshotStore(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error('IndexedDB is not available');
  const opened = indexedDB.open('wr-planner', 1);
  opened.onupgradeneeded = () => {
    if (!opened.result.objectStoreNames.contains('snapshots')) {
      opened.result.createObjectStore('snapshots', { keyPath: 'name' });
    }
  };
  const database = requestResult(opened);

  async function withStore(mode, action) {
    const db = await database;
    const transaction = db.transaction('snapshots', mode);
    const store = transaction.objectStore('snapshots');
    const result = await action(store);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
    return result;
  }

  return createSnapshotStore({
    get: key => withStore('readonly', store => requestResult(store.get(key))),
    put: (_key, value) => withStore('readwrite', store => requestResult(store.put(value))),
    delete: key => withStore('readwrite', store => requestResult(store.delete(key))),
    entries: () => withStore('readonly', async store => {
      const rows = await requestResult(store.getAll());
      return rows.map(entry => [entry.name, entry]);
    }),
  });
}
