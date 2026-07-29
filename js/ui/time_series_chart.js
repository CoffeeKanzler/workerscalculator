import uPlot from '../vendor/uPlot.esm.js?v=2';

export function alignTimeSeries(series) {
  const xValues = [...new Set(series.flatMap(item => item.points.map(point => point.x)))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const indexes = new Map(xValues.map((x, index) => [x, index]));
  const labelsByX = new Map();
  const valueColumns = series.map(item => {
    const values = Array(xValues.length).fill(null);
    for (const point of item.points) {
      const index = indexes.get(point.x);
      if (index === undefined || !Number.isFinite(point.y)) continue;
      values[index] = point.y;
      if (point.label) labelsByX.set(point.x, point.label);
    }
    return values;
  });
  return { xValues, valueColumns, labelsByX };
}

export function gameDateParts(dateKey) {
  const year = Math.floor(dateKey / 366);
  return { year, day: Math.max(0, Math.round(dateKey - year * 366)) };
}

export function formatGameDateKey(dateKey) {
  const { year, day } = gameDateParts(dateKey);
  return `${year} / ${String(day).padStart(3, '0')}`;
}

export function seriesSummary(series) {
  return series.filter(item => item.points.length).map(item => {
    const values = item.points.map(point => point.y).filter(Number.isFinite);
    return {
      label: item.label,
      first: values[0],
      last: values.at(-1),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
}

export { uPlot };
