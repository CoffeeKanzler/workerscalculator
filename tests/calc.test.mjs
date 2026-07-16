// Formula regression tests. Reference values come from the original
// spreadsheet ('ProduktionProductions', 'StädteCitys Neu', 'LowTech Forschung')
// evaluated with the sample prices embedded in data/resources.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Economy, evaluatePlan, evaluateCity, lowTechPoints,
  SEASON_FACTOR, NO_SEASON_FACTOR,
} from '../js/calc.js';

const res = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url)));
const buildings = JSON.parse(readFileSync(new URL('../data/production_buildings.json', import.meta.url)));
const { resources, defaults } = res;

const byDe = name => buildings.find(b => b.de === name);
const eco = opts => new Economy(resources, defaults, opts);

test('price lookup: sell/buy by German and English name and key', () => {
  const e = eco();
  assert.equal(e.sell('steel', 'RUB'), defaults.sellRUB.steel);
  assert.equal(e.sell('Stahl', 'RUB'), defaults.sellRUB.steel);
  assert.equal(e.buy('Steel', 'USD'), defaults.purchaseUSD.steel);
  assert.equal(e.sell('DoesNotExist', 'RUB'), 0);
  assert.equal(e.buy('workers', 'RUB'), defaults.workdayCostRUB);
});

test('Brennerei profit matches sheet G26 = 7506.114 ₽/day (inputs at sell price)', () => {
  const b = byDe('Brennerei');
  const { income, expenses, profit } = eco({ inputPriceMode: 'sell' }).buildingProfit(b, 'RUB');
  assert.ok(Math.abs(income - 12373.10156) < 0.01, `income ${income}`);
  assert.ok(Math.abs(expenses - 4866.987) < 0.01, `expenses ${expenses}`);
  assert.ok(Math.abs(profit - 7506.114333) < 0.01, `profit ${profit}`);
});

test('Brennerei expenses in buy/import mode = 5379.302 ₽/day', () => {
  const b = byDe('Brennerei');
  const { expenses } = eco({ inputPriceMode: 'buy' }).buildingProfit(b, 'RUB');
  assert.ok(Math.abs(expenses - 5379.302) < 0.01, `expenses ${expenses}`);
});

test('Kohlekraftwerk profit matches sheet G24 = 1852.097 ₽/day', () => {
  const b = byDe('Kohlekraftwerk');
  const { profit } = eco().buildingProfit(b, 'RUB');
  assert.ok(Math.abs(profit - 1852.097176) < 0.01, `profit ${profit}`);
});

test('delivery cost lowers sell and raises buy, but not for wire/pipe goods', () => {
  const e = eco({ inputPriceMode: 'buy', includeDelivery: true });
  assert.equal(e.outputPrice('steel', 'RUB'), defaults.sellRUB.steel - defaults.deliveryCostRUB);
  assert.equal(e.inputPrice('steel', 'RUB'), defaults.purchaseRUB.steel + defaults.deliveryCostRUB);
  assert.equal(e.outputPrice('eletric', 'RUB'), defaults.sellRUB.eletric);
  assert.equal(e.inputPrice('water', 'RUB'), defaults.purchaseRUB.water);
});

test('build cost = workdays × workday cost + Σ material × buy price', () => {
  const b = {
    de: 'synthetic', workdays: 100, gravel: 10, bricks: 5, steel: 2, concrete: 0,
    asphalt: 0, boards: 0, panels: 0, ecomponents: 0, mcomponents: 0,
  };
  const expected = 100 * defaults.workdayCostRUB
    + 10 * defaults.purchaseRUB.gravel
    + 5 * defaults.purchaseRUB.bricks
    + 2 * defaults.purchaseRUB.steel;
  assert.ok(Math.abs(eco().buildCost(b, 'RUB') - expected) < 1e-9);
});

