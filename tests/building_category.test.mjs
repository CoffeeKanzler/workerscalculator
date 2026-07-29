import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CATEGORIES, CATEGORY_MARKS, categoryForFlags, displayGroupFor,
  buildTypeCategoryIndex, categoryForSaveType,
} from '../js/models/building_category.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('a building is grouped by what it is for', () => {
  assert.equal(categoryForFlags(['TYPE_LIVING']), 'living');
  assert.equal(categoryForFlags(['TYPE_FACTORY']), 'industry');
  assert.equal(categoryForFlags(['TYPE_STORAGE']), 'storage');
  assert.equal(categoryForFlags(['TYPE_CARGO_STATION']), 'transport');
  assert.equal(categoryForFlags(['CIVIL_BUILDING']), 'civic');
});

// A building carries several flags at once, so precedence has to be decided
// rather than left to whichever happens to be first in the file.
test('a factory with storage attached is still a factory', () => {
  assert.equal(categoryForFlags(['TYPE_STORAGE', 'TYPE_FACTORY']), 'industry');
});

test('an unknown or empty set of flags falls to other, never to a guess', () => {
  assert.equal(categoryForFlags([]), 'other');
  assert.equal(categoryForFlags(null), 'other');
  assert.equal(categoryForFlags(['TYPE_SOMETHING_NEW']), 'other');
});

// Shape has to carry the category on its own: printed, projected, or read by
// someone who does not separate red from green.
test('every group has a mark, and the three that matter differ by shape', () => {
  for (const category of CATEGORIES) {
    assert.ok(CATEGORY_MARKS[category], `${category} has no mark`);
    assert.ok(CATEGORY_MARKS[category].shape);
    assert.ok(CATEGORY_MARKS[category].token);
  }
  const shapes = new Set(['living', 'industry', 'services'].map(c => CATEGORY_MARKS[c].shape));
  assert.equal(shapes.size, 3, 'houses, production and services must be told apart by shape alone');
});

// Plumbing is 82% of the markers on a real save. Drawn as loudly as the rest it
// would bury the three groups a player is actually looking for.
test('infrastructure is drawn smaller than the groups that carry meaning', () => {
  for (const quiet of ['support', 'other']) {
    for (const loud of ['living', 'industry', 'services']) {
      assert.ok(CATEGORY_MARKS[quiet].scale < CATEGORY_MARKS[loud].scale,
        `${quiet} should recede behind ${loud}`);
    }
  }
});

test('the fine-grained rules roll up into the groups shown on the map', () => {
  assert.equal(displayGroupFor('utility'), 'support');
  assert.equal(displayGroupFor('transport'), 'support');
  assert.equal(displayGroupFor('storage'), 'support');
  assert.equal(displayGroupFor('civic'), 'services');
  assert.equal(displayGroupFor('living'), 'living');
  assert.equal(displayGroupFor('anything-new'), 'other');
});

test('the lookup resolves a save type without searching', () => {
  const index = buildTypeCategoryIndex([
    { id: 'sewage_pump_1', types: ['TYPE_SEWAGE_PUMP'] },
    { id: 'dlc3/beer_stand', types: ['TYPE_SHOP'] },
  ]);
  assert.equal(categoryForSaveType('sewage_pump_1', index), 'support');
  assert.equal(categoryForSaveType('SEWAGE_PUMP_1', index), 'support');
});

// The save writes DLC and mirrored buildings with prefixes the dataset does
// not use; without the same normalisation the matcher applies, a whole DLC
// would draw as 'other'.
test('DLC and mirrored buildings resolve to their real category', () => {
  const index = buildTypeCategoryIndex([
    { id: 'dlc3/beer_stand', types: ['TYPE_SHOP'] },
    { id: 'sewage_pump_1', types: ['TYPE_SEWAGE_PUMP'] },
  ]);
  assert.equal(categoryForSaveType('DLC3_beer_stand', index), 'services');
  assert.equal(categoryForSaveType('MIRRORZ_sewage_pump_1', index), 'support');
  assert.equal(categoryForSaveType('MIRRORZ_DLC3_beer_stand', index), 'services');
});

test('an unknown type is other rather than an error', () => {
  const index = buildTypeCategoryIndex([]);
  assert.equal(categoryForSaveType('nothing_like_this', index), 'other');
  assert.equal(categoryForSaveType(null, index), 'other');
  assert.equal(categoryForSaveType('x', null), 'other');
});

// Against the real dataset: if most buildings fell to 'other' the map would be
// no more legible than the single circle it replaces.
test('the shipped dataset categorises the great majority of buildings', () => {
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/game/buildings_raw.json'), 'utf8'));
  const index = buildTypeCategoryIndex(raw);
  assert.ok(index.size > 500, `expected a large index, got ${index.size}`);

  const counts = new Map();
  for (const category of index.values()) counts.set(category, (counts.get(category) ?? 0) + 1);
  const other = counts.get('other') ?? 0;
  assert.ok(other / index.size < 0.5,
    `${other}/${index.size} fell to 'other'; the categories are not carrying their weight`);
  assert.ok((counts.get('living') ?? 0) > 0);
  assert.ok((counts.get('industry') ?? 0) > 0);
});
