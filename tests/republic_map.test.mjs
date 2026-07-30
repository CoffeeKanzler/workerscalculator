import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildingMapMetric,
  buildMapTransportLines,
  filterMapBuildings,
  mapCountOrDash,
  mapPointToLeaflet,
  normalizeMapMetric,
  radiationRasterPixels,
  residenceDetailForBuilding,
  summarizeMapViewport,
  waterRasterPixels,
} from '../js/ui/republic_map.js';

test('radiation raster colors only nonzero samples with the supplied theme palette', () => {
  const packed = Buffer.from([0, 128, 255]).toString('base64');
  const pixels = radiationRasterPixels(packed, [20, 40, 60], [220, 140, 80]);

  assert.deepEqual([...pixels], [
    0, 0, 0, 0,
    120, 90, 70, 164,
    220, 140, 80, 255,
  ]);
});

test('transport lines preserve exact stop order and split around unresolved stops', () => {
  const buildings = [
    { index: 1, mapX: 10, mapY: 20 },
    { index: 2, mapX: 30, mapY: 40 },
    { index: 3, mapX: 50, mapY: 60 },
    { index: 4, mapX: 70, mapY: 80 },
  ];
  const operations = { lines: [{
    slot: 7,
    name: 'Workers',
    stops: [
      { buildingIndex: 1, observedInterval: 4 },
      { buildingIndex: 2, observedInterval: 5 },
      { buildingIndex: -1, observedInterval: 6 },
      { buildingIndex: 3, observedInterval: 7 },
      { buildingIndex: 4, observedInterval: 8 },
    ],
    assignedVehicles: [{ id: 11, name: 'Bus' }],
    completeObservedCycle: 30,
    largestObservedInterval: 8,
  }] };

  const [line] = buildMapTransportLines(operations, buildings);

  assert.equal(line.slot, 7);
  assert.equal(line.locatedStopCount, 4);
  assert.equal(line.stopCount, 5);
  assert.deepEqual(line.segments, [
    [{ mapX: 10, mapY: 20, buildingIndex: 1 }, { mapX: 30, mapY: 40, buildingIndex: 2 }],
    [{ mapX: 50, mapY: 60, buildingIndex: 3 }, { mapX: 70, mapY: 80, buildingIndex: 4 }],
  ]);
  assert.equal(line.completeObservedCycle, 30);
});

test('transport map omits lines without an exact stop-to-stop segment', () => {
  const operations = { lines: [
    { slot: 1, stops: [{ buildingIndex: 1 }], assignedVehicles: [] },
    { slot: 2, stops: [{ buildingIndex: 1 }, { buildingIndex: 99 }], assignedVehicles: [] },
  ] };

  assert.deepEqual(buildMapTransportLines(operations, [{ index: 1, mapX: 2, mapY: 3 }]), []);
  assert.deepEqual(buildMapTransportLines(null, []), []);
});

test('map counts retain finite values and render non-finite values as unavailable', () => {
  const format = (value, digits) => `${value}:${digits}`;
  assert.equal(mapCountOrDash(0, format), '0:0');
  assert.equal(mapCountOrDash(12, format), '12:0');
  assert.equal(mapCountOrDash(Number.NaN, format), '—');
  assert.equal(mapCountOrDash(Number.POSITIVE_INFINITY, format), '—');
});

test('the Leaflet adapter preserves the schematic map coordinate system', () => {
  assert.deepEqual(mapPointToLeaflet({ mapX: 125, mapY: 80 }, 480), [400, 125]);
  assert.deepEqual(mapPointToLeaflet({ mapX: 0, mapY: 480 }, 480), [0, 0]);
});

test('the focused map supports category and construction only', () => {
  assert.equal(normalizeMapMetric('category'), 'category');
  assert.equal(normalizeMapMetric('construction'), 'construction');
  assert.equal(normalizeMapMetric('staffing'), 'category');
  assert.equal(normalizeMapMetric('anything-else'), 'category');
});

test('category mode preserves the building category as its exact band', () => {
  assert.deepEqual(buildingMapMetric({ category: 'industry' }, 'category'), {
    mode: 'category', value: 'industry', band: 'industry',
  });
  assert.deepEqual(buildingMapMetric({}, 'category'), {
    mode: 'category', value: 'other', band: 'other',
  });
});

