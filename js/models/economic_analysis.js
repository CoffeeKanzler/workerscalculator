const DAYS_PER_YEAR = 365;

function ordinal(record) {
  const year = Number(record?.year);
  const day = Number(record?.day);
  return Number.isFinite(year) && Number.isFinite(day) ? year * DAYS_PER_YEAR + day : null;
}

function positivePrices(record, field) {
  return Object.fromEntries(Object.entries(record?.[field] ?? {})
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map(([key, value]) => [key, Number(value)]));
}

export function buildPriceIndex(records, { currency = 'RUB', basis = 'purchase' } = {}) {
  const normalizedBasis = ['base', 'purchase', 'sell'].includes(basis) ? basis : 'base';
  const field = `${normalizedBasis}${currency === 'USD' ? 'USD' : 'RUB'}`;
  const dated = (records ?? [])
    .map(record => ({ record, ordinal: ordinal(record), prices: positivePrices(record, field) }))
    .filter(item => item.ordinal !== null)
    .sort((a, b) => a.ordinal - b.ordinal);
  if (!dated.length) return [];

  let index = 100;
  return dated.map((item, position) => {
    let coverage = Object.keys(item.prices).length;
    if (position > 0) {
      const previous = dated[position - 1].prices;
      const common = Object.keys(item.prices).filter(key => Number.isFinite(previous[key]));
      coverage = common.length;
      if (coverage) {
        const logMean = common.reduce((sum, key) =>
          sum + Math.log(item.prices[key] / previous[key]), 0) / coverage;
        index *= Math.exp(logMean);
      }
    }
    return {
      year: item.record.year,
      day: item.record.day,
      ordinal: item.ordinal,
      index,
      coverage,
    };
  });
}

export function buildResourcePriceIndex(records, {
  resource, currency = 'RUB', basis = 'purchase',
} = {}) {
  const normalizedBasis = ['base', 'purchase', 'sell'].includes(basis) ? basis : 'base';
  const field = `${normalizedBasis}${currency === 'USD' ? 'USD' : 'RUB'}`;
  const dated = (records ?? [])
    .map(record => ({
      year: Number(record?.year),
      day: Number(record?.day),
      price: Number(record?.[field]?.[resource]),
    }))
    .filter(item => Number.isFinite(item.year) && Number.isFinite(item.day)
      && Number.isFinite(item.price) && item.price > 0)
    .map(item => ({ ...item, ordinal: item.year * DAYS_PER_YEAR + item.day }))
    .sort((a, b) => a.ordinal - b.ordinal);
  if (!dated.length) return [];
  const firstPrice = dated[0].price;
  return dated.map(item => ({
    ...item,
    index: item.price / firstPrice * 100,
    coverage: 1,
  }));
}

function annualizedBetween(start, end) {
  const days = end.ordinal - start.ordinal;
  if (!(days > 0) || !(start.index > 0) || !(end.index > 0)) return null;
  return (end.index / start.index) ** (DAYS_PER_YEAR / days) - 1;
}

function pointAtOrBefore(points, targetOrdinal) {
  let found = null;
  for (const point of points) {
    if (point.ordinal > targetOrdinal) break;
    found = point;
  }
  return found;
}

