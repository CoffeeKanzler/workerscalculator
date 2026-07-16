import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rail = JSON.parse(readFileSync(new URL('../data/game/rail_vehicles.json', import.meta.url)));
const byName = new Map(rail.map(v => [v.name, v]));

test('game rail data nests hard-attached tenders instead of publishing choices', () => {
  assert.equal(rail.filter(v => v.attrs.Typ === 'Tender').length, 0);
  assert.equal(byName.get('FD-Serie').tender.name, 'FD Tender');
  assert.equal(byName.get('Ol49').tender.name, '25D49 (Ol49) Tender');
  assert.equal(byName.get('Ty45').tender.name, '32D43 (Ty45) Tender');
  assert.equal(byName.get('Pm2').tender.name, '34D44 (Pm2) Tender');
  assert.equal(byName.get('Br80').tender, undefined);
});
