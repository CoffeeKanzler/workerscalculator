import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  creditVerdictKey,
  summarizeCreditTerms,
} from '../js/models/credit_summary.js';

const loan = {
  annualRate: 5,
  remainingDays: 365,
  currentAmount: 100000,
  penaltyAmount: 0,
};

const inflation = (annualRate) => [
  { ordinal: 0, index: 100 },
  { ordinal: 365, index: 100 * (1 + annualRate) },
];

test('credit summary derives additional cost from the exact 100,000-unit principal', () => {
  const summary = summarizeCreditTerms({ loan, normalIndex: inflation(0.02) });

  assert.ok(summary.totalPaid > 100000);
  assert.equal(summary.additionalCost, summary.totalPaid - 100000);
  assert.equal(summary.maxDailyPayment > 0, true);
  assert.equal(summary.effectiveRate > 0, true);
  assert.equal(summary.hasInflationEvidence, true);
  assert.equal(summary.recommendation, 'risky');
});

test('negative expected real rate is presented as inflation exceeding credit cost', () => {
  const summary = summarizeCreditTerms({ loan: { ...loan, annualRate: 3.65 }, normalIndex: inflation(0.1) });

  assert.ok(summary.expectedRealRate < 0);
  assert.equal(creditVerdictKey(summary), 'creditInflationExceeds');
});

test('risky positive real rate is presented as credit cost exceeding inflation', () => {
  const summary = summarizeCreditTerms({ loan, normalIndex: inflation(0.02) });

  assert.ok(summary.expectedRealRate > 0.03);
  assert.equal(creditVerdictKey(summary), 'creditCostsExceed');
});

test('absent normal history reports unavailable inflation without hiding nominal results', () => {
  const summary = summarizeCreditTerms({ loan, normalIndex: [] });

  assert.equal(summary.hasInflationEvidence, false);
  assert.equal(summary.expectedRealRate, null);
  assert.equal(summary.totalPaid > 100000, true);
  assert.equal(summary.additionalCost, summary.totalPaid - 100000);
  assert.ok(summary.maxDailyPayment > 0);
  assert.equal(creditVerdictKey(summary), 'creditInflationUnavailable');
});
