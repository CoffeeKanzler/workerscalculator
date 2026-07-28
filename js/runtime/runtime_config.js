const MODES = new Set(['hosted', 'addon']);

function dataset(document) {
  return document?.documentElement?.dataset ?? {};
}

export function getRuntimeConfig({ document = globalThis.document, location = globalThis.location } = {}) {
  const data = dataset(document);
  const query = new URLSearchParams(location?.search ?? '');
  const mode = query.get('mode') ?? data.runtimeMode ?? 'hosted';
  if (!MODES.has(mode)) throw new TypeError(`Unsupported runtime mode '${mode}'`);
  const variant = query.get('variant') ?? data.runtimeVariant ?? 'standard';
  const sdkBaseUrl = query.get('sdk') ?? data.sdkBaseUrl ?? '/sdk/v1';
  if (!sdkBaseUrl || typeof sdkBaseUrl !== 'string'
    || /^\/\//.test(sdkBaseUrl) || /^[a-z][a-z\d+.-]*:/i.test(sdkBaseUrl)) {
    throw new TypeError('SDK base URL must be a non-empty relative path');
  }
  return Object.freeze({ mode, variant, sdkBaseUrl });
}

export function hasSaveWorkspace(config) {
  return config?.mode === 'hosted' || config?.variant === 'beta';
}

export { MODES };
