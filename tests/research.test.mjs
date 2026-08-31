import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  completedPaidResearchKeys,
  lowTechDisplayValues,
  lowTechSaveValues,
} from '../js/research.js';

const definitions = JSON.parse(readFileSync(new URL('../data/game/research.json', import.meta.url)));

test('game research data reproduces the LowTech paid/free boundary', () => {
  assert.equal(definitions.length, 117);
  assert.equal(definitions.filter(item => item.pointCost === 1).length, 87);
  assert.equal(definitions.filter(item => item.pointCost === 0).length, 30);
  const byKey = new Map(definitions.map(item => [item.key, item]));
  assert.equal(byKey.get('phone_tapping').pointCost, 1);
  assert.equal(byKey.get('woodcutting_planting').pointCost, 1);
  assert.equal(byKey.get('opec').pointCost, 1);
  assert.equal(byKey.get('pipeline_pressure').pointCost, 1);
  assert.equal(byKey.get('tourist_visa_east').pointCost, 1);
  assert.equal(byKey.get('tourist_visa_west').pointCost, 1);
  assert.equal(byKey.get('concrete_study').pointCost, 0);
  assert.equal(byKey.get('logistic_optimization').pointCost, 0);
  assert.equal(byKey.get('faculty_geology').pointCost, 0);
  assert.ok(definitions.every(item => item.en && item.de));
});

test('imported completion spends points only for completed paid research', () => {
  assert.deepEqual(completedPaidResearchKeys(definitions, [
    { key: 'phone_tapping', progress: 1 },
    { key: 'pipeline_pressure', progress: 1 },
    { key: 'tourist_visa_east', progress: 1 },
    { key: 'tourist_visa_west', progress: 1 },
    { key: 'concrete_study', progress: 1 },
    { key: 'opec', progress: 0.75 },
    { key: 'phone_tapping', progress: 1 },
  ]), ['phone_tapping', 'pipeline_pressure', 'tourist_visa_east', 'tourist_visa_west']);
});

// Only namepoints.bin and buildings_game.bin are required, so a perfectly
// valid save folder can have no research.bin. The worker reports that as null
// rather than undefined, which slips straight past a default parameter and
// crashed the whole LowTech research tab: render threw part-way, leaving the
// previous tab on screen while the navigation claimed otherwise.
test('a save with no research data is empty, not a crash', () => {
  assert.deepEqual(completedPaidResearchKeys(definitions, null), []);
  assert.deepEqual(completedPaidResearchKeys(definitions, undefined), []);
  assert.deepEqual(completedPaidResearchKeys(null, null), []);
  assert.deepEqual(completedPaidResearchKeys(undefined, undefined), []);
});

test('research progress is still read when the save does carry it', () => {
  const paid = definitions.filter(item => item.pointCost === 1).slice(0, 2).map(item => item.key);
  const free = definitions.find(item => item.pointCost === 0).key;

  const keys = completedPaidResearchKeys(definitions, [
    { key: paid[0], progress: 1 },
    { key: paid[1], progress: 0.5 },
    { key: free, progress: 1 },
  ]);

  assert.deepEqual(keys, [paid[0]], 'only completed paid research counts');
});

test('LowTech uses exact values from the loaded save', () => {
  const paid = definitions.find(item => item.pointCost === 1).key;
  assert.deepEqual(lowTechSaveValues({
    citizenCount: 20302,
    residentCount: 19815,
    cityScopeCount: 3,
    scopes: [
      { citizens: { residents: 199 } },
      { citizens: { residents: 200 } },
      { citizens: { residents: 2777 } },
      { citizens: null },
    ],
    research: [{ key: paid, progress: 1 }],
    sourceStatus: { workers: 'exact', research: 'exact' },
  }, {
    definitions,
    gameDate: { year: 2001, day: 116 },
  }), {
    population: 19815,
    cities: 2,
    currentYear: 2001,
    researched: 1,
    researchKeys: [paid],
  });
});

test('LowTech does not present the raw workers.bin record count as resident population', () => {
  assert.equal(lowTechSaveValues({
    citizenCount: 12777,
    sourceStatus: { workers: 'exact' },
  }, { definitions }).population, undefined);
});

test('LowTech prefers the game actual-population statistic over a workers.bin estimate', () => {
  const values = lowTechSaveValues({
    citizenCount: 12777,
    residentCount: 11959,
    sourceStatus: { workers: 'exact', stats: 'exact' },
  }, {
    definitions,
    statsRecords: [{
      year: 1970,
      adults: 8530,
      adultsParent: 116,
      childrenSmall: 1080,
      childrenMedium: 2224,
    }],
  });

  assert.equal(values.population, 11950);
});

test('LowTech falls back to housed citizens when population statistics are incomplete', () => {
  const values = lowTechSaveValues({
    residentCount: 11959,
    sourceStatus: { workers: 'exact', stats: 'exact' },
  }, {
    definitions,
    statsRecords: [{ year: 1970, adults: 8530 }],
  });

  assert.equal(values.population, 11959);
});

test('LowTech does not invent save values from missing optional files', () => {
  assert.deepEqual(lowTechSaveValues({
    citizenCount: 20302,
    cityScopeCount: 3,
    sourceStatus: { workers: 'missing', research: 'missing', stats: 'missing' },
  }, { definitions, gameDate: null }), {});
});

test('LowTech keeps an explicit manual override over save values', () => {
  const saveValues = { population: 20302, cities: 5, currentYear: 2001, researched: 86 };
  assert.equal(lowTechDisplayValues({ population: 2500 }, saveValues).population, 20302);
  assert.deepEqual(lowTechDisplayValues({
    inputSource: 'manual', population: 2500, cities: 1, currentYear: 1930, researched: 2,
  }, saveValues), {
    inputSource: 'manual', population: 2500, cities: 1, currentYear: 1930, researched: 2,
  });
});

test('LowTech prefers the newest imported stats year over stale plan provenance', () => {
  assert.equal(lowTechSaveValues({ sourceStatus: { stats: 'exact' } }, {
    definitions,
    gameDate: { year: 2001, day: 116 },
    statsRecords: [{ year: 2001 }, { year: 2002 }],
  }).currentYear, 2002);
});

test('LowTech uses the earliest valid imported history year as start year', () => {
  assert.equal(lowTechSaveValues({ sourceStatus: { stats: 'exact' } }, {
    definitions,
    gameDate: { year: 2001 },
    statsRecords: [{ year: 2001 }, { year: 1932 }, { year: 'bad' }, {}, { year: 1950 }],
  }).startYear, 1932);
});

test('LowTech leaves start year unavailable without exact usable history', () => {
  assert.equal(lowTechSaveValues({ sourceStatus: { stats: 'missing' } }, {
    definitions,
    gameDate: { year: 2001 },
    statsRecords: [{ year: 1932 }],
  }).startYear, undefined);
  assert.equal(lowTechSaveValues({ sourceStatus: { stats: 'exact' } }, {
    definitions,
    gameDate: { year: 2001 },
    statsRecords: [{ year: 'bad' }],
  }).startYear, undefined);
});
