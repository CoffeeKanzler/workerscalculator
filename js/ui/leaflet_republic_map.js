import {
  CRS,
  canvas,
  circleMarker,
  imageOverlay,
  latLngBounds,
  layerGroup,
  map as createMap,
  polygon,
  polyline,
} from '../vendor/leaflet-src.esm.js?v=1';

import {
  buildingMapMetric,
  filterMapBuildings,
  mapPointToLeaflet,
  summarizeMapViewport,
} from './republic_map.js?v=16';

function imageBounds(image, height) {
  return [
    mapPointToLeaflet({
      mapX: image.mapX,
      mapY: image.mapY + image.mapHeight,
    }, height),
    mapPointToLeaflet({
      mapX: image.mapX + image.mapWidth,
      mapY: image.mapY,
    }, height),
  ];
}

// While a walking corridor is shown, the question on screen is "can a worker
// get from there to here on foot", so reach takes over the marker's colour and
// everything outside the corridor fades rather than disappears — a building
// that is out of reach is the answer, not noise.
function reachStyle(building, reach, palette) {
  if (building.index === reach.sourceIndex) {
    return {
      radius: 9, color: palette.accent2, weight: 4,
      fillColor: palette.accent2, fillOpacity: 1, opacity: 1, dashArray: null,
    };
  }
  const entry = reach.buildings.get(building.index);
  if (!entry) {
    return {
      radius: Math.max(2, 2.4 * (building.markScale ?? 1)),
      color: palette.panel, weight: 1,
      fillColor: palette.muted, fillOpacity: 0.12, opacity: 0.18, dashArray: null,
    };
  }
  const share = entry.budgetUsed / (reach.budgetMeters || 480);
  return {
    radius: Math.max(3.4, 4.4 * (building.markScale ?? 1)),
    color: palette.panel,
    weight: 1,
    fillColor: share <= 0.5 ? palette.pos : share <= 0.8 ? palette.warn : palette.neg,
    fillOpacity: 0.95,
    opacity: 0.9,
    dashArray: null,
  };
}

function metricStyle(building, mode, palette, reach = null) {
  if (reach) return reachStyle(building, reach, palette);
  const metric = buildingMapMetric(building, mode);
  let fillColor = palette.muted;
  let fillOpacity = 0.5;
  if (mode === 'category') {
    fillColor = palette[building.category] ?? palette.muted;
    fillOpacity = ['support', 'other'].includes(building.category) ? 0.48 : 0.9;
  } else if (metric.band === 'active') {
    fillColor = metric.value >= 0.8 ? palette.pos
      : metric.value >= 0.4 ? palette.warn : palette.neg;
    fillOpacity = 0.94;
  } else {
    fillColor = palette.muted;
    fillOpacity = 0.18;
  }
  if (building.borderPost) {
    fillColor = '#ffb02e';
    fillOpacity = 1;
  } else if (building.outlier) {
    fillColor = palette.neg;
    fillOpacity = 1;
  }
  return {
    radius: building.focused ? 8 : building.borderPost ? 5
      : building.outlier ? 6 : Math.max(2.2, 2.8 * (building.markScale ?? 1)),
    color: building.inspected ? palette.accent2
      : building.selected ? palette.accent : palette.panel,
    weight: building.inspected ? 4 : building.selected ? 3
      : building.underConstruction ? 2 : 1,
    dashArray: building.underConstruction ? '3 2' : null,
    fillColor,
    fillOpacity,
    opacity: building.selected || building.underConstruction ? 1 : 0.7,
  };
}

function schematicBounds(points, height) {
  return latLngBounds(points.map(point => mapPointToLeaflet(point, height)));
}

