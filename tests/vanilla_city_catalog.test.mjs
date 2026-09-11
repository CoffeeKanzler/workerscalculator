import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeVanillaCityCatalog, mergeVanillaCityResidences } from '../js/models/vanilla_city_catalog.js';

const rawBuildings = JSON.parse(readFileSync(new URL('../data/game/buildings_raw.json', import.meta.url)));
const cityBuildings = JSON.parse(readFileSync(new URL('../data/city_buildings.json', import.meta.url)));

const rawResidence = id => ({
  id, de: 'Wohnungen - Plattenbau', en: 'Flats - prefab',
  types: ['TYPE_LIVING'], menuSfx: 'building_residential_medium',
  livingSpace: 68, qualityOfLiving: 0.85, workers: 0,
});

const normalize = value => String(value ?? '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
const signature = (name, inhabitants, quality) => JSON.stringify([
  normalize(name), Number(inhabitants), quality == null ? null : Number(quality),
]);

test('multiset matching consumes one existing row and appends the second identity', () => {
  const existing = [{
    de: 'Wohnungen - Plattenbau', en: 'Flats - prefab', kind: 'Vanilla',
    type: { de: 'Plattenbau', en: 'Prefab' }, inhabitants: 68, quality: 0.85,
    workdays: 400,
  }];
  const before = structuredClone(existing);
  const merged = mergeVanillaCityResidences(existing, [rawResidence('dlc3/a'), rawResidence('dlc3/b')]);
  assert.deepEqual(existing, before);
  assert.strictEqual(merged[0], existing[0]);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].gameId, 'dlc3/b');
  assert.equal(merged[1].workdays, null);
});

test('official menu residence merge excludes Workshop-shaped IDs', () => {
  const merged = mergeVanillaCityResidences([], [rawResidence('2124755644/prefab')]);
  assert.deepEqual(merged, []);
});

test('reported prefab2 is a medium 68-person 85-percent residence', () => {
  const merged = mergeVanillaCityResidences(cityBuildings, rawBuildings);
  const prefab = merged.find(row => row.gameId === 'dlc3/prefab2');
  assert.ok(prefab);
  assert.deepEqual(prefab.type, {
    de: 'Mittlere Wohnhäuser', en: 'Medium residential buildings',
  });
  assert.equal(prefab.inhabitants, 68);
  assert.equal(prefab.quality, 0.85);
  assert.equal(prefab.provenance.housing, 'game-file');
  assert.equal(prefab.provenance.workdays, 'unavailable');
});

test('every eligible official raw residence has one representation', () => {
  const merged = mergeVanillaCityResidences(cityBuildings, rawBuildings);
  const byId = new Set(merged.map(row => row.gameId).filter(Boolean));
  const signatureCounts = new Map();
  for (const row of merged.filter(row => !row.gameId)) {
    const key = signature(row.de || row.en, row.inhabitants, row.quality);
    signatureCounts.set(key, (signatureCounts.get(key) ?? 0) + 1);
  }
  const menuTypes = new Set([
    'building_residential_small', 'building_residential_medium',
    'building_residential_big', 'building_internat1',
  ]);
  for (const raw of rawBuildings) {
    if (!menuTypes.has(raw.menuSfx)
      || !raw.types?.includes('TYPE_LIVING')
      || !(Number.isFinite(raw.livingSpace) && raw.livingSpace > 0)
      || /^\d+\//.test(raw.id)) continue;
    if (byId.has(raw.id)) continue;
    const key = signature(raw.de ?? raw.nameStr ?? raw.id, raw.livingSpace, raw.qualityOfLiving);
    const remaining = signatureCounts.get(key) ?? 0;
    assert.ok(remaining > 0, `missing ${raw.id}`);
    signatureCounts.set(key, remaining - 1);
  }
});

test('official police stations are matched by exact staffing and missing variants are appended', () => {
  const rawPolice = [
    {
      id: 'police_small', de: 'Polizeirevier (klein)', en: 'Police station (small)',
      types: ['TYPE_POLICE_STATION'], workers: 12, professors: 12,
    },
    {
      id: 'dlc3/police_station_medium', de: 'Polizeirevier', en: 'Police station',
      types: ['TYPE_POLICE_STATION'], workers: 25, professors: 25,
    },
  ];
  const existing = [{
    de: 'Polizei klein', en: 'police small', kind: 'Vanilla',
    type: { de: 'Polizei', en: 'police' }, workers: 24, special: 12,
  }];

  const merged = mergeVanillaCityCatalog(existing, rawPolice);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].gameId, 'police_small');
  assert.equal(merged[0].workers, 24);
  assert.equal(merged[0].special, 12);

  const medium = merged.find(row => row.gameId === 'dlc3/police_station_medium');
  assert.ok(medium);
  assert.equal(medium.de, 'Polizeirevier (25 Helfer + 25 Polizisten)');
  assert.equal(medium.en, 'Police station (25 workers + 25 police officers)');
  assert.equal(medium.kind, 'Vanilla');
  assert.deepEqual(medium.type, { de: 'Polizei', en: 'police' });
  assert.equal(medium.workers, 50);
  assert.equal(medium.special, 25);
  assert.equal(medium.workdays, null);
  assert.equal(medium.provenance.workers, 'game-file');
  assert.equal(medium.provenance.specialStaff, 'game-file');
  assert.equal(medium.provenance.workdays, 'unavailable');
});

test('current game catalogue exposes the reported 25 plus 25 early police station', () => {
  const merged = mergeVanillaCityCatalog(cityBuildings, rawBuildings);
  const medium = merged.find(row => row.gameId === 'dlc3/police_station_medium');
  assert.ok(medium, 'dlc3/police_station_medium is missing from the city planner catalogue');
  assert.equal(medium.workers, 50);
  assert.equal(medium.special, 25);
});
