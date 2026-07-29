import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  workshopIdsInTypes, missingWorkshopIds, steamcmdScript,
} from '../tools/workshop_missing.mjs';

// A save names the mods it needs: workshop buildings carry the Steam item id
// as a prefix, so "2114329588/conveyortower1to1noroad" states its own origin.
test('workshop item ids are read out of building type names', () => {
  const ids = workshopIdsInTypes([
    '2114329588/conveyortower1to1noroad',
    '2114329588/conveyortower1to3noroad',
    '1893637213/Doorse_10_1',
    'pedestrian_tunel_entry',
    'CWC_magazyn1',
    '',
    null,
  ]);
  assert.deepEqual([...ids].sort(), ['1893637213', '2114329588']);
});

test('a base game or DLC type is never mistaken for a mod', () => {
  const ids = workshopIdsInTypes(['temp', 'sewage_pump_1', 'DLC3_beer_stand', 'MIRRORZ_sewage_pump_1']);
  assert.equal(ids.size, 0);
});

test('missing ids are those the local catalog has never heard of', () => {
  const catalog = { items: { 1111111111: {}, 2222222222: {} } };
  const missing = missingWorkshopIds(new Set(['2222222222', '3333333333', '1111111111']), catalog);
  assert.deepEqual(missing, ['3333333333']);
});

test('an empty or malformed catalog reports everything as missing', () => {
  assert.deepEqual(missingWorkshopIds(new Set(['123456']), null), ['123456']);
  assert.deepEqual(missingWorkshopIds(new Set(['123456']), { items: {} }), ['123456']);
});

// One steamcmd invocation, so the login is answered once rather than per mod.
test('the fetch script asks for every missing mod in a single login', () => {
  const script = steamcmdScript(['111', '222'], { account: 'someone' });
  assert.match(script, /\+login someone/);
  assert.equal((script.match(/\+workshop_download_item 784150/g) ?? []).length, 2);
  assert.equal((script.match(/\+login/g) ?? []).length, 1);
  assert.match(script, /\+quit/);
});
