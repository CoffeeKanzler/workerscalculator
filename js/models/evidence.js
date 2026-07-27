const SOURCES = new Set(['live-sdk', 'save', 'stats-history', 'derived', 'plan']);
const COMPLETENESS = new Set(['complete', 'partial', 'unavailable']);
const CONFIDENCE = new Set(['exact', 'inferred', 'estimated']);
const EVIDENCE_FIELDS = [
  'source', 'observedAt', 'gameDate', 'completeness',
  'confidence', 'capability', 'warning',
];
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function nullableString(value, field) {
  if (value !== null && typeof value !== 'string') {
    throw new TypeError(`${field} must be a string or null`);
  }
}

function validateObservedAt(value) {
  if (value === null) return;
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value)
    || !Number.isFinite(Date.parse(value))) {
    throw new TypeError('observedAt must be an ISO date-time string or null');
  }
}

function validateGameDate(value) {
  if (value === null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Number.isInteger(value.year) || value.year < 0
    || !Number.isInteger(value.day) || value.day < 0) {
    throw new TypeError('gameDate must contain non-negative integer year and day values, or be null');
  }
}

function validateEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || EVIDENCE_FIELDS.some(field => !Object.hasOwn(value, field))) {
    throw new TypeError('Evidence must contain every required provenance field');
  }
  if (!SOURCES.has(value.source)) throw new TypeError(`Unsupported evidence source: ${value.source}`);
  if (!COMPLETENESS.has(value.completeness)) {
    throw new TypeError(`Unsupported evidence completeness: ${value.completeness}`);
  }
  if (!CONFIDENCE.has(value.confidence)) {
    throw new TypeError(`Unsupported evidence confidence: ${value.confidence}`);
  }
  validateObservedAt(value.observedAt);
  validateGameDate(value.gameDate);
  nullableString(value.capability, 'capability');
  nullableString(value.warning, 'warning');
  return value;
}

export function createEvidence({
  source,
  observedAt,
  gameDate,
  completeness,
  confidence,
  capability,
  warning,
} = {}) {
  return deepFreeze(validateEvidence({
    source,
    observedAt,
    gameDate: gameDate === null ? null : { ...gameDate },
    completeness,
    confidence,
    capability,
    warning,
  }));
}

export function isEvidence(value) {
  try {
    validateEvidence(value);
    return Object.isFrozen(value)
      && (value.gameDate === null || Object.isFrozen(value.gameDate));
  } catch {
    return false;
  }
}

export { deepFreeze, validateGameDate, validateObservedAt };
