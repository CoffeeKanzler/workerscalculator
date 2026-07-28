import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  observationForAutosave, hasHeavyMapData, TRANSIENT_KEYS, HEAVY_MAP_KEYS,
} from '../js/models/autosave_observation.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('transient status fields never reach the autosave', () => {
  const observation = observationForAutosave({
    tab: 'republic',
    saveImport: { sourceName: 'Kohleburg' },
    importStatus: 'Import failed: something',
    importStatusError: true,
    importBusy: true,
    statsRecords: [{ year: 1979 }],
    liveModel: { huge: true },
  });

  for (const key of TRANSIENT_KEYS) {
    assert.equal(Object.hasOwn(observation, key), false, `${key} must not be persisted`);
  }
  assert.equal(observation.tab, 'republic');
  assert.equal(observation.saveImport.sourceName, 'Kohleburg');
});

test('heavy map geometry is dropped but the rest of the save survives', () => {
  const observation = observationForAutosave({
    saveImport: {
      sourceName: 'Kohleburg',
      buildingCount: 1812,
      scopes: [{ id: 0, name: 'Tabarz', city: true }],
      roadNetwork: { segments: new Array(1000).fill(0) },
      terrainWater: { cells: new Array(1000).fill(0) },
    },
  });

  for (const key of HEAVY_MAP_KEYS) {
    assert.equal(Object.hasOwn(observation.saveImport, key), false, `${key} must not be autosaved`);
  }
  assert.equal(observation.saveImport.sourceName, 'Kohleburg');
  assert.equal(observation.saveImport.buildingCount, 1812);
  assert.equal(observation.saveImport.scopes.length, 1);
});

test('a save with no map geometry is passed through untouched', () => {
  const saveImport = { sourceName: 'Kohleburg', scopes: [] };
  assert.equal(hasHeavyMapData(saveImport), false);
  const observation = observationForAutosave({ saveImport });
  assert.equal(observation.saveImport, saveImport, 'no needless copy when there is nothing to strip');
});

test('a missing saveImport is not an error', () => {
  assert.equal(hasHeavyMapData(undefined), false);
  assert.equal(hasHeavyMapData(null), false);
  const observation = observationForAutosave({ tab: 'production' });
  assert.equal(observation.tab, 'production');
  assert.equal(observation.saveImport, undefined);
});

// The autosave used to serialise the whole state to strip map geometry, and
// the persistence layer then serialised the result again. On a multi-megabyte
// observation that doubled the main-thread cost of every keystroke.
test('the autosave path does not serialise the state before handing it over', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const saveState = app.slice(app.indexOf('function saveState()'));
  const body = saveState.slice(0, saveState.indexOf('\n}\n'));

  assert.match(body, /observationForAutosave\(/);
  assert.doesNotMatch(body, /serializePlannerState\(/);
});
