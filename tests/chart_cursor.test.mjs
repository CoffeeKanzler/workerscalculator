import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nearestIndex, cursorReadout, tooltipPlacement, plotFraction,
} from '../js/ui/chart_cursor.js';

const points = [
  { x: 0, y: 10, label: '1960' },
  { x: 10, y: 20, label: '1970' },
  { x: 20, y: 15, label: '1980' },
];

test('nearestIndex picks the sample the cursor is closest to', () => {
  assert.equal(nearestIndex(points, 0), 0);
  assert.equal(nearestIndex(points, 11), 1);
  assert.equal(nearestIndex(points, 19), 2);
});

test('nearestIndex clamps past either end rather than reporting nothing', () => {
  assert.equal(nearestIndex(points, -500), 0);
  assert.equal(nearestIndex(points, 500), 2);
});

test('nearestIndex reports no sample for an empty series', () => {
  assert.equal(nearestIndex([], 5), -1);
  assert.equal(nearestIndex(undefined, 5), -1);
});

test('a tie resolves to the earlier sample rather than flickering', () => {
  // Exactly between two samples; strict > keeps the first, so a cursor parked
  // on the midpoint does not alternate as the pointer jitters by a pixel.
  assert.equal(nearestIndex(points, 5), 0);
});

test('cursorReadout reports every series at the cursor', () => {
  const readout = cursorReadout([
    { label: 'births', color: '#0f0', points },
    { label: 'deaths', color: '#f00', points: [{ x: 0, y: 3 }, { x: 20, y: 9 }] },
  ], 19);
  assert.equal(readout.rows.length, 2);
  assert.deepEqual(readout.rows.map(row => row.value), [15, 9]);
  assert.deepEqual(readout.rows.map(row => row.label), ['births', 'deaths']);
});

test('the heading date comes from whichever series is nearest the cursor', () => {
  // Series downsample independently, so a coarse one can be far from the
  // cursor while a fine one sits on it. The fine one names the date.
  const readout = cursorReadout([
    { label: 'coarse', color: '#0f0', points: [{ x: 0, y: 1, label: '1960' }] },
    { label: 'fine', color: '#f00', points: [{ x: 18, y: 2, label: '1979' }] },
  ], 19);
  assert.equal(readout.label, '1979');
});

test('cursorReadout skips series with no points instead of emitting a blank row', () => {
  const readout = cursorReadout([
    { label: 'empty', color: '#0f0', points: [] },
    { label: 'real', color: '#f00', points },
  ], 10);
  assert.equal(readout.rows.length, 1);
  assert.equal(readout.rows[0].label, 'real');
});

test('the tooltip sits to the right of the cursor when there is room', () => {
  assert.equal(tooltipPlacement(100, 120, 640), 112);
});

test('the tooltip flips left rather than being clipped at the right edge', () => {
  // The newest samples are at the right edge, so this is the common case.
  assert.equal(tooltipPlacement(600, 120, 640), 468);
});

test('a tooltip wider than the chart is pinned inside it', () => {
  assert.equal(tooltipPlacement(50, 300, 200), 0);
  assert.equal(tooltipPlacement(50, 150, 200), 50);
});

test('plotFraction maps a pointer offset onto the plotted span', () => {
  const geometry = { width: 640, padding: 32 };
  assert.equal(plotFraction(32, 640, geometry), 0);
  assert.equal(plotFraction(608, 640, geometry), 1);
  assert.equal(plotFraction(320, 640, geometry), 0.5);
});

test('plotFraction clamps a pointer in the axis padding to the nearest end', () => {
  const geometry = { width: 640, padding: 32 };
  assert.equal(plotFraction(0, 640, geometry), 0);
  assert.equal(plotFraction(640, 640, geometry), 1);
});

test('plotFraction accounts for an svg scaled away from its viewBox size', () => {
  // The chart is laid out at 640 wide but stretches to its container, so a
  // pointer at the visual centre must still read as the middle of the plot.
  const geometry = { width: 640, padding: 32 };
  assert.equal(plotFraction(160, 320, geometry), 0.5);
});

test('plotFraction survives a chart measured before layout', () => {
  assert.equal(plotFraction(10, 0, { width: 640, padding: 32 }), 0);
  assert.equal(plotFraction(10, 640, { width: 64, padding: 32 }), 0);
});
