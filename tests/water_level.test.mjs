import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildingHeightSamples,
  fitTerrainHeightScale,
  isOnMap,
  waterLevelFromBuildingHeights,
} from '../js/models/water_level.js';

// A map whose heightmap runs 1000 m per unit with sea level at sample 0.06.
const SLOPE = 1000;
const INTERCEPT = -60;
const terrain = (x, z) => 0.06 + (x + z) / 400_000;
const heightOf = sample => SLOPE * sample + INTERCEPT;

function republic(count, { flat = false } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const x = -4000 + index * 7;
    const z = 2000 - index * 5;
    const sample = flat ? 0.2 : terrain(x, z);
    return { index, x, z, y: flat ? 4 + (index % 3) * 0.01 : heightOf(sample) };
  });
}

test('off-map markers are not fed to the fit', () => {
  assert.equal(isOnMap(0, 0), true);
  assert.equal(isOnMap(19000, 19000), false, 'the foreign-trade markers sit outside the terrain');
  assert.equal(isOnMap(NaN, 0), false);

  const samples = buildingHeightSamples([
    { x: 10, z: 20, y: 5 },
    { x: 19000, z: 19000, y: -20 },
    { x: 30, z: 40 },
  ]);

  assert.deepEqual([...samples], [10, 20, 5], 'only the one usable building survives');
});

test('the height scale comes out of the buildings that stand on the terrain', () => {
  const buildings = republic(200);
  const samples = buildingHeightSamples(buildings);

  const { plane, reason, fit } = waterLevelFromBuildingHeights(samples,
    (x, z) => terrain(x, z), { min: 0, max: 1 });

  assert.equal(reason, null);
  assert.ok(Math.abs(fit.metresPerSample ?? fit.slope) > 0);
  assert.ok(Math.abs(fit.slope - SLOPE) < 1, `slope ${fit.slope}`);
  assert.ok(Math.abs(fit.intercept - INTERCEPT) < 1, `intercept ${fit.intercept}`);
  assert.ok(Math.abs(fit.correlation - 1) < 1e-9);
  // Sea level is zero metres, which on this map is sample 0.06.
  assert.ok(Math.abs(plane - 0.06) < 1e-6, `plane ${plane}`);
});

// A republic built on one flat plain gives no slope to recover, and inventing one
// would move its shoreline on no evidence at all.
test('a terrain too flat to fit is refused rather than guessed at', () => {
  const samples = buildingHeightSamples(republic(200, { flat: true }));

  const { plane, reason, fit } = waterLevelFromBuildingHeights(samples,
    () => 0.2, { min: 0, max: 1 });

  assert.equal(plane, null);
  assert.equal(reason, 'terrain-too-flat-to-fit');
  assert.equal(fit.slope, null, 'a constant sample has no slope');
});

test('too few buildings is not a measurement', () => {
  const { plane, reason } = waterLevelFromBuildingHeights(
    buildingHeightSamples(republic(10)), (x, z) => terrain(x, z), { min: 0, max: 1 });

  assert.equal(plane, null);
  assert.equal(reason, 'not-enough-building-heights');
});

test('a sea level the terrain never reaches is refused', () => {
  const samples = buildingHeightSamples(republic(200));

  const { plane, reason } = waterLevelFromBuildingHeights(samples,
    (x, z) => terrain(x, z), { min: 0.1, max: 0.9 });

  assert.equal(plane, null, 'sample 0.06 is below every cell in the file');
  assert.equal(reason, 'sea-level-outside-terrain');
});

test('a heightmap running the other way is refused, not inverted', () => {
  const buildings = republic(200).map(building => ({ ...building, y: -building.y }));

  const { plane, reason } = waterLevelFromBuildingHeights(
    buildingHeightSamples(buildings), (x, z) => terrain(x, z), { min: 0, max: 1 });

  assert.equal(plane, null);
  assert.equal(reason, 'height-scale-not-increasing');
});

test('no buildings at all leaves the caller with what it had', () => {
  assert.equal(waterLevelFromBuildingHeights(new Float64Array(0), () => 0.2).reason,
    'no-building-heights');
  assert.equal(waterLevelFromBuildingHeights(null, null).reason, 'no-building-heights');
});

test('a fit needs both axes to vary', () => {
  assert.equal(fitTerrainHeightScale(
    Array.from({ length: 100 }, (_, index) => [0.2, index])).slope, null);
  assert.equal(fitTerrainHeightScale(
    Array.from({ length: 100 }, (_, index) => [index / 100, 7])).slope, null);
});
