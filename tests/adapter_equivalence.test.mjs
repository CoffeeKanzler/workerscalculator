import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectSaveToRepublicModel } from '../js/adapters/save_projection.js';
import { createLiveSdkAdapter, LIVE_SOURCE_IDS } from '../js/adapters/live_sdk_adapter.js';

const observedAt = '2026-07-28T12:00:00.000Z';

function syntheticSave() {
  return {
    header: { title: 'Synthetic Republic', savePath: 'fixture/save' },
    sourceStatus: Object.fromEntries(['namepoints', 'buildings', 'workers', 'vehicles', 'research', 'events', 'stats'].map(key => [key, 'exact'])),
    statsRecords: [{ year: 1984, day: 123, averageProductivity: .8, resourcesProduced: { steel: 12 } }],
    settlements: [{ id: 10, name: 'Kohleburg' }],
    buildings: [{ index: 20, type: 'steel_plant', currentWorkers: 4, configuredWorkers: 5 }],
    citizens: [{ id: 30, health: .9, happiness: .8, loyalty: .7, criminality: 0 }],
    vehicles: [{ id: 40, model: 'bus', lineId: 3 }],
    research: [{ key: 'research-a', progress: .5 }],
    events: [{ index: 50, eventType: 1 }],
  };
}

function liveClient() {
  const data = {
    lifecycle: [{ ready: 1, sessionGeneration: 7, dateYear: 1984, dateDay: 123 }],
    game_state: [{ ready: 1, dateYear: 1984, dateDay: 123, buildingCount: 1, cityCount: 1 }],
    republic: [{ sequence: 1, republic: { smallChildren: 0, mediumChildren: 0, adultsParent: 0, adults: 1, averageProductivity: .8 } }],
    cities: [{ handle: 10, name: 'Kohleburg' }],
    buildings: [{ handle: 20, currentWorkers: 4, configuredWorkers: 5 }],
    resources: [{ id: 'steel', produced: 12 }],
    vehicles: [{ handle: 40, model: 'bus', lineId: 3 }],
    research: [{ key: 'research-a', progress: .5 }],
    global_events: [{ index: 50, eventType: 1 }],
  };
  return {
    async catalog() { return { name: 'Synthetic Republic', version: 1, linked: true, sources: [...LIVE_SOURCE_IDS] }; },
    async data(id) { return { ok: true, resultCode: 1, itemCount: data[id]?.length ?? 0, recordSize: 64, items: data[id] ?? [] }; },
  };
}

test('synthetic save and fake SDK agree on shared republic facts with provenance differences', async () => {
  const save = projectSaveToRepublicModel(syntheticSave(), { sourceName: 'Synthetic Republic', observedAt });
  const live = await createLiveSdkAdapter({ client: liveClient(), now: () => observedAt }).refresh();
  assert.equal(live.status, 'ready');
  assert.equal(save.gameDate.year, live.model.gameDate.year);
  assert.equal(save.gameDate.day, live.model.gameDate.day);
  assert.equal(save.republic.population.value, live.model.republic.population.value);
  assert.equal(save.areas.items.length, live.model.areas.items.length);
  assert.equal(save.buildings.items.length, live.model.buildings.items.length);
  assert.equal(save.resources.items.length, live.model.resources.items.length);
  assert.equal(save.transport.items.length, live.model.transport.items.length);
  assert.equal(save.research.items.length, live.model.research.items.length);
  assert.equal(save.events.items.length, live.model.events.items.length);
  assert.equal(save.republic.population.evidence.source, 'save');
  assert.equal(live.model.republic.population.evidence.source, 'live-sdk');
});
