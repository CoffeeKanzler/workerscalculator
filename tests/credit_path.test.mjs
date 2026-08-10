import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateLoan, simulateLoanPath } from '../js/models/economic_analysis.js';

test('loan path exposes paid cash and settlement debt before and after payoff', () => {
  const loan = { annualRate: 5, remainingDays: 365, currentAmount: 100000, penaltyAmount: 0 };
  const result = simulateLoanPath(loan, { horizonDays: 365 * 30, sampleEveryDays: 30 });

  assert.deepEqual(result.points[0], {
    day: 0, paid: 0, currentAmount: 100000, penaltyAmount: 0,
    remainingDebt: 100000, completed: false,
  });
  assert.ok(result.points[1].remainingDebt < 100000);
  assert.equal(result.points.at(-1).day, 365 * 30);
  assert.equal(result.points.at(-1).remainingDebt, 0);
  assert.equal(result.points.at(-1).paid, result.simulation.totalPaid);
  assert.equal(result.simulation.completed, true);
  assert.equal(result.simulation.totalPaid, simulateLoan(loan).totalPaid);
});

test('path retains penalty debt when scheduled cash is unavailable', () => {
  const result = simulateLoanPath({
    annualRate: 3.65, remainingDays: 366, currentAmount: 36500, penaltyAmount: 50,
  }, { horizonDays: 1, sampleEveryDays: 1, availableCash: 0 });

  assert.equal(result.points.length, 2);
  assert.ok(result.points[1].penaltyAmount > 50);
  assert.equal(result.points[1].paid, 0);
  assert.equal(result.simulation.completed, false);
});

test('path does not truncate terms longer than the generic simulation limit', () => {
  const result = simulateLoanPath({
    annualRate: 1, remainingDays: 12000, currentAmount: 1000, penaltyAmount: 0,
  }, { horizonDays: 365 * 40, sampleEveryDays: 365 });

  assert.equal(result.simulation.completed, true);
  assert.ok(result.simulation.days > 10000);
  assert.equal(result.points.at(-1).remainingDebt, 0);
});
