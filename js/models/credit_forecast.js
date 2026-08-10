import { quantile, simulateLoanPath } from './economic_analysis.js?v=4';
import { recipeYearFactors, resolveElectronicsProducerSet } from './electronics_analysis.js?v=2';

const DAYS_PER_YEAR = 365;

function unitRecipeCost(building, outputKey, year, priceFor) {
  const factors = recipeYearFactors(building, year);
  const outputRate = Number(building?.production?.[outputKey]);
  if (!factors || !(outputRate > 0) || typeof priceFor !== 'function') return null;
  let inputCost = 0;
  for (const [resource, rateRaw] of Object.entries(building?.consumption ?? {})) {
    const price = Number(priceFor(resource));
    const rate = Number(rateRaw);
    if (!Number.isFinite(price) || !Number.isFinite(rate)) return null;
    inputCost += rate * factors.consumptionFactor * price;
  }
  const output = outputRate * factors.productionFactor;
  return output > 0 ? inputCost / output : null;
}

export function electronicsComponentIndex({
  buildings, startYear, years = 30, priceFor, variant = 'vanilla',
} = {}) {
  const producerSet = resolveElectronicsProducerSet(buildings)?.[variant];
  const firstYear = Number(startYear);
  const horizon = Math.max(0, Math.trunc(Number(years) || 0));
  if (!producerSet || !Number.isFinite(firstYear) || typeof priceFor !== 'function') return null;
  const [componentFactory, electronicsFactory] = producerSet;
  const points = [];
  for (let yearOffset = 0; yearOffset <= horizon; yearOffset += 1) {
    const year = firstYear + yearOffset;
    const ecomponentsCost = unitRecipeCost(componentFactory, 'ecomponents', year, priceFor);
    const electronicsCost = unitRecipeCost(electronicsFactory, 'eletronics', year, resource =>
      resource === 'ecomponents' ? ecomponentsCost : priceFor(resource));
    if (!Number.isFinite(ecomponentsCost) || !Number.isFinite(electronicsCost)) return null;
    points.push({ yearOffset, year, ecomponentsCost, electronicsCost, index: null });
  }
  const startCost = points[0]?.electronicsCost;
  if (!(startCost > 0)) return null;
  for (const point of points) point.index = point.electronicsCost / startCost * 100;
  return points;
}

function componentIndexAt(componentIndex, month) {
  if (!Array.isArray(componentIndex) || !componentIndex.length) return null;
  const yearOffset = month / 12;
  const lowerYear = Math.floor(yearOffset);
  const upperYear = Math.ceil(yearOffset);
  const lower = componentIndex.find(point => point.yearOffset === lowerYear) ?? componentIndex.at(-1);
  const upper = componentIndex.find(point => point.yearOffset === upperYear) ?? componentIndex.at(-1);
  if (!Number.isFinite(lower?.index) || !Number.isFinite(upper?.index)) return null;
  const fraction = yearOffset - lowerYear;
  return lower.index + (upper.index - lower.index) * fraction;
}

export function forecastElectronicsPrices({
  currentPrice, rateScenarios, componentIndex, months = 360,
} = {}) {
  const startPrice = Number(currentPrice);
  const horizon = Math.max(0, Math.trunc(Number(months) || 0));
  if (!(startPrice > 0) || !rateScenarios || !Array.isArray(componentIndex)) return null;
  return Object.fromEntries(Object.entries(rateScenarios).map(([scenario, rates]) => {
    const normal = Number(rates?.normal);
    const residual = Number(rates?.residual);
    if (!Number.isFinite(normal) || !Number.isFinite(residual)
        || normal <= -1 || residual <= -1) return [scenario, null];
    const points = [];
    for (let month = 0; month <= horizon; month += 1) {
      const component = componentIndexAt(componentIndex, month);
      if (!Number.isFinite(component)) return [scenario, null];
      const years = month / 12;
      points.push({
        month,
        price: startPrice * (1 + normal) ** years * (1 + residual) ** years
          * component / 100,
      });
    }
    return [scenario, points];
  }));
}

