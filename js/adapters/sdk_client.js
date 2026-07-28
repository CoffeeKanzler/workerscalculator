export class SdkClientError extends Error {
  constructor(message, { code = 'sdk-error', status = 0, details = null } = {}) {
    super(message);
    this.name = 'SdkClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function object(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SdkClientError(message, { code: 'malformed-response' });
  }
  return value;
}

function nonNegativeInteger(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new SdkClientError(`${field} must be a non-negative integer`, { code: 'malformed-response' });
  }
  return value;
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new TypeError('SDK base URL is required');
  const clean = baseUrl.replace(/\/+$/, '');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(clean)) return `${clean}/`;
  return clean;
}

function joinUrl(baseUrl, path) {
  const relative = path.replace(/^\/+/, '');
  if (!relative) return baseUrl.replace(/\/+$/, '');
  if (baseUrl.endsWith('/')) return `${baseUrl}${relative}`;
  return `${baseUrl}/${relative}`;
}

function validateCatalog(value) {
  const catalog = object(value, 'catalog response must be an object');
  if (typeof catalog.name !== 'string' || !catalog.name) {
    throw new SdkClientError('catalog.name must be a non-empty string', { code: 'malformed-response' });
  }
  nonNegativeInteger(catalog.version, 'catalog.version');
  if (typeof catalog.linked !== 'boolean') {
    throw new SdkClientError('catalog.linked must be a boolean', { code: 'malformed-response' });
  }
  if (!Array.isArray(catalog.sources) || catalog.sources.some(source => typeof source !== 'string')) {
    throw new SdkClientError('catalog.sources must be an array of strings', { code: 'malformed-response' });
  }
  if (new Set(catalog.sources).size !== catalog.sources.length) {
    throw new SdkClientError('catalog.sources must not contain duplicate ids', { code: 'malformed-response' });
  }
  return Object.freeze({ ...catalog, sources: Object.freeze([...catalog.sources]) });
}

function validateBatch(batch) {
  const result = object(batch, 'cursor batch must be an object');
  for (const field of [
    'requestedAfterSequence', 'oldestAvailableSequence', 'newestAvailableSequence',
    'droppedBeforeCursor',
  ]) nonNegativeInteger(result[field], `batch.${field}`);
  for (const field of ['returnedCount', 'availableCount']) nonNegativeInteger(result[field], `batch.${field}`);
  if (result.newestAvailableSequence < result.oldestAvailableSequence && result.availableCount > 0) {
    throw new SdkClientError('cursor batch sequence range is inverted', { code: 'malformed-response' });
  }
  return result;
}

function validateData(value, expectedRecordSize = undefined) {
  const result = object(value, 'data response must be an object');
  if (result.ok !== true) throw new SdkClientError('data response is not ok', { code: 'data-rejected' });
  if (!Number.isInteger(result.resultCode)) {
    throw new SdkClientError('resultCode must be an integer', { code: 'malformed-response' });
  }
  nonNegativeInteger(result.itemCount, 'itemCount');
  nonNegativeInteger(result.recordSize, 'recordSize');
  if (!Array.isArray(result.items)) {
    throw new SdkClientError('items must be an array', { code: 'malformed-response' });
  }
  if (result.items.length > result.itemCount) {
    throw new SdkClientError('items cannot exceed itemCount', { code: 'malformed-response' });
  }
  if (expectedRecordSize !== undefined && result.recordSize !== expectedRecordSize) {
    throw new SdkClientError(
      `record size ${result.recordSize} does not match expected ${expectedRecordSize}`,
      { code: 'record-size-mismatch' },
    );
  }
  const batch = result.batch === undefined ? undefined : validateBatch(result.batch);
  return Object.freeze({ ...result, items: Object.freeze([...result.items]), ...(batch ? { batch } : {}) });
}

export function createSdkClient({
  baseUrl = '/sdk/v1',
  fetchImpl = globalThis.fetch,
  expectedRecordSizes = {},
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('SDK client requires fetch');
  const root = normalizeBaseUrl(baseUrl);

  async function request(path, init = {}) {
    let response;
    try {
      response = await fetchImpl(joinUrl(root, path), { method: 'GET', ...init });
    } catch (error) {
      throw new SdkClientError(`SDK request failed: ${error.message}`, { code: 'network-error' });
    }
    if (!response?.ok) {
      let details = null;
      try { details = await response.json(); } catch { /* status is enough */ }
      throw new SdkClientError(`SDK request failed with HTTP ${response?.status ?? 0}`, {
        code: 'http-error', status: response?.status ?? 0, details,
      });
    }
    try {
      return await response.json();
    } catch (error) {
      throw new SdkClientError(`SDK response was not valid JSON: ${error.message}`, {
        code: 'invalid-json', status: response.status ?? 200,
      });
    }
  }

  return {
    baseUrl: root,
    async catalog() {
      return validateCatalog(await request(''));
    },
    async data(id, { after = undefined, expectedRecordSize = expectedRecordSizes[id] } = {}) {
      if (typeof id !== 'string' || !id) throw new TypeError('data source id is required');
      if (after !== undefined && (typeof after !== 'number' || !Number.isSafeInteger(after) || after < 0)) {
        throw new TypeError('after cursor must be a non-negative integer');
      }
      const query = after === undefined ? '' : `?after=${encodeURIComponent(after)}`;
      return validateData(await request(`data/${encodeURIComponent(id)}${query}`), expectedRecordSize);
    },
  };
}

export { validateBatch, validateCatalog, validateData };
