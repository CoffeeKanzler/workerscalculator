import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectSaveToRepublicModel, matchSaveBuilding } from '../js/adapters/save_projection.js';
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

// workers.bin stores a recycled 100-value appearance code at citizen offset 0,
// not an identity: real saves hold 20k-40k citizens across exactly 100 distinct
// values.  Only the parser's record index identifies a citizen, so the
// projection must key on it or every real republic fails to import.
test('citizens keep separate stable ids when the save reuses the same citizen code', () => {
  const save = syntheticSave();
  save.citizens = [
    { index: 0, id: 30065, health: .9, happiness: .8, loyalty: .7, criminality: 0 },
    { index: 1, id: 30065, health: .5, happiness: .4, loyalty: .3, criminality: .2 },
    { index: 2, id: 30065, health: .1, happiness: .2, loyalty: .3, criminality: .4 },
  ];

  const model = projectSaveToRepublicModel(save, { sourceName: 'Synthetic Republic', observedAt });

  assert.deepEqual(model.citizens.items.map(item => item.id), [0, 1, 2]);
  assert.equal(model.republic.population.value, 3);
});

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

// A save writes DLC buildings with an underscore prefix — "DLC3_beer_stand" —
// while the game files, and so our extracted dataset, key them by directory:
// "dlc3/beer_stand". Only CWC_ was ever translated, leaving the dlc1, dlc2 and
// dlc3 definitions we already hold unreachable: 230 of the 343 DLC entries.
// MIRRORZ_ is the game's own mirror-placement prefix, not a mod, and is
// stripped before any of this.
test('save DLC prefixes resolve to the directory ids the dataset uses', () => {
  const entries = [
    { id: 'dlc3/beer_stand' }, { id: 'dlc2/foundry' },
    { id: 'dlc1/small_shop' }, { id: 'cwc/magazyn1' },
  ];
  const idOf = entry => entry.id;

  assert.equal(matchSaveBuilding('DLC3_beer_stand', entries, idOf).id, 'dlc3/beer_stand');
  assert.equal(matchSaveBuilding('DLC2_foundry', entries, idOf).id, 'dlc2/foundry');
  assert.equal(matchSaveBuilding('DLC1_small_shop', entries, idOf).id, 'dlc1/small_shop');
  assert.equal(matchSaveBuilding('CWC_magazyn1', entries, idOf).id, 'cwc/magazyn1');
});

test('a mirrored DLC building resolves to the same definition as its original', () => {
  const entries = [{ id: 'dlc3/beer_stand' }];
  const idOf = entry => entry.id;

  assert.equal(matchSaveBuilding('MIRRORZ_DLC3_beer_stand', entries, idOf).id, 'dlc3/beer_stand');
});

test('a base game type is unaffected by the DLC translation', () => {
  const entries = [{ id: 'sewage_pump_1' }, { id: 'dlc3/beer_stand' }];
  const idOf = entry => entry.id;

  assert.equal(matchSaveBuilding('sewage_pump_1', entries, idOf).id, 'sewage_pump_1');
  assert.equal(matchSaveBuilding('DLC9_nonexistent', entries, idOf), null);
});
