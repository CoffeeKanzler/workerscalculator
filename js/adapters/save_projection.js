import { CABLES } from '../calc.js?v=20';
import {
  aggregateCitizensByScope,
  compactObservedBuildings,
  groupObservedProduction,
  inferObservedHousing,
  isNonPlannerSupportType,
  matchObservedBuilding,
  summarizeCriminalityOutliers,
  summarizeCitizenDiagnostics,
  summarizeDistributionOffices,
  summarizeResidenceDetails,
  summarizeResidenceOccupancy,
  summarizeVehicleLines,
} from '../save_model.js?v=20';
import {
  createEvidence,
  createEvidenceCollection,
  createEvidenceValue,
  createRepublicModel,
} from '../models/republic_model.js';

const IMPORTED_CITY_TYPES = new Map([
  ['TYPE_LIVING', ['Wohngebäude', 'Housing']],
  ['TYPE_SHOP', ['Einkaufzentrum', 'Shopping center']],
  ['TYPE_KINDERGARTEN', ['Kindergarten', 'Kindergarten']],
  ['TYPE_SCHOOL', ['Schule', 'School']],
  ['TYPE_UNIVERSITY', ['Universität', 'University']],
  ['TYPE_HOSPITAL', ['Krankenhaus', 'Hospital']],
  ['TYPE_COURT_HOUSE', ['Gerichtsgebäude', 'Courthouse']],
  ['TYPE_POLICE_STATION', ['Polizei', 'Police']],
  ['TYPE_ATTRACTION', ['Attraktionen', 'Attractions']],
  ['TYPE_KINO', ['Kultur', 'Culture']],
  ['TYPE_SPORT', ['Sport', 'Sport']],
  ['TYPE_PUB', ['Alkohol', 'Alcohol']],
  ['TYPE_FIRESTATION', ['Feuerwehr', 'Fire station']],
  ['TYPE_CITYHALL', ['Rathaus', 'City hall']],
  ['TYPE_PRISON', ['Gefängnis', 'Prison']],
  ['TYPE_ORPHANAGE', ['Waisenhaus', 'Orphanage']],
  ['TYPE_CHURCH', ['Religion', 'Religion']],
  ['TYPE_BROADCAST', ['Rundfunk', 'Broadcasting']],
]);

const OPERATIONAL_TYPES = new Map([
  ['TYPE_HOSPITAL', 'clinics'],
  ['TYPE_POLICE_STATION', 'police'],
  ['TYPE_COURT_HOUSE', 'courts'],
  ['TYPE_PRISON', 'prisons'],
  ['TYPE_ORPHANAGE', 'orphanages'],
]);

// Bump whenever the shape of the stored import changes in a way an already
// saved snapshot cannot satisfy. A snapshot from before roads were walkable
// carries no road attachments and no walking edge refs, and silently showing an
// empty access graph for it reads as a broken build rather than as old data.
export const SAVE_IMPORT_VERSION = 7;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function defaultCity() {
  return {
    name: 'Nowa Huta',
    productivity: 0.7,
    cable: CABLES[2].de,
    exchanger: 'small',
    waterDivisor: 3,
    rows: [],
    assignedChain: null,
  };
}

// A save writes DLC buildings with an underscore prefix — "DLC3_beer_stand" —
// while the game ships them in a directory per expansion, which is how the
// extracted dataset keys them: "dlc3/beer_stand". Only CWC_ was translated, so
// the dlc1, dlc2 and dlc3 definitions we already hold could never be reached.
// MIRRORZ_ is the game's own mirror-placement prefix, not a mod, and is
// stripped first so a mirrored building resolves to the same definition.
const DLC_PREFIXES = ['CWC', 'DLC1', 'DLC2', 'DLC3'];