export function mountRepublicLeafletMap(container, options) {
  const {
    model, buildings, scopes, transportLines, layers, categoryVisibility, mode, query,
    pollutionOpacity, radiationOpacity, palette, waterHref, pollutionHref, radiationHref, tooltipFor,
    transportTooltipFor, onSelectBuilding, onSelectTransportLine,
    onSelectScope, onViewportSummary, initialCamera,
    walkReachFor = null, onWalkReach = null,
  } = options;
  let walkReach = null;
  const fullBounds = latLngBounds([[0, 0], [model.height, model.width]]);
  const map = createMap(container, {
    crs: CRS.Simple,
    minZoom: -3,
    maxZoom: 7,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    attributionControl: false,
    preferCanvas: true,
  });
  map.createPane('mapWaterPane').style.zIndex = '210';
  map.createPane('mapPollutionPane').style.zIndex = '220';
  map.createPane('mapRadiationPane').style.zIndex = '230';
  map.createPane('mapVectorPane').style.zIndex = '410';

  // One renderer is essential here. Separate full-size canvas panes stack as
  // opaque hit targets even where their pixels are transparent, which makes a
  // scope canvas above the buildings swallow every building click.
  const vectorRenderer = canvas({
    pane: 'mapVectorPane', padding: 0.25, tolerance: 8,
  });
  const groups = {
    water: layerGroup(),
    pollution: layerGroup(),
    radiation: layerGroup(),
    roads: layerGroup(),
    rails: layerGroup(),
    pedestrian: layerGroup(),
    transport: layerGroup(),
    footprints: layerGroup(),
    buildings: layerGroup(),
    scopes: layerGroup(),
  };
  const addNetwork = (key, lines, style) => {
    if (!lines.length) return;
    polyline(lines.map(line =>
      line.points.map(point => mapPointToLeaflet(point, model.height))), {
      ...style, interactive: false, renderer: vectorRenderer, pane: 'mapVectorPane',
    }).addTo(groups[key]);
  };
  if (model.water) {
    imageOverlay(waterHref(model.water), imageBounds(model.water, model.height), {
      pane: 'mapWaterPane', interactive: false,
    }).addTo(groups.water);
  }
  let pollutionImage = null;
  if (model.pollution) {
    pollutionImage = imageOverlay(
      pollutionHref(model.pollution), imageBounds(model.pollution, model.height), {
        pane: 'mapPollutionPane', interactive: false, opacity: pollutionOpacity,
      }).addTo(groups.pollution);
  }
  let radiationImage = null;
  if (model.pollution?.radiationPacked) {
    radiationImage = imageOverlay(
      radiationHref(model.pollution), imageBounds(model.pollution, model.height), {
        pane: 'mapRadiationPane',
        className: 'map-radiation-overlay',
        interactive: false,
        opacity: radiationOpacity,
      }).addTo(groups.radiation);
  }
  addNetwork('roads', model.roads, {
    color: palette.muted, weight: 1.1, opacity: 0.58,
  });
  addNetwork('rails', model.rails, {
    color: palette.accent2, weight: 1.5, opacity: 0.8,
  });
  addNetwork('pedestrian', model.pedestrian, {
    color: palette.pedestrian, weight: 1, opacity: 0.76,
  });

  const transportRecords = (transportLines ?? []).map(line => {
    const path = polyline(line.segments.map(segment =>
      segment.map(point => mapPointToLeaflet(point, model.height))), {
      color: palette.transport,
      weight: 3,
      opacity: 0.82,
      interactive: true,
      renderer: vectorRenderer,
      pane: 'mapVectorPane',
    });
    path.bindTooltip(() => transportTooltipFor(line), {
      sticky: true, className: 'map-leaflet-tooltip',
    });
    path.on('click', () => selectTransportLine(line));
    path.addTo(groups.transport);
    return { line, path };
  });
  container.dataset.mapTransportLineCount = String(transportRecords.length);

  let selectBuilding = () => {};
  let selectTransportLine = () => {};
  // The footprint is the building; the marker stays because a five-metre shed is
  // a sub-pixel target when the whole republic is on screen, and because a type
  // with no extracted geometry has to remain clickable.
  const footprintStyle = building => {
    const style = metricStyle(building, currentMode, palette, walkReach);
    return {
      color: style.color, weight: Math.min(1.5, style.weight), opacity: style.opacity,
      fillColor: style.fillColor, fillOpacity: Math.min(0.92, style.fillOpacity + 0.06),
    };
  };
  const markerRecords = buildings.map(building => {
    const marker = circleMarker(mapPointToLeaflet(building, model.height), {
      ...metricStyle(building, mode, palette),
      renderer: vectorRenderer,
      pane: 'mapVectorPane',
    });
    marker.bindTooltip(() => tooltipFor(building, walkReach?.buildings.get(building.index) ?? null), {
      sticky: true, className: 'map-leaflet-tooltip',
    });
    marker.on('click', () => selectBuilding(building));
    let shape = null;
    if (building.footprint?.length) {
      shape = polygon(building.footprint.map(ring =>
        ring.map(point => mapPointToLeaflet(point, model.height))), {
        renderer: vectorRenderer, pane: 'mapVectorPane', interactive: true,
      });
      shape.bindTooltip(() => tooltipFor(building, walkReach?.buildings.get(building.index) ?? null), {
        sticky: true, className: 'map-leaflet-tooltip',
      });
      shape.on('click', () => selectBuilding(building));
    }
    return { building, marker, shape };
  });
  container.dataset.mapFootprintCount = String(markerRecords.filter(record => record.shape).length);
  const scopeRecords = scopes.map(scope => {
    const marker = circleMarker(mapPointToLeaflet(scope, model.height), {
      renderer: vectorRenderer,
      pane: 'mapVectorPane',
      radius: scope.selected ? 7 : 5,
      color: palette.accent2,
      fill: false,
      weight: 3,
      opacity: 0.9,
    });
    marker.bindTooltip(() => {
      const label = document.createElement('strong');
      label.textContent = scope.name;
      return label;
    });
    marker.on('click', () => onSelectScope(scope));
    marker.addTo(groups.scopes);
    return { scope, marker };
  });

  let currentMode = mode;
  let currentQuery = query;
  let cameraReady = false;
  const currentCategories = { ...categoryVisibility };
  const currentLayers = { ...layers };
  const visibleBuildings = () => filterMapBuildings(buildings, currentQuery).filter(building => {
    if (building.borderPost) return currentLayers.borders;
    if (building.outlier && !currentLayers.outliers && !currentLayers.buildings) return false;
    if (!building.outlier && !currentLayers.buildings) return false;
    if (building.underConstruction && !currentLayers.construction) return false;
    return currentCategories[building.category] !== false;
  });
  const refreshBuildings = () => {
    const visible = new Set(visibleBuildings());
    for (const record of markerRecords) {
      const style = metricStyle(record.building, currentMode, palette, walkReach);
      const showShape = !!record.shape && currentLayers.footprints !== false;
      record.marker.setStyle(showShape
        ? { ...style, radius: Math.max(1.6, style.radius * 0.55), fillOpacity: style.fillOpacity * 0.6 }
        : style);
      const mounted = groups.buildings.hasLayer(record.marker);
      if (visible.has(record.building) && !mounted) record.marker.addTo(groups.buildings);
      else if (!visible.has(record.building) && mounted) groups.buildings.removeLayer(record.marker);
      if (!record.shape) continue;
      record.shape.setStyle(footprintStyle(record.building));
      const shapeMounted = groups.footprints.hasLayer(record.shape);
      if (visible.has(record.building) && showShape && !shapeMounted) {
        record.shape.addTo(groups.footprints);
      } else if ((!visible.has(record.building) || !showShape) && shapeMounted) {
        groups.footprints.removeLayer(record.shape);
      }
    }
    container.dataset.mapMarkerCount = String(visible.size);
    const counts = {};
    for (const building of visible) counts[building.category] = (counts[building.category] ?? 0) + 1;
    container.dataset.mapCategoryCounts = JSON.stringify(counts);
    updateSummary();
  };
  const applyWalkReach = building => {
    if (!currentLayers.walkReach || !walkReachFor || !building) {
      walkReach = null;
    } else {
      const result = walkReachFor(building.index);
      walkReach = result
        ? { sourceIndex: building.index, ...result }
        : { sourceIndex: building.index, buildings: new Map(), unattached: true };
    }
    container.dataset.mapWalkReachCount = walkReach ? String(walkReach.buildings.size) : '';
    onWalkReach?.(walkReach);
  };
  selectBuilding = building => {
    for (const record of markerRecords) {
      record.building.inspected = record.building.index === building.index;
    }
    applyWalkReach(building);
    refreshBuildings();
    onSelectBuilding(building);
  };
  selectTransportLine = line => {
    for (const record of transportRecords) {
      record.path.setStyle({
        weight: record.line.slot === line.slot ? 6 : 3,
        opacity: record.line.slot === line.slot ? 1 : 0.55,
      });
    }
    onSelectTransportLine(line);
  };
  const updateLayer = key => {
    if (key === 'walkReach') {
      applyWalkReach(markerRecords.find(record => record.building.inspected)?.building ?? null);
      return refreshBuildings();
    }
    const groupKey = ['construction', 'borders', 'outliers', 'footprints'].includes(key)
      ? 'buildings' : key;
    const group = groups[groupKey];
    if (!group) return;
    if (groupKey === 'buildings') return refreshBuildings();
    if (currentLayers[key] && !map.hasLayer(group)) group.addTo(map);
    else if (!currentLayers[key] && map.hasLayer(group)) map.removeLayer(group);
  };
  const mapBoundsAsSchematic = () => {
    const bounds = map.getBounds();
    return {
      minX: Math.max(0, bounds.getWest()),
      maxX: Math.min(model.width, bounds.getEast()),
      minY: Math.max(0, model.height - bounds.getNorth()),
      maxY: Math.min(model.height, model.height - bounds.getSouth()),
    };
  };
  function updateSummary() {
    if (!cameraReady) return;
    onViewportSummary(summarizeMapViewport(visibleBuildings(), mapBoundsAsSchematic()));
    container.dataset.mapZoom = String(map.getZoom());
    const center = map.getCenter();
    container.dataset.mapCenter = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
  }

  for (const key of ['water', 'pollution', 'radiation', 'roads', 'rails', 'pedestrian', 'transport', 'scopes', 'walkReach']) {
    updateLayer(key);
  }
  groups.footprints.addTo(map);
  groups.buildings.addTo(map);
  refreshBuildings();
  if (initialCamera && Number.isFinite(initialCamera.zoom)) {
    map.setView(initialCamera.center, initialCamera.zoom, { animate: false });
  } else {
    const developed = buildings.filter(building => !building.borderPost);
    const bounds = developed.length
      ? schematicBounds(developed, model.height)
      : fullBounds;
    map.fitBounds(bounds.pad(0.08), { animate: false });
  }
  cameraReady = true;
  map.on('moveend zoomend', updateSummary);
  requestAnimationFrame(() => {
    map.invalidateSize();
    updateSummary();
  });

  return {
    destroy() {
      const center = map.getCenter();
      const camera = { center: [center.lat, center.lng], zoom: map.getZoom() };
      map.remove();
      return camera;
    },
    setMetric(nextMode) {
      currentMode = nextMode;
      refreshBuildings();
    },
    setFilter(nextQuery) {
      currentQuery = nextQuery;
      refreshBuildings();
    },
    setCategory(category, visible) {
      currentCategories[category] = visible;
      refreshBuildings();
    },
    setLayer(key, visible) {
      currentLayers[key] = visible;
      updateLayer(key);
    },
    setPollutionOpacity(value) {
      pollutionImage?.setOpacity(value);
    },
    setRadiationOpacity(value) {
      radiationImage?.setOpacity(value);
    },
    fitDeveloped() {
      const points = visibleBuildings().filter(building => !building.borderPost);
      map.fitBounds((points.length ? schematicBounds(points, model.height) : fullBounds).pad(0.08));
    },
    fitFull() {
      map.fitBounds(fullBounds);
    },
    focusBuilding(building) {
      const point = mapPointToLeaflet(building, model.height);
      map.setView(point, Math.max(map.getZoom(), 2), { animate: true });
      selectBuilding(building);
    },
    focusTransportLine(line) {
      const points = line.segments.flat();
      if (points.length) {
        map.fitBounds(schematicBounds(points, model.height).pad(0.18), { animate: false });
      }
      selectTransportLine(line);
    },
  };
}
