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

test('game construction resources add the explicit and the node-derived bill', () => {
  // coal_mine.ini states $COST_RESOURCE workers 3000 / concrete 180 / steel 45
  // and, per construction phase, $COST_RESOURCE_AUTO for ground, walls and
  // steel. The game adds the two, which the spreadsheet's own measured 3878
  // workdays confirms against 3000 + 878.5. Publishing the explicit lines
  // alone understates the mine by a third, and the dataset used to do exactly
  // that while claiming `game-file`.
  const coal = production.find(building => building.gameId === 'coal_mine');
  assert.equal(coal.workdays, 3878.5327282528924);
  assert.equal(coal.boards, 75);
  assert.equal(coal.concrete, 249.63124783878877);
  assert.equal(coal.steel, 74.83902940814868);
  assert.equal(coal.provenance.workdays, 'game-file');
  assert.equal(coal.provenance.concrete, 'game-file');
  assert.equal(coal.provenance.steel, 'game-file');
  // The game file states no power, so that stays a measured sheet value.
  assert.equal(coal.provenance.power, 'sheet-measured');
  assert.equal(coal.provenance.maxKW, 'sheet-measured');

  // The three mines are the only ones the spreadsheet also measured, and every
  // one lands on the sum rather than on either part.
  const measured = { coal_mine: 3878, iron_mine: 3928, uranium_mine: 5205 };
  for (const [gameId, workdays] of Object.entries(measured)) {
    const building = production.find(entry => entry.gameId === gameId);
    assert.ok(building, `${gameId} is missing from the game dataset`);
    assert.ok(Math.abs(building.workdays - workdays) < 1.5,
      `${gameId} workdays ${building.workdays} disagree with the measured ${workdays}`);
  }
});

test('a game-file construction value is the one the raw building states', () => {
  // This is the check that was missing: the dataset claimed `game-file` for 20
  // construction fields while 17 of them contradicted buildings_raw.json, and
  // nothing noticed, because a stale derived dataset still reads as
  // authoritative.
  const raw = new Map(rawBuildings.map(building => [building.id, building]));
  const fields = [['workdays', 'workers'], ['asphalt', 'asphalt'], ['boards', 'boards'],
    ['bricks', 'bricks'], ['concrete', 'concrete'], ['gravel', 'gravel'], ['steel', 'steel'],
    ['mcomponents', 'mcomponents'], ['panels', 'prefabpanels'], ['ecomponents', 'ecomponents']];
  let claimed = 0;
  for (const entry of production) {
    const source = raw.get(entry.gameId);
    if (!source) continue;
    for (const [field, rawField] of fields) {
      if (entry.provenance?.[field] !== 'game-file') continue;
      const stated = source.constructionResources?.[rawField];
      assert.ok(stated != null,
        `${entry.gameId} ${field} claims game-file but the building states no ${rawField}`);
      assert.ok(Math.abs(entry[field] - stated) <= Math.max(1e-6, Math.abs(stated) * 1e-9),
        `${entry.gameId} ${field} is ${entry[field]} but the building states ${stated}`);
      claimed += 1;
    }
  }
  assert.ok(claimed > 500, `only ${claimed} game-file construction fields to check`);
});

test('a building the game fully specifies is never published as a zero bill', () => {
  // dlc3/h_repair_station has no explicit $COST_RESOURCE at all: the whole bill
  // comes from the node-derived costs, and the dataset used to publish zeroes
  // while the raw source carried every quantity.
  const workshop = production.find(building => building.gameId === 'dlc3/h_repair_station');
  const source = rawBuildings.find(building => building.id === 'dlc3/h_repair_station');
  for (const [field, rawField] of [['workdays', 'workers'], ['boards', 'boards'],
    ['bricks', 'bricks'], ['concrete', 'concrete'], ['gravel', 'gravel'], ['steel', 'steel']]) {
    assert.ok(workshop[field] > 0, `${field} is not published for the horse workshop`);
    assert.equal(workshop.provenance[field], 'game-file');
    const stated = source.constructionResources[rawField];
    // The two files come from separate extraction runs, so compare with the
    // tolerance the sums deserve rather than bit-for-bit.
    assert.ok(Math.abs(workshop[field] - stated) <= Math.abs(stated) * 1e-12,
      `${field} is ${workshop[field]} but the building states ${stated}`);
  }
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
  // 41 spreadsheet rows matched to a game building, plus six water-supply
  // buildings added straight from the game files by
  // tools/add_city_water_supply.py, which are the game building rather than a
  // row matched to one.
  assert.equal(identified.length, 47);
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

test('city planner offers the early DLC water-supply buildings', () => {
  const expected = [
    ['dlc3/water_treatment', 'Wasseraufbereitung (klein) (10 Arbeiter)', 10, 240],
    ['dlc3/water_well', 'Wasserbrunnen (groß) (8 Arbeiter)', 8, 1920],
    ['dlc3/water_well_small', 'Wasserbrunnen (klein) (5 Arbeiter)', 5, 250],
  ];

  for (const [gameId, name, workers, waterSupply] of expected) {
    const building = cityBuildings.find(row => row.gameId === gameId);
    assert.ok(building, `${gameId} is missing from the city planner catalogue`);
    assert.equal(building.de, name);
    assert.equal(building.kind, 'Vanilla');
    assert.deepEqual(building.type, { de: 'Sonstiges', en: 'Miscellaneous' });
    assert.equal(building.workers, workers);
    assert.equal(building.waterSupply, waterSupply);
    assert.equal(building.dlc, 'dlc3');
  }
});
