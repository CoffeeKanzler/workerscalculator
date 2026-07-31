// "How much steel can this workforce actually staff?"
//
// The chain solver runs one way: name an output rate and it returns the
// buildings and the workers they need. The question people actually ask is the
// inverse — they have a town with some spare workers and want to know what it
// can run. That is a search over the solver rather than a second solver.
//
// Worker count rises with the output asked for, but as a staircase, not a line:
// counts are ceiled, because half a steel mill staffs nobody. So this looks for
// the largest rate whose ceiled buildings still fit the budget, which is the
// last tread of the staircase at or below it.
const MAX_DOUBLINGS = 48;
const REFINEMENTS = 60;

function workersFor(solve, goalKey, amount, budgetOptions) {
  const result = solve(goalKey, amount, budgetOptions.buildings, budgetOptions.eco, budgetOptions.opts);
  if (!result || result.diverged) return { workers: Infinity, result: null };
  return { workers: result.totals?.workers ?? Infinity, result };
}

export function largestChainForWorkforce({
  goalKey,
  workerBudget,
  buildings,
  eco,
  opts = {},
  solve,
} = {}) {
  if (!goalKey || !solve) throw new Error('largestChainForWorkforce needs a goal and a solver');
  const budgetOptions = { buildings, eco, opts };
  if (!Number.isFinite(workerBudget) || workerBudget <= 0) {
    return { amount: 0, workers: 0, result: null, budget: workerBudget, reason: 'no-workers' };
  }

  // The smallest chain worth naming is one that produces anything at all. If
  // even that overruns the budget, the honest answer is that this town cannot
  // staff this chain — not a rounded-down zero presented as a plan.
  const smallest = workersFor(solve, goalKey, 1e-6, budgetOptions);
  if (!smallest.result) {
    return { amount: 0, workers: 0, result: null, budget: workerBudget, reason: 'unsolvable' };
  }
  if (smallest.workers > workerBudget) {
    // `workers` always describes the plan being returned, and there is no plan
    // here. The size of the smallest chain is the explanation, so it is named
    // as such rather than left to be mistaken for a recommendation.
    return {
      amount: 0, workers: 0, smallestChainWorkers: smallest.workers, result: null,
      budget: workerBudget, reason: 'smallest-chain-too-big',
    };
  }

  // Double until it does not fit, so the search has a bracket it can trust.
  let low = 1e-6, lowResult = smallest;
  let high = null;
  let probe = 1;
  for (let i = 0; i < MAX_DOUBLINGS; i += 1) {
    const at = workersFor(solve, goalKey, probe, budgetOptions);
    if (at.workers > workerBudget) { high = probe; break; }
    low = probe; lowResult = at;
    probe *= 2;
  }
  // Nothing in reach overruns the budget: the chain is free of workers, or the
  // budget is larger than any sane republic. Report the last rate actually solved.
  if (high === null) {
    return {
      amount: low, workers: lowResult.workers, result: lowResult.result,
      budget: workerBudget, reason: 'budget-not-binding',
    };
  }

  for (let i = 0; i < REFINEMENTS; i += 1) {
    const mid = (low + high) / 2;
    if (!(mid > low && mid < high)) break;
    const at = workersFor(solve, goalKey, mid, budgetOptions);
    if (at.workers > workerBudget) high = mid;
    else { low = mid; lowResult = at; }
  }

  return {
    amount: low,
    workers: lowResult.workers,
    result: lowResult.result,
    budget: workerBudget,
    spare: workerBudget - lowResult.workers,
    reason: 'fits',
  };
}
