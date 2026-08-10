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
  const field = `${basis === 'sell' ? 'sell' : 'purchase'}${currency === 'USD' ? 'USD' : 'RUB'}`;
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

export function rollingAnnualRates(points) {
  const sorted = [...(points ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const rates = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const end = sorted[index];
    const start = pointAtOrBefore(sorted.slice(0, index), end.ordinal - DAYS_PER_YEAR);
    const rate = start ? annualizedBetween(start, end) : null;
    if (Number.isFinite(rate)) rates.push(rate);
  }
  return rates;
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
