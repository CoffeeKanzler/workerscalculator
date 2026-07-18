import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rawBuildings = JSON.parse(readFileSync(new URL('../data/game/buildings_raw.json', import.meta.url)));
const production = JSON.parse(readFileSync(new URL('../data/game/production_buildings.json', import.meta.url)));
const resources = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url))).resources;

test('game production dataset keeps game workers and economic rates authoritative', () => {
  const raw = new Map(rawBuildings.map(building => [building.id, building]));
  const resourceKey = new Map(resources.flatMap(resource =>
    [[resource.de, resource.key], [resource.en, resource.key]]));
  for (const entry of production) {
    const source = raw.get(entry.gameId);
    assert.ok(source, `missing raw game building ${entry.gameId}`);
    assert.equal(entry.workers, source.workers, `${entry.gameId} worker count`);
    for (const output of entry.production) {
      const key = resourceKey.get(output.de) ?? resourceKey.get(output.en);
      if (!key || key === 'heat' || source.production[key] == null) continue;
      const expected = source.workers ? source.production[key] * source.workers : source.production[key];
      assert.equal(output.rate, Math.round(expected * 1e4) / 1e4,
        `${entry.gameId} ${key} output`);
    }
  }
});

test('explicit game construction resources override stale sheet measurements', () => {
  const coal = production.find(building => building.gameId === 'coal_mine');
  assert.equal(coal.workdays, 3000);
  assert.equal(coal.boards, 75);
  assert.equal(coal.concrete, 180);
  assert.equal(coal.steel, 45);
  assert.equal(coal.provenance.workdays, 'game-file');
  assert.equal(coal.provenance.power, 'sheet-measured');
});

test('sheet-unit heating output is not labelled as exact game production', () => {
  const heating = production.find(building => building.gameId === 'heating_plant_big');
  assert.equal(heating.production[0].de, 'Heißwasser');
  assert.equal(heating.production[0].rate, 1050);
  assert.equal(heating.provenance.production, 'sheet-measured');
  assert.equal(heating.provenance.consumption, 'game-file');

  const steel = production.find(building => building.gameId === 'steel_mill');
  assert.equal(steel.provenance.production, 'game-file');
});

test('per-second electricity stays a utility field, not a per-worker material input', () => {
  for (const source of rawBuildings) {
    if (source.consumptionPerSecond?.eletric != null) {
      assert.equal(source.consumption.eletric, undefined, `${source.id} mixed electricity units`);
    }
  }
  for (const building of production) {
    assert.equal(building.consumption.some(item => item.de === 'Strom' || item.en === 'Electricity'), false,
      `${building.gameId} exposes utility electricity as economic consumption`);
  }
});
