import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLiveSdkAdapter, LIVE_SOURCE_IDS } from '../js/adapters/live_sdk_adapter.js';

const lifecycle = generation => ({
  ok: true, resultCode: 1, itemCount: 1, recordSize: 96,
  items: [{ ready: 1, sessionGeneration: generation, dateYear: 1984, dateDay: 123 }],
});

function clientFrom(sequence) {
  return {
    async catalog() { return { name: 'fake', version: 1, linked: true, sources: [...LIVE_SOURCE_IDS] }; },
    async data(id, { after = 0 } = {}) {
      if (id === 'lifecycle') return typeof sequence.lifecycle === 'function'
        ? sequence.lifecycle() : lifecycle(sequence.generation ?? 1);
      return sequence.data(id, after);
    },
  };
}

function basicData(id, after) {
  const rows = {
    game_state: [{ ready: 1, dateYear: 1984, dateDay: 123, buildingCount: 2, cityCount: 1 }],
    republic: [{ ready: 1, sequence: 11, republic: { smallChildren: 2, mediumChildren: 3, adultsParent: 4, adults: 5, averageProductivity: 0.8 } }],
    cities: [{ handle: 10, index: 0, name: 'Kohleburg', buildingCount: 2 }],
    buildings: [{ handle: 20, assetType: 7, currentWorkers: 4, configuredWorkers: 5, constructionProgress: 1 }],
    citizens: [{ handle: 30, ageYears: 22 }],
    resources: [{ id: 'steel', localPrice: 10 }],
    resource_flows: [{ resource: 'steel', scopeKind: 0, scopeIndex: 0, values: [1, 2] }],
    vehicles: [{ handle: 40, model: 'bus', lineId: 3 }],
    research: [{ key: 'research-a', progress: 0.5 }],
    global_events: [{ index: 0, type: 1 }],
    sdk_events: [{ sequence: after + 1, kind: 1, topic: 'tick' }],
  };
  const items = rows[id] ?? [];
  if (id === 'sdk_events') return {
    ok: true, resultCode: 1, itemCount: items.length, recordSize: 128, items,
    batch: {
      requestedAfterSequence: after, oldestAvailableSequence: items[0]?.sequence ?? after,
      newestAvailableSequence: items.at(-1)?.sequence ?? after,
      droppedBeforeCursor: 0, returnedCount: items.length, availableCount: items.length,
    },
  };
  return { ok: true, resultCode: 1, itemCount: items.length, recordSize: 64, items };
}

test('live adapter projects supported sources into evidence-backed domains', async () => {
  const adapter = createLiveSdkAdapter({
    client: clientFrom({ generation: 4, data: basicData }),
    now: () => '2026-07-28T10:00:00.000Z',
  });
  const result = await adapter.refresh();

  assert.equal(result.status, 'ready');
  assert.equal(result.model.generation, 4);
  assert.equal(result.model.republic.population.value, 14);
  assert.equal(result.model.areas.items[0].name, 'Kohleburg');
  assert.equal(result.model.buildings.items[0].currentWorkers, 4);
  assert.equal(result.model.resources.items[0].id, 'steel');
  assert.equal(result.model.transport.items[0].model, 'bus');
  assert.equal(result.model.events.items[0].sequence, 1);
  assert.equal(result.cursors.sdk_events, 1);
  assert.equal(result.model.resources.evidence.source, 'live-sdk');
});

test('missing live capabilities become unavailable evidence instead of fabricated rows', async () => {
  const client = {
    async catalog() { return { name: 'fake', version: 1, linked: true, sources: ['lifecycle', 'game_state'] }; },
    async data(id) {
      if (id === 'lifecycle') return lifecycle(1);
      return basicData(id, 0);
    },
  };
  const result = await createLiveSdkAdapter({ client }).refresh();
  assert.equal(result.model.buildings.completeness, 'unavailable');
  assert.match(result.model.buildings.evidence.warning, /buildings/i);
  assert.deepEqual(result.model.buildings.items, []);
});

test('generation changes discard the snapshot, publish resynchronizing, and atomically replace state on retry', async () => {
  let lifecycleReads = 0;
  const adapter = createLiveSdkAdapter({
    client: clientFrom({
      generation: 1,
      lifecycle: () => lifecycle(++lifecycleReads < 2 ? 1 : 2),
      data: basicData,
    }),
    maxAttempts: 2,
  });
  const result = await adapter.refresh();

  assert.equal(result.status, 'ready');
  assert.equal(result.model.generation, 2);
  assert.equal(result.resynchronized, true);
  assert.equal(adapter.state.status, 'ready');
});

test('cursor overflow and non-monotonic events force a clean resynchronization', async () => {
  let calls = 0;
  const adapter = createLiveSdkAdapter({
    client: clientFrom({
      generation: 1,
      data: (id, after) => {
        const result = basicData(id, after);
        if (id === 'sdk_events') {
          calls += 1;
          if (calls === 1) result.batch.droppedBeforeCursor = 1;
          else result.items = [{ sequence: 1, kind: 1, topic: 'reset' }];
          result.batch.oldestAvailableSequence = 1;
          result.batch.newestAvailableSequence = 1;
        }
        return result;
      },
    }),
    initialCursors: { sdk_events: 4 },
    maxAttempts: 2,
  });
  const result = await adapter.refresh();
  assert.equal(result.status, 'ready');
  assert.equal(result.resynchronized, true);
  assert.equal(result.cursors.sdk_events, 1);

  const nonMonotonic = createLiveSdkAdapter({
    client: clientFrom({
      generation: 1,
      data: (id, after) => {
        const result = basicData(id, after);
        if (id === 'sdk_events') {
          result.items = [{ sequence: after, kind: 1 }, { sequence: after - 1, kind: 1 }];
          result.batch.newestAvailableSequence = after;
        }
        return result;
      },
    }),
    initialCursors: { sdk_events: 4 },
    maxAttempts: 1,
  });
  const failed = await nonMonotonic.refresh();
  assert.equal(failed.status, 'resynchronizing');
  assert.equal(failed.model, null);
});
