import { resolveVehicleModels } from '../fleet.js?v=11';
import { latestProductivity } from '../save_model.js?v=23';
import { buildImportedPlanning, projectSaveToRepublicModel } from './save_projection.js?v=30';
import { readWorkshopIndex } from '../models/workshop_index.js?v=2';

const REQUIRED_FILES = ['namepoints.bin', 'buildings_game.bin'];
const CORE_BINARY_FILES = {
  namepoints: 'namepoints.bin',
  buildings: 'buildings_game.bin',
  workers: 'workers.bin',
  vehicles: 'vehicles.bin',
  usedVehicles: 'usedveh.bin',
  lines: 'lines.bin',
  header: 'header.bin',
  research: 'research.bin',
  events: 'events.bin',
  stats: 'stats.ini',
};
const DEFERRED_MAP_FILES = {
  road: 'road.bin',
  rail: 'rail.bin',
  pedestrian: 'pedestrianway.bin',
  cableway: 'cableway.bin',
  powerHigh: 'electro_high.bin',
  powerLow: 'electro_low.bin',
  heightmap: 'heightmap.dds',
  pollution: 'pollution.bin',
};

const WORKSHOP_PRODUCTION_GROUPS = new Map([
  ['eletric', ['Strom', 'Electricity']],
  ['heat', ['Heizwerk', 'Heating plant']],
  ['water', ['Wasser & Abwasser', 'Water & Wastewater']],
  ['usagewater', ['Wasser & Abwasser', 'Water & Wastewater']],
  ['plants', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['food', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['alcohol', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['meat', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['livestock', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['gravel', ['Bauindustrie', 'Construction industry']],
  ['rawgravel', ['Bauindustrie', 'Construction industry']],
  ['cement', ['Bauindustrie', 'Construction industry']],
  ['concrete', ['Bauindustrie', 'Construction industry']],
  ['asphalt', ['Bauindustrie', 'Construction industry']],
  ['bricks', ['Bauindustrie', 'Construction industry']],
  ['boards', ['Bauindustrie', 'Construction industry']],
  ['wood', ['Bauindustrie', 'Construction industry']],
  ['prefabpanels', ['Bauindustrie', 'Construction industry']],
  ['rawcoal', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['coal', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['oil', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['fuel', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['bitumen', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['chemicals', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['plastics', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['rawiron', ['Metallurgie', 'Metallurgy']],
  ['iron', ['Metallurgie', 'Metallurgy']],
  ['steel', ['Metallurgie', 'Metallurgy']],
  ['rawbauxite', ['Metallurgie', 'Metallurgy']],
  ['bauxite', ['Metallurgie', 'Metallurgy']],
  ['alumina', ['Metallurgie', 'Metallurgy']],
  ['aluminium', ['Metallurgie', 'Metallurgy']],
]);

export class SaveFolderValidationError extends Error {
  constructor(missing) {
    super(`Missing required save files: ${missing.join(', ')}`);
    this.name = 'SaveFolderValidationError';
    this.missing = [...missing];
  }
}

function emit(onProgress, phase, detail = {}) {
  onProgress?.({ phase, localOnly: true, ...detail });
}

function workshopProductionBuilding(raw, resources) {
  const pseudo = new Set(['vehicles', 'trains']);
  const productionKeys = Object.keys(raw.production ?? {}).filter(key => !pseudo.has(key));
  const consumptionKeys = Object.keys(raw.consumption ?? {})
    .filter(key => !pseudo.has(key) && key !== 'eletric');
  if ((!productionKeys.length && !consumptionKeys.length)
    || raw.types?.includes('TYPE_FARM')) return null;
  const resource = key => resources.find(item => item.key === key);
  const heatOnly = productionKeys.length === 1 && productionKeys[0] === 'heat';
  const lines = (keys, values, isProduction) => keys.map(key => {
    const item = resource(key);
    if (!item) return null;
    const base = values[key] ?? 0;
    const rate = isProduction && heatOnly ? base : base * (raw.workers || 1);
    return { de: item.de, en: item.en, rate };
  }).filter(Boolean);
  const mainKey = productionKeys[0] ?? consumptionKeys[0];
  const group = WORKSHOP_PRODUCTION_GROUPS.get(mainKey)
    ?? ['Fortschrittliche Industrie', 'Advanced industry'];
  const materials = raw.constructionResources ?? {};
  return {
    gameId: raw.id,
    de: raw.nameStr || raw.de || raw.id,
    en: raw.nameStr || raw.en || raw.de || raw.id,
    group: { de: group[0], en: group[1] },
    workers: raw.workers ?? 0,
    production: lines(productionKeys, raw.production, true),
    consumption: lines(consumptionKeys, raw.consumption, false),
    usesQuality: raw.types?.some(type => type.startsWith('TYPE_MINE_')) ?? false,
    power: 0,
    maxKW: 0,
    water: 0,
    hotwater: 0,
    wastePerWorker: 0,
    workdays: materials.workers ?? 0,
    gravel: materials.gravel ?? 0,
    bricks: materials.bricks ?? 0,
    steel: materials.steel ?? 0,
    concrete: materials.concrete ?? 0,
    asphalt: materials.asphalt ?? 0,
    boards: materials.boards ?? 0,
    panels: materials.prefabpanels ?? 0,
    ecomponents: materials.ecomponents ?? 0,
    mcomponents: materials.mcomponents ?? 0,
    provenance: {
      workers: 'workshop-ini',
      production: 'workshop-ini',
      consumption: 'workshop-ini',
    },
  };
}

export async function orchestrateWorkshopCatalog(buildings, vehicles = [], {
  workshopIndex = null,
  localWorkshopBuildings = [],
  resources = [],
  fetchCatalog = async () => null,
} = {}) {
  const ids = [...new Set([
    ...buildings.map(building => /^(\d{6,20})\//.exec(building.type)?.[1]),
    ...vehicles.map(vehicle => /^(\d{6,20})\//.exec(vehicle.model)?.[1]),
  ].filter(Boolean))];
  const catalog = readWorkshopIndex(workshopIndex);
  const available = ids.filter(id => catalog.has(id));
  const loaded = await Promise.all(available.map(async id => {
    try {
      return await fetchCatalog(catalog.pathFor(id), id);
    } catch {
      return null;
    }
  }));
  const combined = new Map();
  for (const building of loaded.flatMap(item => item?.buildings ?? [])) {
    combined.set(building.id, building);
  }
  for (const building of localWorkshopBuildings) combined.set(building.id, building);
  const workshopBuildings = [...combined.values()];
  const workshopVehicles = loaded.flatMap(item => item?.vehicles ?? []);
  const workshopProduction = workshopBuildings
    .map(building => workshopProductionBuilding(building, resources))
    .filter(Boolean);
  const resolvedIds = new Set([
    ...workshopBuildings.map(building => building.workshopId),
    ...workshopVehicles.map(vehicle => vehicle.workshopId),
  ].filter(Boolean).map(String));
  return {
    workshopBuildings,
    workshopVehicles,
    workshopProduction,
    catalog: {
      referenced: ids.length,
      resolved: ids.filter(id => resolvedIds.has(String(id))).length,
      buildingDefinitions: workshopBuildings.length,
      vehicleDefinitions: workshopVehicles.length,
      localDefinitions: localWorkshopBuildings.length,
    },
  };
}

export function parseSaveInWorker(payload, {
  WorkerClass = globalThis.Worker,
  workerUrl = new URL('../savegame_worker.js?v=39', import.meta.url),
  onProgress,
} = {}) {
  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerUrl, { type: 'module' });
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'Save parser worker failed'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        emit(onProgress, 'worker-progress', {
          file: data.file,
          done: data.done,
          total: data.total,
        });
      } else if (data.type === 'error' && data.required) {
        worker.terminate();
        reject(new Error(`${data.file}: ${data.message}`));
      } else if (data.type === 'complete') {
        worker.terminate();
        resolve(data.parsed);
      }
    };
    const transfer = Object.values(payload).filter(value => value instanceof ArrayBuffer);
    worker.postMessage(payload, transfer);
  });
}

export function parseMapLayersInWorker(files, {
  WorkerClass = globalThis.Worker,
  workerUrl = new URL('../savegame_map_worker.js?v=15', import.meta.url),
  onProgress,
  // Sea level comes from the buildings' own saved heights, which the map files
  // alone cannot supply.
  buildingHeights = null,
} = {}) {
  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerUrl, { type: 'module' });
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'Map parser worker failed'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        emit(onProgress, 'map-progress', {
          stage: data.phase,
          file: data.file,
        });
      } else if (data.type === 'complete') {
        worker.terminate();
        resolve(data);
      }
    };
    worker.postMessage(buildingHeights ? { ...files, buildingHeights } : files);
  });
}

export async function importSaveFolder(fileList, {
  parseCore = (payload, options) => parseSaveInWorker(payload, options),
  resolveWorkshop = orchestrateWorkshopCatalog,
  rawBuildings = [],
  productionBuildings = [],
  combineProductionBuildings = workshopProduction =>
    [...productionBuildings, ...workshopProduction],
  rawVehicles = [],
  workshopIndex = null,
  localWorkshopBuildings = [],
  resources = [],
  fetchCatalog,
  resolveFleet = resolveVehicleModels,
  translate,
  observedAt = new Date().toISOString(),
  onProgress,
} = {}) {
  const files = [...fileList];
  const byName = new Map(files.map(file => [file.name.toLowerCase(), file]));
  const missing = REQUIRED_FILES.filter(name => !byName.has(name));
  if (missing.length) throw new SaveFolderValidationError(missing);

  emit(onProgress, 'reading-files');
  const payloadEntries = await Promise.all(Object.entries(CORE_BINARY_FILES).map(
    async ([key, name]) => [key, byName.has(name) ? await byName.get(name).arrayBuffer() : null],
  ));
  const material = byName.get('material.mtl');
  const payload = {
    ...Object.fromEntries(payloadEntries),
    road: null,
    rail: null,
    pedestrian: null,
    heightmap: null,
    pollution: null,
    material: material ? await material.text() : '',
  };
  emit(onProgress, 'parsing-core');
  const parsed = await parseCore(payload, { onProgress });
  const namepoints = byName.get('namepoints.bin');
  const buildingsFile = byName.get('buildings_game.bin');
  const relative = namepoints.webkitRelativePath || buildingsFile.webkitRelativePath || '';
  const sourceName = parsed.header?.title || relative.split('/')[0]
    || namepoints.name.replace(/\.bin$/i, '') || 'W&R save';
  const statsRecords = parsed.statsRecords ?? [];
  const activeLoans = parsed.activeLoans ?? [];
  const productivity = latestProductivity(statsRecords, 1);

  emit(onProgress, 'resolving-workshop');
  const workshop = await resolveWorkshop(parsed.buildings, parsed.vehicles ?? [], {
    workshopIndex,
    localWorkshopBuildings,
    resources,
    fetchCatalog,
  });
  const ownedFleet = parsed.vehicles
    ? resolveFleet(parsed.vehicles, {
      game: rawVehicles,
      workshop: workshop.workshopVehicles,
    }) : null;
  const usedMarket = parsed.usedVehicleOffers
    ? resolveFleet(parsed.usedVehicleOffers, {
      game: rawVehicles,
      workshop: workshop.workshopVehicles,
    }) : null;

  emit(onProgress, 'building-projection');
  const planning = buildImportedPlanning(
    sourceName,
    parsed.settlements,
    parsed.buildings,
    parsed.membershipAudit,
    {
      citizens: parsed.citizens,
      citizenFileSummary: parsed.citizenFileSummary,
      vehicles: ownedFleet?.records ?? null,
      vehicleFileSummary: parsed.vehicleFileSummary,
      vehicleLines: parsed.vehicleLines,
      lineFileSummary: parsed.lineFileSummary,
      vehicleModelCoverage: ownedFleet?.summary ?? null,
      usedVehicleOffers: usedMarket?.records ?? null,
      usedVehicleFileSummary: parsed.usedVehicleFileSummary,
      usedVehicleModelCoverage: usedMarket?.summary ?? null,
      header: parsed.header,
      research: parsed.research,
      events: parsed.events,
      sourceStatus: parsed.sourceStatus,
      parserWarnings: parsed.warnings,
      defaultProductivity: productivity,
      workshopCatalog: workshop.catalog,
      cityStats: parsed.cityStats ?? [],
      mapClimate: parsed.mapClimate,
      roadNetwork: parsed.roadNetwork,
      railNetwork: parsed.railNetwork,
      terrainWater: parsed.terrainWater,
      rawBuildings,
      workshopBuildings: workshop.workshopBuildings,
      productionBuildings: combineProductionBuildings(workshop.workshopProduction),
      importedAt: observedAt,
      translate,
    },
  );
  planning.metadata.statsRecordCount = statsRecords.length;
  planning.metadata.latestProductivity = productivity;
  planning.metadata.blueprintOwned = parsed.blueprintOwned;
  const model = projectSaveToRepublicModel(parsed, { sourceName, observedAt });
  const deferredMapFiles = Object.fromEntries(
    Object.entries(DEFERRED_MAP_FILES).map(([key, name]) => [key, byName.get(name) ?? null]),
  );
  emit(onProgress, 'complete');
  return {
    sourceName,
    parsed,
    planning,
    model,
    statsRecords,
    activeLoans,
    productivity,
    statsFile: byName.get('stats.ini') ?? null,
    deferredMapFiles,
    workshop,
  };
}
