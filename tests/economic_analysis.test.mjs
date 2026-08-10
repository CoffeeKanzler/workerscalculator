import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPriceIndex,
  effectiveAnnualRate,
  evaluateLoanScenarios,
  quantile,
  realAnnualRate,
  rollingAnnualRates,
  simulateLoan,
  summarizeInflation,
} from '../js/models/economic_analysis.js';

test('base index isolates normal currency inflation from import price movement', () => {
  const records = [
    { year: 2000, day: 0, baseRUB: { food: 100, steel: 400 }, purchaseRUB: { food: 100, steel: 400 } },
    { year: 2001, day: 0, baseRUB: { food: 110, steel: 440 }, purchaseRUB: { food: 150, steel: 200 } },
  ];

  const normal = buildPriceIndex(records, { currency: 'RUB', basis: 'base' });
  const imports = buildPriceIndex(records, { currency: 'RUB', basis: 'purchase' });

  assert.ok(Math.abs(normal[1].index - 110) < 1e-12);
  assert.ok(Math.abs(imports[1].index - Math.sqrt(0.75) * 100) < 1e-12);
});

test('price index chains equal-weight geometric relatives instead of price levels', () => {
  const points = buildPriceIndex([
    { year: 2000, day: 0, purchaseRUB: { food: 100, steel: 400 } },
    { year: 2001, day: 0, purchaseRUB: { food: 121, steel: 484 } },
    { year: 2002, day: 0, purchaseRUB: { food: 133.1 } },
  ], { currency: 'RUB', basis: 'purchase' });

  assert.deepEqual(points.map(point => point.coverage), [2, 2, 1]);
  assert.ok(Math.abs(points[0].index - 100) < 1e-12);
  assert.ok(Math.abs(points[1].index - 121) < 1e-12);
  assert.ok(Math.abs(points[2].index - 133.1) < 1e-10);
});

test('price index skips an unusable step rather than inventing a price change', () => {
  const points = buildPriceIndex([
    { year: 2000, day: 0, sellUSD: { food: 10 } },
    { year: 2001, day: 0, sellUSD: { steel: 20 } },
    { year: 2002, day: 0, sellUSD: { steel: 22 } },
  ], { currency: 'USD', basis: 'sell' });

  assert.deepEqual(points.map(point => Number(point.index.toFixed(8))), [100, 100, 110]);
  assert.deepEqual(points.map(point => point.coverage), [1, 0, 1]);
});

test('inflation summary annualizes irregular dated endpoints', () => {
  const points = buildPriceIndex([
    { year: 2000, day: 0, purchaseUSD: { food: 10 } },
    { year: 2002, day: 0, purchaseUSD: { food: 12.1 } },
  ], { currency: 'USD', basis: 'purchase' });
  const summary = summarizeInflation(points);

  assert.ok(Math.abs(summary.allAnnual - 0.1) < 1e-12);
  assert.ok(Math.abs(summary.latestAnnual - 0.1) < 1e-12);
  assert.equal(summary.fiveYearAnnual, null);
});

test('rolling annual rates and quartiles are deterministic save-derived scenarios', () => {
  const points = [
    { ordinal: 0, index: 100 },
    { ordinal: 365, index: 90 },
    { ordinal: 730, index: 99 },
    { ordinal: 1095, index: 118.8 },
  ];
  const rates = rollingAnnualRates(points);
  assert.deepEqual(rates.map(rate => Number(rate.toFixed(6))), [-0.1, 0.1, 0.2]);
  assert.ok(Math.abs(quantile(rates, 0.25) - 0) < 1e-12);
  assert.ok(Math.abs(quantile(rates, 0.5) - 0.1) < 1e-12);
  assert.ok(Math.abs(quantile(rates, 0.75) - 0.15) < 1e-12);
});

test('effective and real annual rates use daily compounding and Fisher adjustment', () => {
  const effective = effectiveAnnualRate(3.65);
  assert.ok(Math.abs(effective - ((1 + 0.0365 / 365) ** 365 - 1)) < 1e-15);
  assert.ok(Math.abs(realAnnualRate(effective, 0.1) - ((1 + effective) / 1.1 - 1)) < 1e-15);
});

test('one simulated game day applies interest then the scheduled payment', () => {
  const result = simulateLoan({
    annualRate: 3.65,
    remainingDays: 366,
    currentAmount: 36500,
    penaltyAmount: 0,
  }, { maxDays: 1 });

  assert.equal(result.days, 1);
  assert.ok(Math.abs(result.totalPaid - 100.01) < 1e-9);
  assert.ok(Math.abs(result.interestPaid - 3.650365) < 1e-9);
  assert.ok(Math.abs(result.maxDailyPayment - 100.01) < 1e-9);
  assert.ok(Math.abs(result.endingCurrentAmount - 36403.64) < 1e-9);
  assert.equal(result.endingPenaltyAmount, 0);
});

test('missed scheduled payment moves principal into the penalty balance', () => {
  const result = simulateLoan({
    annualRate: 3.65,
    remainingDays: 366,
    currentAmount: 36500,
    penaltyAmount: 0,
  }, { availableCash: 0, maxDays: 1 });

  assert.equal(result.totalPaid, 0);
  assert.ok(Math.abs(result.endingCurrentAmount - 36403.64) < 1e-9);
  assert.ok(Math.abs(result.endingPenaltyAmount - 100.01) < 1e-9);
});

test('loan scenarios use normal inflation and order borrower best above base above worst', () => {
  const index = [
    { ordinal: 0, index: 100 },
    { ordinal: 365, index: 102 },
    { ordinal: 730, index: 108.12 },
    { ordinal: 1095, index: 112.4448 },
  ];
  const result = evaluateLoanScenarios({
    annualRate: 5,
    remainingDays: 365,
    currentAmount: 100000,
    penaltyAmount: 0,
  }, index);

  assert.equal(result.inflationSource, 'base');
  assert.ok(result.realRates.best < result.realRates.base);
  assert.ok(result.realRates.base < result.realRates.worst);
  assert.ok(['favorable', 'tight', 'risky'].includes(result.recommendation));
  assert.ok(result.reasons.length > 0);
});
