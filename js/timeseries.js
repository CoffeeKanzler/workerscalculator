export function recordDateKey(record) {
  return (record.year ?? 0) * 366 + (record.day ?? 0);
}

export function filterRange(records, range = 'all') {
  if (range === 'all' || records.length < 2) return records;
  const span = range === 'month' ? 30 : range === 'year' ? 366 : Infinity;
  const latest = recordDateKey(records.at(-1));
  return records.filter(record => recordDateKey(record) >= latest - span);
}

export function seriesFromRecords(records, valueOf) {
  return records.flatMap((record, index) => {
    const y = valueOf(record, index);
    if (!Number.isFinite(y)) return [];
    return [{
      x: recordDateKey(record), y, record,
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
