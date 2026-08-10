import {
  evaluateLoanScenarios,
  rollingAnnualRateIntervals,
} from './economic_analysis.js';

export function hasUsableInflationEvidence(points = []) {
  const latestInterval = rollingAnnualRateIntervals(points).at(-1);
  if (!latestInterval) return false;
  return points.some(point => Number(point?.coverage) > 0
    && Number(point?.ordinal) > latestInterval.startOrdinal
    && Number(point?.ordinal) <= latestInterval.endOrdinal);
}

export function electronicsAvailabilityState({
  hasImportedSave = false,
  marketSourceStatus = null,
  usedOfferCount = 0,
  hasForecastEvidence = false,
  compatibleQuoteCount = 0,
  evaluatedCorridorCount = 0,
  hasQualifyingStrategy = false,
} = {}) {
  if (hasQualifyingStrategy) {
    return {
      status: 'available',
      messageKey: null,
      forecastEvidenceAvailable: true,
      requiresUsedMarket: false,
    };
  }
  if (!hasImportedSave) {
    return {
      status: 'missing-save',
      messageKey: 'electronicsNoUsedOffers',
      forecastEvidenceAvailable: false,
      requiresUsedMarket: true,
    };
  }
  if (['missing', 'failed'].includes(marketSourceStatus)) {
    return {
      status: 'missing-used-market-source',
      messageKey: 'electronicsNoUsedOffers',
      forecastEvidenceAvailable: false,
      requiresUsedMarket: true,
    };
  }
  if (!(Number(usedOfferCount) > 0)) {
    return {
      status: 'missing-used-offers',
      messageKey: 'electronicsNoUsedOffers',
      forecastEvidenceAvailable: false,
      requiresUsedMarket: true,
    };
  }
  if (!hasForecastEvidence) {
    return {
      status: 'missing-evidence',
      messageKey: 'electronicsNoHistory',
      forecastEvidenceAvailable: false,
      requiresUsedMarket: false,
    };
  }
  if (!(Number(compatibleQuoteCount) > 0)) {
    return {
      status: 'missing-compatible-ship',
      messageKey: 'electronicsNoCompatibleShips',
      forecastEvidenceAvailable: false,
      requiresUsedMarket: false,
    };
  }
  if (!(Number(evaluatedCorridorCount) > 0)) {
    return {
      status: 'unavailable',
      messageKey: 'electronicsTradeUnavailable',
      forecastEvidenceAvailable: false,
      requiresUsedMarket: false,
    };
  }
  return {
    status: 'no-strategy',
    messageKey: 'creditNoRelevantElectronics',
    forecastEvidenceAvailable: true,
    requiresUsedMarket: false,
  };
}

export function creditProvenanceKeys({
  hasStatsInflation = false,
  hasImportedSave = false,
  hasForecastEvidence = false,
} = {}) {
  return [
    'creditEnteredCalculationEvidence',
    ...(hasStatsInflation ? ['creditStatsInflationEvidence'] : []),
    ...(hasImportedSave ? ['creditImportedSaveEvidence'] : []),
    hasForecastEvidence ? 'creditForecastEvidence' : 'creditForecastUnavailableEvidence',
  ];
}

export function summarizeCreditTerms({ loan, normalIndex } = {}) {
  const scenarios = evaluateLoanScenarios(loan, normalIndex);
  const simulation = scenarios.simulation;
  const principal = Number(loan?.currentAmount) || 0;
  const hasInflationEvidence = Number.isFinite(scenarios.inflationRates.base)
    && hasUsableInflationEvidence(normalIndex);
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
  if (summary.expectedRealRate <= 0.03) return 'creditCostsSimilar';
  return 'creditCostsExceed';
}
