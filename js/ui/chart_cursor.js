// Hover readout for the history charts.
//
// The charts plot 3,000 to 8,000 records downsampled to 160 points, and until
// now a reader could see the shape of a line but never a number on it: no
// value, no date, nothing but the two axis extremes. Asking "what was the
// population in spring '73" meant counting pixels.
//
// The geometry lives here rather than in the renderer because it is the part
// worth testing — which sample a pointer is over, and where a tooltip can sit
// without leaving the chart — and none of it needs a browser.

// Points are plotted in ascending x, so the nearest one is found by walking in
// from whichever side is closer. A linear scan is fine at 160 points and stays
// correct if a caller ever passes an unsorted series.
export function nearestIndex(points, x) {
  if (!points?.length) return -1;
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.abs(points[index].x - x);
    if (distance >= bestDistance) continue;
    best = index;
    bestDistance = distance;
  }
  return best;
}

// One reading across every series at the cursor. Series are sampled from the
// same records but downsampling can land them on different x values, so each
// is resolved independently and reports the date it actually holds.
export function cursorReadout(series, x) {
  const rows = [];
  let label = null;
  let closest = Infinity;
  for (const item of series) {
    const index = nearestIndex(item.points, x);
    if (index < 0) continue;
    const point = item.points[index];
    rows.push({ label: item.label, color: item.color, value: point.y, x: point.x });
    const distance = Math.abs(point.x - x);
    // The heading shows one date, so it shows the one the cursor is nearest to.
    if (distance < closest) {
      closest = distance;
      label = point.label ?? null;
    }
  }
  return { label, rows };
}

// The tooltip follows the cursor and would otherwise be clipped at the right
// edge, which is exactly where the most recent — most interesting — samples
// are. It flips to the other side of the cursor instead.
export function tooltipPlacement(x, tooltipWidth, chartWidth, { gap = 12 } = {}) {
  const right = x + gap;
  if (right + tooltipWidth <= chartWidth) return right;
  const left = x - gap - tooltipWidth;
  if (left >= 0) return left;
  // Narrower chart than tooltip: pin it inside and accept the overlap.
  return Math.max(0, chartWidth - tooltipWidth);
}

// Pointer position as a fraction of the plot area, clamped to it. The chart
// pads its box, and a cursor in that padding should read as the nearest edge
// rather than extrapolating past the first or last sample.
export function plotFraction(offsetX, boxWidth, { width, padding }) {
  if (!(boxWidth > 0)) return 0;
  // The svg scales to its box, so a pixel offset is converted to the viewBox
  // coordinates the plot was laid out in.
  const scaled = (offsetX / boxWidth) * width;
  const span = width - 2 * padding;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (scaled - padding) / span));
}
