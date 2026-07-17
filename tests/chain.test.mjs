import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Economy } from '../js/calc.js';
import { solveChain, producersByResource } from '../js/chain.js';

const { resources, defaults } = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url)));
const gameBuildings = JSON.parse(readFileSync(new URL('../data/game/production_buildings.json', import.meta.url)));
const eco = new Economy(resources, defaults);

test('vehicles/trains transit markers are excluded from the dataset', () => {
  for (const b of gameBuildings) {
    for (const p of [...b.production, ...b.consumption]) {
      assert.ok(!['vehicles', 'trains'].includes(eco.keyForName(p.de)),
        `${b.de} has pseudo-resource ${p.de}`);
    }
  }
});

test('nuclear power chain converges (Zaporozie reactor)', () => {
  const r = solveChain('eletric', 5850, gameBuildings, eco,
    { producerChoice: new Map([['eletric', 'Zaporozie Reactor']]) });
  assert.ok(!r.diverged, 'chain diverged');
  const row = r.rows.find(x => x.key === 'eletric');
  assert.equal(row.building.de, 'Zaporozie Reactor');
  assert.ok(r.rows.find(x => x.key === 'nuclearfuel'), 'fuel chain present');
});

test('producers index covers core resources', () => {
  const idx = producersByResource(gameBuildings, eco);
  for (const key of ['steel', 'eletric', 'bricks', 'fuel', 'food', 'clothes']) {
    assert.ok(idx.get(key)?.length, `no producer for ${key}`);
  }
});

test('steel chain expands to iron and coal, and utilities induce power demand', () => {
  const r = solveChain('steel', 43, gameBuildings, eco, { productivity: 1, currency: 'RUB' });
  const keys = new Set(r.rows.map(x => x.key));
  assert.ok(keys.has('steel'));
  assert.ok(keys.has('iron'), 'steel mill needs iron');
  assert.ok(keys.has('coal'), 'steel mill needs coal');
  assert.ok(keys.has('eletric'), 'utilities: electricity demand');
  const steelRow = r.rows.find(x => x.key === 'steel');
  assert.equal(steelRow.countCeil, 1); // one steel mill produces 43 t/day
  assert.ok(r.totals.workers > 500, 'chain needs more workers than the mill alone');
  assert.ok(r.totals.revenue > 0);
});

test('marking a resource as import stops expansion and prices it', () => {
  const withImport = solveChain('steel', 43, gameBuildings, eco,
    { imports: new Set(['iron']) });
  const ironRow = withImport.rows.find(x => x.key === 'iron');
  assert.ok(ironRow.imported);
  assert.ok(ironRow.importCost > 0);
  // importing iron means no iron processing, no rawiron mining
  assert.ok(!withImport.rows.some(x => x.key === 'rawiron' && !x.imported && x.building));
});

test('demand scales linearly with the goal amount', () => {
  const a = solveChain('bricks', 51, gameBuildings, eco);
  const b = solveChain('bricks', 102, gameBuildings, eco);
  const fa = a.rows.find(x => x.key === 'bricks').count;
  const fb = b.rows.find(x => x.key === 'bricks').count;
  assert.ok(Math.abs(fb - 2 * fa) < 1e-6);
});

test('qualityTiers scales a mine\'s output, halving the buildings needed at double richness', () => {
  const base = solveChain('rawiron', 1000, gameBuildings, eco,
    { producerChoice: new Map([['rawiron', 'Eisenmine']]), includeUtilities: false });
  const richer = solveChain('rawiron', 1000, gameBuildings, eco,
    { producerChoice: new Map([['rawiron', 'Eisenmine']]), includeUtilities: false,
      qualityTiers: new Map([['rawiron', [{ quality: 2, count: 0 }]]]) });
  const baseCount = base.rows.find(x => x.key === 'rawiron').count;
  const richerCount = richer.rows.find(x => x.key === 'rawiron').count;
  assert.ok(Math.abs(richerCount - baseCount / 2) < 1e-6);
});

test('qualityTiers: fixed-count tiers contribute their own output, remainder auto-fills at the last tier\'s quality', () => {
  const goal = 5000;
  const result = solveChain('rawiron', goal, gameBuildings, eco,
    { producerChoice: new Map([['rawiron', 'Eisenmine']]), includeUtilities: false,
      qualityTiers: new Map([['rawiron', [{ quality: 1.5, count: 2 }, { quality: 0.5, count: 0 }]]]) });
  const row = result.rows.find(x => x.key === 'rawiron');
  const baseRate = row.building.production.find(p => eco.keyForName(p.de) === 'rawiron').rate;
  const richTierOutput = 2 * 1.5 * baseRate;
  const remaining = goal - richTierOutput;
  const expectedCount = 2 + remaining / (0.5 * baseRate);
  assert.ok(Math.abs(row.count - expectedCount) < 1e-6);
  assert.ok(Math.abs(row.output - goal) < 1e-6);
});

test('qualityTiers: a fully-specified (non-zero last count) tier list can leave a real shortfall', () => {
  const result = solveChain('rawiron', 2500, gameBuildings, eco,
    { producerChoice: new Map([['rawiron', 'Eisenmine']]), includeUtilities: false,
      qualityTiers: new Map([['rawiron', [{ quality: 1, count: 1 }]]]) });
  const row = result.rows.find(x => x.key === 'rawiron');
  assert.equal(row.count, 1);
  assert.ok(row.output < row.demand);
});

test('cyclic chains converge (power plants need coal, mining needs power)', () => {
  const r = solveChain('eletric', 5000, gameBuildings, eco,
    { producerChoice: new Map([['eletric', 'Kohlekraftwerk']]) });
  const powerRow = r.rows.find(x => x.key === 'eletric');
  assert.ok(powerRow && !powerRow.imported);
  assert.equal(powerRow.building.de, 'Kohlekraftwerk');
  assert.ok(r.rows.find(x => x.key === 'coal' || x.key === 'rawcoal'), 'fuel chain present');
  for (const [, dem] of r.demands) assert.ok(Number.isFinite(dem));
});
