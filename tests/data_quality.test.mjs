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

test('game dataset includes horse veterinary workshop', () => {
  const horseWorkshop = production.find(building => building.gameId === 'dlc3/h_repair_station');
  assert.ok(horseWorkshop, 'horse veterinary workshop is missing from the game dataset');
  assert.deepEqual(horseWorkshop.group, { de: 'Werkstätten', en: 'Workshops' });
  assert.equal(horseWorkshop.workers, 10);
  assert.deepEqual(horseWorkshop.production, []);
  assert.deepEqual(horseWorkshop.consumption, []);
  assert.ok(!production.some(building => building.gameId === 'repair_service_office'),
    'construction office must not be listed as a workshop');
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

test('heating output is computed from the building file, and still matches what was measured', () => {
  const heating = production.find(building => building.gameId === 'heating_plant_big');
  assert.equal(heating.production[0].de, 'Heißwasser');
  // Unchanged by the switch away from the sheet, which is the whole reason to
  // trust the rule: 350 in the ini x 30 workers / 10 is the 1050 the community
  // measured, and 350 x 30 / 50 is the 210 MJ the game itself publishes.
  assert.equal(heating.production[0].rate, 1050);
  // Previously sheet-measured, because it was copied from the sheet. It is now
  // derived from the building file, so claiming otherwise would understate it.
  assert.equal(heating.provenance.production, 'game-file');
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
  // 41 spreadsheet rows matched to a game building, plus the three water
  // supply buildings added straight from the game files by
  // tools/add_city_water_supply.py, which are the game building rather than a
  // row matched to one.
  assert.equal(identified.length, 44);
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
