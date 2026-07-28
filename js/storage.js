// Named planning snapshots can include several megabytes of save history.
// IndexedDB provides the quota and structured-clone semantics that localStorage
// cannot, while this small adapter boundary keeps the behavior testable in Node.

import {
  createObservationStore,
  createPlanningStore,
  restorePlannerState,
} from './storage/planning_store.js?v=1';
import { PLANNING_KEYS, createPlanningModel } from './models/planning_model.js';

export {
  createObservationStore,
  createPlanningStore,
  migrateLegacyPlannerState,
  restorePlannerState,
  serializePlannerState,
} from './storage/planning_store.js?v=1';

export function createPlanningPersistence({
  planningStore,
  observationStore,
  storage = globalThis.localStorage,
  key = 'wr-planner-v1',
} = {}) {
  if (!planningStore || typeof planningStore.load !== 'function' || typeof planningStore.save !== 'function') {
    throw new TypeError('Planning persistence requires a planning store');
  }
  if (!observationStore || typeof observationStore.load !== 'function' || typeof observationStore.save !== 'function') {
    throw new TypeError('Planning persistence requires an observation store');
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

  function releaseLegacySlot() {
    // The migrated observation can be megabytes. Give the space back so the
    // shared localStorage origin quota stops being a cliff for large saves.
    try {
      storage.removeItem(key);
    } catch {
      // Losing the cleanup is harmless; IndexedDB is already authoritative.
    }
  }

  return {
    async load() {
      const storedObservation = await observationStore.load();
      const legacy = storedObservation ? null : readLegacy();
      const stored = await planningStore.load();
      const observationState = storedObservation
        ? restorePlannerState({ schemaVersion: 1, observation: storedObservation.observation })
        : legacy.state;
      const state = stored
        ? { ...observationState, planning: createPlanningModel(stored) }
        : observationState;
      let migrated = false;
      let observationError = legacy?.observationError ?? legacy?.parseError ?? null;

      if (legacy?.parsed) {
        // First load after the move: carry the localStorage observation across
        // and hand the slot back.
        if (hasLegacyPlanning(legacy.parsed) && !stored) await planningStore.save(state.planning);
        try {
          await observationStore.save(state);
          releaseLegacySlot();
        } catch (error) {
          observationError = error;
        }
        migrated = true;
      }
      return {
        state,
        migrated,
        error: observationError,
        // A migrated observation has no recorded time; treat it as just saved.
        lastSavedAt: storedObservation?.savedAt ?? (migrated ? Date.now() : null),
      };
    },

    async save(state) {
      await planningStore.save(state.planning);
      try {
        await observationStore.save(state);
        return { planningSaved: true, observationSaved: true, observationError: null };
      } catch (observationError) {
        // The canonical plan is already durable. Keep the observation failure
        // distinct instead of reporting a successful planning save as failed.
        return { planningSaved: true, observationSaved: false, observationError };
      }
    },
  };
}

export function createPlanningSaveCoordinator({
  persistence,
  onErrors,
  render,
  delayMs = 0,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = handle => clearTimeout(handle),
} = {}) {
  if (!persistence || typeof persistence.save !== 'function') {
    throw new TypeError('Planning save coordinator requires persistence.save');
  }
  if (typeof onErrors !== 'function' || typeof render !== 'function') {
    throw new TypeError('Planning save coordinator requires onErrors and render callbacks');
  }

  let running = null;
  let pending = null;
  let timer = null;
  let renderScheduled = false;

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      render();
    });
  }

  async function writeOnce(state) {
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
  }

  function drain() {
    if (running) return running;
    running = (async () => {
      try {
        while (pending !== null) {
          const current = pending;
          pending = null;
          await writeOnce(current);
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    // Every edit calls this, including each keystroke, and the observation is
    // megabytes. Two things keep that off the keystroke path: the write waits
    // for a pause in editing, and states arriving while a write is in flight
    // replace the queued one rather than adding another write. Only the newest
    // state can matter, and the drain above always reaches it.
    save(state) {
      pending = state;
      if (delayMs > 0) {
        if (timer !== null) cancel(timer);
        timer = schedule(() => { timer = null; drain(); }, delayMs);
        return running ?? Promise.resolve();
      }
      return drain();
    },

    // Leaving the page must not cost the user their last edit, so the wait is
    // abandoned rather than honoured when someone asks for the write now.
    flush() {
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      return drain();
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

// The `planning` object store is keyed by record name, so the plan, its backup
// and the observation all live in it without a schema change.
function createPlanningRecordAdapter(indexedDB) {
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

  return {
    get: key => withStore('readonly', store => requestResult(store.get(key))),
    put: (key, value) => withStore('readwrite', store => requestResult(store.put({ key, ...value }))),
    delete: key => withStore('readwrite', store => requestResult(store.delete(key))),
  };
}

export function createIndexedDbPlanningStore(indexedDB = globalThis.indexedDB, { key = 'planning' } = {}) {
  return createPlanningStore(createPlanningRecordAdapter(indexedDB), { key });
}

export function createIndexedDbObservationStore(indexedDB = globalThis.indexedDB, { key = 'observation' } = {}) {
  return createObservationStore(createPlanningRecordAdapter(indexedDB), { key });
}
