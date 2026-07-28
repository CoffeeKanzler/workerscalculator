import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapRuntime } from '../js/bootstrap.js';
import { getRuntimeConfig, hasSaveWorkspace } from '../js/runtime/runtime_config.js';

test('runtime config uses explicit metadata and never infers beta mode from pathname', () => {
  const hosted = getRuntimeConfig({
    document: { documentElement: { dataset: { runtimeMode: 'hosted', runtimeVariant: 'standard' } } },
    location: { pathname: '/beta/index.html', search: '' },
  });
  assert.deepEqual(hosted, { mode: 'hosted', variant: 'standard', sdkBaseUrl: '/sdk/v1' });
});

test('hosted bootstrap is save-folder local-only and does not construct a live client', async () => {
  let network = 0;
  const runtime = bootstrapRuntime({
    config: { mode: 'hosted', variant: 'standard', sdkBaseUrl: '/sdk/v1' },
    fetchImpl: async () => { network += 1; },
  });
  assert.equal(runtime.mode, 'hosted');
  assert.equal(runtime.capabilities.live, false);
  assert.equal(runtime.capabilities.saveImport, true);
  assert.equal(runtime.live, null);
  await runtime.start();
  assert.equal(network, 0);
});

test('the normal hosted release exposes the save-folder workspace without beta branding', () => {
  const config = { mode: 'hosted', variant: 'standard', sdkBaseUrl: '/sdk/v1' };
  assert.equal(hasSaveWorkspace(config), true);
  assert.equal(config.variant, 'standard');
});

test('addon bootstrap uses the relative SDK bridge and keeps save import optional', async () => {
  const calls = [];
  const runtime = bootstrapRuntime({
    config: { mode: 'addon', variant: 'standard', sdkBaseUrl: '/sdk/v1' },
    fetchImpl: async url => {
      calls.push(url);
      return { ok: true, status: 200, async json() {
        if (String(url).endsWith('/sdk/v1')) return { name: 'fake', version: 1, linked: true, sources: ['lifecycle'] };
        return { ok: true, resultCode: 1, itemCount: 1, recordSize: 96,
          items: [{ ready: 1, sessionGeneration: 1, dateYear: 1984, dateDay: 1 }] };
      } };
    },
    live: { refresh: async () => ({ status: 'ready', model: { identity: { id: 'live:1' } } }) },
  });
  assert.equal(runtime.mode, 'addon');
  assert.equal(runtime.capabilities.live, true);
  assert.equal(runtime.capabilities.saveImport, true);
  const result = await runtime.start();
  assert.equal(result.status, 'ready');
  assert.equal(runtime.state.status, 'ready');
  assert.equal(runtime.state.model.identity.id, 'live:1');
  assert.equal(calls.length, 0);
});

test('runtime config rejects unknown modes and explicit addon URLs remain relative', () => {
  assert.throws(() => getRuntimeConfig({
    document: { documentElement: { dataset: { runtimeMode: 'cloud' } } },
    location: { pathname: '/', search: '' },
  }), /mode/i);
  const config = getRuntimeConfig({
    document: { documentElement: { dataset: { runtimeMode: 'addon', sdkBaseUrl: '/bridge/sdk/v1' } } },
    location: { pathname: '/', search: '' },
  });
  assert.equal(config.sdkBaseUrl, '/bridge/sdk/v1');
});
