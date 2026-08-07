import {
  PLANNING_KEYS,
  createPlanningModel,
  isPlanningKey,
  planningProjection,
} from '../models/planning_model.js?v=10';

export const PLANNER_STATE_SCHEMA_VERSION = 1;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function legacyPlanningValues(source = {}) {
  const planning = {};
  for (const key of PLANNING_KEYS) {
    if (Object.hasOwn(source, key)) planning[key] = clone(source[key]);
  }
  if (planning.chains === undefined && Object.hasOwn(source, 'chain')) {
    planning.chains = [{ name: null, ...clone(source.chain) }];
  }
  return planning;
}

function observationValues(source = {}) {
  const observation = {};
  for (const [key, value] of Object.entries(source)) {
    if (key !== 'planning' && key !== 'chain' && !isPlanningKey(key)) observation[key] = clone(value);
  }
  return observation;
}

export function serializePlannerState(state = {}, { includePlanning = true } = {}) {
  const planning = createPlanningModel(state.planning ?? legacyPlanningValues(state));
  const observation = state.observation && typeof state.observation === 'object'
    ? clone(state.observation) : observationValues(state);
  const envelope = {
    schemaVersion: PLANNER_STATE_SCHEMA_VERSION,
    observation,
  };
  if (includePlanning) envelope.planning = planningProjection(planning);
  return envelope;
}

export function restorePlannerState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { planning: createPlanningModel({}) };
  }
  // The envelope is the current format whenever it carries an observation.
  // Planning is optional in it: the app writes the observation with
  // includePlanning:false because the canonical plan lives in IndexedDB.
  // Requiring planning here sent every such envelope down the legacy path,
  // which read the wrapper instead of the observation and dropped the save.
  if (value.observation) {
    return {
      ...clone(value.observation),
      planning: createPlanningModel(value.planning ?? {}),
    };
  }
  return migrateLegacyPlannerState(value).state;
}

export function migrateLegacyPlannerState(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input); }
    catch { return { migrated: false, state: { planning: createPlanningModel({}) } }; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { migrated: false, state: { planning: createPlanningModel({}) } };
  }
  const source = parsed.observation && parsed.planning ? parsed.observation : parsed;
  const planningSource = parsed.planning ?? legacyPlanningValues(parsed);
  const state = observationValues(source);
  state.planning = createPlanningModel(planningSource);
  return { migrated: !parsed.planning, state };
}

// The observation is the save side of the state: several megabytes for a real
// republic. It lives in IndexedDB beside the plan rather than in the ~5MB
// synchronous localStorage slot it used to share with everything else.
export function createObservationStore(adapter, { key = 'observation' } = {}) {
  if (!adapter || typeof adapter.get !== 'function' || typeof adapter.put !== 'function') {
    throw new TypeError('Observation store adapter must provide get and put');
  }
  return {
    async load() {
      const stored = await adapter.get(key);
      if (!stored?.observation) return null;
      return { observation: clone(stored.observation), savedAt: stored.savedAt ?? null };
    },
    // savedAt rides along on a record that is already written on every change,
    // so "how long since this was last touched" costs no extra write.
    async save(state, { now = Date.now() } = {}) {
      const { observation } = serializePlannerState(state, { includePlanning: false });
      await adapter.put(key, {
        schemaVersion: PLANNER_STATE_SCHEMA_VERSION,
        savedAt: now,
        observation,
      });
    },
    async remove() {
      if (typeof adapter.delete === 'function') await adapter.delete(key);
    },
  };
}

// stats.ini history is large — 27 MB parsed for a modest save, 74 MB for a big
// one — and it never changes once a save is imported. Writing it with the
// autosave would put tens of megabytes on the path of every keystroke, so it
// gets a record of its own, written at import and read at startup.
//
// Without this it was simply dropped, and a reloaded republic showed an empty
// history asking to be given a stats.ini the save had already supplied.
export function createStatsStore(adapter, { key = 'stats' } = {}) {
  if (!adapter || typeof adapter.get !== 'function' || typeof adapter.put !== 'function') {
    throw new TypeError('Stats store adapter must provide get and put');
  }
  return {
    async load() {
      const stored = await adapter.get(key);
      if (!stored?.records) return null;
      return { records: stored.records, name: stored.name ?? null };
    },
    async save(records, { name = null } = {}) {
      if (!Array.isArray(records) || !records.length) {
        if (typeof adapter.delete === 'function') await adapter.delete(key);
        return;
      }
      await adapter.put(key, {
        schemaVersion: PLANNER_STATE_SCHEMA_VERSION,
        savedAt: Date.now(),
        name,
        records,
      });
    },
    async remove() {
      if (typeof adapter.delete === 'function') await adapter.delete(key);
    },
  };
}

export function createPlanningStore(adapter, { key = 'planning' } = {}) {
  if (!adapter || typeof adapter.get !== 'function' || typeof adapter.put !== 'function') {
    throw new TypeError('Planning store adapter must provide get and put');
  }
  return {
    async load() {
      const stored = await adapter.get(key);
      return stored?.planning ? createPlanningModel(stored.planning) : null;
    },
    async save(model) {
      const planning = model?.planning ?? model;
      await adapter.put(key, {
        schemaVersion: PLANNER_STATE_SCHEMA_VERSION,
        planning: planningProjection(planning),
      });
    },
    async remove() {
      if (typeof adapter.delete === 'function') await adapter.delete(key);
    },
  };
}
