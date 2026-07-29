export function mapPointToLeaflet(point, mapHeight) {
  return [mapHeight - point.mapY, point.mapX];
}

export function mapCountOrDash(value, formatter) {
  return Number.isFinite(value) ? formatter(value, 0) : '—';
}

export function radiationRasterPixels(packed, low, high) {
  const samples = Uint8Array.from(atob(packed), character => character.charCodeAt(0));
  const pixels = new Uint8ClampedArray(samples.length * 4);
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] / 255;
    if (!value) continue;
    const target = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[target + channel] = Math.round(
        low[channel] + (high[channel] - low[channel]) * value,
      );
    }
    pixels[target + 3] = Math.round(72 + value * 183);
  }
  return pixels;
}

function workerPositions(building) {
  return (Number.isFinite(building.configuredWorkers) ? building.configuredWorkers : 0)
    + (Number.isFinite(building.configuredWorkersHighEducation)
      ? building.configuredWorkersHighEducation : 0);
}

export function normalizeMapMetric(mode) {
  return mode === 'construction' ? 'construction' : 'category';
}

export function buildingMapMetric(building, mode) {
  if (mode === 'construction') {
    const value = Number.isFinite(building.constructionProgress)
      ? building.constructionProgress : 1;
    return { mode, value, band: value < 1 ? 'active' : 'complete' };
  }
  return { mode: 'category', value: building.category ?? 'other', band: building.category ?? 'other' };
}

export function filterMapBuildings(buildings, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase();
  if (!needle) return buildings;
  return buildings.filter(building =>
    [building.name, building.displayName, building.type, building.areaName]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(needle)));
}

export function buildMapTransportLines(lineOperations, buildings) {
  const buildingByIndex = new Map((buildings ?? []).map(building => [building.index, building]));
  return (lineOperations?.lines ?? []).flatMap(line => {
    const locatedStops = [];
    const segments = [];
    let segment = [];
    for (const stop of line.stops ?? []) {
      const building = buildingByIndex.get(stop.buildingIndex);
      const point = building && Number.isFinite(building.mapX) && Number.isFinite(building.mapY)
        ? { mapX: building.mapX, mapY: building.mapY, buildingIndex: building.index }
        : null;
      if (point) {
        locatedStops.push(point);
        segment.push(point);
      } else {
        if (segment.length > 1) segments.push(segment);
        segment = [];
      }
    }
    if (segment.length > 1) segments.push(segment);
    return segments.length ? [{
      ...line,
      stopCount: line.stops?.length ?? 0,
      locatedStopCount: locatedStops.length,
      segments,
    }] : [];
  });
}

export function residenceDetailForBuilding(building, summaries, options) {
  const capacity = Number.isFinite(options.capacity) && options.capacity >= 0
    ? options.capacity : null;
  const summary = summaries instanceof Map
    ? summaries.get(building.index)
    : summaries.find(detail => detail.buildingIndex === building.index);
  if (summary) {
    return {
      ...summary,
      // Children share their parent's apartment: Petrograd #971 has 348 residents,
      // but only its 217 adults occupy the building's 220 saved housing slots.
      occupiedAdultSpaces: Number.isFinite(summary.adults) ? summary.adults : null,
      capacity,
    };
  }
  if (!options.residential) return null;
  return {
    buildingIndex: building.index,
    residents: 0,
    adults: 0,
    children: 0,
    higherEducation: 0,
    health: null,
    happiness: null,
    loyalty: null,
    criminality: null,
    highestCriminality: null,
    highRiskResidents: 0,
    occupiedAdultSpaces: 0,
    capacity,
  };
}

export function summarizeMapViewport(buildings, bounds) {
  const visible = buildings.filter(building =>
    building.mapX >= bounds.minX && building.mapX <= bounds.maxX
    && building.mapY >= bounds.minY && building.mapY <= bounds.maxY);
  return visible.reduce((summary, building) => {
    summary.buildings += 1;
    summary.workers += Number.isFinite(building.currentWorkers) ? building.currentWorkers : 0;
    summary.positions += workerPositions(building);
    if ((building.constructionProgress ?? 1) < 1) summary.underConstruction += 1;
    return summary;
  }, { buildings: 0, workers: 0, positions: 0, underConstruction: 0 });
}
