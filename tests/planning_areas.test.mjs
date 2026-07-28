import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { planningAreas } from '../js/models/planning_areas.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const createDefault = () => ({ name: 'Nowa Huta', productivity: 0.7, rows: [] });

test('city planning falls back to one default area only when no save is loaded', () => {
  const areas = planningAreas({ cities: [], scopes: null, createDefault });
  assert.equal(areas.length, 1);
  assert.equal(areas[0].name, 'Nowa Huta');
  assert.equal(areas[0].syntheticArea, undefined);
});

test('city planning lists every city and production scope the save reported', () => {
  const areas = planningAreas({
    cities: [],
    scopes: [
      { id: 0, name: 'Kohleburg', city: true },
      { id: 1, name: 'Stahlwerk Nord', production: true },
      { id: 2, name: 'Nowhere', city: false, production: false },
    ],
    createDefault,
  });

  assert.deepEqual(areas.map(area => area.name), ['Kohleburg', 'Stahlwerk Nord']);
  assert.deepEqual(areas.map(area => area.scopeId), [0, 1]);
  assert.equal(areas.every(area => area.syntheticArea === true), true);
  // The placeholder must never be what a user with a save lands on.
  assert.equal(areas.some(area => area.name === 'Nowa Huta'), false);
});

test('city planning keeps the imported city object so edits bind to stored state', () => {
  const imported = { name: 'Kohleburg', scopeId: 0, rows: [{ name: 'Panelak' }], source: 'save' };
  const areas = planningAreas({
    cities: [imported],
    scopes: [{ id: 0, name: 'Kohleburg', city: true }, { id: 1, name: 'Stahlwerk Nord', production: true }],
    createDefault,
  });

  assert.equal(areas[0], imported);
  assert.equal(areas[0].syntheticArea, undefined);
  assert.equal(areas[1].syntheticArea, true);
});

test('city planning keeps hand-made areas that belong to no scope', () => {
  const handMade = { name: 'My test town', rows: [] };
  const areas = planningAreas({
    cities: [handMade],
    scopes: [{ id: 0, name: 'Kohleburg', city: true }],
    createDefault,
  });

  assert.deepEqual(areas.map(area => area.name), ['Kohleburg', 'My test town']);
  assert.equal(areas[1], handMade);
});

test('city planning renders through the shared area resolver instead of state.cities alone', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const renderCity = app.slice(app.indexOf('function renderCity()'), app.indexOf('function renderCity()') + 2000);

  assert.match(renderCity, /cityPlanningAreas\(\)/);
  assert.doesNotMatch(renderCity, /if \(!state\.cities\.length\) state\.cities\.push\(defaultCity\(\)\);/);
});

test('no code path plants the placeholder area on top of a loaded save', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const pushes = app.match(/state\.cities\.push\(defaultCity\(\)\)/g) ?? [];
  // Every remaining push must be guarded by the absence of imported scopes,
  // except the explicit "add area" button.
  assert.equal(app.includes('if (!state.cities.length) state.cities.push(defaultCity());'), false);
  assert.ok(pushes.length >= 1);
  assert.equal(
    (app.match(/!state\.cities\.length && !Array\.isArray\(state\.saveImport\?\.scopes\)/g) ?? []).length,
    3,
  );
});

test('opening an area from the republic overview resolves against the listed areas', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const openArea = app.slice(app.indexOf('const openArea ='), app.indexOf('const openArea =') + 400);

  assert.match(openArea, /cityPlanningAreas\(\)\.findIndex\(area => area\.scopeId === scopeId\)/);
});