export function deriveForecastRateScenarios({
  normalRates = [], electronicsRates = [], componentRates = [],
} = {}) {
  const count = Math.min(normalRates.length, electronicsRates.length);
  const normals = normalRates.slice(-count).filter(rate => Number.isFinite(rate) && rate > -1);
  const residuals = [];
  for (let offset = 0; offset < count; offset += 1) {
    const normal = Number(normalRates[normalRates.length - count + offset]);
    const electronics = Number(electronicsRates[electronicsRates.length - count + offset]);
    const component = Number(componentRates[componentRates.length - count + offset] ?? 0);
    if (![normal, electronics, component].every(Number.isFinite)
        || normal <= -1 || electronics <= -1 || component <= -1) continue;
    residuals.push((1 + electronics) / ((1 + normal) * (1 + component)) - 1);
  }
  if (!normals.length || !residuals.length) return null;
  return {
    base: { normal: quantile(normals, 0.5), residual: quantile(residuals, 0.5) },
    favorable: { normal: quantile(normals, 0.75), residual: quantile(residuals, 0.75) },
    adverse: { normal: quantile(normals, 0.25), residual: quantile(residuals, 0.25) },
  };
}

export function futureExchangePath({
  currentRubPerUsd, rubNormalRate, usdNormalRate, months = 360,
} = {}) {
  const current = Number(currentRubPerUsd);
  const rub = Number(rubNormalRate);
  const usd = Number(usdNormalRate);
  const horizon = Math.max(0, Math.trunc(Number(months) || 0));
  if (!(current > 0) || !Number.isFinite(rub) || !Number.isFinite(usd)
      || rub <= -1 || usd <= -1) return null;
  return Array.from({ length: horizon + 1 }, (_, month) => ({
    month,
    rubPerUsd: current * ((1 + rub) / (1 + usd)) ** (month / 12),
  }));
}

function valueAtMonth(points, month, field) {
  const point = points?.find(item => item.month === month) ?? points?.[month];
  return Number(point?.[field]);
}

export function amortizationCorridor({
  quote, loan, cargoPurchasePrice, financingCurrency,
  exitPricePaths, conversionPaths,
} = {}) {
  const capacity = Number(quote?.offer?.modelFacts?.capacity);
  const shipPrice = Number(quote?.purchaseValue);
  const cargoPrice = Number(cargoPurchasePrice);
  if (!(capacity > 0) || !(shipPrice >= 0) || !(cargoPrice > 0)
      || !['RUB', 'USD'].includes(financingCurrency)) return null;
  const capitalRequired = shipPrice + capacity * cargoPrice;
  const maxMonth = Math.max(0, ...Object.values(exitPricePaths ?? {}).flatMap(paths =>
    Object.values(paths ?? {}).map(points => points?.at(-1)?.month ?? 0)));
  const horizonDays = Math.round(maxMonth * DAYS_PER_YEAR / 12);
  const debt = simulateLoanPath({
    ...loan, currentAmount: capitalRequired, penaltyAmount: 0,
  }, { horizonDays, sampleEveryDays: 1 });
  const debtByDay = debt.points;
  const routes = {};
  for (const [exitCurrency, scenarios] of Object.entries(exitPricePaths ?? {})) {
    const conversions = conversionPaths?.[exitCurrency];
    if (!Array.isArray(conversions)) continue;
    routes[exitCurrency] = {};
    for (const [scenario, prices] of Object.entries(scenarios ?? {})) {
      if (!Array.isArray(prices)) continue;
      routes[exitCurrency][scenario] = prices.map(pricePoint => {
        const month = pricePoint.month;
        const day = Math.min(horizonDays, Math.round(month * DAYS_PER_YEAR / 12));
        const debtPoint = debtByDay[day] ?? debtByDay.at(-1);
        const factor = valueAtMonth(conversions, month, 'factor');
        const liquidationValue = capacity * pricePoint.price * factor;
        return {
          month,
          liquidationValue,
          cumulativePayments: debtPoint.paid,
          remainingDebt: debtPoint.remainingDebt,
          net: liquidationValue - debtPoint.paid - debtPoint.remainingDebt,
        };
      });
    }
  }
  return {
    quote,
    financingCurrency,
    capacity,
    capitalRequired,
    shipResidualValue: 0,
    loanPath: debt,
    routes,
  };
}
