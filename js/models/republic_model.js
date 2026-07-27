import {
  createEvidence,
  deepFreeze,
  isEvidence,
  validateGameDate,
  validateObservedAt,
} from './evidence.js';

export const REPUBLIC_MODEL_SCHEMA_VERSION = 1;
export const REPUBLIC_SCALAR_FIELDS = Object.freeze([
  'population',
  'occupiedNamedAreas',
  'liveBuildingCount',
  'configuredIndustryWorkers',
  'currentIndustryWorkers',
  'productivity',
  'health',
  'criminality',
  'happiness',
  'loyalty',
  'realizedProduction',
  'medicalEmergencies',
  'activeCrimes',
  'awaitingPolice',
  'underInvestigation',
  'atCourt',
]);
const REPUBLIC_SCALAR_FIELD_SET = new Set(REPUBLIC_SCALAR_FIELDS);

const DOMAIN_DEFAULTS = {
  republic: {},
  areas: null,
  buildings: null,
  citizens: null,
  resources: null,
  transport: null,
  research: null,
  events: null,
};

function unavailableCollection() {
  const evidence = createEvidence({
    source: 'derived',
    observedAt: null,
    gameDate: null,
    completeness: 'unavailable',
    confidence: 'exact',
    capability: null,
    warning: null,
  });
  return createEvidenceCollection([], evidence);
}

function validateIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)
    || (typeof identity.id !== 'string' && !Number.isInteger(identity.id))
    || identity.id === '') {
    throw new TypeError('identity must contain a stable string or integer id');
  }
}

export function createEvidenceValue(value, evidence) {
  if (!isEvidence(evidence)) throw new TypeError('value evidence must come from createEvidence');
  return deepFreeze({ value, evidence });
}

export function createEvidenceCollection(items, evidence) {
  if (!Array.isArray(items)) throw new TypeError('collection items must be an array');
  if (!isEvidence(evidence)) throw new TypeError('collection evidence must come from createEvidence');
  const ids = new Set();
  for (const item of items) {
    const id = item?.id;
    if ((typeof id !== 'string' && !Number.isInteger(id)) || id === '') {
      throw new TypeError('Every collection item must have a stable id');
    }
    if (ids.has(id)) throw new TypeError(`Duplicate stable id in collection: ${id}`);
    ids.add(id);
  }
  return deepFreeze({
    items: [...items],
    evidence,
    completeness: evidence.completeness,
  });
}

function validateSources(sources) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)
    || Object.values(sources).some(source => !isEvidence(source))) {
    throw new TypeError('source catalog values must come from createEvidence');
  }
}

function validateDomain(name, domain) {
  if (name === 'republic') {
    if (!domain || typeof domain !== 'object' || Array.isArray(domain)) {
      throw new TypeError('republic domain must be an object');
    }
    for (const field of REPUBLIC_SCALAR_FIELD_SET) {
      if (Object.hasOwn(domain, field) && !isEvidenceValue(domain[field])) {
        throw new TypeError(`republic.${field} must be an evidence value`);
      }
    }
    return;
  }
  if (!domain || typeof domain !== 'object' || Array.isArray(domain)
    || !Array.isArray(domain.items) || !isEvidence(domain.evidence)
    || domain.completeness !== domain.evidence.completeness) {
    throw new TypeError(`${name} domain must be an evidence collection`);
  }
}

function isEvidenceValue(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.hasOwn(value, 'value') && Object.hasOwn(value, 'evidence')
    && isEvidence(value.evidence);
}

export function createRepublicModel({
  identity,
  generation = 0,
  observedAt = null,
  gameDate = null,
  sources = {},
  republic = DOMAIN_DEFAULTS.republic,
  areas = unavailableCollection(),
  buildings = unavailableCollection(),
  citizens = unavailableCollection(),
  resources = unavailableCollection(),
  transport = unavailableCollection(),
  research = unavailableCollection(),
  events = unavailableCollection(),
} = {}) {
  validateIdentity(identity);
  if (!Number.isInteger(generation) || generation < 0) {
    throw new TypeError('generation must be a non-negative integer');
  }
  validateObservedAt(observedAt);
  validateGameDate(gameDate);
  validateSources(sources);

  const domains = {
    republic, areas, buildings, citizens, resources, transport, research, events,
  };
  for (const [name, domain] of Object.entries(domains)) validateDomain(name, domain);

  return deepFreeze({
    schemaVersion: REPUBLIC_MODEL_SCHEMA_VERSION,
    identity: { ...identity },
    generation,
    observedAt,
    gameDate: gameDate === null ? null : { ...gameDate },
    sources: { ...sources },
    ...domains,
  });
}

export { createEvidence };
