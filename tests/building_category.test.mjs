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

// --- coverage against the real dataset ---------------------------------
//
// The rules above were first written from guesswork about what the game's
// flags are called, and roughly half of the names matched nothing: police
// stations, oil wells, fire stations, road depots and rail transformers all
// silently landed in 'other', which on the map is an undifferentiated grey
// dot. Nothing failed, because a rule that matches nothing is not an error —
// it is just a rule that never fires.
//
// These read the extracted dataset itself, so a flag that exists in the game
// and is named in no rule is a failure rather than a silent miscategorisation.

import { CATEGORY_RULES, UNCATEGORISED_FLAGS } from '../js/models/building_category.js';

const dataset = (() => {
  const parsed = JSON.parse(readFileSync(
    new URL('../data/game/buildings_raw.json', import.meta.url), 'utf8'));
  return parsed.buildings ?? parsed;
})();

const datasetFlags = new Set(dataset.flatMap(building => building.types ?? []));
const ruleFlags = new Set(CATEGORY_RULES.flatMap(([, flags]) => flags));

test('every flag the dataset uses is named by some rule', () => {
  const ignored = new Set(UNCATEGORISED_FLAGS);
  const unhandled = [...datasetFlags].filter(flag => !ruleFlags.has(flag) && !ignored.has(flag));
  assert.deepEqual(unhandled, [],
    `these flags exist in the dataset but no rule mentions them:\n  ${unhandled.join('\n  ')}`);
});

test('no rule names a flag the dataset never uses', () => {
  // A rule that matches nothing is the failure mode this whole block exists
  // for: it looks like coverage and provides none.
  const dead = [...ruleFlags].filter(flag => !datasetFlags.has(flag));
  assert.deepEqual(dead, [],
    `these rules can never match; check the spelling against the dataset:\n  ${dead.join('\n  ')}`);
});

test('the dataset leaves few building types uncategorised', () => {
  const uncategorised = dataset.filter(building =>
    categoryForFlags(building.types) === 'other');
  // Some entries genuinely carry no type flags at all — decorations, fences,
  // terrain pieces. The bar is that this stays a small minority rather than
  // the near-half it was when the flag names were guesses.
  assert.ok(uncategorised.length / dataset.length < 0.2,
    `${uncategorised.length} of ${dataset.length} dataset types fall to 'other': `
    + uncategorised.slice(0, 15).map(building => building.id).join(', '));
});

test('the vanilla types that were miscategorised now land where they belong', () => {
  const index = buildTypeCategoryIndex(dataset);
  // Each of these was 'other' before the flag names were read off the dataset.
  assert.equal(categoryForSaveType('police', index), 'services');
  assert.equal(categoryForSaveType('police_small', index), 'services');
  assert.equal(categoryForSaveType('oil_mine', index), 'industry');
  assert.equal(categoryForSaveType('rail_trafo', index), 'support');
  assert.equal(categoryForSaveType('muddy_depot', index), 'support');
  // A water well is flagged as a mine but supplies water, so it reads as
  // plumbing rather than as an ore pit.
  assert.equal(categoryForSaveType('water_well_small', index), 'support');
});

test('a DLC building is categorised through its prefix', () => {
  const index = buildTypeCategoryIndex(dataset);
  assert.equal(categoryForSaveType('CWC_Kindergarten1', index), 'services');
  // The save writes mirrored placements with a prefix the dataset never uses.
  assert.equal(categoryForSaveType('MIRRORZ_CWC_Kindergarten1', index), 'services');
});
