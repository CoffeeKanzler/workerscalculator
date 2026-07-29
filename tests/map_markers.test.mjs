import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  markerRadius, visibleMarkers, markerAt, drawOrder, paletteFrom,
} from '../js/ui/map_markers.js';

const at = (x, y, extra = {}) => ({ x, y, ...extra });

test('a marker keeps a constant screen size, so its world radius follows the zoom', () => {
  const plain = at(0, 0);
  // Zooming in halves the scale, so the world radius halves with it.
  assert.equal(markerRadius(plain, 1), 1.35);
  assert.equal(markerRadius(plain, 0.5), 0.675);
});

test('status markers stay larger than the buildings around them', () => {
  const scale = 1;
  assert.ok(markerRadius(at(0, 0, { focused: true }), scale) > markerRadius(at(0, 0, { outlier: true }), scale));
  assert.ok(markerRadius(at(0, 0, { outlier: true }), scale) > markerRadius(at(0, 0, { borderPost: true }), scale));
  assert.ok(markerRadius(at(0, 0, { borderPost: true }), scale) > markerRadius(at(0, 0), scale));
});

// Infrastructure is 82% of a save's markers and is drawn smaller, so its scale
// has to reach the radius or the distinction is lost.
test('a category scale shrinks an ordinary marker', () => {
  assert.ok(markerRadius(at(0, 0, { scale: 0.9 }), 1) < markerRadius(at(0, 0, { scale: 1.6 }), 1));
});

test('only markers the viewport can show are drawn', () => {
  const markers = [at(10, 10), at(500, 500), at(-400, 20), at(105, 60)];
  const view = { x: 0, y: 0, width: 120, height: 80 };
  const visible = visibleMarkers(markers, view, 1, { padding: 0 });

  assert.deepEqual(visible.map(m => m.x), [10, 105]);
});

test('the cull keeps a margin so markers do not pop in at the edge', () => {
  const markers = [at(-5, 40)];
  const view = { x: 0, y: 0, width: 120, height: 80 };
  assert.equal(visibleMarkers(markers, view, 1, { padding: 0 }).length, 0);
  assert.equal(visibleMarkers(markers, view, 1, { padding: 12 }).length, 1);
});

// Markers are around 2.7 screen pixels across. Without a tolerance far larger
// than the marker, clicking one is a matter of luck.
test('a click near a marker finds it, and a click in empty space finds nothing', () => {
  const markers = [at(100, 100), at(200, 200)];
  assert.equal(markerAt(markers, { x: 104, y: 103 }, 1), markers[0]);
  assert.equal(markerAt(markers, { x: 150, y: 150 }, 1), null);
});

test('the nearest marker wins when several are within reach', () => {
  const near = at(100, 100);
  const far = at(106, 100);
  assert.equal(markerAt([far, near], { x: 101, y: 100 }, 1), near);
});

test('tolerance follows the zoom, so hitting is equally easy at any scale', () => {
  const markers = [at(100, 100)];
  // At half scale the reach is 4 world units, so 6 away is out and 2 is in.
  // The same two clicks at full scale both land, which is the point: the
  // tolerance tracks the zoom rather than being fixed in world space.
  assert.equal(markerAt(markers, { x: 106, y: 100 }, 0.5), null);
  assert.equal(markerAt(markers, { x: 102, y: 100 }, 0.5), markers[0]);
  assert.equal(markerAt(markers, { x: 106, y: 100 }, 1), markers[0]);
});

test('an empty map is not a crash', () => {
  assert.equal(markerAt([], { x: 0, y: 0 }, 1), null);
  assert.deepEqual(visibleMarkers([], { x: 0, y: 0, width: 10, height: 10 }, 1), []);
});

// A republic overlaps heavily, so what is drawn last is what a reader sees.
test('status markers draw over the buildings around them', () => {
  const ordered = drawOrder([
    at(0, 0, { focused: true }), at(1, 1), at(2, 2, { outlier: true }),
    at(3, 3, { borderPost: true }), at(4, 4, { selected: true }),
  ]);
  assert.equal(ordered.at(-1).focused, true, 'the focused building is never buried');
  assert.equal(ordered[0].x, 1, 'an ordinary building draws first');
});

test('drawing does not reorder the caller’s array', () => {
  const markers = [at(0, 0, { focused: true }), at(1, 1)];
  const before = [...markers];
  drawOrder(markers);
  assert.deepEqual(markers, before);
});

// Canvas cannot inherit CSS, so the theme has to be read at draw time or the
// map ignores light and dark entirely.
test('the palette is read from the document, with a fallback if a token is missing', () => {
  const styles = { getPropertyValue: token => (token === '--accent' ? ' #c74a3a ' : '') };
  const palette = paletteFrom(styles, {
    industry: { token: 'accent' },
    living: { token: 'blueprint' },
  });
  assert.equal(palette.industry, '#c74a3a');
  assert.equal(palette.living, '#888', 'a missing token still draws something');
});
