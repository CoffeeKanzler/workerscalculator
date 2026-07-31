import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cityUtilityPlan, coverage, utilitySuppliers, UTILITY_KINDS } from '../js/models/city_utilities.js';

const catalogue = [
  { en: 'Small water well', workers: 0, power: 0, production: [{ en: 'Water', rate: 70 }] },
  { en: 'Big water well', workers: 7, power: 4.4, production: [{ en: 'Water', rate: 1505 }] },
  { en: 'Water treatment (small)', workers: 5, power: 3.9, production: [{ en: 'Water', rate: 120 }] },
  { en: 'Small heating plant', workers: 7, power: 12, production: [{ en: 'Hot water', rate: 210 }] },
  { en: 'Steel mill', workers: 50, power: 90, production: [{ en: 'Steel', rate: 4 }] },
];

test('only buildings that produce the utility are offered', () => {
  const names = utilitySuppliers(catalogue, 'water').map(entry => entry.building.en);
  assert.deepEqual(names, ['Small water well', 'Water treatment (small)', 'Big water well']);
  // A resource nothing in the catalogue makes yields no suppliers at all.
  assert.equal(utilitySuppliers(catalogue, 'uranium').length, 0);
});

test('coverage counts whole buildings, never a fraction of one', () => {
  // 71 of water is two small wells, not 1.014 of one.
  assert.deepEqual(coverage({ demand: 71, rate: 70, workers: 0, power: 0 }),
    { count: 2, supplied: 140, spare: 69, workers: 0, power: 0 });
  // Exactly on the boundary is one building, not two.
  assert.equal(coverage({ demand: 70, rate: 70 }).count, 1);
  assert.equal(coverage({ demand: 0, rate: 70 }).count, 0);
});

test('a supplier that produces nothing cannot cover anything', () => {
  assert.equal(coverage({ demand: 100, rate: 0 }), null);
});

test('the default supplier is the smallest that covers the demand alone', () => {
  const [water] = cityUtilityPlan({ demand: { water: 100 }, catalogue });
  assert.equal(water.chosen.en, 'Water treatment (small)');   // 120 covers 100; a well's 70 does not
  assert.equal(water.coverage.count, 1);

  const [small] = cityUtilityPlan({ demand: { water: 50 }, catalogue });
  assert.equal(small.chosen.en, 'Small water well');          // a hamlet gets a well
});

test('a demand larger than any single supplier still gets a plan', () => {
  const [water] = cityUtilityPlan({ demand: { water: 5000 }, catalogue });
  assert.equal(water.chosen.en, 'Big water well');
  assert.equal(water.coverage.count, 4);
  assert.ok(water.coverage.supplied >= 5000);
});

test('the reader can override the choice', () => {
  const [water] = cityUtilityPlan({
    demand: { water: 100 }, catalogue, choice: { water: 'Small water well' },
  });
  assert.equal(water.chosen.en, 'Small water well');
  assert.equal(water.coverage.count, 2);
  assert.equal(water.coverage.workers, 0);
});

test('heating is planned from the same shape', () => {
  const plan = cityUtilityPlan({ demand: { water: 0, hotwater: 400 }, catalogue });
  const heating = plan.find(entry => entry.kind === 'heating');
  assert.equal(heating.chosen.en, 'Small heating plant');
  assert.equal(heating.coverage.count, 2);
  assert.equal(heating.coverage.workers, 14);
});

// The rates this is worth anything for are the game's own, so a change in the
// shipped catalogue that lost them should fail here rather than silently
// recommend nothing.
test('the shipped catalogue still carries game-sourced supply rates', () => {
  const rows = JSON.parse(readFileSync(new URL('../data/game/production_buildings.json', import.meta.url)));
  // Water supply is the game's own word, and must stay that way.
  for (const name of ['Small water well', 'Big water well', 'Water treatment (big)']) {
    const building = rows.find(b => b.en === name);
    assert.ok(building, `${name} is missing from the catalogue`);
    assert.equal(building.provenance?.production, 'game-file', `${name} production is not game-sourced`);
  }
  // Heating too, now that the extractor computes it from the building file by
  // the rate x workers / 10 rule rather than copying a measured figure. The
  // rule is pinned here because it reproduces what the sheet measured for the
  // vanilla plants, which is the reason to believe it.
  const heating = rows.find(b => b.en === 'Small heating plant');
  assert.ok(heating, 'Small heating plant is missing from the catalogue');
  assert.equal(heating.provenance?.production, 'game-file');
  const hotWater = name => rows.find(b => b.en === name)
    .production.find(p => p.en === 'Hot water').rate;
  assert.equal(hotWater('Small heating plant'), 210);            // 300 x 7 / 10
  assert.equal(hotWater('Heating plant'), 1050);                 // 350 x 30 / 10
  assert.equal(hotWater('Incinerator - heating plant'), 675);    // 450 x 15 / 10
  // And it corrects the DLC plants nobody measured: these used to read 350,
  // 210 and 210, the last two being the vanilla small plant's figure copied.
  assert.equal(hotWater('Heating plant (20 workers)'), 700);     // 350 x 20 / 10
  assert.equal(hotWater('Small heating plant (3 workers)'), 60); // 200 x 3 / 10
  assert.equal(hotWater('Small heating plant (5 workers)'), 150);// 300 x 5 / 10
  const plan = cityUtilityPlan({ demand: { water: 575, hotwater: 300 }, catalogue: rows });
  for (const entry of plan) {
    assert.ok(entry.chosen, `nothing supplies ${entry.kind}`);
    assert.ok(entry.coverage.supplied >= entry.demand, `${entry.kind} is short`);
  }
});
