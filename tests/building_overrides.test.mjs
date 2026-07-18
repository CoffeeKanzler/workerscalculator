import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBuildingOverrides, buildingOverrideKey } from '../js/building_overrides.js';

const building = {
  gameId: 'steel_mill', en: 'Steel mill', de: 'Stahlwerk', workers: 500,
  power: 10, production: [{ en: 'Steel', de: 'Stahl', rate: 40 }],
  consumption: [{ en: 'Iron', de: 'Eisen', rate: 80 }],
  provenance: { workers: 'game-file' },
};

test('building overrides are dataset-scoped and leave source objects untouched', () => {
  const overrides = {
    'game:steel_mill': { workers: 420, power: 12, production: { Steel: 50 }, consumption: { Iron: 75 } },
  };
  const [changed] = applyBuildingOverrides([building], overrides, 'game');
  assert.equal(changed.workers, 420);
  assert.equal(changed.power, 12);
  assert.equal(changed.production[0].rate, 50);
  assert.equal(changed.consumption[0].rate, 75);
  assert.equal(changed.provenance.userOverride, true);
  assert.equal(changed.provenance.workers, 'user-override');
  assert.equal(changed.provenance.production, 'user-override');
  assert.equal(building.workers, 500);
  assert.equal(building.production[0].rate, 40);
  assert.strictEqual(applyBuildingOverrides([building], overrides, 'sheet')[0], building);
});

test('building override identity falls back to a stable localized name', () => {
  assert.equal(buildingOverrideKey('sheet', {
    en: 'Steel mill', de: 'Stahlwerk', group: { en: 'Metallurgy', de: 'Metallurgie' },
  }), 'sheet:Metallurgy:Steel mill');
});
