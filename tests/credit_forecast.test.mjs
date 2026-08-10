import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amortizationCorridor,
  deriveForecastRateScenarios,
  electronicsComponentIndex,
  forecastElectronicsPrices,
  futureExchangePath,
  historicalElectronicsComponentIndex,
  rubPerUsdFromBasePrices,
} from '../js/models/credit_forecast.js';

const producer = (id, output, inputs, start, minimum = 0.3) => ({
  id,
  workers: 150,
  production: output,
  consumption: inputs,
  consumptionIncreaseAccordingYear: {
    startYear: start, yearSpan: 100, maximumFactor: 2,
  },
  productionDecreaseAccordingYear: {
    startYear: start, yearSpan: 110, minimumFactor: minimum,
  },
});

const buildings = [
  producer('eletronic_components_factory', { ecomponents: 0.025 },
    { plastics: 0.01, steel: 0.01, chemicals: 0.008 }, 1960),
  producer('eletronic_factory', { eletronics: 0.03 },
    { ecomponents: 0.01, plastics: 0.015, mcomponents: 0.01 }, 1960),
  producer('dlc3/electronic_components_factory', { ecomponents: 0.025 },
    { gravel: 0.03, steel: 0.01, chemicals: 0.008 }, 1930, 0.2),
  producer('dlc3/electronics_factory', { eletronics: 0.03 },
    { ecomponents: 0.01, boards: 0.03, mcomponents: 0.01 }, 1930, 0.2),
];
const prices = {
  plastics: 200, steel: 100, chemicals: 300, mcomponents: 400,
  gravel: 20, boards: 80,
  workers: 10,
};

test('component index recomputes electronic components before electronics', () => {
  const points = electronicsComponentIndex({
    buildings, startYear: 2000, years: 30, priceFor: key => prices[key], variant: 'vanilla',
  });

  assert.equal(points[0].index, 100);
  assert.ok(points[10].index > points[1].index);
  assert.ok(points[30].ecomponentsCost > points[10].ecomponentsCost);
  assert.ok(points[30].electronicsCost > points[10].electronicsCost);
});

test('component index keeps vanilla and DLC3 recipe chains separate', () => {
  const vanilla = electronicsComponentIndex({
    buildings, startYear: 2000, years: 2, priceFor: key => prices[key], variant: 'vanilla',
  });
  const dlc3 = electronicsComponentIndex({
    buildings, startYear: 2000, years: 2, priceFor: key => prices[key], variant: 'dlc3',
  });

  assert.notEqual(vanilla[0].electronicsCost, dlc3[0].electronicsCost);
  assert.equal(electronicsComponentIndex({
    buildings: buildings.slice(1), startYear: 2000, years: 2,
    priceFor: key => prices[key], variant: 'vanilla',
  }), null);
});

test('historical component index uses each saved year with fixed save-derived root prices', () => {
  const records = [
    { year: 2000, day: 1, workdayCostRUB: 10, purchaseRUB: { chemicals: 20, plastics: 30, steel: 40, mcomponents: 50 } },
    { year: 2010, day: 1, workdayCostRUB: 20, purchaseRUB: { chemicals: 40, plastics: 60, steel: 80, mcomponents: 100 } },
  ];
  const points = historicalElectronicsComponentIndex({
    buildings, records, currency: 'RUB', variant: 'vanilla',
  });
  assert.equal(points.length, 2);
  assert.equal(points[0].index, 100);
  assert.ok(points[1].index > 100, 'the later recipe applies');
  assert.ok(points[1].index < 200, 'historical input inflation is held fixed');
  assert.equal(points[1].ordinal, 2010 * 365 + 1);
});

test('forecast applies component movement and normal inflation once', () => {
  const paths = forecastElectronicsPrices({
    currentPrice: 100,
    rateScenarios: {
      base: { normal: 0.1, residual: 0 },
      favorable: { normal: 0.2, residual: 0 },
      adverse: { normal: 0, residual: 0 },
    },
    componentIndex: [{ yearOffset: 0, index: 100 }, { yearOffset: 1, index: 120 }],
    months: 12,
  });

  assert.ok(Math.abs(paths.base.at(-1).price - 132) < 1e-9);
  assert.ok(Math.abs(paths.adverse.at(-1).price - 120) < 1e-9);
});

