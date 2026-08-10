import { quantile, simulateLoanPath } from './economic_analysis.js?v=7';
import { recipeYearFactors, resolveElectronicsProducerSet } from './electronics_analysis.js?v=5';

const DAYS_PER_YEAR = 365;

function unitRecipeCost(building, outputKey, year, priceFor) {
  const factors = recipeYearFactors(building, year);
  const outputRate = Number(building?.production?.[outputKey]);
  if (!factors || !(outputRate > 0) || typeof priceFor !== 'function') return null;
  let inputCost = 0;
  for (const [resource, rateRaw] of Object.entries(building?.consumption ?? {})) {
    const price = Number(priceFor(resource));
    const rate = Number(rateRaw);
    if (!(price > 0) || !Number.isFinite(rate)) return null;
    inputCost += rate * factors.consumptionFactor * price;
  }
  const workers = Number(building?.workers ?? 0);
  if (workers > 0) {
    const workdayPrice = Number(priceFor('workers'));
    if (!(workdayPrice > 0)) return null;
    inputCost += workers * workdayPrice;
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

export function historicalElectronicsComponentIndex({
  buildings, records = [], currency = 'RUB', variant = 'vanilla',
} = {}) {
  const priceField = currency === 'USD' ? 'purchaseUSD' : 'purchaseRUB';
  const dated = records.flatMap(record => {
    const year = Number(record?.year);
    const day = Number(record?.day);
    if (!Number.isFinite(year) || year <= 0 || !Number.isFinite(day) || day < 0) return [];
    return [{ record, year, day, ordinal: year * DAYS_PER_YEAR + day }];
  }).sort((a, b) => a.ordinal - b.ordinal);
  const sourceIndex = dated.findIndex(({ record, year }) => electronicsComponentIndex({
    buildings, startYear: year, years: 0, variant,
    priceFor: key => key === 'workers'
      ? Number(record?.[currency === 'USD' ? 'workdayCostUSD' : 'workdayCostRUB'])
      : Number(record?.[priceField]?.[key]),
  })?.[0]?.electronicsCost > 0);
  if (sourceIndex < 0) return [];
  const source = dated[sourceIndex].record;
  const fixedPriceFor = key => key === 'workers'
    ? Number(source?.[currency === 'USD' ? 'workdayCostUSD' : 'workdayCostRUB'])
    : Number(source?.[priceField]?.[key]);
  const costs = dated.slice(sourceIndex).flatMap(({ year, day, ordinal }) => {
    const point = electronicsComponentIndex({
      buildings, startYear: year, years: 0, variant, priceFor: fixedPriceFor,
    })?.[0];
    return point?.electronicsCost > 0
      ? [{ year, day, ordinal, price: point.electronicsCost }] : [];
  });
  const first = costs[0]?.price;
  if (!(first > 0)) return [];
  return costs.map(point => ({ ...point, index: point.price / first * 100, coverage: 1 }));
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
  const dated = [normalRates, electronicsRates, componentRates].some(rates =>
    rates.some(item => typeof item === 'object' && item !== null));
  let alignedNormal = normalRates;
  let alignedElectronics = electronicsRates;
  let alignedComponents = componentRates;
  if (dated) {
    const key = item => `${item?.startOrdinal}:${item?.endOrdinal}`;
    const normalByInterval = new Map(normalRates.map(item => [key(item), item?.rate]));
    const componentByInterval = new Map(componentRates.map(item => [key(item), item?.rate]));
    const aligned = electronicsRates.flatMap(item => {
      const interval = key(item);
      const normal = normalByInterval.get(interval);
      const component = componentByInterval.get(interval);
      return [normal, item?.rate, component].every(Number.isFinite)
        ? [{ normal, electronics: item.rate, component }] : [];
    });
    alignedNormal = aligned.map(item => item.normal);
    alignedElectronics = aligned.map(item => item.electronics);
    alignedComponents = aligned.map(item => item.component);
  }
  const count = Math.min(alignedNormal.length, alignedElectronics.length);
  const normals = alignedNormal.slice(-count).filter(rate => Number.isFinite(rate) && rate > -1);
  const residuals = [];
  for (let offset = 0; offset < count; offset += 1) {
    const normal = Number(alignedNormal[alignedNormal.length - count + offset]);
    const electronics = Number(alignedElectronics[alignedElectronics.length - count + offset]);
    const component = Number(alignedComponents[alignedComponents.length - count + offset] ?? 0);
    if (![normal, electronics, component].every(Number.isFinite)
        || normal <= -1 || electronics <= -1 || component <= -1) continue;
    residuals.push((1 + electronics) / ((1 + normal) * (1 + component)) - 1);
  }
  if (!normals.length || !residuals.length) return null;
  const baseNormal = normals.at(-1);
  return {
    base: { normal: baseNormal, residual: quantile(residuals, 0.5) },
    favorable: { normal: Math.max(baseNormal, quantile(normals, 0.75)), residual: quantile(residuals, 0.75) },
    adverse: { normal: Math.min(baseNormal, quantile(normals, 0.25)), residual: quantile(residuals, 0.25) },
  };
}

export function rubPerUsdFromBasePrices(record) {
  const rub = record?.baseRUB ?? {};
  const usd = record?.baseUSD ?? {};
  const ratios = Object.keys(rub).flatMap(key => {
    const rubPrice = Number(rub[key]);
    const usdPrice = Number(usd[key]);
    return rubPrice > 0 && usdPrice > 0 ? [rubPrice / usdPrice] : [];
  }).sort((a, b) => a - b);
  if (ratios.length < 2) return null;
  return quantile(ratios, 0.5);
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

function firstBreakEvenMonth(points, horizonMonth) {
  return points?.find(point => point.month <= horizonMonth && Number(point.net) >= 0)?.month ?? null;
}

function routeSummary({ quote, loan, corridor, exitCurrency, paths, horizonMonth }) {
  const baseBreakEvenMonth = firstBreakEvenMonth(paths?.base, horizonMonth);
  if (!Number.isFinite(baseBreakEvenMonth)) return null;
  const adverseBreakEvenMonth = firstBreakEvenMonth(paths?.adverse, horizonMonth);
  const baseEnd = [...(paths.base ?? [])].reverse()
    .find(point => point.month <= horizonMonth && Number.isFinite(point.net));
  const milestones = Object.fromEntries(Object.entries(paths ?? {}).map(([scenario, points]) =>
    [scenario, Object.fromEntries([5, 10, 20, 30].map(years => {
      const target = years * 12;
      const point = [...(points ?? [])].reverse()
        .find(item => item.month <= target && Number.isFinite(item.net));
      return [years, point?.net ?? null];
    }))]));
  const neverBreaksEven = Object.fromEntries(Object.entries(paths ?? {}).map(([scenario, points]) =>
    [scenario, !Number.isFinite(firstBreakEvenMonth(points, horizonMonth))]));
  return {
    quote,
    loan,
    shipName: quote.offer.modelFacts.name,
    financingCurrency: loan.currency,
    exitCurrency,
    capacity: corridor.capacity,
    capitalRequired: corridor.capitalRequired,
    corridor,
    paths,
    baseBreakEvenMonth,
    adverseBreakEvenMonth,
    baseValue30Years: baseEnd?.net ?? null,
    milestones,
    neverBreaksEven,
    assessment: Number.isFinite(adverseBreakEvenMonth)
      ? 'profitable-adverse' : 'profitable-base-only',
  };
}

function compatibleElectronicsShip(quote) {
  const facts = quote?.offer?.modelFacts;
  return facts?.runtimeCategory === 6
    && (facts.transportSubtype === 0 || facts.transportSubtype === 11)
    && Number.isFinite(facts.capacity) && facts.capacity > 0
    && Number.isFinite(quote?.purchaseValue) && quote.purchaseValue >= 0;
}

export function rankRelevantCreditOpportunities({
  quotes = [], loans = [], forecastContext, horizonYears = 30,
} = {}) {
  if (typeof forecastContext?.corridorFor !== 'function') return [];
  const horizonMonth = Math.max(0, Math.trunc(Number(horizonYears) * 12 || 0));
  const byOffer = new Map();
  for (const quote of quotes.filter(compatibleElectronicsShip)) {
    const candidates = [];
    for (const loan of loans) {
      if (!['RUB', 'USD'].includes(loan?.currency)) continue;
      const corridor = forecastContext.corridorFor({ quote, loan, horizonYears });
      if (!corridor) continue;
      for (const [exitCurrency, paths] of Object.entries(corridor.routes ?? {})) {
        const summary = routeSummary({
          quote, loan, corridor, exitCurrency, paths, horizonMonth,
        });
        if (summary) candidates.push(summary);
      }
    }
    candidates.sort((a, b) => a.baseBreakEvenMonth - b.baseBreakEvenMonth
      || (b.baseValue30Years ?? -Infinity) - (a.baseValue30Years ?? -Infinity));
    if (candidates.length) byOffer.set(quote.offer, candidates);
  }
  return [...byOffer.values()].map(candidates => ({
    ...candidates[0],
    alternateRoutes: candidates.slice(1).map(candidate => ({
      financingCurrency: candidate.financingCurrency,
      exitCurrency: candidate.exitCurrency,
      baseBreakEvenMonth: candidate.baseBreakEvenMonth,
      adverseBreakEvenMonth: candidate.adverseBreakEvenMonth,
      baseValue30Years: candidate.baseValue30Years,
      assessment: candidate.assessment,
      paths: candidate.paths,
      milestones: candidate.milestones,
      neverBreaksEven: candidate.neverBreaksEven,
    })),
  })).sort((a, b) => a.baseBreakEvenMonth - b.baseBreakEvenMonth
    || (b.baseValue30Years ?? -Infinity) - (a.baseValue30Years ?? -Infinity));
}
