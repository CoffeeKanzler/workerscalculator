import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPriceIndex,
  quantile,
  rollingAnnualRates,
  summarizeInflation,
} from '../js/models/economic_analysis.js';

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
