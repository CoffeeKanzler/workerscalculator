import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  creditProvenanceKeys,
  creditVerdictKey,
  electronicsAvailabilityState,
  summarizeCreditTerms,
} from '../js/models/credit_summary.js';

const loan = {
  annualRate: 5,
  remainingDays: 365,
  currentAmount: 100000,
  penaltyAmount: 0,
};

const inflation = (annualRate) => [
  { ordinal: 0, index: 100, coverage: 1 },
  { ordinal: 365, index: 100 * (1 + annualRate), coverage: 1 },
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

test('a penalty stays risky without overstating a low positive real credit cost', () => {
  const summary = summarizeCreditTerms({
    loan: { ...loan, penaltyAmount: 100 },
    normalIndex: inflation(0.04),
  });

  assert.equal(summary.recommendation, 'risky');
  assert.ok(summary.expectedRealRate > 0 && summary.expectedRealRate <= 0.03);
  assert.equal(creditVerdictKey(summary), 'creditCostsSimilar');
});

test('dated zero-coverage points do not become zero-percent inflation evidence', () => {
  const summary = summarizeCreditTerms({
    loan,
    normalIndex: [
      { ordinal: 0, index: 100, coverage: 0 },
      { ordinal: 365, index: 100, coverage: 0 },
    ],
  });

  assert.equal(summary.hasInflationEvidence, false);
  assert.equal(summary.expectedRealRate, null);
  assert.equal(creditVerdictKey(summary), 'creditInflationUnavailable');
});

test('the latest annual interval needs some usable price coverage', () => {
  const summary = summarizeCreditTerms({
    loan,
    normalIndex: [
      { ordinal: 0, index: 100, coverage: 1 },
      { ordinal: 365, index: 100, coverage: 0 },
    ],
  });

  assert.equal(summary.hasInflationEvidence, false);
  assert.equal(summary.expectedRealRate, null);
});

test('a partial history remains usable when its latest annual interval has coverage', () => {
  const summary = summarizeCreditTerms({
    loan,
    normalIndex: [
      { ordinal: 0, index: 100, coverage: 1 },
      { ordinal: 365, index: 100, coverage: 0 },
      { ordinal: 730, index: 110, coverage: 1 },
    ],
  });

  assert.equal(summary.hasInflationEvidence, true);
  assert.ok(Number.isFinite(summary.expectedRealRate));
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

test('electronics availability distinguishes missing inputs from a complete losing evaluation', () => {
  const cases = [
    {
      name: 'no imported save',
      input: {},
      want: {
        status: 'missing-save', messageKey: 'electronicsNoUsedOffers',
        requiresUsedMarket: true,
      },
    },
    {
      name: 'imported save without a used-market source',
      input: { hasImportedSave: true, marketSourceStatus: 'missing' },
      want: {
        status: 'missing-used-market-source', messageKey: 'electronicsNoUsedOffers',
        requiresUsedMarket: true,
      },
    },
    {
      name: 'used-market source failed to import',
      input: { hasImportedSave: true, marketSourceStatus: 'failed' },
      want: {
        status: 'missing-used-market-source', messageKey: 'electronicsNoUsedOffers',
        requiresUsedMarket: true,
      },
    },
    {
      name: 'exact imported market without offers',
      input: { hasImportedSave: true, marketSourceStatus: 'exact' },
      want: {
        status: 'missing-used-offers', messageKey: 'electronicsNoUsedOffers',
        requiresUsedMarket: true,
      },
    },
    {
      name: 'missing price recipe or exchange evidence',
      input: { hasImportedSave: true, usedOfferCount: 3 },
      want: { status: 'missing-evidence', messageKey: 'electronicsNoHistory' },
    },
    {
      name: 'no compatible ship',
      input: { hasImportedSave: true, usedOfferCount: 3, hasForecastEvidence: true },
      want: { status: 'missing-compatible-ship', messageKey: 'electronicsNoCompatibleShips' },
    },
    {
      name: 'compatible input without a valid evaluated corridor',
      input: {
        hasImportedSave: true, usedOfferCount: 3, hasForecastEvidence: true,
        compatibleQuoteCount: 1,
      },
      want: { status: 'unavailable', messageKey: 'electronicsTradeUnavailable' },
    },
    {
      name: 'complete evaluation with no crossing',
      input: {
        hasImportedSave: true, usedOfferCount: 3, hasForecastEvidence: true,
        compatibleQuoteCount: 1, evaluatedCorridorCount: 1,
      },
      want: { status: 'no-strategy', messageKey: 'creditNoRelevantElectronics' },
    },
    {
      name: 'qualifying strategy',
      input: {
        hasImportedSave: true, usedOfferCount: 3, hasForecastEvidence: true,
        compatibleQuoteCount: 1, evaluatedCorridorCount: 1, hasQualifyingStrategy: true,
      },
      want: { status: 'available', messageKey: null },
    },
  ];

  for (const { name, input, want } of cases) {
    const state = electronicsAvailabilityState(input);
    assert.equal(state.status, want.status, name);
    assert.equal(state.messageKey, want.messageKey, name);
    assert.equal(state.requiresUsedMarket, want.requiresUsedMarket ?? false, name);
    assert.equal(state.forecastEvidenceAvailable,
      ['no-strategy', 'available'].includes(want.status), name);
  }
});

test('credit provenance names only the evidence that is actually available', () => {
  assert.deepEqual(creditProvenanceKeys({}), [
    'creditEnteredCalculationEvidence',
    'creditForecastUnavailableEvidence',
  ]);
  assert.deepEqual(creditProvenanceKeys({ hasStatsInflation: true }), [
    'creditEnteredCalculationEvidence',
    'creditStatsInflationEvidence',
    'creditForecastUnavailableEvidence',
  ]);
  assert.deepEqual(creditProvenanceKeys({
    hasStatsInflation: true,
    hasImportedSave: true,
    hasForecastEvidence: true,
  }), [
    'creditEnteredCalculationEvidence',
    'creditStatsInflationEvidence',
    'creditImportedSaveEvidence',
    'creditForecastEvidence',
  ]);
});
