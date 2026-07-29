import {
  CRS,
  canvas,
  circleMarker,
  imageOverlay,
  latLngBounds,
  layerGroup,
  map as createMap,
  polyline,
} from '../vendor/leaflet-src.esm.js?v=1';

import {
  buildingMapMetric,
  filterMapBuildings,
  mapPointToLeaflet,
  summarizeMapViewport,
} from './republic_map.js?v=6';

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

function metricStyle(building, mode, palette) {
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
    model, buildings, scopes, layers, categoryVisibility, mode, query,
    pollutionOpacity, palette, waterHref, pollutionHref, tooltipFor,
    onSelectBuilding, onSelectScope, onViewportSummary, initialCamera,
  } = options;
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
    roads: layerGroup(),
    rails: layerGroup(),
    pedestrian: layerGroup(),
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
  addNetwork('roads', model.roads, {
    color: palette.muted, weight: 1.1, opacity: 0.58,
  });
  addNetwork('rails', model.rails, {
    color: palette.accent2, weight: 1.5, opacity: 0.8,
  });
  addNetwork('pedestrian', model.pedestrian, {
    color: palette.pedestrian, weight: 1, opacity: 0.76,
  });

  let selectBuilding = () => {};
  const markerRecords = buildings.map(building => {
    const marker = circleMarker(mapPointToLeaflet(building, model.height), {
      ...metricStyle(building, mode, palette),
      renderer: vectorRenderer,
      pane: 'mapVectorPane',
    });
    marker.bindTooltip(() => tooltipFor(building), {
      sticky: true, className: 'map-leaflet-tooltip',
    });
    marker.on('click', () => selectBuilding(building));
    return { building, marker };
  });
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
      record.marker.setStyle(metricStyle(record.building, currentMode, palette));
      const mounted = groups.buildings.hasLayer(record.marker);
      if (visible.has(record.building) && !mounted) record.marker.addTo(groups.buildings);
      else if (!visible.has(record.building) && mounted) groups.buildings.removeLayer(record.marker);
    }
    container.dataset.mapMarkerCount = String(visible.size);
    const counts = {};
    for (const building of visible) counts[building.category] = (counts[building.category] ?? 0) + 1;
    container.dataset.mapCategoryCounts = JSON.stringify(counts);
    updateSummary();
  };
  selectBuilding = building => {
    for (const record of markerRecords) {
      record.building.inspected = record.building.index === building.index;
    }
    refreshBuildings();
    onSelectBuilding(building);
  };
  const updateLayer = key => {
    const groupKey = ['construction', 'borders', 'outliers'].includes(key) ? 'buildings' : key;
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

  for (const key of ['water', 'pollution', 'roads', 'rails', 'pedestrian', 'scopes']) {
    updateLayer(key);
  }
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
  };
}
