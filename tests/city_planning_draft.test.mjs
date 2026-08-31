import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_PLANNING_DRAFT_KEY,
  loadCityPlanningDraft,
  saveCityPlanningDraft,
} from '../js/storage/city_planning_draft.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('city planning draft round-trips the latest revision synchronously', () => {
  const storage = memoryStorage();
  assert.equal(saveCityPlanningDraft({
    revision: 7,
    activeCity: 1,
    cities: [{ name: 'Nowa Huta' }, { name: 'Refresh-safe city', rows: [{ count: 2 }] }],
  }, storage), true);

  assert.deepEqual(loadCityPlanningDraft(storage), {
    schemaVersion: 1,
    revision: 7,
    activeCity: 1,
    cities: [{ name: 'Nowa Huta' }, { name: 'Refresh-safe city', rows: [{ count: 2 }] }],
  });
});

test('invalid and unavailable city draft storage is ignored', () => {
  const storage = memoryStorage();
  storage.setItem(CITY_PLANNING_DRAFT_KEY, '{broken');
  assert.equal(loadCityPlanningDraft(storage), null);
  assert.equal(saveCityPlanningDraft({ cities: [] }, {
    setItem() { throw new Error('quota'); },
  }), false);
});
