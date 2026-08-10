import {
  quantile,
  rollingAnnualRates,
  simulateLoan,
} from './economic_analysis.js?v=6';

const DAYS_PER_YEAR = 365;
const ELECTRONICS_SHIP_SUBTYPES = new Set([0, 11]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ELECTRONICS_PRODUCER_IDS = Object.freeze({
  vanilla: ['eletronic_components_factory', 'eletronic_factory'],
  dlc3: ['dlc3/electronic_components_factory', 'dlc3/electronics_factory'],
});

export function resolveElectronicsProducerSet(buildings) {
  const byId = new Map((buildings ?? []).map(building => [building?.id, building]));
  return Object.fromEntries(Object.entries(ELECTRONICS_PRODUCER_IDS).map(([variant, ids]) => {
    const rows = ids.map(id => byId.get(id));
    const complete = rows.every(row => row?.consumptionIncreaseAccordingYear
      && row?.productionDecreaseAccordingYear);
    return [variant, complete ? rows : null];
  }));
}

function curveValues(curve) {
  const startYear = Number(curve?.startYear);
  const yearSpan = Number(curve?.yearSpan);
  const limit = Number(curve?.maximumFactor ?? curve?.minimumFactor);
  return Number.isFinite(startYear) && Number.isFinite(yearSpan) && yearSpan > 0
    && Number.isFinite(limit) ? { startYear, yearSpan, limit } : null;
}

export function recipeYearFactors(building, year) {
  const targetYear = Number(year);
  const consumption = curveValues(building?.consumptionIncreaseAccordingYear);
  const production = curveValues(building?.productionDecreaseAccordingYear);
  if (!Number.isFinite(targetYear) || !consumption || !production) return null;
  return {
    consumptionFactor: clamp(
      (targetYear - consumption.startYear) / consumption.yearSpan,
      0,
      consumption.limit,
    ),
    productionFactor: clamp(
      1 - (targetYear - production.startYear) / production.yearSpan,
      production.limit,
      1,
    ),
  };
}

export function electronicsRecipeCost(building, year, purchasePrice) {
  const factors = recipeYearFactors(building, year);
  const outputRate = Number(building?.production?.eletronics);
  if (!factors || !(outputRate > 0) || typeof purchasePrice !== 'function') return null;

  let inputCost = 0;
  const missingPrices = [];
  const adjustedInputs = {};
  for (const [resource, amountRaw] of Object.entries(building?.consumption ?? {})) {
    const amount = Number(amountRaw) * factors.consumptionFactor;
    const price = Number(purchasePrice(resource));
    adjustedInputs[resource] = amount;
    if (Number.isFinite(price)) inputCost += amount * price;
    else missingPrices.push(resource);
  }
  const adjustedOutput = outputRate * factors.productionFactor;
  return {
    ...factors,
    adjustedInputs,
    adjustedOutput,
    inputCostPerOutputTonne: missingPrices.length || !(adjustedOutput > 0)
      ? null : inputCost / adjustedOutput,
    missingPrices,
  };
}

function priceScenarios(priceIndex) {
  const rates = rollingAnnualRates(priceIndex);
  return {
    base: rates.at(-1) ?? null,
    best: quantile(rates, 0.75),
    worst: quantile(rates, 0.25),
  };
}

function compatibleQuote(quote) {
  const facts = quote?.offer?.modelFacts;
  return facts?.runtimeCategory === 6
    && ELECTRONICS_SHIP_SUBTYPES.has(facts.transportSubtype)
    && Number.isFinite(facts.capacity) && facts.capacity > 0
    && Number.isFinite(quote?.purchaseValue) && quote.purchaseValue >= 0;
}

export function evaluateElectronicsShipTrade(quote, {
  loan, purchasePrice, sellPrice, priceIndex, recoveryValue = () => 0,
} = {}) {
  if (!compatibleQuote(quote) || !Number.isFinite(purchasePrice) || !(purchasePrice > 0)
      || !Number.isFinite(sellPrice) || !(sellPrice > 0)
      || !Number.isFinite(Number(loan?.annualRate))
      || !Number.isFinite(Number(loan?.remainingDays)) || !(loan.remainingDays > 0)) return null;

  const capacity = quote.offer.modelFacts.capacity;
  const capitalRequired = quote.purchaseValue + capacity * purchasePrice;
  const financing = simulateLoan({
    annualRate: loan.annualRate,
    remainingDays: loan.remainingDays,
    currentAmount: capitalRequired,
    penaltyAmount: 0,
  }, { maxDays: Math.max(10000, Math.ceil(loan.remainingDays) + 1) });
  const currentRecoveryValue = Number(recoveryValue(quote));
  const recovery = Number.isFinite(currentRecoveryValue) ? currentRecoveryValue : 0;
  const horizonYears = loan.remainingDays / DAYS_PER_YEAR;
  const rates = priceScenarios(priceIndex);
  const scenarios = Object.fromEntries(Object.entries(rates).map(([name, rate]) => {
    if (!Number.isFinite(rate) || rate <= -1) return [name, null];
    const futureSellPrice = sellPrice * (1 + rate) ** horizonYears;
    const cargoRevenue = capacity * futureSellPrice;
    return [name, {
      annualRate: rate,
      futureSellPrice,
      cargoRevenue,
      profitZeroResidual: cargoRevenue - financing.totalPaid,
      profitWithCurrentRecovery: cargoRevenue + recovery - financing.totalPaid,
    }];
  }));

  let recommendation = 'unavailable';
  if (scenarios.base) {
    if (scenarios.worst?.profitZeroResidual > 0) recommendation = 'robust';
    else if (scenarios.base.profitZeroResidual > 0
      || scenarios.base.profitWithCurrentRecovery > 0) recommendation = 'speculative';
    else recommendation = 'reject';
  }

  return {
    quote,
    loan,
    capacity,
    capitalRequired,
    financing,
    currentRecoveryValue: Number.isFinite(currentRecoveryValue) ? currentRecoveryValue : null,
    horizonYears,
    scenarios,
    breakEvenSellPriceZeroResidual: financing.totalPaid / capacity,
    breakEvenSellPriceWithCurrentRecovery: (financing.totalPaid - recovery) / capacity,
    recommendation,
  };
}

export function rankElectronicsShipTrades(quotes, options) {
  return (quotes ?? [])
    .map(quote => evaluateElectronicsShipTrade(quote, options))
    .filter(Boolean)
    .sort((a, b) => (b.scenarios.base?.profitWithCurrentRecovery ?? -Infinity)
      - (a.scenarios.base?.profitWithCurrentRecovery ?? -Infinity));
}
