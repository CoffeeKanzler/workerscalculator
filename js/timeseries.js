export function recordDateKey(record) {
  const year = Number(record.year);
  const day = Number(record.day);
  // myCanyon ends with a useful $STAT_CURRENT snapshot dated 0/0. Treating
  // that sentinel as year zero stretches a century of history across 2,025 years.
  if (!Number.isFinite(year) || year <= 0 || !Number.isFinite(day) || day < 0) return NaN;
  return year * 366 + day;
}

export function filterRange(records, range = 'all') {
  if (range === 'all') return records;
  const dated = records.filter(record => Number.isFinite(recordDateKey(record)));
  if (dated.length < 2) return dated;
  const span = range === 'month' ? 30 : range === 'year' ? 366 : Infinity;
  const latest = recordDateKey(dated.at(-1));
  return dated.filter(record => recordDateKey(record) >= latest - span);
}

export function seriesFromRecords(records, valueOf) {
  return records.flatMap((record, index) => {
    const y = valueOf(record, index);
    const x = recordDateKey(record);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{
      x, y, record,
      label: `${record.year ?? '?'} / ${record.day ?? '?'}`,
    }];
  });
}

export function downsampleMinMax(points, limit = 160) {
  if (points.length <= limit || limit < 4) return points.slice(0, Math.max(0, limit));
  const result = [points[0]];
  const interior = points.slice(1, -1);
  const bucketCount = Math.floor((limit - 2) / 2);

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(bucket * interior.length / bucketCount);
    const end = Math.floor((bucket + 1) * interior.length / bucketCount);
    const values = interior.slice(start, end);
    if (!values.length) continue;
    let min = values[0];
    let max = values[0];
    for (const point of values.slice(1)) {
      if (point.y < min.y) min = point;
      if (point.y > max.y) max = point;
    }
    for (const point of min.x <= max.x ? [min, max] : [max, min]) {
      if (result.at(-1) !== point) result.push(point);
    }
  }
  if (result.at(-1) !== points.at(-1)) result.push(points.at(-1));
  return result;
}
