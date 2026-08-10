import { evaluateLoanScenarios } from './economic_analysis.js';

export function summarizeCreditTerms({ loan, normalIndex } = {}) {
  const scenarios = evaluateLoanScenarios(loan, normalIndex);
  const simulation = scenarios.simulation;
  const principal = Number(loan?.currentAmount) || 0;
  const hasInflationEvidence = Number.isFinite(scenarios.inflationRates.base);
  const expectedRealRate = hasInflationEvidence ? scenarios.realRates.base : null;

  return {
    totalPaid: simulation.totalPaid,
    additionalCost: simulation.totalPaid - principal,
    maxDailyPayment: simulation.maxDailyPayment,
    effectiveRate: scenarios.effectiveRate,
    expectedRealRate,
    recommendation: scenarios.recommendation,
    hasInflationEvidence,
  };
}

export function creditVerdictKey(summary = {}) {
  if (!summary.hasInflationEvidence || !Number.isFinite(summary.expectedRealRate)) {
    return 'creditInflationUnavailable';
  }
  if (summary.expectedRealRate < 0) return 'creditInflationExceeds';
  if (summary.recommendation === 'risky') return 'creditCostsExceed';
  return 'creditCostsSimilar';
}
