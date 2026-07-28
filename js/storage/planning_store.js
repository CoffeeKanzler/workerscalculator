import {
  PLANNING_KEYS,
  createPlanningModel,
  isPlanningKey,
  planningProjection,
} from '../models/planning_model.js';

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
  if (value.observation && value.planning) {
    return {
      ...clone(value.observation),
      planning: createPlanningModel(value.planning),
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
