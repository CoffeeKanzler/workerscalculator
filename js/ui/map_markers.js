// Projection, culling and hit-testing for the republic map's building markers.
//
// The markers were individual SVG elements, one per building with a <title>
// child: 2,142 markers and 4,409 nodes on a real save, rebuilt on every pan,
// zoom, filter and re-render. Opening the map took 4.2 seconds and a zoom press
// cost 246ms at the median, degrading to 438ms as interaction continued.
//
// Canvas draws them in one pass instead, but canvas has no elements, so the
// things the DOM was doing for free have to be done here: deciding what is
// visible, and working out what was clicked. Both are pure, so both are
// testable without a browser.

// A marker is drawn at a constant screen size, so the radius in world units
// shrinks as the view zooms in. Everything below works in world units and
// converts once, at the edges.
export function markerRadius(marker, scale) {
  const base = marker.focused ? 7.5
    : marker.borderPost ? 4.5
      : marker.outlier ? 5.5
        : marker.selected ? 2.4
          : 1.35 * (marker.scale ?? 1);
  return base * scale;
}

// Only what the viewport can show. A republic spans far more than one screen
// once zoomed, and drawing two thousand markers to decide that most of them
// land outside it is the work this avoids.
export function visibleMarkers(markers, viewBox, scale, { padding = 12 } = {}) {
  const pad = padding * scale;
  const left = viewBox.x - pad;
  const right = viewBox.x + viewBox.width + pad;
  const top = viewBox.y - pad;
  const bottom = viewBox.y + viewBox.height + pad;
  return markers.filter(marker => marker.x >= left && marker.x <= right
    && marker.y >= top && marker.y <= bottom);
}

// Canvas cannot tell you what was clicked, so the nearest marker within a
// tolerance is the answer. Markers are around 2.7 screen pixels across, so the
// tolerance is what makes them hittable at all — it matches the transparent
// stroke the SVG version used to widen its hit area.
export function markerAt(markers, point, scale, { tolerance = 8 } = {}) {
  const reach = tolerance * scale;
  let best = null;
  let bestDistance = Infinity;
  for (const marker of markers) {
    const dx = marker.x - point.x;
    const dy = marker.y - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // A marker drawn larger is easier to hit, which is what a reader expects
    // of a border post or a focused building.
    const limit = Math.max(reach, markerRadius(marker, scale));
    if (distance > limit || distance >= bestDistance) continue;
    best = marker;
    bestDistance = distance;
  }
  return best;
}

// Draw order decides what a reader sees where markers overlap, and a republic
// overlaps heavily. Ordinary buildings first, then anything carrying a status,
// so a border post or an outlier is never buried under the housing around it.
export function drawOrder(markers) {
  const rank = marker => (marker.focused ? 4
    : marker.outlier ? 3
      : marker.borderPost ? 2
        : marker.selected ? 1 : 0);
  return [...markers].sort((a, b) => rank(a) - rank(b));
}

// Canvas cannot inherit CSS, so the palette is read from the document once per
// draw rather than hard-coded — otherwise the map would ignore the theme.
export function paletteFrom(styles, categories) {
  const read = token => styles.getPropertyValue(`--${token}`).trim() || '#888';
  const palette = {};
  for (const [category, mark] of Object.entries(categories)) {
    palette[category] = read(mark.token);
  }
  return palette;
}
