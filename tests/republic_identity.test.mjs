import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  republicFingerprint, areaOverlap, isSameRepublic,
} from '../js/models/republic_identity.js';

const save = (sourceName, path, names) => ({
  sourceName,
  header: { savePath: path },
  scopes: names.map((name, id) => ({ id, name })),
});

// The two real saves: one republic a year apart, saved under different names,
// sharing 42 of 43 settlement names.
const earlier = save('2001_Kohle_Tanker2', 'save/453 - 2001_Kohle_Tanker2',
  ['Tabarz', 'VEB Stoff&Bau', 'Zellertal', 'VEB Kies&Ziegel', 'Tavriyi',
    'Knappsack', 'VEB Sprengstoffwerke', 'Holzheim', 'Petrograd', 'Mühlheim']);
const later = save('Real N1.75 Mellerhöffe', 'save/10253 - Real N1.75 Mellerhöffe',
  ['Tabarz', 'VEB Stoff&Bau', 'Zellertal', 'VEB Kies&Ziegel', 'Tavriyi',
    'Knappsack', 'VEB Sprengstoffwerke', 'Holzheim', 'Petrograd', 'Mühlheim',
    'Neustadt', 'Bergdorf']);
const unrelated = save('myCanyon', 'save/14674 - myCanyon',
  ['Triba', 'Yakunetsk', 'Fichtenwalde', 'Noyarkassk', 'Grunewalde',
    'Domodny', 'Troipeysk', 'Groß Kieferntal', 'Sedlice', 'Ostrov']);

test('a republic saved under a different name is still the same republic', () => {
  // This is the case that was broken: different path, different title, so the
  // import re-seeded planning and discarded the user's edits.
  assert.notEqual(earlier.header.savePath, later.header.savePath);
  assert.equal(isSameRepublic(earlier, later), true);
});

test('an unrelated republic is not mistaken for a continuation', () => {
  assert.equal(isSameRepublic(earlier, unrelated), false);
  assert.equal(isSameRepublic(later, unrelated), false);
});

test('re-importing the very same file is certain, not a judgement call', () => {
  assert.equal(isSameRepublic(earlier, earlier), true);
});

test('founding new towns does not make a republic stop being itself', () => {
  // Overlap is measured against the smaller set for exactly this reason.
  assert.equal(later.scopes.length > earlier.scopes.length, true);
  assert.equal(areaOverlap(
    republicFingerprint(earlier).areas, republicFingerprint(later).areas,
  ), 1);
});

test('names are compared without case or padding tripping them up', () => {
  const spaced = save('x', 'p', [' tabarz ', 'VEB STOFF&BAU', 'Zellertal',
    'VEB Kies&Ziegel', 'Tavriyi', 'Knappsack']);
  assert.equal(areaOverlap(
    republicFingerprint(spaced).areas, republicFingerprint(earlier).areas,
  ), 1);
});

// The costly mistake is keeping a plan that describes neither republic, so a
// save too small to judge falls back to the name it was saved under.
test('a save with too few areas falls back to the saved name', () => {
  // Distinct paths, so the identical-path shortcut cannot answer this and the
  // name fallback is what is actually under test.
  const tiny = (sourceName, path) => save(sourceName, path, ['Alpha', 'Beta']);
  assert.equal(isSameRepublic(tiny('Starter', 'save/a'), tiny('Starter', 'save/b')), true);
  assert.equal(isSameRepublic(tiny('Starter', 'save/a'), tiny('Different', 'save/b')), false);
});

test('a missing or empty save is never a match', () => {
  assert.equal(isSameRepublic(null, later), false);
  assert.equal(isSameRepublic(earlier, null), false);
  assert.equal(isSameRepublic({}, {}), false);
});

test('half a republic in common is not enough to keep a plan', () => {
  const half = save('Half', 'save/h',
    ['Tabarz', 'VEB Stoff&Bau', 'Zellertal', 'VEB Kies&Ziegel', 'Tavriyi',
      'Nowhere', 'Elsewhere', 'Faraway', 'Distant', 'Remote']);
  assert.ok(areaOverlap(republicFingerprint(earlier).areas, republicFingerprint(half).areas) < 0.7);
  assert.equal(isSameRepublic(earlier, half), false);
});
