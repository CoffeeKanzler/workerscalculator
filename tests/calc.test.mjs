// Formula regression tests. Reference values come from the original
// spreadsheet ('ProduktionProductions', 'StädteCitys Neu', 'LowTech Forschung')
// evaluated with the sample prices embedded in data/resources.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Economy, evaluatePlan, evaluateCity, lowTechPoints,
  evaluateVehicleProduction, recommendVehicleProduction, vehicleSaleValue,
  vehicleProductionGroup, SEASON_FACTOR, NO_SEASON_FACTOR,
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

test('delivery cost lowers exports and raises imported inputs, but not wire/pipe goods', () => {
  const e = eco({ inputPriceMode: 'buy', includeDelivery: true });
  assert.equal(e.outputPrice('steel', 'RUB'), defaults.sellRUB.steel - defaults.deliveryCostRUB);
  assert.equal(e.inputPrice('steel', 'RUB'), defaults.purchaseRUB.steel + defaults.deliveryCostRUB);
  assert.equal(e.outputPrice('eletric', 'RUB'), defaults.sellRUB.eletric);
  assert.equal(e.inputPrice('water', 'RUB'), defaults.purchaseRUB.water);
});

test('delivery never discounts consumed inputs in sell-price opportunity mode', () => {
  const e = eco({ inputPriceMode: 'sell', includeDelivery: true });
  assert.equal(e.inputPrice('steel', 'RUB'), defaults.sellRUB.steel);

  const distillery = byDe('Brennerei');
  const withoutDelivery = eco({ inputPriceMode: 'sell', includeDelivery: false })
    .buildingProfit(distillery, 'RUB').profit;
  const withDelivery = e.buildingProfit(distillery, 'RUB').profit;
  assert.ok(withDelivery <= withoutDelivery);
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
  // school is well under capacity -> optimal staffing is a fraction of the max
  assert.equal(svc.workersNeeded.max, 94);
  assert.ok(Math.abs(svc.workersNeeded.optimal - 94 * svc.utilization) < 1e-9);
  assert.ok(svc.workersNeeded.optimal < 94);
  // no quality data on this test building -> unrated, not zeroed
  assert.equal(r.avgHousingQuality, null);
});

test('city: average housing quality is population-weighted over rated buildings only', () => {
  const rated = {
    de: 'RatedHaus', type: { de: 'Plattenbau', en: 'Prefab' }, inhabitants: 40, quality: 0.8, workers: 0,
    power: 0, maxKW: 0, water: 0, hotwater: 0, waste: 0, workdays: 0,
    gravel: 0, bricks: 0, steel: 0, concrete: 0, asphalt: 0, boards: 0, panels: 0,
    ecomponents: 0, mcomponents: 0, special: 0, visitors: 0,
  };
  const unrated = { ...rated, de: 'ModHaus', quality: null, inhabitants: 1000 };
  const city = {
    productivity: 0.7, cable: 'Untergrund Kabel 1,85 MW', exchanger: 'small', waterDivisor: 3,
    rows: [
      { building: rated, count: 2 },
      { building: unrated, count: 1 },
    ],
  };
  const r = evaluateCity(city, eco());
  // unrated building's 1000 residents must not drag the average toward 0
  assert.ok(Math.abs(r.avgHousingQuality - 0.8) < 1e-9);
});

test('city: workersNeeded is capped at max when over-utilized (can only scale down, never up)', () => {
  const residential = {
    de: 'TestHaus', type: { de: 'Plattenbau', en: 'Prefab' }, inhabitants: 4000, workers: 0,
    power: 0, maxKW: 0, water: 0, hotwater: 0, waste: 0, workdays: 0,
    gravel: 0, bricks: 0, steel: 0, concrete: 0, asphalt: 0, boards: 0, panels: 0,
    ecomponents: 0, mcomponents: 0, special: 0, visitors: 0,
  };
  const school = { ...residential, de: 'TestSchule', type: { de: 'Schule', en: 'School' }, inhabitants: 0, workers: 94, visitors: 150 };
  const city = {
    productivity: 0.7, cable: 'Untergrund Kabel 1,85 MW', exchanger: 'small', waterDivisor: 3,
    rows: [
      { building: residential, count: 1 },
      { building: school, count: 1 },
    ],
  };
  const r = evaluateCity(city, eco());
  const svc = r.services.find(s => s.id === 'school');
  assert.ok(svc.utilization > 1);
  // over capacity: can't overstaff past the building's own worker slots, so
  // optimal is capped at max (building more is the actual fix, not more staff)
  assert.equal(svc.workersNeeded.max, 94);
  assert.equal(svc.workersNeeded.optimal, 94);
});

test('LowTech example from the sheet = 4 points', () => {
  assert.equal(lowTechPoints({
    population: 4578, cities: 1, currentYear: 1940, startYear: 1920, researched: 1,
  }), 4);
});

