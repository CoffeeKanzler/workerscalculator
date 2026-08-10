import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveElectronicsProducerSet } from '../js/models/electronics_analysis.js';

const raw = JSON.parse(readFileSync(new URL('../data/game/buildings_raw.json', import.meta.url)));

test('electronics producer evidence resolves both complete recipe chains', () => {
  const evidence = resolveElectronicsProducerSet(raw);

  assert.deepEqual(Object.fromEntries(Object.entries(evidence)
    .map(([variant, rows]) => [variant, rows.map(row => row.id)])), {
    vanilla: ['eletronic_components_factory', 'eletronic_factory'],
    dlc3: ['dlc3/electronic_components_factory', 'dlc3/electronics_factory'],
  });
  for (const rows of Object.values(evidence)) {
    for (const row of rows) {
      assert.ok(row.consumptionIncreaseAccordingYear, row.id);
      assert.ok(row.productionDecreaseAccordingYear, row.id);
    }
  }
});

test('an incomplete producer chain stays unavailable', () => {
  assert.equal(resolveElectronicsProducerSet(raw.filter(row =>
    row.id !== 'eletronic_components_factory')).vanilla, null);
});
