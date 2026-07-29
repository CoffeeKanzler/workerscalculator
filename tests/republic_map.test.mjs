import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildingMapMetric,
  filterMapBuildings,
  mapCountOrDash,
  mapPointToLeaflet,
  normalizeMapMetric,
  residenceDetailForBuilding,
  summarizeMapViewport,
} from '../js/ui/republic_map.js';

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