test('forecast scenarios separate normal inflation from electronics residuals', () => {
  const scenarios = deriveForecastRateScenarios({
    normalRates: [0.02, 0.04, 0.06],
    electronicsRates: [0.05, 0.10, 0.20],
    componentRates: [0.01, 0.02, 0.03],
  });

  assert.ok(scenarios.favorable.normal >= scenarios.base.normal);
  assert.ok(scenarios.base.normal >= scenarios.adverse.normal);
  assert.ok(scenarios.favorable.residual >= scenarios.base.residual);
  assert.ok(scenarios.base.residual >= scenarios.adverse.residual);
  assert.equal(scenarios.base.normal, 0.06, 'Base uses the latest stable normal-inflation estimate');
});

test('forecast residuals join only identical historical intervals', () => {
  const interval = (startOrdinal, endOrdinal, rate) => ({ startOrdinal, endOrdinal, rate });
  const scenarios = deriveForecastRateScenarios({
    normalRates: [interval(0, 365, 0.5), interval(365, 730, 0.1)],
    electronicsRates: [interval(365, 730, 0.32)],
    componentRates: [interval(0, 365, 0.2), interval(365, 730, 0.1)],
  });
  assert.equal(scenarios.base.normal, 0.1);
  assert.ok(Math.abs(scenarios.base.residual - 0.09090909090909083) < 1e-12);
});

test('component forecast rejects a missing or zero root price', () => {
  assert.equal(electronicsComponentIndex({
    buildings, startYear: 2000, years: 1, variant: 'vanilla',
    priceFor: key => key === 'steel' ? 0 : prices[key],
  }), null);
});

test('exchange anchor uses common normal base prices rather than electronics export', () => {
  assert.equal(rubPerUsdFromBasePrices({
    baseRUB: { food: 100, steel: 200, eletronics: 9999 },
    baseUSD: { food: 10, steel: 20, eletronics: 1 },
  }), 10);
  assert.equal(rubPerUsdFromBasePrices({ baseRUB: { food: 100 }, baseUSD: {} }), null);
});

test('future exchange follows relative normal currency inflation', () => {
  const path = futureExchangePath({
    currentRubPerUsd: 10, rubNormalRate: 0.1, usdNormalRate: 0.02, months: 12,
  });
  assert.equal(path[0].rubPerUsd, 10);
  assert.ok(Math.abs(path.at(-1).rubPerUsd - 10 * 1.1 / 1.02) < 1e-12);
});

test('amortization settles remaining debt and never credits future ship value', () => {
  const quote = {
    purchaseValue: 1000,
    offer: { modelFacts: { name: 'Covered ship', runtimeCategory: 6,
      transportSubtype: 0, capacity: 10 } },
  };
  const pricePath = scenario => Array.from({ length: 25 }, (_, month) => ({
    month, price: scenario === 'base' ? 100 + month * 10 : 100 + month * 5,
  }));
  const corridor = amortizationCorridor({
    quote,
    loan: { annualRate: 5, remainingDays: 365, currentAmount: 1, penaltyAmount: 0 },
    cargoPurchasePrice: 100,
    financingCurrency: 'RUB',
    exitPricePaths: { RUB: { base: pricePath('base'), adverse: pricePath('adverse') } },
    conversionPaths: { RUB: Array.from({ length: 25 }, (_, month) => ({ month, factor: 1 })) },
  });

  assert.equal(corridor.capitalRequired, 2000);
  assert.equal(corridor.routes.RUB.base[0].liquidationValue, 1000);
  assert.ok(corridor.routes.RUB.base[1].remainingDebt > 0);
  assert.equal(corridor.routes.RUB.base.at(-1).remainingDebt, 0);
  assert.equal(corridor.shipResidualValue, 0);
});
