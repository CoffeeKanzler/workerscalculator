import { createEvidence } from './evidence.js';

export const PLANNING_MODEL_SCHEMA_VERSION = 1;

// These values are hypothetical or user-controlled.  The application keeps
// compatibility aliases for the old flat state shape, but this list is the
// boundary used by persistence and adapters.
export const PLANNING_KEYS = Object.freeze([
  'currency', 'priceSource', 'decade', 'overrides',
  'plan', 'cities', 'activeCity', 'vanillaOnly',
  'vehicleProduction', 'train', 'lowtech', 'calcOpts', 'dataset',
  'tuning', 'buildingOverrides', 'customBuildings', 'advancedBuildingKey',
  'chains', 'activeChain', 'productionScope',
  'historyKey', 'historyCompareKeys', 'historyLogScale',
  'republicView', 'republicRange', 'republicResource', 'republicScope',
  'mapLayers', 'mapBuildingFilter', 'mapPollutionOpacity',
  'republicAlertFilter', 'analysisSort', 'analysisSearch', 'priceSort',
]);

const PLANNING_KEY_SET = new Set(PLANNING_KEYS);

const DEFAULT_PLANNING = {
  currency: 'RUB',
  priceSource: 'default',
  decade: 1980,
  overrides: {},
  plan: {
    settings: {
      productivity: 1,
      timeUnit: 'day',
      seasons: true,
      calendarFlow: 1,
      fertilizer: 1,
      currency: 'RUB',
    },
    fields: { small: 0, medium: 0, large: 0, hectares: null },
    rows: [],
  },
  cities: [],
  activeCity: 0,
  vanillaOnly: false,
  vehicleProduction: { productivity: 1, timeUnit: 'year', rows: [] },
  train: { cargo: 'Kohle', length: 450, locoName: null, locoCount: 1 },
  lowtech: {
    population: 2500, cities: 1, currentYear: 1930, startYear: 1920,
    researched: 0, researchKeys: null,
  },
  calcOpts: { inputPriceMode: 'sell', includeDelivery: false },
  dataset: 'game',
  tuning: {},
  buildingOverrides: {},
  customBuildings: [],
  advancedBuildingKey: null,
  chains: [{
    name: null, goal: 'steel', amount: 43, imports: [], producerChoice: {},
    includeUtilities: true, qualityTiers: {},
  }],
  activeChain: 0,
  productionScope: 'all',
  historyKey: 'steel',
  historyCompareKeys: [],
  historyLogScale: false,
  republicView: 'actual',
  republicRange: 'all',
  republicResource: null,
  republicScope: null,
  mapLayers: {
    water: true, pollution: true, roads: true, rails: true,
    pedestrian: false, buildings: true, construction: true,
    scopes: true, borders: true, outliers: true,
  },
  mapBuildingFilter: '',
  mapPollutionOpacity: 0.68,
  republicAlertFilter: 'all',
  analysisSort: { col: 'profit', dir: -1 },
  analysisSearch: '',
  priceSort: { col: 'name', dir: 1 },
};

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function merge(base, override) {
  if (override === undefined) return clone(base);
  if (!base || typeof base !== 'object' || Array.isArray(base)
    || !override || typeof override !== 'object' || Array.isArray(override)) {
    return clone(override);
  }
  const result = clone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(result[key], value) : clone(value);
  }
  return result;
}

function pickValues(input = {}) {
  const source = input?.planning && typeof input.planning === 'object'
    ? input.planning : input;
  const values = {};
  for (const key of PLANNING_KEYS) {
    if (Object.hasOwn(source, key)) values[key] = clone(source[key]);
  }
  if (values.chains === undefined && Object.hasOwn(source, 'chain')) {
    values.chains = [{ name: null, ...clone(source.chain) }];
  }
  return values;
}

function observationMetadata(observation) {
  if (!observation || typeof observation !== 'object') return null;
  return {
    identityId: observation.identity?.id ?? observation.id ?? null,
    generation: Number.isInteger(observation.generation) ? observation.generation : 0,
    observedAt: observation.observedAt ?? null,
    gameDate: observation.gameDate ? clone(observation.gameDate) : null,
  };
}

function planEvidence(gameDate = null) {
  return createEvidence({
    source: 'plan',
    observedAt: null,
    gameDate: gameDate ? clone(gameDate) : null,
    completeness: 'complete',
    confidence: 'exact',
    capability: null,
    warning: null,
  });
}

function normalizeEvidence(evidence, gameDate = null) {
  if (!evidence || evidence.source !== 'plan') return planEvidence(gameDate);
  return planEvidence(evidence.gameDate ?? gameDate);
}

export function createPlanningModel(values = {}, {
  seededFrom = null,
  evidence = null,
  edited = false,
  revision = 0,
  lastObserved = null,
} = {}) {
  const input = values?.planning && typeof values.planning === 'object'
    ? values.planning : values;
  const merged = merge(DEFAULT_PLANNING, pickValues(input));
  const sourceSeed = seededFrom ?? input.seededFrom ?? null;
  const sourceDate = sourceSeed?.gameDate ?? input.lastObserved?.gameDate ?? null;
  return {
    schemaVersion: PLANNING_MODEL_SCHEMA_VERSION,
    evidence: normalizeEvidence(evidence ?? input.evidence, sourceDate),
    seededFrom: sourceSeed ? clone(sourceSeed) : null,
    edited: edited || input.edited === true,
    revision: Number.isInteger(revision) ? revision : (Number.isInteger(input.revision) ? input.revision : 0),
    lastObserved: clone(lastObserved ?? input.lastObserved ?? null),
    ...merged,
  };
}

export function seedPlanningFromObservation(observation, values = {}) {
  const seed = observationMetadata(observation);
  return createPlanningModel(values, {
    seededFrom: seed,
    evidence: planEvidence(seed?.gameDate ?? null),
    edited: false,
    revision: 0,
    lastObserved: seed,
  });
}

export function updatePlanningModel(model, patch = {}) {
  const current = createPlanningModel(model, {
    seededFrom: model?.seededFrom ?? null,
    evidence: model?.evidence,
    edited: model?.edited === true,
    revision: model?.revision ?? 0,
    lastObserved: model?.lastObserved ?? null,
  });
  const changes = typeof patch === 'function' ? patch(clone(current)) : patch;
  return createPlanningModel({ ...current, ...pickValues(changes) }, {
    seededFrom: current.seededFrom,
    evidence: current.evidence,
    edited: true,
    revision: current.revision + 1,
    lastObserved: current.lastObserved,
  });
}

export function refreshPlanningFromObservation(model, observation, nextValues = {}) {
  const current = createPlanningModel(model, {
    seededFrom: model?.seededFrom ?? null,
    evidence: model?.evidence,
    edited: model?.edited === true,
    revision: model?.revision ?? 0,
    lastObserved: model?.lastObserved ?? null,
  });
  const observed = observationMetadata(observation);
  const values = current.edited ? current : { ...current, ...pickValues(nextValues) };
  return createPlanningModel(values, {
    seededFrom: current.seededFrom ?? observed,
    evidence: current.evidence,
    edited: current.edited,
    revision: current.revision,
    lastObserved: observed,
  });
}

export function planningProjection(model) {
  const current = createPlanningModel(model);
  return clone({
    schemaVersion: current.schemaVersion,
    evidence: current.evidence,
    seededFrom: current.seededFrom,
    edited: current.edited,
    revision: current.revision,
    lastObserved: current.lastObserved,
    ...pickValues(current),
  });
}

export function isPlanningKey(key) {
  return PLANNING_KEY_SET.has(key);
}

export { DEFAULT_PLANNING };
