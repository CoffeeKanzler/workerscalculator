import { createSdkClient } from './adapters/sdk_client.js';
import { createLiveSdkAdapter } from './adapters/live_sdk_adapter.js';
import { importSaveFolder } from './adapters/save_folder_adapter.js?v=5';
import { createAddonRuntime } from './runtime/addon_runtime.js';
import { createHostedRuntime } from './runtime/hosted_runtime.js';
import { getRuntimeConfig } from './runtime/runtime_config.js';

export function bootstrapRuntime({
  config = getRuntimeConfig(),
  fetchImpl = globalThis.fetch,
  live = null,
  saveAdapter = { importSaveFolder },
} = {}) {
  if (config.mode === 'hosted') return createHostedRuntime({ saveAdapter });
  const client = createSdkClient({ baseUrl: config.sdkBaseUrl, fetchImpl });
  const liveAdapter = live ?? createLiveSdkAdapter({ client });
  return createAddonRuntime({ liveAdapter, saveAdapter });
}

export { createAddonRuntime, createHostedRuntime, createLiveSdkAdapter, createSdkClient, getRuntimeConfig };
