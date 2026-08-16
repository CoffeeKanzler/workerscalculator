import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_CORE_CATEGORY_TYPES,
  aggregateCityObservations,
  addMissingCityCategoryRows,
  cityBuildingDisplayName,
  cityWorkshopBuildings,
  resolveCityWorkshopRows,
} from '../js/city_planning.js';

test('city building names distinguish DLC variants', () => {
  assert.equal(cityBuildingDisplayName({ de: 'Wasserbrunnen', dlc: 'dlc3' }, 'de'),
    'Wasserbrunnen [DLC]');
  assert.equal(cityBuildingDisplayName({ en: 'Water well' }, 'en'), 'Water well');
});

test('aggregates assigned real cities without changing the planned rows', () => {
  const result = aggregateCityObservations([
    { scopeId: 1, rows: [{ sourceGameId: 'house', count: 2 }], observed: { residents: 100, happiness: .5 } },
    { scopeId: 2, rows: [{ sourceGameId: 'house', count: 3 }], observed: { residents: 50, happiness: .8 } },
  ], [1, 2]);

  assert.equal(result.rows[0].count, 5);
  assert.equal(result.observed.residents, 150);
  assert.equal(result.observed.happiness, 0.6);
});

test('city quick-start covers the requested exact building categories', () => {
  assert.deepEqual([...CITY_CORE_CATEGORY_TYPES], [
    'Rathaus', 'Einkaufzentrum', 'Alkohol', 'Kindergarten', 'Schule', 'Universität',
    'Polizei', 'Krankenhaus', 'Feuerwehr', 'Kino', 'Sport', 'Kultur',
  ]);
});

test('city quick-start preserves rows and is idempotent', () => {
  const existing = { type: 'Schule', name: 'Schule konkret', count: 2 };
  const initial = [existing, { type: 'Wohngebäude', name: 'Haus', count: 1 }];
  const first = addMissingCityCategoryRows(initial);

  assert.equal(first.rows.length, initial.length + 11);
  assert.equal(first.rows[0], existing);
  assert.equal(first.addedTypes.includes('Schule'), false);
  assert.deepEqual(first.rows.filter(row => row.categoryOnly).map(row => row.type),
    CITY_CORE_CATEGORY_TYPES.filter(type => type !== 'Schule'));

  const second = addMissingCityCategoryRows(first.rows);
  assert.equal(second.rows.length, first.rows.length);
  assert.deepEqual(second.addedTypes, []);
  assert.equal(second.rows.filter(row => row.type === 'Schule').length, 1);
});

const workshopCatalog = [
  {
    gameId: 'dlc3/h_repair_station',
    de: 'Pferdearzt und Tischlerei',
    group: { de: 'Werkstätten', en: 'Workshops' },
    workers: 10,
  },
  {
    gameId: 'coal_mine',
    de: 'Kohlemine',
    group: { de: 'Rohstoffe', en: 'Resources' },
    workers: 300,
  },
];

test('city workshops are selected by the bilingual workshop group', () => {
  assert.deepEqual(cityWorkshopBuildings(workshopCatalog).map(building => building.gameId),
    ['dlc3/h_repair_station']);
});

test('city workshop rows resolve by stable gameId and retain unknown rows', () => {
  const rows = resolveCityWorkshopRows([
    { gameId: 'dlc3/h_repair_station', count: 2 },
    { gameId: 'missing/workshop', count: 1 },
  ], workshopCatalog);
  assert.equal(rows[0].building.workers, 10);
  assert.equal(rows[1].building, null);
  assert.equal(rows[1].gameId, 'missing/workshop');
});