test('construction mode distinguishes active work from completed buildings', () => {
  assert.deepEqual(buildingMapMetric({ constructionProgress: 0.36 }, 'construction'), {
    mode: 'construction', value: 0.36, band: 'active',
  });
  assert.deepEqual(buildingMapMetric({ constructionProgress: 1 }, 'construction'), {
    mode: 'construction', value: 1, band: 'complete',
  });
});

test('map search matches saved names, localized labels, types, and areas', () => {
  const buildings = [
    { name: 'Lenin Steel', displayName: 'Steel mill', type: 'steel_mill', areaName: 'East' },
    { name: '', displayName: 'Hospital', type: 'hospital', areaName: 'Central' },
  ];
  assert.deepEqual(filterMapBuildings(buildings, 'lenin'), [buildings[0]]);
  assert.deepEqual(filterMapBuildings(buildings, 'HOSPITAL'), [buildings[1]]);
  assert.deepEqual(filterMapBuildings(buildings, 'central'), [buildings[1]]);
  assert.deepEqual(filterMapBuildings(buildings, ''), buildings);
});

test('viewport summary only totals visible filtered buildings', () => {
  const buildings = [
    {
      mapX: 10, mapY: 10, currentWorkers: 8,
      configuredWorkers: 10, configuredWorkersHighEducation: 2,
      constructionProgress: 1,
    },
    {
      mapX: 40, mapY: 30, currentWorkers: 3,
      configuredWorkers: 5, configuredWorkersHighEducation: 0,
      constructionProgress: 0.4,
    },
    { mapX: 90, mapY: 90, currentWorkers: 100, configuredWorkers: 100 },
  ];
  assert.deepEqual(summarizeMapViewport(buildings, {
    minX: 0, maxX: 50, minY: 0, maxY: 50,
  }), {
    buildings: 2, workers: 11, positions: 17, underConstruction: 1,
  });
});

test('residence details join by exact building index and retain exact zero', () => {
  const summaries = [{
    buildingIndex: 7, residents: 12, adults: 8, children: 4,
    higherEducation: 3, health: 0.8, happiness: 0.7, loyalty: 0.6,
    criminality: 0.02, highestCriminality: 0.12, highRiskResidents: 1,
  }];
  assert.deepEqual(residenceDetailForBuilding(
    { index: 7 }, summaries, { residential: true, capacity: 20 },
  ), { ...summaries[0], occupiedAdultSpaces: 8, capacity: 20 });
  assert.deepEqual(residenceDetailForBuilding(
    { index: 7 }, summaries, { residential: false, capacity: null },
  ), { ...summaries[0], occupiedAdultSpaces: 8, capacity: null });
  assert.deepEqual(residenceDetailForBuilding(
    { index: 8 }, summaries, { residential: true, capacity: 40 },
  ), {
    buildingIndex: 8, residents: 0, adults: 0, children: 0,
    higherEducation: 0, health: null, happiness: null, loyalty: null,
    criminality: null, highestCriminality: null, highRiskResidents: 0,
    occupiedAdultSpaces: 0,
    capacity: 40,
  });
  assert.equal(residenceDetailForBuilding(
    { index: 9 }, summaries, { residential: false, capacity: null },
  ), null);
});

// The whole water pipeline has to agree on one row order, and the order is the
// one every other raster uses: row 0 is north. The parser emits it that way and
// nothing between there and the overlay may mirror it — two copies of this
// conversion used to, which cancelled a bottom-up parser and hid the convention.
test('water cells are converted in place, north stays north', () => {
  // Four cells: levels 0, 1, 2, 3 in reading order.
  const packed = Buffer.from([0 | (1 << 2) | (2 << 4) | (3 << 6)]).toString('base64');

  const pixels = waterRasterPixels(packed, 4);

  assert.deepEqual([...pixels], [
    44, 133, 190, 0,
    44, 133, 190, 65,
    44, 133, 190, 115,
    44, 133, 190, 165,
  ]);
});

test('a dry north and a wet south stay that way through the conversion', () => {
  // A 2x2 map: both northern cells dry, both southern cells fully wet.
  const packed = Buffer.from([0 | (0 << 2) | (3 << 4) | (3 << 6)]).toString('base64');

  const pixels = waterRasterPixels(packed, 4);

  assert.deepEqual([pixels[3], pixels[7], pixels[11], pixels[15]], [0, 0, 165, 165],
    'transparent on the first row, opaque on the last');
});
