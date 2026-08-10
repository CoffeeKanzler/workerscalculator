import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SaveFolderValidationError,
  importSaveFolder,
  orchestrateWorkshopCatalog,
} from '../js/adapters/save_folder_adapter.js';
import {
  buildImportedPlanning,
  buildOperationalServices,
  projectSaveToRepublicModel,
} from '../js/adapters/save_projection.js';

function localFile(name, contents = name, relativePath = `Kohleburg/${name}`) {
  const bytes = new TextEncoder().encode(contents);
  const reads = { arrayBuffer: 0, text: 0 };
  return {
    name,
    size: bytes.byteLength,
    webkitRelativePath: relativePath,
    reads,
    async arrayBuffer() {
      reads.arrayBuffer += 1;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async text() {
      reads.text += 1;
      return contents;
    },
  };
}

function parsedSave(overrides = {}) {
  return {
    settlements: [{ id: 7, name: 'Kohleburg', x: 10, y: 2, z: 30 }],
    buildings: [{
      index: 41, type: 'hospital', name: 'Central clinic', scopeId: 7,
      currentWorkers: 8, configuredWorkers: 10, configuredWorkersHighEducation: 3,
      constructionProgress: 1, currentVisitors: 4, effectiveServiceCapacity: 20,
      storages: [],
    }],
    citizens: [{
      index: 0, id: 501, residenceBuildingIndex: 41, education: 2, age: 32,
      happiness: 0.8, food: 0.9, health: 0.75, loyalty: 0.6, criminality: 0.1,
    }],
    citizenFileSummary: { recordCount: 1, byteLength: 1820, trailingBytes: 0 },
    header: {
      title: 'Kohleburg Republic', savePath: 'media_soviet/save/kohleburg',
      settings: { seasonsEnabled: true },
    },
    research: [{ key: 'vaccine_development', progress: 0.5, buildingIndex: 41, flags: 3 }],
    events: [{
      index: 0, eventType: 1, state: 0,
      location: { objectKind: 0, objectIndex: 41 },
      subject: { objectKind: 2, objectIndex: 501 }, assignments: [],
    }],
    vehicles: [{ id: 90, index: 0, model: 'bus', cargo: [] }],
    vehicleFileSummary: { recordCount: 1, byteLength: 2048, trailingBytes: 0 },
    usedVehicleOffers: null,
    usedVehicleFileSummary: null,
    vehicleLines: null,
    lineFileSummary: null,
    statsRecords: [{ index: 0, year: 1984, day: 123, current: true, averageProductivity: 0.82 }],
    activeLoans: [{ currency: 'RUB', currentAmount: 100000 }],
    cityStats: [],
    blueprintOwned: ['bus'],
    membershipAudit: {
      duplicateMembers: [], invalidMemberRefs: [], fallbackAssignments: 0, unassigned: 0,
    },
    sourceStatus: {
      namepoints: 'exact', buildings: 'exact', workers: 'exact', vehicles: 'exact',
      usedVehicles: 'missing', lines: 'missing', header: 'exact', research: 'exact',
      events: 'exact', stats: 'exact', material: 'missing',
    },
    warnings: [],
    mapClimate: null,
    roadNetwork: null,
    railNetwork: null,
    terrainWater: null,
    ...overrides,
  };
}

const rawHospital = {
  id: 'hospital',
  de: 'Krankenhaus',
  en: 'Hospital',
  nameStr: 'Central clinic',
  types: ['TYPE_HOSPITAL'],
  workers: 20,
  citizenAbleServe: 2,
  qualityOfLiving: 0,
  livingSpace: 0,
  production: {},
  consumption: {},
  constructionResources: {},
};

test('save folder rejects missing required files before reading any local file', async () => {
  const buildings = localFile('buildings_game.bin');

  await assert.rejects(
    importSaveFolder([buildings], { parseCore: async () => parsedSave() }),
    error => {
      assert.ok(error instanceof SaveFolderValidationError);
      assert.deepEqual(error.missing, ['namepoints.bin']);
      return true;
    },
  );
  assert.deepEqual(buildings.reads, { arrayBuffer: 0, text: 0 });
});

test('save folder reads required and optional core files locally and defers map files', async () => {
  const files = [
    localFile('NAMEPOINTS.BIN'),
    localFile('buildings_game.bin'),
    localFile('workers.bin'),
    localFile('stats.ini', '$STAT_CURRENT\n$DATE_YEAR 1984\n$DATE_DAY 123'),
    localFile('material.mtl', '$TEXTURE tiles_normal/grass2.dds'),
    localFile('road.bin'),
  ];
  const progress = [];
  let payload;
  let networkCalls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('save import must not upload files');
  };

  try {
    const result = await importSaveFolder(files, {
      parseCore: async value => {
        payload = value;
        return parsedSave({
          citizens: [
            { index: 0, id: 501, residenceBuildingIndex: 41, education: 2, age: 32,
              happiness: 0.8, food: 0.9, health: 0.75, loyalty: 0.6, criminality: 0.1 },
            { index: 1, id: 502, residenceBuildingIndex: 41, education: 1, age: 20,
              happiness: 0.7, food: 0.9, health: 0.8, loyalty: 0.5, criminality: 0.02 },
          ],
        });
      },
      resolveWorkshop: async () => ({
        catalog: { referenced: 0, resolved: 0 },
        workshopBuildings: [],
        workshopVehicles: [],
        workshopProduction: [],
      }),
      rawBuildings: [rawHospital],
      productionBuildings: [],
      rawVehicles: [],
      onProgress: event => progress.push(event),
      observedAt: '2026-07-27T12:30:00.000Z',
    });

    assert.ok(payload.namepoints instanceof ArrayBuffer);
    assert.ok(payload.buildings instanceof ArrayBuffer);
    assert.ok(payload.workers instanceof ArrayBuffer);
    assert.ok(payload.stats instanceof ArrayBuffer);
    assert.equal(payload.material, '$TEXTURE tiles_normal/grass2.dds');
    assert.equal(payload.road, null);
    assert.equal(result.deferredMapFiles.road.name, 'road.bin');
    assert.equal(files.at(-1).reads.arrayBuffer, 0);
    assert.equal(networkCalls, 0);
    assert.deepEqual(progress.map(event => event.phase), [
      'reading-files', 'parsing-core', 'resolving-workshop',
      'building-projection', 'complete',
    ]);
    assert.ok(progress.every(event => event.localOnly === true));
    assert.equal(result.sourceName, 'Kohleburg Republic');
  assert.equal(result.statsRecords.length, 1);
  assert.deepEqual(result.activeLoans, [{ currency: 'RUB', currentAmount: 100000 }]);
    assert.equal(result.productivity, 0.82);
    assert.equal(result.planning.metadata.operationalServices.regional[0].clinics.currentWorkers, 8);
    assert.equal(result.planning.metadata.residenceDetails.buildings[0].buildingIndex, 41);
    assert.equal(result.planning.metadata.residenceDetails.buildings[0].residents, 2);
    assert.equal(result.planning.metadata.citizenDiagnostics.areas[0].approachingAdulthood, 1);
    assert.equal(result.planning.metadata.citizenDiagnostics.areas[0].adultSpaceBalance, null);
    assert.equal(result.planning.metadata.citizenDiagnostics.areas[0]
      .occupiedUnknownCapacityResidences, 1);
    assert.equal('citizens' in result.planning.metadata, false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Workshop orchestration resolves referenced packages and overlays local definitions', async () => {
  const fetched = [];
  const result = await orchestrateWorkshopCatalog(
    [{ type: '123456789/hospital' }],
    [{ model: '123456789/bus' }],
    {
      workshopIndex: { items: { 123456789: { path: '123456789.json' } } },
      localWorkshopBuildings: [{
        id: '123456789/hospital', workshopId: '123456789', nameStr: 'Local clinic',
        types: ['TYPE_HOSPITAL'], workers: 10, production: {}, consumption: {},
      }],
      resources: [],
      fetchCatalog: async path => {
        fetched.push(path);
        return {
          buildings: [{
            id: '123456789/hospital', workshopId: '123456789', nameStr: 'Catalog clinic',
            types: ['TYPE_HOSPITAL'], workers: 8, production: {}, consumption: {},
          }],
          vehicles: [{ id: '123456789/bus', workshopId: '123456789' }],
        };
      },
    },
  );

  assert.deepEqual(fetched, ['123456789.json']);
  assert.equal(result.workshopBuildings[0].nameStr, 'Local clinic');
  assert.equal(result.workshopVehicles.length, 1);
  assert.deepEqual(result.catalog, {
    referenced: 1,
    resolved: 1,
    buildingDefinitions: 1,
    vehicleDefinitions: 1,
    localDefinitions: 1,
  });
});

test('save projection emits a normalized Republic model with stable IDs and file evidence', () => {
  const model = projectSaveToRepublicModel(parsedSave(), {
    sourceName: 'Kohleburg Republic',
    observedAt: '2026-07-27T12:30:00.000Z',
  });

  assert.equal(model.schemaVersion, 1);
  assert.deepEqual(model.identity, {
    id: 'save:media_soviet/save/kohleburg',
    name: 'Kohleburg Republic',
  });
  assert.deepEqual(model.gameDate, { year: 1984, day: 123 });
  assert.equal(model.republic.population.value, 1);
  assert.equal(model.republic.population.evidence.capability, 'save.workers');
  assert.equal(model.areas.items[0].id, 7);
  assert.equal(model.buildings.items[0].id, 41);
  // 501 is the save's reusable citizen code, not an identity: the record index is.
  assert.equal(model.citizens.items[0].id, 0);
  assert.equal(model.transport.items[0].id, 90);
  assert.equal(model.research.items[0].id, 'vaccine_development');
  assert.equal(model.events.items[0].id, 0);
  assert.equal(model.transport.completeness, 'complete');
  assert.equal(model.resources.completeness, 'partial');
  assert.ok(Object.isFrozen(model));
});

test('optional save sources become unavailable evidence without inventing records', () => {
  const model = projectSaveToRepublicModel(parsedSave({
    citizens: null,
    vehicles: null,
    research: null,
    events: null,
    statsRecords: [],
    sourceStatus: {
      namepoints: 'exact', buildings: 'exact', workers: 'missing',
      vehicles: 'missing', research: 'missing', events: 'missing', stats: 'missing',
    },
  }), {
    sourceName: 'Kohleburg',
    observedAt: '2026-07-27T12:30:00.000Z',
  });

  assert.equal(model.republic.population.value, null);
  assert.equal(model.republic.population.evidence.completeness, 'unavailable');
  assert.equal(model.citizens.completeness, 'unavailable');
  assert.equal(model.transport.completeness, 'unavailable');
  assert.equal(model.research.completeness, 'unavailable');
  assert.equal(model.events.completeness, 'unavailable');
  assert.deepEqual(model.citizens.items, []);
});

test('imported planning retains operational service staffing and observed city rows', () => {
  const parsed = parsedSave();
  const operations = buildOperationalServices(
    parsed.buildings, parsed.citizens, [rawHospital], [], parsed.events,
  );
  const planning = buildImportedPlanning(
    'Kohleburg Republic',
    parsed.settlements,
    parsed.buildings,
    parsed.membershipAudit,
    {
      ...parsed,
      rawBuildings: [rawHospital],
      productionBuildings: [],
      importedAt: '2026-07-27T12:30:00.000Z',
      translate: key => ({ city: 'City', area: 'Area' })[key] ?? key,
    },
  );

  assert.equal(operations.regional[0].clinics.currentWorkers, 8);
  assert.equal(operations.republic.liveQueue.medicalEmergencies, 1);
  assert.equal(planning.cities[0].name, 'Kohleburg');
  assert.equal(planning.cities[0].rows[0].importedBuilding.workers, 10);
  assert.equal(planning.metadata.operationalServices.regional[0].clinics.configuredCapacity, 26);
});

// Institutions staff themselves largely from the high-education slider, so counting
// only the basic one reports a court or police station as holding more workers than
// it employs - a real save shows a secret police post staffed 8 against a capacity
// of 0. Nominal staffing already comes from the catalog total, so the configured
// side has to be the total too or the two are not comparable.
test('configured staffing counts basic and high-education workers as one establishment', () => {
  const parsed = parsedSave();

  const operations = buildOperationalServices(
    parsed.buildings, parsed.citizens, [rawHospital], [], parsed.events,
  );

  const clinics = operations.regional[0].clinics;
  assert.equal(clinics.configuredWorkers, 13);
  assert.ok(clinics.currentWorkers <= clinics.configuredWorkers,
    'observed staff must never exceed the configured establishment');
});

// The transport model reads vehicle routes off the imported fleet, and the fleet
// lives under `ownedVehicles` — not `vehicles`. Reading the wrong key found no
// transport at all and said so in a way that looked like the save had none, so
// the name and the route field are both pinned here.
test('the imported fleet keeps its saved routes under the key the app reads', () => {
  const parsed = parsedSave();
  const planning = buildImportedPlanning(
    'Kohleburg Republic',
    parsed.settlements,
    parsed.buildings,
    parsed.membershipAudit,
    {
      ...parsed,
      vehicles: [{
        id: 12, model: 'peckett', modelFacts: null,
        routeTargetBuildingIndices: [41, 42],
      }],
      rawBuildings: [rawHospital],
      productionBuildings: [],
      importedAt: '2026-07-27T12:30:00.000Z',
      translate: key => key,
    },
  );

  const fleet = planning.metadata.ownedVehicles;
  assert.ok(Array.isArray(fleet), 'the fleet is stored as ownedVehicles');
  assert.equal(planning.metadata.vehicles, undefined,
    'nothing else on the import is called vehicles');
  assert.deepEqual(fleet[0].routeTargetBuildingIndices, [41, 42],
    'the saved route survives the projection');
});
