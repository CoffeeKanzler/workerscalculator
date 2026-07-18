import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rawBuildings = JSON.parse(readFileSync(new URL('../data/game/buildings_raw.json', import.meta.url)));
const production = JSON.parse(readFileSync(new URL('../data/game/production_buildings.json', import.meta.url)));
const cityBuildings = JSON.parse(readFileSync(new URL('../data/city_buildings.json', import.meta.url)));
const resources = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url))).resources;
const dataVersion = JSON.parse(readFileSync(new URL('../data/VERSION.json', import.meta.url)));

test('dataset metadata never invents an unrecorded upstream game build', () => {
  assert.match(dataVersion.datasetRelease, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dataVersion.gameFileExtraction, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dataVersion.gameBuild, null);
  assert.equal(dataVersion.gameBuildStatus, 'not-recorded');
});

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

test('stable city-building IDs expose only exact raw game facts', () => {
  const raw = new Map(rawBuildings.map(building => [building.id, building]));
  const identified = cityBuildings.filter(building => building.gameId);
  assert.equal(identified.length, 41);
  for (const building of identified) {
    const source = raw.get(building.gameId);
    assert.ok(source, `missing city source ${building.gameId}`);
    assert.equal(building.provenance.identity, 'game-file');
    assert.equal(building.workers, source.workers, `${building.gameId} workers`);
    if (source.livingSpace > 0) {
      assert.equal(building.inhabitants, source.livingSpace, `${building.gameId} housing`);
      assert.equal(building.quality, source.qualityOfLiving, `${building.gameId} quality`);
    }
    if (source.workers > 0 && source.citizenAbleServe > 0) {
      assert.equal(Math.max(building.visitors, building.special),
        source.workers * source.citizenAbleServe, `${building.gameId} service capacity`);
    }
  }
});
