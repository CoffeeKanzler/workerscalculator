const SOURCES = new Set(['live-sdk', 'save', 'stats-history', 'derived', 'plan']);
const COMPLETENESS = new Set(['complete', 'partial', 'unavailable']);
const CONFIDENCE = new Set(['exact', 'inferred', 'estimated']);

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
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
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

export function createEvidence({
  source,
  observedAt,
  gameDate,
  completeness,
  confidence,
  capability,
  warning,
} = {}) {
  if (!SOURCES.has(source)) throw new TypeError(`Unsupported evidence source: ${source}`);
  if (!COMPLETENESS.has(completeness)) {
    throw new TypeError(`Unsupported evidence completeness: ${completeness}`);
  }
  if (!CONFIDENCE.has(confidence)) {
    throw new TypeError(`Unsupported evidence confidence: ${confidence}`);
  }
  validateObservedAt(observedAt);
  validateGameDate(gameDate);
  nullableString(capability, 'capability');
  nullableString(warning, 'warning');

  return deepFreeze({
    source,
    observedAt,
    gameDate: gameDate === null ? null : { ...gameDate },
    completeness,
    confidence,
    capability,
    warning,
  });
}

export function isEvidence(value) {
  return !!value && typeof value === 'object'
    && SOURCES.has(value.source)
    && COMPLETENESS.has(value.completeness)
    && CONFIDENCE.has(value.confidence)
    && Object.isFrozen(value);
}

export { deepFreeze };
