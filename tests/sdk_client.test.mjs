import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SdkClientError, createSdkClient } from '../js/adapters/sdk_client.js';

function response(body, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    ok,
    status,
    async json() { return body; },
  };
}

test('SDK client uses a relative gateway URL and validates catalog envelopes', async () => {
  const calls = [];
  const client = createSdkClient({
    baseUrl: '/sdk/v1',
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return response({ name: 'fake gateway', version: 1, linked: true, sources: ['lifecycle'] });
    },
  });

  const catalog = await client.catalog();

  assert.deepEqual(catalog.sources, ['lifecycle']);
  assert.equal(calls[0][0], '/sdk/v1');
  assert.equal(calls[0][1].method, 'GET');
});

test('SDK client rejects HTTP failures and malformed record envelopes', async () => {
  const client = createSdkClient({
    fetchImpl: async () => response({ error: 'no game link' }, { status: 503, ok: false }),
  });
  await assert.rejects(client.catalog(), error => {
    assert.ok(error instanceof SdkClientError);
    assert.equal(error.status, 503);
    return true;
  });

  const malformed = createSdkClient({
    fetchImpl: async () => response({ ok: true, resultCode: 1, itemCount: 1, recordSize: 0, items: 'not-an-array' }),
  });
  await assert.rejects(malformed.data('buildings'), /items must be an array/i);
});

test('SDK client validates record size, cursor batches, and encodes after cursors', async () => {
  const calls = [];
  const client = createSdkClient({
    expectedRecordSizes: { buildings: 64 },
    fetchImpl: async (url) => {
      calls.push(url);
      return response({
        ok: true, resultCode: 1, itemCount: 1, recordSize: 64,
        items: [{ handle: 7 }],
        batch: {
          requestedAfterSequence: 4, oldestAvailableSequence: 5,
          newestAvailableSequence: 5, droppedBeforeCursor: 0,
          returnedCount: 1, availableCount: 1,
        },
      });
    },
  });
  const result = await client.data('sdk_events', { after: 4 });
  assert.equal(result.batch.newestAvailableSequence, 5);
  assert.match(calls[0], /\/sdk\/v1\/data\/sdk_events\?after=4$/);
  await assert.rejects(client.data('buildings', { expectedRecordSize: 32 }), /record size/i);
});

test('SDK client rejects invalid cursors and non-object JSON', async () => {
  const client = createSdkClient({ fetchImpl: async () => response(null) });
  await assert.rejects(client.data('events', { after: -1 }), /after cursor/i);
  await assert.rejects(client.catalog(), /catalog response must be an object/i);
});