test('vehicle production follows sheet material and workday throughput formula', () => {
  const vehicle = {
    attrs: {
      Arbeitstage: 1000, Stahl: 10, Aluminium: 2, Kunststoffe: 3,
      Stoff: 4, 'Mechanik-Bauteile': 5, 'Elektronik-Bauteile': 6,
      Elektronik: 7,
    },
  };
  const prices = {
    Stahl: 2, Aluminium: 3, Kunststoffe: 4, Stoff: 5,
    'Mechanik-Bauteile': 6, 'Elektronik-Bauteile': 7, Elektronik: 8,
  };
  const fakeEco = { inputPrice: name => prices[name] ?? 0 };
  const result = evaluateVehicleProduction(vehicle, {
    workers: 100, productivity: 0.8, timeUnit: 'year', salePrice: 500,
    currency: 'RUB',
  }, fakeEco);
  assert.equal(result.materialCostPerUnit, 186);
  assert.equal(result.units, 29.2);
  assert.equal(result.income, 14600);
  assert.equal(result.expenses, 5431.2);
  assert.equal(result.profit, 9168.8);
  assert.ok(Math.abs(result.profitPerWorker - 91.688) < 1e-9);
});

test('vehicle sale value uses save prices and game export adjustments', () => {
  const vehicle = {
    attrs: {
      Typ: 'Bus', Bauland: 'Sowjetunion', Arbeitstage: 100,
      Stahl: 2, Aluminium: 0, Kunststoffe: 0, Stoff: 0,
      'Mechanik-Bauteile': 3, 'Elektronik-Bauteile': 0, Elektronik: 0,
    },
  };
  const fakeEco = {
    workday: currency => currency === 'RUB' ? 10 : 4,
    sell: (key, currency) => ({ steel: 20, mcomponents: 30 })[key] * (currency === 'RUB' ? 1 : 0.5),
  };
  assert.equal(vehicleSaleValue(vehicle, 'RUB', fakeEco), 100 * 10 * 0.45 + 2 * 20 + 3 * 30);
  const usd = (((100 * 4) * 0.65 + 2 * 10) * 0.65 + 3 * 15) * 0.65;
  assert.ok(Math.abs(vehicleSaleValue(vehicle, 'USD', fakeEco) - usd) < 1e-9);
});

test('western aircraft get RUB cross-market adjustment and aircraft multiplier', () => {
  const vehicle = {
    attrs: {
      Typ: 'Flugzeug', Bauland: 'West Germany', Arbeitstage: 10,
      Stahl: 1, Aluminium: 0, Kunststoffe: 0, Stoff: 0,
      'Mechanik-Bauteile': 0, 'Elektronik-Bauteile': 0, Elektronik: 0,
    },
  };
  const fakeEco = { workday: () => 10, sell: () => 20 };
  const expected = ((10 * 10 * 0.45) * 1.27 + 20) * 1.27 * 2;
  assert.ok(Math.abs(vehicleSaleValue(vehicle, 'RUB', fakeEco) - expected) < 1e-9);
});

test('cross-market formula restores separate body and engine component order', () => {
  const vehicle = {
    attrs: {
      Typ: 'Flugzeug', Bauland: 'West Germany', Leergewicht: 2, Motorleistung: 1000,
      Arbeitstage: 500, Stahl: 10, Aluminium: 0, Kunststoffe: 0, Stoff: 0,
      'Mechanik-Bauteile': 20, 'Elektronik-Bauteile': 0, Elektronik: 0,
    },
  };
  const fakeEco = { workday: () => 1, sell: () => 1 };
  const workerParts = splitByRatio(500, 350, 150);
  const mechanicalParts = splitByRatio(20, .34, .7);
  let expected = 0;
  for (const amount of [workerParts[0] * .45, 10, mechanicalParts[0], workerParts[1] * .45, mechanicalParts[1]]) {
    expected = (expected + amount) * 1.27;
  }
  assert.ok(Math.abs(vehicleSaleValue(vehicle, 'RUB', fakeEco) - expected * 2) < 1e-9);
});

function splitByRatio(total, first, second) {
  return [total * first / (first + second), total * second / (first + second)];
}

test('vehicle recommendations rank profitable models per worker', () => {
  const vehicles = [
    { name: 'Slow', attrs: { Typ: 'Bus', Arbeitstage: 100, Stahl: 5 } },
    { name: 'Best', attrs: { Typ: 'Bus', Arbeitstage: 50, Stahl: 2 } },
    { name: 'Loss', attrs: { Typ: 'Bus', Arbeitstage: 10, Stahl: 100 } },
    { name: 'No recipe', attrs: { Typ: 'Bus', Arbeitstage: 0 } },
  ];
  const fakeEco = { inputPrice: () => 10 };
  const rows = recommendVehicleProduction(vehicles, {
    workers: 100, productivity: 1, timeUnit: 'year', currency: 'RUB',
    salePrice: 100,
  }, fakeEco, 2);
  assert.deepEqual(rows.map(row => row.vehicle.name), ['Best', 'Slow']);
  assert.ok(rows[0].result.profitPerWorker > rows[1].result.profitPerWorker);
});

test('vehicle production groups match factory categories', () => {
  const vehicle = type => ({ attrs: { Typ: type } });
  assert.equal(vehicleProductionGroup(vehicle('Bus')), 'road');
  assert.equal(vehicleProductionGroup(vehicle('Lokomotive')), 'trains');
  assert.equal(vehicleProductionGroup(vehicle('Frachtschiff')), 'boats');
  assert.equal(vehicleProductionGroup(vehicle('Hubschrauber')), 'aircraft');
});