function saveTypeCandidates(type) {
  const clean = type.replace(/^MIRRORZ_/, '');
  const candidates = [type, clean];
  for (const prefix of DLC_PREFIXES) {
    if (clean.startsWith(`${prefix}_`)) {
      candidates.push(`${prefix.toLowerCase()}/${clean.slice(prefix.length + 1)}`);
      break;
    }
  }
  const aliases = {
    concrete_plant_v2: 'concrete_plant',
    brick_factory_v2: 'brick_factory',
    oil_rafinery_v2: 'oil_rafinery',
  };
  if (aliases[clean]) candidates.push(aliases[clean]);
  return [...new Set(candidates.map(value => value.toLowerCase()))];
}

export function matchSaveBuilding(type, entries, idOf) {
  const candidates = saveTypeCandidates(type);
  const exact = new Map(entries.map(entry => [String(idOf(entry) ?? '').toLowerCase(), entry]));
  for (const candidate of candidates) if (exact.has(candidate)) return exact.get(candidate);

  if (/^\d{6,20}\//.test(candidates.at(-1))) return null;
  const basename = candidates.at(-1).split('/').at(-1);
  const matches = entries.filter(entry =>
    String(idOf(entry) ?? '').toLowerCase().split('/').at(-1) === basename);
  return matches.length === 1 ? matches[0] : null;
}

function importedCityBuilding(raw, sourceType) {
  const mappedType = raw.types.map(type => IMPORTED_CITY_TYPES.get(type)).find(Boolean);
  if (!mappedType) return null;
  const capacity = (raw.workers ?? 0) * (raw.citizenAbleServe ?? 0);
  const specialTypes = new Set(['Gerichtsgebäude', 'Polizei']);
  const materials = raw.constructionResources ?? {};
  return {
    de: raw.de || raw.nameStr || sourceType,
    en: raw.en || raw.nameStr || raw.de || sourceType,
    type: { de: mappedType[0], en: mappedType[1] },
    kind: 'Save',
    gameId: raw.id,
    sourceType,
    quality: raw.qualityOfLiving ?? null,
    workers: raw.workers ?? 0,
    special: specialTypes.has(mappedType[0]) ? capacity : 0,
    visitors: specialTypes.has(mappedType[0]) ? 0 : capacity,
    inhabitants: raw.livingSpace ?? 0,
    citizenAbleServe: raw.citizenAbleServe ?? 0,
    power: 0,
    maxKW: 0,
    water: 0,
    hotwater: 0,
    waste: 0,
    workdays: 0,
    gravel: materials.gravel ?? 0,
    bricks: materials.bricks ?? 0,
    steel: materials.steel ?? 0,
    concrete: materials.concrete ?? 0,
    asphalt: materials.asphalt ?? 0,
    boards: materials.boards ?? 0,
    panels: materials.prefabpanels ?? 0,
    ecomponents: materials.ecomponents ?? 0,
    mcomponents: materials.mcomponents ?? 0,
    recommendedFor: 0,
  };
}

function emptyFacilitySummary() {
  return {
    buildingCount: 0,
    currentWorkers: 0,
    configuredWorkers: 0,
    nominalWorkers: 0,
    configuredCapacity: 0,
    nominalCapacity: 0,
    occupants: 0,
    currentVisitors: 0,
    effectiveServiceCapacity: 0,
    assignedEvents: 0,
    underConstructionCount: 0,
  };
}

// The save splits a building's establishment across a basic and a high-education
// slider. The catalog's nominal worker count is the combined total, so configured
// staffing only compares against it when both sliders are counted.
function configuredEstablishment(record) {
  return (record.configuredWorkers ?? 0) + (record.configuredWorkersHighEducation ?? 0);
}

function addFacility(summary, record, raw, occupants, assignedEvents = 0) {
  const serve = raw?.citizenAbleServe ?? 0;
  const configured = configuredEstablishment(record);
  summary.buildingCount += 1;
  summary.currentWorkers += record.currentWorkers ?? 0;
  summary.configuredWorkers += configured;
  summary.nominalWorkers += raw?.workers ?? 0;
  summary.configuredCapacity += configured * serve;
  summary.nominalCapacity += (raw?.workers ?? 0) * serve;
  summary.occupants += occupants ?? 0;
  summary.currentVisitors += record.currentVisitors ?? 0;
  summary.effectiveServiceCapacity += record.effectiveServiceCapacity ?? 0;
  summary.assignedEvents += assignedEvents;
}

export function buildOperationalServices(buildings, citizens, rawBuildings, cityStats, events) {
  const residentsByBuilding = new Map();
  for (const citizen of citizens ?? []) {
    const index = citizen.residenceBuildingIndex;
    if (index >= 0) residentsByBuilding.set(index, (residentsByBuilding.get(index) ?? 0) + 1);
  }
  const buildingsByIndex = new Map(buildings.map(building => [building.index, building]));
  const assignedEventsByBuilding = new Map();
  const eventCourtBuildings = new Set();
  const eventPoliceBuildings = new Set();
  const liveByScope = new Map();
  const liveQueue = events ? {
    available: true,
    total: events.length,
    medicalEmergencies: 0,
    crimes: 0,
    awaitingPolice: 0,
    underInvestigation: 0,
    atCourt: 0,
    mild: 0,
    medium: 0,
    serious: 0,
  } : { available: false };
  const scopeLive = scopeId => {
    const current = liveByScope.get(scopeId) ?? {
      medicalEmergencies: 0,
      crimes: 0,
      awaitingPolice: 0,
      underInvestigation: 0,
      atCourt: 0,
      mild: 0,
      medium: 0,
      serious: 0,
    };
    liveByScope.set(scopeId, current);
    return current;
  };
  for (const event of events ?? []) {
    const location = event.location.objectKind === 0
      ? buildingsByIndex.get(event.location.objectIndex) : null;
    const scope = Number.isInteger(location?.scopeId) ? scopeLive(location.scopeId) : null;
    if (event.eventType === 1) {
      liveQueue.medicalEmergencies += 1;
      if (scope) scope.medicalEmergencies += 1;
      continue;
    }
    if (event.eventType < 3 || event.eventType > 5) continue;
    liveQueue.crimes += 1;
    if (scope) scope.crimes += 1;
    const severity = event.eventType === 3 ? 'mild' : event.eventType === 4 ? 'medium' : 'serious';
    liveQueue[severity] += 1;
    if (scope) scope[severity] += 1;
    const stage = event.state === 0 ? 'awaitingPolice'
      : event.state === 2 ? 'underInvestigation'
        : event.state === 3 ? 'atCourt' : null;
    if (stage) {
      liveQueue[stage] += 1;
      if (scope) scope[stage] += 1;
    }
    for (const assignment of event.assignments) {
      if (assignment.objectKind !== 0) continue;
      assignedEventsByBuilding.set(
        assignment.objectIndex,
        (assignedEventsByBuilding.get(assignment.objectIndex) ?? 0) + 1,
      );
      if (event.state === 2) eventPoliceBuildings.add(assignment.objectIndex);
      if (event.state === 3) eventCourtBuildings.add(assignment.objectIndex);
    }
  }
  const crimeByScope = new Map((cityStats ?? []).map(record => [record.scopeId, record]));
  const regional = new Map();
  const republic = {
    courts: emptyFacilitySummary(),
    prisons: emptyFacilitySummary(),
    orphanages: emptyFacilitySummary(),
    crime: {
      recordedCrimes: 0,
      unresolvedCrimes: 0,
      withoutPolice: 0,
      notInvestigated: 0,
      withoutCourt: 0,
      prisonersEscaped: 0,
    },
  };
  for (const record of buildings) {
    const raw = matchSaveBuilding(record.type, rawBuildings, entry => entry.id);
    const key = raw?.types?.map(type => OPERATIONAL_TYPES.get(type)).find(Boolean)
      ?? (eventPoliceBuildings.has(record.index) ? 'police' : null)
      ?? (eventCourtBuildings.has(record.index) ? 'courts' : null);
    if (!key) continue;
    if (key === 'clinics' || key === 'police') {
      if (!Number.isInteger(record.scopeId)) continue;
      const scope = regional.get(record.scopeId) ?? {
        scopeId: record.scopeId,
        clinics: emptyFacilitySummary(),
        police: emptyFacilitySummary(),
      };
      if ((record.constructionProgress ?? 1) < 1) scope[key].underConstructionCount += 1;
      else {
        addFacility(
          scope[key],
          record,
          raw,
          residentsByBuilding.get(record.index),
          assignedEventsByBuilding.get(record.index),
        );
      }
      regional.set(record.scopeId, scope);
    } else if ((record.constructionProgress ?? 1) < 1) {
      republic[key].underConstructionCount += 1;
    } else {
      addFacility(
        republic[key],
        record,
        raw,
        residentsByBuilding.get(record.index),
        assignedEventsByBuilding.get(record.index),
      );
    }
  }
  for (const crime of crimeByScope.values()) {
    for (const key of Object.keys(republic.crime)) republic.crime[key] += crime[key] ?? 0;
    if (!regional.has(crime.scopeId)) {
      regional.set(crime.scopeId, {
        scopeId: crime.scopeId,
        clinics: emptyFacilitySummary(),
        police: emptyFacilitySummary(),
      });
    }
  }
  for (const scopeId of liveByScope.keys()) {
    if (!regional.has(scopeId)) {
      regional.set(scopeId, {
        scopeId,
        clinics: emptyFacilitySummary(),
        police: emptyFacilitySummary(),
      });
    }
  }
  return {
    regional: [...regional.values()].map(scope => ({
      ...scope,
      crime: crimeByScope.get(scope.scopeId) ?? null,
      live: events ? liveByScope.get(scope.scopeId) ?? scopeLive(scope.scopeId) : null,
    })),
    republic: { ...republic, liveQueue },
  };
}

export function buildImportedPlanning(sourceName, settlements, buildings, membershipAudit, {
  citizens = null,
  citizenFileSummary = null,
  header = null,
  research = null,
  vehicles = null,
  vehicleFileSummary = null,
  vehicleLines = null,
  lineFileSummary = null,
  usedVehicleOffers = null,
  usedVehicleFileSummary = null,
  vehicleModelCoverage = null,
  usedVehicleModelCoverage = null,
  sourceStatus = {},
  parserWarnings = [],
  defaultProductivity = 1,
  workshopCatalog = null,
  cityStats = [],
  mapClimate = null,
  events = null,
  roadNetwork = null,
  railNetwork = null,
  terrainWater = null,
  rawBuildings = [],
  workshopBuildings = [],
  productionBuildings = [],
  importedAt = new Date().toISOString(),
  translate = key => key,
} = {}) {
  const occupiedScopeIds = new Set(
    buildings.map(building => building.scopeId).filter(Number.isInteger),
  );
  const occupiedSettlements = settlements.filter(settlement => occupiedScopeIds.has(settlement.id));
  const cityRows = new Map(occupiedSettlements.map(settlement => [settlement.id, new Map()]));
  const citizenResult = citizens ? aggregateCitizensByScope(citizens, buildings) : null;
  const citizenScopes = citizenResult?.scopes ?? new Map();
  const allRawBuildings = [...rawBuildings, ...workshopBuildings];
  const inferredHousing = citizens ? inferObservedHousing(citizens, buildings, building => {
    const raw = matchSaveBuilding(building.type, allRawBuildings, entry => entry.id);
    return !!(raw && importedCityBuilding(raw, building.type)?.inhabitants > 0);
  }) : [];
  const inferredHousingIndices = new Set(inferredHousing.flatMap(group => group.buildingIndices));
  const productionGrouped = groupObservedProduction(
    buildings.filter(record => record.type !== 'temp'),
    productionBuildings,
    allRawBuildings,
  );
  const productionRows = productionGrouped.rows.map(row => ({
    ...row,
    productivity: citizenScopes.get(row.scopeId)?.productivity ?? defaultProductivity,
  }));
  const unmatched = new Map();
  const unrepresentedSupport = new Map();
  let cityCount = 0;
  let productionCount = 0;
  let temporaryCount = 0;
  let infrastructureCount = 0;

  for (const record of buildings) {
    if (record.type === 'temp') {
      temporaryCount += 1;
      continue;
    }
    const productionBuilding = matchObservedBuilding(record.type, productionBuildings);
    if (productionBuilding) {
      productionCount += 1;
      continue;
    }

    const raw = matchSaveBuilding(record.type, allRawBuildings, building => building.id);
    const cityBuilding = raw ? importedCityBuilding(raw, record.type) : null;
    if (cityBuilding && cityRows.has(record.scopeId)) {
      const rows = cityRows.get(record.scopeId);
      const key = cityBuilding.gameId;
      const current = rows.get(key) ?? {
        type: cityBuilding.type.de,
        name: cityBuilding.de,
        count: 0,
        importedBuilding: cityBuilding,
        sourceGameId: record.type,
        currentWorkers: 0,
        configuredWorkers: 0,
        nominalWorkers: 0,
      };
      current.count += 1;
      current.currentWorkers += record.currentWorkers ?? 0;
      current.configuredWorkers += record.configuredWorkers ?? 0;
      current.nominalWorkers += cityBuilding.workers ?? 0;
      rows.set(key, current);
      cityCount += 1;
      continue;
    }

    if (inferredHousingIndices.has(record.index)) continue;
    if (raw && !Object.keys(raw.production ?? {}).length
      && !Object.keys(raw.consumption ?? {}).length) {
      infrastructureCount += 1;
      continue;
    }
    if (!raw && isNonPlannerSupportType(record.type)) {
      const key = `${record.scopeId ?? 'none'}\0${record.type}`;
      const current = unrepresentedSupport.get(key)
        ?? { scopeId: record.scopeId, type: record.type, count: 0 };
      current.count += 1;
      unrepresentedSupport.set(key, current);
      infrastructureCount += 1;
      continue;
    }

    const key = `${record.scopeId ?? 'none'}\0${record.type}`;
    const current = unmatched.get(key)
      ?? { scopeId: record.scopeId, type: record.type, count: 0 };
    current.count += 1;
    unmatched.set(key, current);
  }

  for (const rows of cityRows.values()) {
    for (const row of rows.values()) {
      const serve = row.importedBuilding.citizenAbleServe ?? 0;
      if (!(serve > 0) || !(row.count > 0)) continue;
      const configuredPerBuilding = row.configuredWorkers / row.count;
      row.importedBuilding = {
        ...row.importedBuilding,
        workers: configuredPerBuilding,
        visitors: configuredPerBuilding * serve,
      };
    }
  }

  for (const group of inferredHousing) {
    if (!cityRows.has(group.scopeId)) continue;
    const importedBuilding = {
      de: `${group.type} — observed occupancy`,
      en: `${group.type} — observed occupancy`,
      type: { de: 'Wohngebäude', en: 'Housing' },
      kind: 'Save',
      gameId: group.type,
      sourceType: group.type,
      quality: null,
      workers: 0,
      special: 0,
      visitors: 0,
      inhabitants: group.residents,
      power: 0,
      maxKW: 0,
      water: 0,
      hotwater: 0,
      waste: 0,
      workdays: 0,
      gravel: 0,
      bricks: 0,
      steel: 0,
      concrete: 0,
      asphalt: 0,
      boards: 0,
      panels: 0,
      ecomponents: 0,
      mcomponents: 0,
      recommendedFor: 0,
      observedOccupancy: true,
      observedBuildingCount: group.buildingCount,
      maxObservedOccupancy: group.maxObservedOccupancy,
    };
    cityRows.get(group.scopeId).set(`observed:${group.type}`, {
      type: importedBuilding.type.de,
      name: importedBuilding.de,
      count: 1,
      importedBuilding,
      sourceGameId: group.type,
    });
    cityCount += group.buildingCount;
  }

  const unresolvedByScope = new Map();
  for (const item of unmatched.values()) {
    if (!Number.isInteger(item.scopeId)) continue;
    unresolvedByScope.set(item.scopeId, (unresolvedByScope.get(item.scopeId) ?? 0) + item.count);
  }
  const productionScopeIds = new Set(
    productionRows.map(row => row.scopeId).filter(Number.isInteger),
  );
  const cities = occupiedSettlements
    .filter(settlement => cityRows.get(settlement.id).size || citizenScopes.has(settlement.id))
    .map(settlement => ({
      ...defaultCity(),
      name: settlement.name || settlement.extraName || `${translate('city')} ${settlement.id + 1}`,
      scopeId: settlement.id,
      scopeIds: [settlement.id],
      scopeNames: [settlement.name || settlement.extraName
        || `${translate('area')} ${settlement.id + 1}`],
      source: 'save',
      productivity: citizenScopes.get(settlement.id)?.productivity ?? defaultProductivity,
      heatingEnabled: (header?.settings?.seasonsEnabled ?? true)
        && (mapClimate?.heatingRequired ?? true),
      heatingClimate: mapClimate?.id ?? null,
      observed: citizenScopes.get(settlement.id) ?? null,
      unresolvedBuildingCount: unresolvedByScope.get(settlement.id) ?? 0,
      sourcePosition: { x: settlement.x, y: settlement.y, z: settlement.z },
      rows: [...cityRows.get(settlement.id).values()],
    }));
  const warnings = [];
  if (membershipAudit.duplicateMembers.length) {
    warnings.push(
      `${membershipAudit.duplicateMembers.length} duplicate member reference(s); primary building ownership was used.`,
    );
  }
  if (membershipAudit.invalidMemberRefs.length) {
    warnings.push(`${membershipAudit.invalidMemberRefs.length} invalid member reference(s).`);
  }
  if (membershipAudit.fallbackAssignments) {
    warnings.push(
      `${membershipAudit.fallbackAssignments} building assignment(s) used the namepoint fallback.`,
    );
  }
  if (membershipAudit.unassigned) {
    warnings.push(`${membershipAudit.unassigned} building(s) have no settlement assignment.`);
  }
  for (const warning of parserWarnings) warnings.push(`${warning.file}: ${warning.message}`);
  const researchComplete = research?.filter(item => item.progress >= 1).length ?? 0;
  const researchPartial = research?.filter(item => item.progress > 0 && item.progress < 1).length ?? 0;
  const operationalServices = buildOperationalServices(
    buildings,
    citizens,
    allRawBuildings,
    cityStats,
    events,
  );
  const distributionOperations = summarizeDistributionOffices(buildings, vehicles ?? []);
  const lineOperations = vehicleLines
    ? summarizeVehicleLines(vehicleLines, vehicles ?? [], buildings) : null;
  const criminalityOutliers = citizens
    ? summarizeCriminalityOutliers(citizens, buildings) : null;
  const residenceDetails = citizens
    ? summarizeResidenceDetails(citizens, buildings) : null;
  const citizenDiagnostics = citizens
    ? summarizeCitizenDiagnostics(citizens, buildings, building => {
      const raw = matchSaveBuilding(building.type, allRawBuildings, entry => entry.id);
      return Number.isFinite(raw?.livingSpace) && raw.livingSpace > 0 ? raw.livingSpace : null;
    }) : null;
  const residenceOccupancy = citizens ? summarizeResidenceOccupancy(citizens, buildings) : null;
  const inventoryBuildings = buildings.filter(building =>
    building.storages?.some(storage => storage.resources?.length));
  const inventoryStorageCount = inventoryBuildings.reduce(
    (sum, building) =>
      sum + building.storages.filter(storage => storage.resources?.length).length,
    0,
  );
  const throughputBuildingCount = productionRows.reduce(
    (sum, row) => sum + (row.firstOutputThroughput?.instanceCount ?? 0),
    0,
  );

  return {
    cities,
    productionRows,
    metadata: {
      version: SAVE_IMPORT_VERSION,
      sourceName,
      importedAt,
      header,
      sourceStatus,
      mapClimate,
      roadNetwork,
      railNetwork,
      terrainWater,
      settlementCount: occupiedSettlements.length,
      sourceSettlementCount: settlements.length,
      emptySettlementCount: settlements.length - occupiedSettlements.length,
      buildingCount: buildings.length,
      citizenCount: citizenResult?.recordCount ?? 0,
      citizenSummary: citizenResult ? {
        ...citizenFileSummary,
        unassigned: citizenResult.unassigned,
        invalidResidenceRefs: citizenResult.invalidResidenceRefs,
        populatedScopeCount: citizenScopes.size,
      } : null,
      ownedVehicles: vehicles,
      vehicleFileSummary,
      lineFileSummary,
      vehicleLines: lineOperations,
      distributionOffices: distributionOperations,
      criminalityOutliers,
      residenceDetails,
      citizenDiagnostics,
      residenceOccupancy,
      vehicleModelCoverage,
      usedVehicleOffers,
      usedVehicleFileSummary,
      usedVehicleModelCoverage,
      observedBuildings: compactObservedBuildings(buildings),
      observedProductionRows: clone(productionRows),
      research: research ?? null,
      cityStats,
      operationalServices,
      researchComplete,
      researchPartial,
      inventoryBuildingCount: inventoryBuildings.length,
      inventoryStorageCount,
      throughputBuildingCount,
      cityScopeCount: cities.length,
      productionScopeCount: productionScopeIds.size,
      scopes: occupiedSettlements.map(settlement => ({
        id: settlement.id,
        name: settlement.name || settlement.extraName
          || `${translate('area')} ${settlement.id + 1}`,
        position: { x: settlement.x, y: settlement.y, z: settlement.z },
        city: cityRows.get(settlement.id).size > 0 || citizenScopes.has(settlement.id),
        production: productionScopeIds.has(settlement.id),
        citizens: citizenScopes.get(settlement.id) ?? null,
      })),
      cityBuildingCount: cityCount,
      productionBuildingCount: productionCount,
      infrastructureCount,
      workshopCatalog,
      inferredHousingBuildingCount: inferredHousing.reduce(
        (sum, group) => sum + group.buildingCount,
        0,
      ),
      inferredHousingResidents: inferredHousing.reduce(
        (sum, group) => sum + group.residents,
        0,
      ),
      temporaryCount,
      unmatchedCount: [...unmatched.values()].reduce((sum, item) => sum + item.count, 0),
      unmatched: [...unmatched.values()]
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
      unrepresentedSupportCount: [...unrepresentedSupport.values()]
        .reduce((sum, item) => sum + item.count, 0),
      unrepresentedSupport: [...unrepresentedSupport.values()]
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
      warnings,
    },
  };
}

function latestGameDate(statsRecords) {
  for (let index = (statsRecords?.length ?? 0) - 1; index >= 0; index -= 1) {
    const { year, day } = statsRecords[index] ?? {};
    if (Number.isInteger(year) && Number.isInteger(day) && day >= 0 && day < 365) {
      return { year, day };
    }
  }
  return null;
}

function sourceEvidence(parsed, key, observedAt, gameDate, {
  capability = `save.${key}`,
  forcePartial = false,
} = {}) {
  const status = parsed.sourceStatus?.[key] ?? 'missing';
  const completeness = status === 'exact'
    ? (forcePartial ? 'partial' : 'complete')
    : status === 'missing' ? 'unavailable' : 'partial';
  const warning = status === 'exact'
    ? (forcePartial ? `${capability} contains only the fields exported by the save.` : null)
    : status === 'missing'
      ? `${capability} is not present in this save folder.`
      : `${capability} could not be parsed completely.`;
  return createEvidence({
    source: 'save',
    observedAt,
    gameDate,
    completeness,
    confidence: 'exact',
    capability,
    warning,
  });
}

function average(citizens, key) {
  if (!citizens?.length) return null;
  return citizens.reduce((sum, citizen) => sum + (citizen[key] ?? 0), 0) / citizens.length;
}

function stableItems(items, idOf) {
  return (items ?? []).map((item, index) => ({
    ...clone(item),
    id: idOf(item, index),
  }));
}

export function projectSaveToRepublicModel(parsed, {
  sourceName,
  observedAt = new Date().toISOString(),
  generation = 0,
} = {}) {
  const gameDate = latestGameDate(parsed.statsRecords);
  const workersEvidence = sourceEvidence(parsed, 'workers', observedAt, gameDate);
  const namepointsEvidence = sourceEvidence(parsed, 'namepoints', observedAt, gameDate);
  const buildingsEvidence = sourceEvidence(parsed, 'buildings', observedAt, gameDate);
  const vehiclesEvidence = sourceEvidence(parsed, 'vehicles', observedAt, gameDate);
  const researchEvidence = sourceEvidence(parsed, 'research', observedAt, gameDate);
  const eventsEvidence = sourceEvidence(parsed, 'events', observedAt, gameDate);
  const statsEvidence = sourceEvidence(parsed, 'stats', observedAt, gameDate, {
    capability: 'save.stats',
    forcePartial: parsed.sourceStatus?.stats === 'exact',
  });
  const citizens = parsed.citizens ?? [];
  const latestStats = parsed.statsRecords?.at(-1) ?? null;
  const resources = latestStats
    ? [...new Set([
      ...Object.keys(latestStats.resourcesProduced ?? {}),
      ...Object.keys(latestStats.resourcesImportRUB ?? {}),
      ...Object.keys(latestStats.resourcesExportRUB ?? {}),
    ])].map(id => ({
      id,
      produced: latestStats.resourcesProduced?.[id] ?? null,
      importedRUB: latestStats.resourcesImportRUB?.[id] ?? null,
      exportedRUB: latestStats.resourcesExportRUB?.[id] ?? null,
    }))
    : [];
  const republic = {
    population: createEvidenceValue(parsed.citizens ? citizens.length : null, workersEvidence),
    productivity: createEvidenceValue(
      Number.isFinite(latestStats?.averageProductivity)
        ? latestStats.averageProductivity : null,
      statsEvidence,
    ),
    health: createEvidenceValue(average(parsed.citizens, 'health'), workersEvidence),
    criminality: createEvidenceValue(average(parsed.citizens, 'criminality'), workersEvidence),
    happiness: createEvidenceValue(average(parsed.citizens, 'happiness'), workersEvidence),
    loyalty: createEvidenceValue(average(parsed.citizens, 'loyalty'), workersEvidence),
    liveBuildingCount: createEvidenceValue(parsed.buildings?.length ?? null, buildingsEvidence),
  };
  const identityKey = parsed.header?.savePath || sourceName || 'unknown';
  return createRepublicModel({
    identity: {
      id: `save:${identityKey}`,
      name: sourceName || parsed.header?.title || 'W&R save',
    },
    generation,
    observedAt,
    gameDate,
    sources: {
      namepoints: namepointsEvidence,
      buildings: buildingsEvidence,
      workers: workersEvidence,
      vehicles: vehiclesEvidence,
      research: researchEvidence,
      events: eventsEvidence,
      stats: statsEvidence,
    },
    republic,
    areas: createEvidenceCollection(
      stableItems(parsed.settlements, settlement => settlement.id),
      namepointsEvidence,
    ),
    buildings: createEvidenceCollection(
      stableItems(compactObservedBuildings(parsed.buildings ?? []), building => building.index),
      buildingsEvidence,
    ),
    // A citizen's `id` is the save's recycled appearance code (100 values for
    // tens of thousands of citizens), so only the record index identifies one.
    citizens: createEvidenceCollection(
      stableItems(citizens, (citizen, index) => citizen.index ?? index),
      workersEvidence,
    ),
    resources: createEvidenceCollection(resources, statsEvidence),
    transport: createEvidenceCollection(
      stableItems(parsed.vehicles ?? [], (vehicle, index) => vehicle.id ?? vehicle.index ?? index),
      vehiclesEvidence,
    ),
    research: createEvidenceCollection(
      stableItems(parsed.research ?? [], (item, index) => item.key || `research:${index}`),
      researchEvidence,
    ),
    events: createEvidenceCollection(
      stableItems(parsed.events ?? [], (event, index) => event.index ?? index),
      eventsEvidence,
    ),
  });
}
