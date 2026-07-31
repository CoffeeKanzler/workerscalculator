import test from 'node:test';
import assert from 'node:assert/strict';

import { largestChainForWorkforce } from '../js/models/workforce_plan.js';

// A stand-in for the chain solver with the property that matters: workers rise
// with the rate asked for, in steps, because buildings are whole things.
const staircase = (perBuilding, outputPerBuilding) => (goalKey, amount) => ({
  totals: { workers: Math.ceil(amount / outputPerBuilding - 1e-9) * perBuilding },
  rows: [{ key: goalKey, countCeil: Math.ceil(amount / outputPerBuilding - 1e-9) }],
});

test('it finds the largest rate the workforce can staff', () => {
  // 50 workers per mill, each mill makes 2 t/day. 340 workers buys 6 mills.
  const out = largestChainForWorkforce({
    goalKey: 'steel', workerBudget: 340, solve: staircase(50, 2),
  });
  assert.equal(out.reason, 'fits');
  assert.equal(out.workers, 300);
  assert.equal(out.spare, 40);
  // 6 mills is 12 t/day, and the answer must not have crept into a 7th.
  assert.ok(Math.abs(out.amount - 12) < 1e-6, `amount was ${out.amount}`);
});

test('a returned plan never exceeds the budget it was given', () => {
  for (const budget of [1, 7, 49, 50, 51, 99, 100, 101, 1000, 12345]) {
    const out = largestChainForWorkforce({
      goalKey: 'steel', workerBudget: budget, solve: staircase(50, 2),
    });
    assert.ok(out.workers <= budget, `budget ${budget} produced ${out.workers} workers`);
    // Below one building there is no plan at all, and none is offered.
    if (out.reason !== 'fits') assert.equal(out.amount, 0, `budget ${budget}`);
  }
});

// The failure people would otherwise hit as a silent zero.
test('a town too small for even one building is told so, not shown an empty plan', () => {
  const out = largestChainForWorkforce({
    goalKey: 'steel', workerBudget: 20, solve: staircase(50, 2),
  });
  assert.equal(out.reason, 'smallest-chain-too-big');
  assert.equal(out.amount, 0);
  // No plan fits, so the plan costs nobody; the smallest chain's size is the
  // explanation and is reported separately so it cannot read as a suggestion.
  assert.equal(out.workers, 0);
  assert.equal(out.smallestChainWorkers, 50);
  assert.equal(out.result, null);
});

test('no workforce is a stated reason rather than a crash', () => {
  for (const budget of [0, -5, null, undefined, NaN]) {
    const out = largestChainForWorkforce({
      goalKey: 'steel', workerBudget: budget, solve: staircase(50, 2),
    });
    assert.equal(out.reason, 'no-workers');
  }
});

test('a chain the solver cannot resolve is reported, not guessed at', () => {
  const out = largestChainForWorkforce({
    goalKey: 'steel', workerBudget: 500, solve: () => ({ diverged: true, rows: [], totals: {} }),
  });
  assert.equal(out.reason, 'unsolvable');
});

test('a chain that needs nobody does not search forever', () => {
  const out = largestChainForWorkforce({
    goalKey: 'gravel', workerBudget: 100, solve: () => ({ totals: { workers: 0 }, rows: [] }),
  });
  assert.equal(out.reason, 'budget-not-binding');
  assert.ok(out.amount > 0);
});

test('it refuses to run without a solver rather than inventing one', () => {
  assert.throws(() => largestChainForWorkforce({ goalKey: 'steel', workerBudget: 10 }), /solver/);
});
