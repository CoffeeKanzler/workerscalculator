// Named planning snapshots can include several megabytes of save history.
// IndexedDB provides the quota and structured-clone semantics that localStorage
// cannot, while this small adapter boundary keeps the behavior testable in Node.

import {
  createPlanningStore,
  migrateLegacyPlannerState,
  restorePlannerState,
  serializePlannerState,
} from './storage/planning_store.js';
import { PLANNING_KEYS, createPlanningModel } from './models/planning_model.js';

export {
  createPlanningStore,
  migrateLegacyPlannerState,
  restorePlannerState,
  serializePlannerState,
} from './storage/planning_store.js';

export function createPlanningPersistence({
  planningStore,
  storage = globalThis.localStorage,
  key = 'wr-planner-v1',
} = {}) {
  if (!planningStore || typeof planningStore.load !== 'function' || typeof planningStore.save !== 'function') {
    throw new TypeError('Planning persistence requires a planning store');
  }
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('Planning persistence requires a synchronous observation storage');
  }

  function readLegacy() {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (observationError) {
      return {
        parsed: null,
        state: { planning: createPlanningModel({}) },
        parseError: null,
        observationError,
      };
    }
    if (!raw) return { parsed: null, state: { planning: createPlanningModel({}) }, parseError: null };
    try {
      const parsed = JSON.parse(raw);
      return { parsed, state: restorePlannerState(parsed), parseError: null };
    } catch (error) {
      return {
        parsed: null,
        state: { planning: createPlanningModel({}) },
        parseError: new Error(`Could not read saved planner state: ${error.message}`),
        observationError: null,
      };
    }
  }

  function hasLegacyPlanning(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.planning && typeof parsed.planning === 'object') return true;
    return PLANNING_KEYS.some(planningKey => Object.hasOwn(parsed, planningKey));
  }

  return {
    async load() {
      const legacy = readLegacy();
      const stored = await planningStore.load();
      const state = stored
        ? { ...legacy.state, planning: createPlanningModel(stored) }
        : legacy.state;
      let migrated = false;
      let observationError = legacy.observationError ?? legacy.parseError ?? null;
      if (hasLegacyPlanning(legacy.parsed)) {
        if (!stored) await planningStore.save(state.planning);
        try {
          storage.setItem(key, JSON.stringify(serializePlannerState(state, { includePlanning: false })));
        } catch (error) {
          observationError = error;
        }
        migrated = true;
      }
      return { state, migrated, error: observationError };
    },

    async save(state) {
      await planningStore.save(state.planning);
      try {
        const observation = serializePlannerState(state, { includePlanning: false });
        storage.setItem(key, JSON.stringify(observation));
        return { planningSaved: true, observationSaved: true, observationError: null };
      } catch (observationError) {
        // The canonical plan is already durable in IndexedDB. Keep the
        // synchronous observation failure distinct instead of reporting a
        // successful planning save as failed.
        return { planningSaved: true, observationSaved: false, observationError };
      }
    },
  };
}

export function createPlanningSaveCoordinator({ persistence, onErrors, render } = {}) {
  if (!persistence || typeof persistence.save !== 'function') {
    throw new TypeError('Planning save coordinator requires persistence.save');
  }
  if (typeof onErrors !== 'function' || typeof render !== 'function') {
    throw new TypeError('Planning save coordinator requires onErrors and render callbacks');
  }

  let queue = Promise.resolve();
  let renderScheduled = false;

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      render();
    });
  }

  return {
    save(state) {
      queue = queue.catch(() => {}).then(async () => {
        let changed;
        try {
          const result = await persistence.save(state);
          const observation = result.observationError
            ? `Observation state was not saved: ${result.observationError.message}`
            : '';
          changed = onErrors({ planning: '', observation });
        } catch (error) {
          changed = onErrors({
            planning: `Planning state was not saved: ${error.message}`,
            observation: '',
          });
        }
        if (changed) scheduleRender();
      });
      return queue;
    },
  };
}

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

const PLANNER_DB_VERSION = 2;

export function createIndexedDbSnapshotStore(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error('IndexedDB is not available');
  const opened = indexedDB.open('wr-planner', PLANNER_DB_VERSION);
  opened.onupgradeneeded = () => {
    if (!opened.result.objectStoreNames.contains('snapshots')) {
      opened.result.createObjectStore('snapshots', { keyPath: 'name' });
    }
    if (!opened.result.objectStoreNames.contains('planning')) {
      opened.result.createObjectStore('planning', { keyPath: 'key' });
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

export function createIndexedDbPlanningStore(indexedDB = globalThis.indexedDB, { key = 'planning' } = {}) {
  if (!indexedDB) throw new Error('IndexedDB is not available');
  const opened = indexedDB.open('wr-planner', PLANNER_DB_VERSION);
  opened.onupgradeneeded = () => {
    if (!opened.result.objectStoreNames.contains('snapshots')) {
      opened.result.createObjectStore('snapshots', { keyPath: 'name' });
    }
    if (!opened.result.objectStoreNames.contains('planning')) {
      opened.result.createObjectStore('planning', { keyPath: 'key' });
    }
  };
  const database = requestResult(opened);

  async function withStore(mode, action) {
    const db = await database;
    const transaction = db.transaction('planning', mode);
    const store = transaction.objectStore('planning');
    const result = await action(store);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
    return result;
  }

  return createPlanningStore({
    get: key => withStore('readonly', store => requestResult(store.get(key))),
    put: (key, value) => withStore('readwrite', store => requestResult(store.put({ key, ...value }))),
    delete: key => withStore('readwrite', store => requestResult(store.delete(key))),
  }, { key });
}