export function rollingAnnualRateIntervals(points) {
  const sorted = [...(points ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const rates = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const end = sorted[index];
    const start = pointAtOrBefore(sorted.slice(0, index), end.ordinal - DAYS_PER_YEAR);
    const rate = start ? annualizedBetween(start, end) : null;
    if (Number.isFinite(rate)) rates.push({
      startOrdinal: start.ordinal, endOrdinal: end.ordinal, rate,
    });
  }
  return rates;
}

export function rollingAnnualRates(points) {
  return rollingAnnualRateIntervals(points).map(interval => interval.rate);
}

export function summarizeInflation(points) {
  const sorted = [...(points ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  if (sorted.length < 2) {
    return { latestAnnual: null, fiveYearAnnual: null, allAnnual: null, coverage: sorted.at(-1)?.coverage ?? 0 };
  }
  const first = sorted[0];
  const last = sorted.at(-1);
  const latestStart = pointAtOrBefore(sorted.slice(0, -1), last.ordinal - DAYS_PER_YEAR);
  const fiveYearStart = pointAtOrBefore(sorted.slice(0, -1), last.ordinal - 5 * DAYS_PER_YEAR);
  return {
    latestAnnual: latestStart ? annualizedBetween(latestStart, last) : null,
    fiveYearAnnual: fiveYearStart ? annualizedBetween(fiveYearStart, last) : null,
    allAnnual: annualizedBetween(first, last),
    coverage: last.coverage ?? 0,
  };
}

export function quantile(values, q) {
  const sorted = (values ?? []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = Math.max(0, Math.min(1, q)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

export function effectiveAnnualRate(annualPercent) {
  const rate = Number(annualPercent);
  if (!Number.isFinite(rate)) return null;
  return (1 + rate / 100 / DAYS_PER_YEAR) ** DAYS_PER_YEAR - 1;
}

export function realAnnualRate(effectiveRate, inflationRate) {
  const effective = Number(effectiveRate);
  const inflation = Number(inflationRate);
  if (!Number.isFinite(effective) || !Number.isFinite(inflation) || inflation <= -1) return null;
  return (1 + effective) / (1 + inflation) - 1;
}

function cashAvailable(availableCash, day, state) {
  const value = typeof availableCash === 'function'
    ? availableCash(day, { ...state })
    : availableCash;
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : Infinity;
}

function initialLoanState(loan) {
  return {
    remainingDays: Math.max(0, Math.trunc(Number(loan?.remainingDays) || 0)),
    currentAmount: Math.max(0, Number(loan?.currentAmount) || 0),
    penaltyAmount: Math.max(0, Number(loan?.penaltyAmount) || 0),
    totalPaid: 0,
    interestPaid: 0,
    maxDailyPayment: 0,
    days: 0,
  };
}

function loanStateCompleted(state) {
  return state.currentAmount <= 1e-7 && state.penaltyAmount <= 1e-7;
}

function stepLoanDay(state, annualRate, availableCash) {
  if (loanStateCompleted(state)) return state;
  const dailyRate = annualRate / 100 / DAYS_PER_YEAR;
  if (state.remainingDays > 0) state.remainingDays -= 1;
  const balanceAfterInterest = state.currentAmount * (1 + dailyRate)
    + state.penaltyAmount * dailyRate;
  const interestPart = state.currentAmount * (1 + dailyRate) * dailyRate
    + state.penaltyAmount * dailyRate;
  const scheduledPrincipal = state.remainingDays > 0
    ? balanceAfterInterest / state.remainingDays
    : balanceAfterInterest;
  const amountDue = scheduledPrincipal + state.penaltyAmount;
  const payment = Math.min(cashAvailable(availableCash, state.days, {
    remainingDays: state.remainingDays,
    currentAmount: state.currentAmount,
    penaltyAmount: state.penaltyAmount,
    amountDue,
  }), amountDue);

  state.currentAmount = balanceAfterInterest;
  const penaltyPayment = Math.min(state.penaltyAmount, payment);
  state.penaltyAmount -= penaltyPayment;
  state.currentAmount = Math.max(0, state.currentAmount - (payment - penaltyPayment));
  if (scheduledPrincipal > payment) {
    const shortfall = scheduledPrincipal - payment;
    state.currentAmount = Math.max(0, state.currentAmount - shortfall);
    state.penaltyAmount += shortfall;
  }
  state.totalPaid += payment;
  state.interestPaid += Math.min(payment, interestPart);
  state.maxDailyPayment = Math.max(state.maxDailyPayment, payment);
  state.days += 1;
  return state;
}

function loanSimulationResult(state) {
  return {
    days: state.days,
    totalPaid: state.totalPaid,
    interestPaid: state.interestPaid,
    maxDailyPayment: state.maxDailyPayment,
    endingCurrentAmount: state.currentAmount,
    endingPenaltyAmount: state.penaltyAmount,
    remainingDays: state.remainingDays,
    completed: loanStateCompleted(state),
  };
}

export function simulateLoan(loan, { availableCash = Infinity, maxDays = 10000 } = {}) {
  const state = initialLoanState(loan);
  const annualRate = Number(loan?.annualRate) || 0;
  const safetyDays = Math.max(0, Math.trunc(Number(maxDays) || 0));
  while (!loanStateCompleted(state) && state.days < safetyDays) {
    stepLoanDay(state, annualRate, availableCash);
  }
  return loanSimulationResult(state);
}

export function simulateLoanPath(loan, {
  horizonDays = loan?.remainingDays ?? 0,
  sampleEveryDays = 30,
  availableCash = Infinity,
} = {}) {
  const state = initialLoanState(loan);
  const annualRate = Number(loan?.annualRate) || 0;
  const horizon = Math.max(0, Math.trunc(Number(horizonDays) || 0));
  const interval = Math.max(1, Math.trunc(Number(sampleEveryDays) || 1));
  const point = day => ({
    day,
    paid: state.totalPaid,
    currentAmount: state.currentAmount,
    penaltyAmount: state.penaltyAmount,
    remainingDebt: state.currentAmount + state.penaltyAmount,
    completed: loanStateCompleted(state),
  });
  const points = [point(0)];
  for (let day = 1; day <= horizon; day += 1) {
    const wasCompleted = loanStateCompleted(state);
    if (!wasCompleted) stepLoanDay(state, annualRate, availableCash);
    const justCompleted = !wasCompleted && loanStateCompleted(state);
    if (day % interval === 0 || day === horizon || justCompleted) points.push(point(day));
  }
  return { points, simulation: loanSimulationResult(state) };
}

export function evaluateLoanScenarios(loan, normalInflationIndex) {
  const rates = rollingAnnualRates(normalInflationIndex);
  const baseInflation = rates.at(-1) ?? null;
  const scenarios = {
    base: baseInflation,
    best: quantile(rates, 0.75),
    worst: quantile(rates, 0.25),
  };
  const effectiveRate = effectiveAnnualRate(loan?.annualRate);
  const realRates = Object.fromEntries(Object.entries(scenarios)
    .map(([name, inflation]) => [name, realAnnualRate(effectiveRate, inflation)]));
  const simulation = simulateLoan(loan);
  const hasPenalty = Number(loan?.penaltyAmount) > 1e-7;
  let recommendation = 'tight';
  const reasons = [];

  if (hasPenalty) {
    recommendation = 'risky';
    reasons.push('existingPenalty');
  } else if (!Number.isFinite(realRates.base)) {
    reasons.push('insufficientInflationHistory');
  } else if (realRates.base < 0) {
    recommendation = 'favorable';
    reasons.push('inflationExceedsLoanCost');
  } else if (realRates.base <= 0.03) {
    reasons.push('lowPositiveRealCost');
  } else {
    recommendation = 'risky';
    reasons.push('highPositiveRealCost');
  }

  return {
    inflationSource: 'base',
    inflationRates: scenarios,
    effectiveRate,
    realRates,
    simulation,
    recommendation,
    reasons,
  };
}
