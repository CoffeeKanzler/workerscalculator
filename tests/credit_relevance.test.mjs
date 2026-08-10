import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRelevantCreditOpportunities } from '../js/models/credit_forecast.js';

const quote = (name, subtype = 0) => ({
  purchaseValue: 1000,
  offer: { modelFacts: { name, runtimeCategory: 6, transportSubtype: subtype, capacity: 100 } },
});
const path = values => values.map((net, month) => ({ month: month * 12, net }));
const corridor = ({ base, adverse = base, exit = 'RUB', value = 0 }) => ({
  capitalRequired: 10000,
  capacity: 100,
  routes: {
    [exit]: {
      base: path(base),
      adverse: path(adverse),
      favorable: path(base.map(number => number + value)),
    },
  },
});

test('a ship that never breaks even in Base is absent', () => {
  const rows = rankRelevantCreditOpportunities({
    quotes: [quote('Losing ship')],
    loans: [{ currency: 'RUB' }],
    forecastContext: { corridorFor: () => corridor({ base: [-10, -5, -1] }) },
    horizonYears: 30,
  });
  assert.deepEqual(rows, []);
});

test('base-only and adverse-profitable opportunities use direct assessments', () => {
  const quotes = [quote('Adverse winner'), quote('Base winner')];
  const rows = rankRelevantCreditOpportunities({
    quotes,
    loans: [{ currency: 'RUB' }],
    forecastContext: {
      corridorFor: candidate => candidate.quote.offer.modelFacts.name === 'Adverse winner'
        ? corridor({ base: [-5, 5, 20], adverse: [-8, 1, 10] })
        : corridor({ base: [-5, -1, 8], adverse: [-10, -5, -1] }),
    },
  });

  assert.deepEqual(rows.map(row => row.assessment), [
    'profitable-adverse', 'profitable-base-only',
  ]);
  assert.deepEqual(rows.map(row => row.baseBreakEvenMonth), [12, 24]);
});

test('ranking keeps one best route per ship and nests alternate exits', () => {
  const rows = rankRelevantCreditOpportunities({
    quotes: [quote('Dual border')],
    loans: [{ currency: 'RUB' }],
    forecastContext: {
      corridorFor: () => ({
        capitalRequired: 10000,
        capacity: 100,
        routes: {
          RUB: { base: path([-5, -1, 5]), adverse: path([-5, -2, -1]) },
          USD: { base: path([-5, 2, 8]), adverse: path([-5, -1, 1]) },
        },
      }),
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].exitCurrency, 'USD');
  assert.equal(rows[0].alternateRoutes.length, 1);
  assert.equal(rows[0].alternateRoutes[0].exitCurrency, 'RUB');
  assert.deepEqual(rows[0].milestones.base, { 5: 8, 10: 8, 20: 8, 30: 8 });
  assert.equal(rows[0].neverBreaksEven.adverse, false);
  assert.equal(rows[0].alternateRoutes[0].neverBreaksEven.adverse, true);
});

test('incompatible and unresolved ship offers are never evaluated', () => {
  let calls = 0;
  const rows = rankRelevantCreditOpportunities({
    quotes: [quote('Oil ship', 3), { purchaseValue: 1, offer: { modelFacts: null } }],
    loans: [{ currency: 'RUB' }],
    forecastContext: { corridorFor: () => { calls += 1; return corridor({ base: [1] }); } },
  });

  assert.deepEqual(rows, []);
  assert.equal(calls, 0);
});
