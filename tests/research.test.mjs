import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completedPaidResearchKeys } from '../js/research.js';

const definitions = JSON.parse(readFileSync(new URL('../data/game/research.json', import.meta.url)));

test('game research data reproduces the LowTech paid/free boundary', () => {
  assert.equal(definitions.length, 117);
  assert.equal(definitions.filter(item => item.pointCost === 1).length, 84);
  assert.equal(definitions.filter(item => item.pointCost === 0).length, 33);
  const byKey = new Map(definitions.map(item => [item.key, item]));
  assert.equal(byKey.get('phone_tapping').pointCost, 1);
  assert.equal(byKey.get('woodcutting_planting').pointCost, 1);
  assert.equal(byKey.get('opec').pointCost, 1);
  assert.equal(byKey.get('concrete_study').pointCost, 0);
  assert.equal(byKey.get('logistic_optimization').pointCost, 0);
  assert.equal(byKey.get('faculty_geology').pointCost, 0);
  assert.ok(definitions.every(item => item.en && item.de));
});

test('imported completion spends points only for completed paid research', () => {
  assert.deepEqual(completedPaidResearchKeys(definitions, [
    { key: 'phone_tapping', progress: 1 },
    { key: 'concrete_study', progress: 1 },
    { key: 'opec', progress: 0.75 },
    { key: 'phone_tapping', progress: 1 },
  ]), ['phone_tapping']);
});
