import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  electronicsRecipeCost,
  recipeYearFactors,
  rankElectronicsShipTrades,
} from '../js/models/electronics_analysis.js';
import { buildResourcePriceIndex } from '../js/models/economic_analysis.js';

const vanilla = {
  id: 'eletronic_factory',
  production: { eletronics: 0.03 },
  consumption: { ecomponents: 0.01, plastics: 0.015, mcomponents: 0.01 },
  consumptionIncreaseAccordingYear: { startYear: 1960, yearSpan: 100, maximumFactor: 2 },
  productionDecreaseAccordingYear: { startYear: 1960, yearSpan: 110, minimumFactor: 0.3 },
};

test('electronics recipe reproduces both documented year curves', () => {
  assert.deepEqual(recipeYearFactors(vanilla, 1960), {
    consumptionFactor: 0,
    productionFactor: 1,
  });
  assert.deepEqual(recipeYearFactors(vanilla, 2010), {
    consumptionFactor: 0.5,
    productionFactor: 1 - 50 / 110,
  });
  assert.deepEqual(recipeYearFactors(vanilla, 2200), {
    consumptionFactor: 2,
    productionFactor: 0.3,
  });
});

test('electronics direct input cost applies recipe factors per output tonne', () => {
  const prices = { ecomponents: 300, plastics: 100, mcomponents: 200 };
  const result = electronicsRecipeCost(vanilla, 2010, key => prices[key]);

  assert.equal(result.inputCostPerOutputTonne,
    ((0.01 * 300 + 0.015 * 100 + 0.01 * 200) * 0.5) / (0.03 * (1 - 50 / 110)));
  assert.deepEqual(result.missingPrices, []);
});

test('resource price index follows electronics only rather than the market basket', () => {
  const points = buildResourcePriceIndex([
    { year: 2000, day: 1, sellRUB: { eletronics: 100, steel: 100 } },
    { year: 2001, day: 1, sellRUB: { eletronics: 150, steel: 50 } },
  ], { resource: 'eletronics', currency: 'RUB', basis: 'sell' });

  assert.deepEqual(points.map(point => point.index), [100, 150]);
  assert.deepEqual(points.map(point => point.price), [100, 150]);
});

const shipQuote = (name, subtype, capacity, purchaseValue) => ({
  purchaseValue,
  offer: { modelFacts: { name, runtimeCategory: 6, transportSubtype: subtype, capacity } },
});

test('ship trade ranks only exact electronics-compatible used ships', () => {
  const priceIndex = [
    { year: 2000, day: 1, ordinal: 730001, index: 100, price: 100, coverage: 1 },
    { year: 2001, day: 1, ordinal: 730366, index: 130, price: 130, coverage: 1 },
  ];
  const trades = rankElectronicsShipTrades([
    shipQuote('Covered', 0, 100, 1000),
    shipQuote('General', 11, 80, 900),
    shipQuote('Oil tanker', 3, 1000, 100),
    shipQuote('Covered no capacity', 0, null, 100),
  ], {
    loan: { annualRate: 5, remainingDays: 365, currentAmount: 1, penaltyAmount: 0 },
    purchasePrice: 80,
    sellPrice: 100,
    priceIndex,
    recoveryValue: quote => quote.offer.modelFacts.name === 'Covered' ? 500 : 400,
  });

  assert.deepEqual(trades.map(trade => trade.quote.offer.modelFacts.name), ['Covered', 'General']);
  assert.equal(trades[0].capitalRequired, 9000);
  assert.equal(trades[0].breakEvenSellPriceZeroResidual,
    trades[0].financing.totalPaid / 100);
  assert.equal(trades[0].breakEvenSellPriceWithCurrentRecovery,
    (trades[0].financing.totalPaid - 500) / 100);
  assert.equal(trades[0].scenarios.base.futureSellPrice, 130);
  assert.ok(['robust', 'speculative', 'reject'].includes(trades[0].recommendation));
});

test('cheap credit remains unavailable as a trade without price history', () => {
  const [trade] = rankElectronicsShipTrades([shipQuote('Covered', 0, 100, 1000)], {
    loan: { annualRate: 1, remainingDays: 365, currentAmount: 1, penaltyAmount: 0 },
    purchasePrice: 80,
    sellPrice: 100,
    priceIndex: [],
    recoveryValue: () => 500,
  });

  assert.equal(trade.recommendation, 'unavailable');
  assert.equal(trade.scenarios.base, null);
});

test('financing simulation covers loan terms longer than the generic safety limit', () => {
  const [trade] = rankElectronicsShipTrades([shipQuote('Covered', 0, 10, 1000)], {
    loan: { annualRate: 5, remainingDays: 12000, currentAmount: 1, penaltyAmount: 0 },
    purchasePrice: 80,
    sellPrice: 100,
    priceIndex: [
      { ordinal: 1, index: 100 },
      { ordinal: 366, index: 110 },
    ],
  });

  assert.equal(trade.financing.completed, true);
  assert.ok(trade.financing.days > 10000);
});