test('mine production scales with quality, consumption does not', () => {
  const mine = byDe('Kohlemine');
  const settings = { productivity: 1, timeUnit: 'day', seasons: false, currency: 'RUB' };
  const full = evaluatePlan([{ building: mine, count: 1, quality: 1 }],
    { small: 0, medium: 0, large: 0, hectares: null }, settings, eco());
  const half = evaluatePlan([{ building: mine, count: 1, quality: 0.5 }],
    { small: 0, medium: 0, large: 0, hectares: null }, settings, eco());
  const key = mine.production[0].de;
  const get = r => [...r.balance.values()].find(e => e.name === key).produced;
  assert.ok(Math.abs(get(half) - get(full) / 2) < 1e-9);
});

test('time unit month multiplies rates ×30', () => {
  const b = byDe('Brennerei');
  const day = evaluatePlan([{ building: b, count: 1 }], { small: 0, medium: 0, large: 0, hectares: null },
    { productivity: 1, timeUnit: 'day', seasons: false, currency: 'RUB' }, eco());
  const month = evaluatePlan([{ building: b, count: 1 }], { small: 0, medium: 0, large: 0, hectares: null },
    { productivity: 1, timeUnit: 'month', seasons: false, currency: 'RUB' }, eco());
  assert.ok(Math.abs(month.totalProfit - 30 * day.totalProfit) < 1e-6);
});

test('field yield: 10 ha, seasons, fertilizer 1.5', () => {
  const r = evaluatePlan([], { small: 0, medium: 0, large: 0, hectares: 10 },
    { productivity: 1, timeUnit: 'day', seasons: true, fertilizer: 1.5, currency: 'RUB' }, eco());
  assert.ok(Math.abs(r.fieldPlants - 10 * SEASON_FACTOR * 1.5) < 1e-9);
  const r2 = evaluatePlan([], { small: 2, medium: 0, large: 1, hectares: null },
    { productivity: 1, timeUnit: 'day', seasons: false, fertilizer: 1, currency: 'RUB' }, eco());
  assert.ok(Math.abs(r2.fieldPlants - (2 * 0.39 + 4.81) * NO_SEASON_FACTOR) < 1e-9);
});

test('city: worker surplus (200 pop, 94 workers) = -20.5; service coverage', () => {
  const residential = {
    de: 'TestHaus', type: { de: 'Plattenbau', en: 'Prefab' }, inhabitants: 20, workers: 0,
    power: 0, maxKW: 0, water: 0, hotwater: 0, waste: 0, workdays: 0,
    gravel: 0, bricks: 0, steel: 0, concrete: 0, asphalt: 0, boards: 0, panels: 0,
    ecomponents: 0, mcomponents: 0, special: 0, visitors: 0,
  };
  const school = { ...residential, de: 'TestSchule', type: { de: 'Schule', en: 'School' }, inhabitants: 0, workers: 94, visitors: 150 };
  const city = {
    productivity: 0.7, cable: 'Untergrund Kabel 1,85 MW', exchanger: 'small', waterDivisor: 3,
    rows: [
      { building: residential, count: 10 },
      { building: school, count: 1 },
    ],
  };
  const r = evaluateCity(city, eco());
  assert.equal(r.population, 200);
  assert.equal(r.workersNeeded, 94);
  assert.ok(Math.abs(r.workerSurplus - (200 - 3 * 94) / 4) < 1e-9);
  const svc = r.services.find(s => s.id === 'school');
  assert.ok(Math.abs(svc.provided - 150 * 0.7 * 18) < 1e-9);
  assert.ok(Math.abs(svc.utilization - 200 / (150 * 0.7 * 18)) < 1e-9);
  // 10 residential buildings → needs 10/7 secret police vehicles
  assert.ok(Math.abs(r.secretPolice.needed - 10 / 7) < 1e-9);
});

test('LowTech example from the sheet = 4 points', () => {
  assert.equal(lowTechPoints({
    population: 4578, cities: 1, currentYear: 1940, startYear: 1920, researched: 1,
  }), 4);
});
