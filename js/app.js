import { STRINGS } from './i18n.js?v=224';
import { recordToPrices, resourceHistoryKeys } from './statsini.js?v=30';
import { parseLiveStatsFile } from './live_stats.js?v=4';
import { Economy, evaluatePlan, evaluateCity, evaluateCityProductivityScenarios, evaluateVehicleProduction, recommendVehicleProduction, vehicleBlueprintQuote, vehicleProductionGroup, vehicleProductionRecipe, buildingPlanningAuthority, profitPerWorkerAfterLabor, workerCostForType, CABLES, QUALITY_BUILDINGS_DE, lowTechPoints, FIELD_SIZES } from './calc.js?v=55';
import { stateToFragment, fragmentToState, downloadJson } from './share.js?v=13';
import { solveChain, producersByResource, defaultProducer } from './chain.js?v=17';
import { TUNABLES, TUNABLE_DEFAULTS, applyTuning } from './community_constants.js?v=13';
import { applyBuildingOverrides, buildingOverrideKey, BUILDING_OVERRIDE_FIELDS, duplicateCustomBuilding } from './building_overrides.js?v=2';
import {
  completedPaidResearchKeys,
  lowTechDisplayValues,
  lowTechSaveValues,
} from './research.js?v=13';
import {
  isLocomotive, evaluateConsist, eraOk, recommendTrain, mergeVehiclePools,
  vehicleCargoCapacity, vehicleSupportsCargo, vehicleDrive,
} from './train.js?v=30';
import {
  createIndexedDbObservationStore,
  createIndexedDbStatsStore,
  createIndexedDbPlanningStore,
  createIndexedDbSnapshotStore,
  clearIndexedDbStorage,
  createPlanningPersistence,
  createPlanningSaveCoordinator,
  migrateLegacySnapshots,
  serializePlannerState,
} from './storage.js?v=12';
import {
  PLANNING_KEYS,
  createPlanningCompatibleState,
  createPlanningModel,
  detachPlanningAssignments,
  isPlanningKey,
  planningProjection,
  rebindPlanningAssignments,
  refreshPlanningFromObservation,
  seedPlanningFromObservation,
} from './models/planning_model.js?v=11';
import { isSameRepublic } from './models/republic_identity.js?v=1';
import { cityScopeIds, planningAreas } from './models/planning_areas.js?v=1';
import {
  CITY_CORE_CATEGORY_TYPES,
  addMissingCityCategoryRows,
  aggregateCityObservations,
  cityBuildingDisplayName,
  cityWorkshopBuildings,
  resolveCityWorkshopRows,
} from './city_planning.js?v=8';
import { statsStateForImport } from './models/import_stats.js?v=2';
import { importBannerState, importControls } from './ui/import_banner.js';
import { observationForAutosave } from './models/autosave_observation.js';
import { mapLayerReport } from './models/map_layer_report.js?v=4';
import {
  CATEGORY_MARKS, buildTypeCategoryIndex, categoryForSaveType,
} from './models/building_category.js?v=6';
import { republicTrendAlerts } from './models/republic_trends.js?v=2';
import { isTheme, nextTheme, resolveTheme, themeAttribute } from './ui/theme.js?v=2';
import {
  productionBufferStatus, productionBufferAlerts, summarizeOccupiedBuildingPollution,
  buildSchematicMap, activeConstructionProjects, filterConstructionProjects,
  filterCitizenDiagnostics, isBorderPostType, isFrontierBuilding, isExternalAirLinkType,
} from './save_model.js?v=44';
import {
  buildRepublicModel, compareObservedSnapshots, republicAlerts, visibleRepublicAlerts,
  alertCategory, alertGroup, filterRepublicAlerts, groupRepublicAlerts,
} from './republic.js?v=23';
import { filterRange, seriesFromRecords } from './timeseries.js?v=3';
import {
  buildPriceIndex, buildResourcePriceIndex, evaluateLoanScenarios, rollingAnnualRates,
  rollingAnnualRateIntervals, simulateLoan, summarizeInflation,
} from './models/economic_analysis.js?v=11';
import {
  creditProvenanceKeys, creditVerdictKey, electronicsAvailabilityState,
  hasUsableInflationEvidence,
  summarizeCreditTerms,
} from './models/credit_summary.js?v=2';
import {
  amortizationCorridor, deriveForecastRateScenarios, electronicsComponentIndex,
  forecastElectronicsPrices, futureExchangePath, historicalElectronicsComponentIndex,
  rankRelevantCreditOpportunities, rubPerUsdFromBasePrices,
} from './models/credit_forecast.js?v=13';
import {
  destroyTimeSeriesCharts, mountTimeSeriesChart, resetChartGroup,
} from './ui/time_series_chart.js?v=5';
import { createVirtualTable } from './ui/virtual_table.js?v=1';
import { mountRepublicLeafletMap } from './ui/leaflet_republic_map.js?v=37';
import { workerAccessAvailability } from './models/access_graph.js?v=20';
import { mountWorkerAccessGraph } from './ui/access_graph.js?v=20';
import { buildWorkerAccessEvidence } from './models/worker_access_evidence.js?v=17';
import { buildWalkingNetwork, walkingReachFrom } from './models/walking_access.js?v=10';
import { buildCablewayRoutes } from './models/cableway_access.js?v=3';
import { workerAccessAlerts } from './models/access_alerts.js?v=3';
import { unpoweredBuildingAlerts } from './models/power_alerts.js?v=6';
import { missingUtilityAlerts, fullWasteStorageAlerts } from './models/utility_alerts.js?v=5';
import { largestChainForWorkforce } from './models/workforce_plan.js?v=3';
import { cityUtilityPlan } from './models/city_utilities.js?v=3';
import { mergeVanillaCityResidences } from './models/vanilla_city_catalog.js?v=5';
import { buildVehicleRoutes } from './models/vehicle_routes.js?v=3';
import { buildingHeightSamples } from './models/water_level.js?v=3';
import { transitReachFrom } from './models/transit_reach.js?v=4';
import { mergedFootprints } from './models/building_footprint.js?v=3';
import {
  buildMapTransportLines,
  mapCountOrDash,
  normalizeMapMetric,
  radiationRasterPixels,
  residenceDetailForBuilding,
  waterRasterPixels,
} from './ui/republic_map.js?v=26';
import { parseWorkshopBuildingIni, workshopBuildingIdentity } from './workshop_ini.js?v=1';
import {
  filterAndSortVehicleOpportunities, rankUsedVehicleReplacements, rankUsedMarketArbitrage,
  rankUsedMarketBorderRoutes,
  paginateVehicleOpportunities, shareSafeSaveImport, vehicleCategoryGroup,
  vehicleEconomicOpportunity, vehicleUsedMarketQuote,
} from './fleet.js?v=26';
import {
  SaveFolderValidationError,
  orchestrateWorkshopCatalog,
  parseMapLayersInWorker,
} from './adapters/save_folder_adapter.js?v=30';
import { matchSaveBuilding } from './adapters/save_projection.js?v=30';
import { bootstrapRuntime } from './bootstrap.js?v=16';
import { getRuntimeConfig, hasSaveWorkspace } from './runtime/runtime_config.js?v=4';
import {
  COMMAND_SECTIONS, sectionForTab, tabsForSection, surfaceState,
  QUICK_TOOLS_STORAGE_KEY, defaultQuickTools, normalizeQuickTools, reorderQuickTools,
  shouldOpenStartPage, relativeAge,
} from './ui/command_center.js?v=18';

const RUNTIME_CONFIG = getRuntimeConfig();
const APP_RUNTIME = bootstrapRuntime({ config: RUNTIME_CONFIG });
const IS_BETA = RUNTIME_CONFIG.variant === 'beta';
const SHOW_EVIDENCE_RAIL = false;
const HAS_SAVE_WORKSPACE = hasSaveWorkspace(RUNTIME_CONFIG);
const TABS = [...(HAS_SAVE_WORKSPACE ? ['home'] : []), 'republic', 'map', 'cities', 'history', 'credits', 'construction', 'logistics', 'alerts', 'pollution', 'crime', 'environment', 'snapshots', 'production', 'city', 'chain',
  'prices', 'priceedit', 'analysisRUB', 'analysisUSD', 'analysis', 'vehicleprod', ...(HAS_SAVE_WORKSPACE ? ['saveimport'] : []),
  'trains', 'research', 'advanced', 'help'];
const LEGACY_TAB_ALIASES = new Set(['analysis']);
const TAB_LABEL_KEYS = { home: 'tabHome', prices: 'tabPrices', priceedit: 'tabPriceEdit', production: 'tabProduction', chain: 'tabChain',
  analysis: 'tabAnalysis', analysisRUB: 'tabAnalysisRUB', analysisUSD: 'tabAnalysisUSD', vehicleprod: 'tabVehicleProd', city: 'tabCity', cities: 'tabCities', republic: 'tabRepublic',
  map: 'tabMap', history: 'tabHistory', credits: 'tabCredits', construction: 'tabConstruction', logistics: 'tabLogistics', environment: 'tabEnvironment', alerts: 'tabAlerts', pollution: 'tabPollution', crime: 'tabCrime', snapshots: 'tabSnapshots', saveimport: 'tabSaveImport', trains: 'tabTrains', research: 'tabResearch', advanced: 'tabAdvanced', help: 'tabHelp' };

function loadQuickTools() {
  try {
    const raw = globalThis.localStorage?.getItem(QUICK_TOOLS_STORAGE_KEY);
    if (raw !== null && raw !== undefined) return normalizeQuickTools(JSON.parse(raw), TABS);
  } catch { /* a locked-down profile uses the defaults for this session */ }
  return defaultQuickTools(TABS);
}

let quickToolTabs = loadQuickTools();
let quickToolsEditorOpen = false;

function saveQuickTools() {
  try { globalThis.localStorage?.setItem(QUICK_TOOLS_STORAGE_KEY, JSON.stringify(quickToolTabs)); }
  catch { /* navigation remains usable when browser storage is unavailable */ }
}

function setQuickTools(next) {
  quickToolTabs = normalizeQuickTools(next, TABS);
  saveQuickTools();
  update();
}

function toggleQuickTool(tab) {
  setQuickTools(quickToolTabs.includes(tab)
    ? quickToolTabs.filter(id => id !== tab)
    : [...quickToolTabs, tab]);
}

function moveQuickTool(tab, direction) {
  setQuickTools(reorderQuickTools(quickToolTabs, tab, direction));
}
// Keys worth sharing/exporting (statsRecords stay local: big + personal to the save).
const SHARE_KEYS = ['lang', 'theme', 'currency', 'priceSource', 'decade', 'overrides', 'plan',
  'cities', 'activeCity', 'vanillaOnly', 'vehicleProduction', 'train', 'lowtech', 'dataset',
  'chains', 'activeChain', 'tuning', 'productionScope', 'saveImport', 'republicView',
  'buildingOverrides', 'customBuildings',
  'republicRange', 'republicResource', 'republicScope', 'republicAlertGroup', 'mapLayers', 'mapBuildingFilter',
  'mapPollutionOpacity', 'mapMetric', 'mapCategoryVisibility', 'republicAlertFilter',
  'accessAlertsMuted', 'historyCurrency', 'historyInflationBasis', 'tab'];
const SNAPSHOT_KEYS = [...SHARE_KEYS, 'statsRecords', 'statsName', 'recordIndex', 'activeLoans'];

// ---------------------------------------------------------------- state
const SAVES_KEY = 'wr-planner-saves-v1';
const snapshotStore = createIndexedDbSnapshotStore();
const planningStore = createIndexedDbPlanningStore();
const planningBackupStore = createIndexedDbPlanningStore(undefined, { key: 'planning-backup' });
const observationStore = createIndexedDbObservationStore();
const statsStore = createIndexedDbStatsStore();
const planningPersistence = createPlanningPersistence({ planningStore, observationStore });
let hasPlanningBackup = false;
let namedSnapshotNames = [];
let comparisonSnapshotName = '';
let comparisonSnapshot = null;
let comparisonSnapshotError = '';
let cityDiagnosticsSearch = '';
let cityDiagnosticsSort = 'pressure';
let mapFocusBuildingIndex = null;
let mapFocusScopeId = null;
let mapSelectedBuildingIndex = null;
let mapSelectedTransportLineSlot = null;
let mapWalkReach = null;
let standaloneMapViewBox = null;
let standaloneLeafletMap = null;
let standaloneLeafletCamera = null;
let compactMapExpanded = false;
let compactMapOpen = false;
let plannerAssumptionsOpen = false;
let creditElectronicsOpen = false;
let creditElectronicsAssumptionsOpen = false;
let creditHistoryOpen = false;
let pendingChartMounts = [];
let constructionPage = 1;
let constructionDetailsOpen = false;
let constructionProgressFilter = 'all';
let constructionScopeFilter = '';
let constructionSearch = '';
let unmatchedScopeFilter = '';
let deferredMapRetry = null;
const terrainWaterImageCache = new Map();
const pollutionImageCache = new Map();
const radiationImageCache = new Map();

function createInitialState() {
  const initial = {
    lang: 'en',
    theme: 'auto',               // auto | light | dark — a reading preference
    tab: HAS_SAVE_WORKSPACE ? 'home' : 'republic',
    currency: 'RUB',
    priceSource: 'default',      // default | stats | decade
    decade: 1980,
    recordIndex: 0,
    statsRecords: null,          // parsed stats.ini records
    statsName: null,
    activeLoans: [],             // current $LoanStart contracts from stats.ini
    overrides: {},               // {"sellRUB.steel": 123}
    historyKey: 'steel',
    historyCompareKeys: [],
    historyLogScale: false,
    historyCurrency: 'RUB',
    historyInflationBasis: 'base',
    creditAmount: 100000,
    creditApr: 5,
    creditTermYears: 10,
    creditRecipeVariant: 'vanilla',
    creditFinancingSource: 'hypothetical',
    plan: {
      settings: { productivity: 1, timeUnit: 'day', seasons: true, calendarFlow: 1, fertilizer: 1, currency: 'RUB' },
      fields: { small: 0, medium: 0, large: 0, hectares: null },
      rows: [],                  // {group, name, count, quality}
    },
    cities: [],
    activeCity: 0,
    vanillaOnly: false,
    vehicleProduction: { productivity: 1, timeUnit: 'year', rows: [] },
    train: { cargo: 'Kohle', length: 450, locoName: null, locoCount: 1 },
    dataset: 'game',   // 'game' (current game files) | 'sheet' (spreadsheet snapshot)
    tuning: {},        // advanced-mode overrides for community constants
    buildingOverrides: {}, // dataset-scoped advanced production-building overrides
    customBuildings: [],
    advancedBuildingKey: null,
    lowtech: {
      population: 2500, cities: 1, currentYear: 1930, startYear: 1920,
      researched: 0, researchKeys: null, inputSource: 'auto',
    },
    chains: [defaultChainPlan()],
    activeChain: 0,
    productionScope: 'all',
    republicView: 'actual',
    republicRange: 'all',
    republicResource: null,
    republicScope: null,
    mapLayers: {
      water: true, pollution: true, radiation: false, roads: true, rails: true, pedestrian: false, buildings: true,
      transport: false, construction: true, scopes: true, borders: true, outliers: true,
    },
    mapBuildingFilter: '',
    mapPollutionOpacity: 0.68,
    mapRadiationOpacity: 0.72,
    mapMetric: 'category',
    mapCategoryVisibility: {
      living: true, industry: true, services: true, support: true, other: true,
    },
    saveImport: null,
    analysisSort: { col: 'profit', dir: -1 },
    analysisSearch: '',
    analysisResource: 'all',
    analysisWorkerType: 'resident',
    analysisCostBasis: 'purchase',
    priceSort: { col: 'name', dir: 1 },
    saveSlotName: '',   // transient UI field for the named-save-slot input, not shared/exported
    snapshotNotice: '', // transient feedback for named snapshot actions
    planningPersistenceError: '', // transient canonical IndexedDB planning error
    observationPersistenceError: '', // transient localStorage observation error
    importStatus: '',    // transient save-directory parsing status
    importStatusError: false,
    importBusy: false,
    liveStatsStatus: '', // transient File System Access API watcher feedback
    liveStatsStatusError: false,
    localWorkshopStatus: '',
    productionDetails: false,
    cityDetails: false,
    fleetFilter: { category: 'all', action: 'all', sort: 'advantage' },
    fleetDetails: false,
    republicAlertsExpanded: false,
    republicAlertFilter: 'all',
    accessAlertsMuted: [],
    runtimeStatus: RUNTIME_CONFIG.mode === 'hosted' ? 'ready' : 'loading',
    runtimeReason: '',
    runtimeGeneration: null,
    runtimeObservedAt: null,
    liveModel: null,
  };
  initial.planning = createPlanningModel(initial);
  for (const key of PLANNING_KEYS) delete initial[key];
  return initial;
}

function createCompatibleState(initial) {
  return createPlanningCompatibleState(initial).state;
}

const state = createCompatibleState(createInitialState());

const planningSaveCoordinator = createPlanningSaveCoordinator({
  persistence: planningPersistence,
  onErrors: ({ planning, observation }) => {
    const changed = state.planningPersistenceError !== planning
      || state.observationPersistenceError !== observation;
    state.planningPersistenceError = planning;
    state.observationPersistenceError = observation;
    if (planning) console.error(planning);
    if (observation) console.error(observation);
    return changed;
  },
  render,
  // Measured on a 2.77MB observation: a keystroke costs ~115ms with a save
  // loaded against ~35ms with none. Waiting for a pause in editing takes the
  // write off the keystroke path; leaving the page flushes it immediately.
  delayMs: 400,
});

// pagehide covers navigation and tab close; visibilitychange covers the mobile
// case where a backgrounded tab may never get pagehide at all.
// On 'auto' the stylesheet follows the system by itself, but anything the app
// derives from the resolved theme would otherwise go stale until the next
// render, so a system change is treated as a reason to redraw.
globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  ?.addEventListener?.('change', () => { if (!themeAttribute(state.theme)) render(); });

for (const [target, event] of [[window, 'pagehide'], [document, 'visibilitychange']]) {
  target.addEventListener(event, () => {
    if (event === 'visibilitychange' && document.visibilityState !== 'hidden') return;
    planningSaveCoordinator.flush();
  });
}

function plannerScopes(kind = null) {
  const imported = state.saveImport?.scopes;
  if (Array.isArray(imported)) return kind ? imported.filter(scope => scope[kind]) : imported;
  return state.cities.flatMap(city => cityScopeIds(city).map(scopeId => ({
    id: scopeId, name: city.name, city: true, production: true,
  })));
}

// City planning works on the same areas the republic overview lists, so a save
// with production-only areas no longer hides them behind the hand-made
// placeholder.
function cityPlanningAreas() {
  return planningAreas({
    cities: state.cities,
    scopes: state.saveImport?.scopes ?? null,
    createDefault: defaultCity,
  });
}

// The planner edits its area in place, so an area that exists only as a save
// scope has to become a stored city before it can carry edits. Only the area
// the user actually opened is materialised.
function materializeCityArea(area) {
  if (!area?.syntheticArea) return area;
  const { syntheticArea, ...stored } = area;
  stored.scopeIds = cityScopeIds(stored);
  state.cities.push(stored);
  return state.cities[state.cities.length - 1];
}

function setCityScopeAssignments(city, values) {
  const scopeIds = [...new Set(values.map(value => Number(value)).filter(Number.isInteger))];
  if (scopeIds.length) {
    city.scopeIds = scopeIds;
    // Keep the old scalar alias for imported plans and older render paths.
    city.scopeId = scopeIds[0];
    const names = new Map(plannerScopes('city').map(scope => [scope.id, scope.name]));
    city.scopeNames = scopeIds.map(scopeId => names.get(scopeId)).filter(Boolean);
  } else {
    delete city.scopeIds;
    delete city.scopeId;
    delete city.scopeNames;
  }
}

function plannerScopeName(scopeId) {
  return plannerScopes().find(scope => scope.id === scopeId)?.name ?? t('unassigned');
}

function returnToRepublicButton() {
  if (!state.saveImport) return null;
  return el('button', { class: 'back-republic', onclick: () => { state.tab = 'republic'; update(); } },
    `← ${t('returnRepublic')}`);
}

function defaultCity() {
  return {
    name: 'Nowa Huta', productivity: 0.7, cable: CABLES[2].de, exchanger: 'small',
    worstCaseProductivity: 0.5, waterDivisor: 3, rows: [], workshops: [], assignedChain: null,
  };
}

function defaultChainPlan() {
  return {
    name: null, goal: 'steel', amount: 43, imports: [], producerChoice: {},
    includeUtilities: true, qualityTiers: {},
  };
}

// Old saves/share-links have a single `state.chain` object; migrate it into
// the new `state.chains` array (one plan) the first time it's touched.
function chainPlans() {
  if (!state.chains) {
    state.chains = [state.chain ? { name: null, ...state.chain } : defaultChainPlan()];
    state.activeChain = 0;
    delete state.chain;
  }
  if (!state.chains.length) state.chains.push(defaultChainPlan());
  if (state.activeChain >= state.chains.length) state.activeChain = 0;
  return state.chains;
}

function saveState() {
  // The persistence layer serialises what it is given, so this hands over a
  // shallow projection rather than a second JSON round-trip of the same
  // multi-megabyte observation.
  planningSaveCoordinator.save({
    ...observationForAutosave({ ...state }),
    planning: state.planning,
  });
}

// When the observation was last written. Used to decide whether this launch is
// a resumed session or a new sitting.
let observationSavedAt = null;

async function loadState() {
  try {
    const loaded = await planningPersistence.load();
    Object.assign(state, loaded.state);
    observationSavedAt = loaded.lastSavedAt ?? null;
    // stats.ini history is written once at import rather than with the
    // autosave: it is tens of megabytes and never changes until the next save.
    const storedStats = await statsStore.load().catch(() => null);
    if (storedStats?.records?.length) {
      state.statsRecords = storedStats.records;
      state.statsName = storedStats.name ?? state.statsName;
      state.recordIndex = storedStats.records.length - 1;
    }
    if (loaded.error) state.observationPersistenceError = loaded.error.message;
    // Price-table sorting is a view preference, not plan state. Each launch
    // starts with the resource names in ascending alphabetical order.
    state.priceSort = { col: 'name', dir: 1 };
    state.localWorkshopStatus = '';
  } catch (error) {
    state.planningPersistenceError = `Planning state could not be loaded: ${error.message}`;
    console.error(error);
  }
}

// ---------------------------------------------------------------- data
let DATA = null; // {resources, defaults, prodBuildings, cityBuildings, vehicles, decades}

// Data version: bumped together with the ?v= in index.html on each release so
// GitHub Pages' 10-minute cache can't serve stale JSON to a fresh app.
const DATA_V = new URL(import.meta.url).searchParams.get('v') ?? '0';

// index.html carries no marker of its own, so a browser holding a stale copy of
// the shell keeps loading the module versions that copy names and behaves like
// an old build long after a new one is deployed.
//
// The authoritative question is not "is the dataset stamp newer" — that is ahead
// of the shell for as long as a deploy takes to propagate, and answering it
// would nag on every release. It is "does the shell the server is serving right
// now name a newer app.js than the one actually running". Only that means the
// reader is looking at a stale page.
async function fetchDeployedShellBuild() {
  try {
    const url = new URL('../index.html', import.meta.url);
    url.searchParams.set('build', String(Date.now()));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return appBuildMarker(await response.text());
  } catch {
    return null;
  }
}

export function appBuildMarker(html) {
  return String(html ?? '').match(/js\/app\.js\?v=(\d+)/)?.[1] ?? null;
}

export function isStaleBuild(running, deployed) {
  const current = Number(running);
  const latest = Number(deployed);
  if (!Number.isFinite(current) || !Number.isFinite(latest)) return false;
  return latest > current;
}

export async function checkForNewerBuild() {
  const deployed = await fetchDeployedShellBuild();
  if (!isStaleBuild(DATA_V, deployed)) return null;
  return { running: String(DATA_V), deployed: String(deployed) };
}

async function loadData() {
  const get = path => {
    const url = new URL(`../${path}`, import.meta.url);
    url.searchParams.set('v', DATA_V);
    return fetch(url);
  };
  const [res, prod, prodGame, city, rawBuildings, workshopIndex, veh, rail, rawVehicles, dec, research, dataVersion, footprints] = await Promise.all([
    get('data/resources.json').then(r => r.json()),
    get('data/production_buildings.json').then(r => r.json()),
    get('data/game/production_buildings.json').then(r => r.ok ? r.json() : null).catch(() => null),
    get('data/city_buildings.json').then(r => r.json()),
    get('data/game/buildings_raw.json').then(r => r.ok ? r.json() : []).catch(() => []),
    HAS_SAVE_WORKSPACE ? get('data/workshop/index.json').then(r => r.ok ? r.json() : null).catch(() => null) : null,
    get('data/vehicles.json').then(r => r.json()),
    get('data/game/rail_vehicles.json').then(r => r.ok ? r.json() : []).catch(() => []),
    get('data/game/vehicles_raw.json').then(r => r.ok ? r.json() : []).catch(() => []),
    get('data/decade_prices.json').then(r => r.json()),
    get('data/game/research.json').then(r => r.ok ? r.json() : []).catch(() => []),
    get('data/VERSION.json').then(r => r.ok ? r.json() : null).catch(() => null),
    get('data/building_footprints.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  DATA = {
    resources: res.resources, defaults: res.defaults,
    prodSets: { sheet: prod, game: prodGame },
    cityBuildings: mergeVanillaCityResidences(city, rawBuildings),
    rawBuildings, rawVehicles, workshopIndex, workshopBuildings: [], workshopVehicles: [],
    localWorkshopBuildings: [], workshopProduction: [],
    // Game-only rail vehicles join the pool; hard-attached tenders stay nested.
    sheetVehicles: veh.vehicles,
    vehicles: mergeVehiclePools(veh.vehicles, rail, rawVehicles),
    decades: dec, research, dataVersion,
    buildingFootprints: footprints?.footprints ?? null,
  };
}

function baseProdBuildings() {
  const custom = state.customBuildings.filter(building => building.customDataset === state.dataset);
  if (state.dataset === 'game') return [...(DATA.prodSets.game ?? []), ...(DATA.workshopProduction ?? []), ...custom];
  return [...DATA.prodSets.sheet, ...custom];
}

// Active production-building dataset ('game' from game files, 'sheet' from the spreadsheet).
function prodBuildings() {
  return applyBuildingOverrides(baseProdBuildings(), state.buildingOverrides, state.dataset);
}

// ---------------------------------------------------------------- prices
function basePrices() {
  if (state.priceSource === 'stats' && state.statsRecords?.length) {
    const rec = state.statsRecords[Math.min(state.recordIndex, state.statsRecords.length - 1)];
    const p = recordToPrices(rec, state.statsRecords);
    // Older game versions don't export every resource (e.g. no "eletric" row);
    // fall back to the sample defaults for anything missing and remember which.
    p.fallback = {};
    for (const tbl of ['purchaseUSD', 'purchaseRUB', 'sellUSD', 'sellRUB']) {
      for (const [k, v] of Object.entries(DATA.defaults[tbl])) {
        if (p[tbl][k] === undefined) {
          p[tbl][k] = v;
          p.fallback[`${tbl}.${k}`] = true;
        }
      }
    }
    return p;
  }
  if (state.priceSource === 'decade') {
    const d = DATA.decades[state.decade] || {};
    const p = { purchaseUSD: {}, purchaseRUB: {}, sellUSD: {}, sellRUB: {} };
    for (const [k, v] of Object.entries(d)) {
      p.purchaseUSD[k] = v.buyUSD; p.purchaseRUB[k] = v.buyRUB;
      p.sellUSD[k] = v.sellUSD; p.sellRUB[k] = v.sellRUB;
    }
    // scale workday cost roughly with the era is impossible: keep defaults
    p.workdayCostUSD = DATA.defaults.workdayCostUSD; p.workdayCostRUB = DATA.defaults.workdayCostRUB;
    p.deliveryCostUSD = DATA.defaults.deliveryCostUSD; p.deliveryCostRUB = DATA.defaults.deliveryCostRUB;
    p.imigrantCostUSD = DATA.defaults.imigrantCostUSD; p.imigrantCostRUB = DATA.defaults.imigrantCostRUB;
    return p;
  }
  return JSON.parse(JSON.stringify(DATA.defaults));
}

function currentPrices() {
  const p = basePrices();
  for (const [path, val] of Object.entries(state.overrides)) {
    const [table, key] = path.split('.');
    if (key === undefined) p[table] = val;
    else if (p[table]) p[table][key] = val;
  }
  return p;
}

function economy() {
  return new Economy(DATA.resources, currentPrices());
}


// ---------------------------------------------------------------- helpers
const $ = sel => document.querySelector(sel);
const t = key => (STRINGS[state.lang] || STRINGS.en)[key] ?? key;
const rname = r => r[state.lang] ?? r.de;

function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return '∞';
  return n.toLocaleString(state.lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: digits });
}
const addKnown = (a, b) => a == null || b == null ? null : a + b;
function currencySymbol(currency) { return currency === 'USD' ? '$' : '₽'; }
function cur() { return currencySymbol(state.currency); }

let openMoreToolsDetails = null;

// The navigation can wrap the More tools trigger onto a row whose right edge
// is far left of the viewport. CSS gives the menu a useful default position;
// when it opens, clamp that position to the visible viewport and use the side
// with more room. If neither side has enough room, the menu becomes internally
// scrollable instead of hiding its last tools below the screen.
function positionMoreToolsMenu(details) {
  if (!details?.open) return;
  const summary = details.querySelector(':scope > summary');
  const menu = details.querySelector(':scope > .more-nav-menu');
  if (!summary || !menu) return;

  const margin = 10;
  const gap = 5;
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.style.maxHeight = 'none';

  const trigger = summary.getBoundingClientRect();
  const detailsBox = details.getBoundingClientRect();
  const menuWidth = Math.min(menu.getBoundingClientRect().width, window.innerWidth - margin * 2);
  const naturalHeight = menu.scrollHeight;
  const availableBelow = Math.max(1, window.innerHeight - margin - (trigger.bottom + gap));
  const availableAbove = Math.max(1, trigger.top - gap - margin);
  const opensAbove = naturalHeight > availableBelow && availableAbove > availableBelow;
  const available = opensAbove ? availableAbove : availableBelow;
  const maxHeight = Math.max(1, Math.min(naturalHeight, available));
  const viewportLeft = Math.min(
    Math.max(margin, trigger.left),
    Math.max(margin, window.innerWidth - margin - menuWidth),
  );
  const viewportTop = opensAbove
    ? trigger.top - gap - maxHeight
    : trigger.bottom + gap;

  menu.style.left = `${viewportLeft - detailsBox.left}px`;
  menu.style.top = `${viewportTop - detailsBox.top}px`;
  menu.style.maxHeight = `${maxHeight}px`;
}

function resetMoreToolsMenu(details) {
  const menu = details?.querySelector(':scope > .more-nav-menu');
  if (!menu) return;
  menu.style.left = '';
  menu.style.top = '';
  menu.style.maxHeight = '';
}

window.addEventListener('resize', () => {
  if (openMoreToolsDetails?.isConnected) positionMoreToolsMenu(openMoreToolsDetails);
});

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'selected' || k === 'value') e[k] = v;
    else if (v === false || v === null || v === undefined) continue;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

function numInput(value, onchange, opts = {}) {
  return el('input', {
    type: 'number', value: value ?? '', step: opts.step ?? 'any',
    min: opts.min ?? '', class: opts.class ?? 'num',
    // Deferred so the browser finishes applying the keystroke (caret position,
    // in-progress text like "1.") to this input before update() tears down
    // and rebuilds the whole tab; doing that synchronously inside the event
    // handler corrupts multi-character typing (e.g. decimals) mid-edit.
    oninput: e => { onchange(parseFloat(e.target.value) || 0); setTimeout(update, 0); },
  });
}

// Percent input for values stored as factors (game UI shows productivity in %).
function pctInput(factor, onchange) {
  const input = el('input', {
    type: 'number', value: Math.round((factor ?? 1) * 1000) / 10, step: 5, min: 0,
    class: 'num pct',
    onchange: e => { onchange((parseFloat(e.target.value) || 0) / 100); update(); },
  });
  return el('span', { class: 'pctwrap' }, input, ' %');
}

// Display name incl. DLC marker (DLC files ship with every install, but the
// buildings are only placeable when the DLC is owned).
function bname(b) {
  return b[state.lang] + (b.dlc ? ' [DLC]' : '');
}

function planningAuthorityBadge(building, scopes = ['economy', 'utilities', 'construction']) {
  if (!building) return null;
  const authority = buildingPlanningAuthority(building, scopes);
  if (authority.exact) return null;
  const sourceLabels = {
    'user-override': 'authorityUserOverride',
    unavailable: 'authorityUnavailable', unknown: 'authorityUnknown',
    'sheet-category-estimate': 'authorityCategoryEstimate',
    'sheet-scaled': 'authorityScaled', 'sheet-measured': 'authorityMeasured',
  };
  const sourceClasses = {
    'user-override': 'derived',
    unavailable: 'missing', unknown: 'missing', 'sheet-category-estimate': 'missing',
    'sheet-scaled': 'derived', 'sheet-measured': 'derived',
  };
  const details = Object.entries(authority.groups)
    .filter(([source]) => source !== 'game-file')
    .map(([source, fields]) => `${t(sourceLabels[source] ?? 'authorityUnknown')}: ${fields.join(', ')}`)
    .join('\n');
  return el('div', { class: 'sourceid', title: details },
    `${t('planningInputs')}: `,
    el('span', { class: `evidence-badge ${sourceClasses[authority.strongest] ?? 'missing'}` },
      `${t(sourceLabels[authority.strongest] ?? 'authorityUnknown')} · ${authority.nonExactCount}`));
}

function selectInput(options, value, onchange, opts = {}) {
  const s = el('select', { class: opts.class ?? '', onchange: e => { onchange(e.target.value); update(); } });
  for (const o of options) {
    const [val, label] = Array.isArray(o) ? o : [o, o];
    s.append(el('option', { value: val, selected: String(val) === String(value) }, label));
  }
  return s;
}

// ---------------------------------------------------------------- stats.ini loading
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = parseLiveStatsFile(reader.result, file); }
    catch (error) { return alert(error.message); }
    const { records } = parsed;
    state.statsRecords = records;
    state.activeLoans = parsed.loans;
    state.statsName = file.name;
    state.recordIndex = records.length - 1; // newest snapshot
    state.priceSource = 'stats';
    state.overrides = {};
    if (state.saveImport) state.saveImport.blueprintOwned = parsed.blueprintOwned;
    update();
  };
  reader.readAsText(file);
}

let liveStatsDirectory = null;
let liveStatsTimer = null;
let liveStatsRevision = null;
let liveStatsRefreshing = false;

function liveStatsSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

function stopLiveStatsFollow(showStatus = true) {
  if (liveStatsTimer) clearInterval(liveStatsTimer);
  liveStatsTimer = null;
  liveStatsDirectory = null;
  liveStatsRevision = null;
  if (showStatus) {
    state.liveStatsStatus = t('liveStatsStopped');
    state.liveStatsStatusError = false;
    update();
  }
}

async function refreshLiveStats() {
  if (!liveStatsDirectory || liveStatsRefreshing) return;
  liveStatsRefreshing = true;
  try {
    const handle = await liveStatsDirectory.getFileHandle('stats.ini');
    const file = await handle.getFile();
    const parsed = parseLiveStatsFile(await file.text(), file);
    if (parsed.revision === liveStatsRevision) return;

    liveStatsRevision = parsed.revision;
    state.statsRecords = parsed.records;
    state.activeLoans = parsed.loans;
    state.statsName = parsed.name;
    state.recordIndex = parsed.records.length - 1;
    state.priceSource = 'stats';
    state.overrides = {};
    const productivity = latestProductivity(parsed.records, state.plan.settings.productivity || 1);
    if (state.saveImport) {
      state.saveImport.blueprintOwned = parsed.blueprintOwned;
      state.saveImport.statsRecordCount = parsed.records.length;
      state.saveImport.latestProductivity = productivity;
      state.saveImport.liveStatsUpdatedAt = new Date().toISOString();
    }
    state.liveStatsStatus = t('liveStatsUpdated')
      .replace('{count}', fmt(parsed.records.length, 0))
      .replace('{time}', new Date().toLocaleTimeString());
    state.liveStatsStatusError = false;
    update();

    if (state.saveSlotName) {
      const result = await saveNamedState(state.saveSlotName);
      if (!result.ok) {
        state.liveStatsStatus = `${t('liveStatsSnapshotFailed')}: ${result.error.message}`;
        state.liveStatsStatusError = true;
        update();
      }
    }
  } catch (error) {
    state.liveStatsStatus = `${t('liveStatsReadFailed')}: ${error.message}`;
    state.liveStatsStatusError = true;
    update();
  } finally {
    liveStatsRefreshing = false;
  }
}

async function startLiveStatsFollow() {
  if (!liveStatsSupported()) return;
  try {
    const directory = await window.showDirectoryPicker({ id: 'workers-live-stats', mode: 'read' });
    stopLiveStatsFollow(false);
    liveStatsDirectory = directory;
    state.liveStatsStatus = t('liveStatsWatching').replace('{name}', directory.name);
    state.liveStatsStatusError = false;
    update();
    await refreshLiveStats();
    liveStatsTimer = setInterval(refreshLiveStats, 15_000);
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.liveStatsStatus = `${t('liveStatsReadFailed')}: ${error.message}`;
    state.liveStatsStatusError = true;
    update();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshLiveStats();
});

// ---------------------------------------------------------------- rendering
// Numbers are right-aligned in their cells but their headers were not, so in a
// wide column the header sat at the far left and its numbers at the far right.
// Read across a row and the values appeared to belong to the column before.
// Done here rather than at the call sites because every table in the app has
// the problem and a new one would otherwise be born with it.
// Ten of thirty tables were written without the .tablewrap their CSS needs to
// scroll. Wrapping them here rather than at the call sites means a table added
// later cannot be born without one.
function wrapOverflowingTables(root) {
  for (const table of root.querySelectorAll('table.data')) {
    if (table.parentElement?.classList.contains('tablewrap')) continue;
    const wrap = document.createElement('div');
    wrap.className = 'tablewrap';
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }
}

function alignNumericHeaders(root) {
  for (const table of root.querySelectorAll('table.data')) {
    const headers = [...table.querySelectorAll(':scope > thead > tr:last-child > th')];
    const rows = [...table.querySelectorAll(':scope > tbody > tr')];
    if (!headers.length || !rows.length) continue;
    const bodies = rows.filter(row => row.children.length === headers.length);
    if (!bodies.length) continue;
    headers.forEach((header, index) => {
      const numeric = bodies.filter(row => row.children[index]?.classList.contains('r')).length;
      if (numeric > bodies.length / 2) header.classList.add('r');
    });
  }
}

function decorateResponsiveTables(root) {
  for (const table of root.querySelectorAll('table.data')) {
    if (table.querySelector('input, select, textarea')) continue;
    if (table.querySelector('th[colspan], th[rowspan], td[colspan], td[rowspan]')) continue;

    const headers = [...table.querySelectorAll(':scope > thead > tr:last-child > th')];
    const rows = [...table.querySelectorAll(':scope > tbody > tr')];
    if (!headers.length || !rows.length) continue;
    if (rows.some(row => row.querySelectorAll(':scope > td').length !== headers.length)) continue;

    table.classList.add('mobile-cards');
    const labels = headers.map(header => header.textContent.trim());
    for (const row of rows) {
      [...row.querySelectorAll(':scope > td')].forEach((cell, index) => {
        cell.dataset.label = labels[index];
      });
    }
  }
}

function render() {
  republicSnapshotCache = null;
  document.title = t('appTitle');
  applyTheme();
  const root = $('#app');
  if (standaloneLeafletMap) {
    standaloneLeafletCamera = standaloneLeafletMap.destroy();
    standaloneLeafletMap = null;
  }
  destroyTimeSeriesCharts();
  pendingChartMounts = [];

  // Preserve focus/cursor/typed-but-unparsed text across the full re-render
  // triggered by every keystroke (see numInput's 'input' listener) — without
  // this, the input a user is typing into loses focus after each character.
  const focused = document.activeElement;
  let focusPath = null, rawValue = null, selStart = null, selEnd = null;
  if (focused && root.contains(focused) && focused !== root) {
    focusPath = [];
    for (let node = focused; node && node !== root; node = node.parentNode) {
      focusPath.unshift(Array.prototype.indexOf.call(node.parentNode.children, node));
    }
    if ('value' in focused) rawValue = focused.value;
    try { selStart = focused.selectionStart; selEnd = focused.selectionEnd; } catch { /* not a text-selectable input */ }
  }

  root.replaceChildren(renderHeader(), ...(SHOW_EVIDENCE_RAIL ? [renderEvidenceRail()] : []), ...(IS_BETA ? [renderBetaBanner()] : []),
    ...(state.viewingSharedLink ? [renderSharedLinkBanner()] : []),
    ...(state.planningPersistenceError ? [el('p', { class: 'neg', role: 'alert' }, state.planningPersistenceError)] : []),
    ...(state.observationPersistenceError ? [el('p', { class: 'neg', role: 'alert' }, state.observationPersistenceError)] : []),
    ...[renderImportActivity()].filter(Boolean),
    renderTabs(), renderCurrentTab());
  wrapOverflowingTables(root);
  alignNumericHeaders(root);
  decorateResponsiveTables(root);
  for (const mount of pendingChartMounts) mount();
  pendingChartMounts = [];

  if (focusPath) {
    let node = root;
    for (const i of focusPath) node = node?.children[i];
    if (node && typeof node.focus === 'function') {
      if (rawValue !== null && 'value' in node) node.value = rawValue;
      node.focus();
      if (selStart != null) {
        try { node.setSelectionRange(selStart, selEnd); } catch { /* not a text-selectable input */ }
      }
    }
  }
}

function renderBetaBanner() {
  return el('div', { class: 'betabanner' },
    el('strong', {}, 'β ' + t('betaTitle')), ' ', t('betaHint'),
    el('a', { href: '../' }, t('stableVersion')));
}

function renderEvidenceRail() {
  const mode = RUNTIME_CONFIG.mode;
  const stateKind = surfaceState({
    mode, runtimeStatus: state.runtimeStatus, hasSave: !!state.saveImport, hasModel: !!state.liveModel,
  });
  const items = [
    ['live', 'LIVE', mode === 'addon'
      ? (state.runtimeStatus === 'ready' ? t('evidenceConnected')
        : state.runtimeStatus === 'resynchronizing' ? t('evidenceResync') : t('evidenceWaiting'))
      : t('evidenceAddonOnly')],
    ['save', 'SAVE', state.saveImport ? t('evidenceSaveLoaded') : t('evidenceSaveWaiting')],
    ['plan', 'PLAN', t('evidencePlanLocal')],
    ['derived', 'DERIVED', t('evidenceDerived')],
    ['unavailable', 'UNAVAILABLE', stateKind === 'resynchronizing'
      ? t('evidenceResync') : stateKind === 'error' ? (state.runtimeReason || t('evidenceUnavailable'))
        : t('evidenceUnavailable')],
  ];
  return el('aside', { class: `evidence-rail rail-${stateKind}`, 'aria-label': t('evidenceRail') },
    el('div', { class: 'rail-mode' },
      el('span', { class: 'rail-kicker' }, t('modeLabel')),
      el('strong', {}, mode === 'addon' ? t('modeAddon') : t('modeHosted')),
      el('span', { class: 'rail-state' }, t(`surface.${stateKind}`))),
    el('div', { class: 'rail-stamps' }, ...items.map(([tone, label, detail]) => el('div', {
      class: `evidence-stamp stamp-${tone}`,
      'data-evidence': tone,
      title: detail,
    }, el('strong', {}, label), el('span', {}, detail)))),
    mode === 'addon' && state.runtimeGeneration != null
      ? el('span', { class: 'rail-generation' }, `${t('generation')} ${state.runtimeGeneration}`) : null);
}

function renderSharedLinkBanner() {
  return el('div', { class: 'sharedlinkbanner' },
    el('span', {}, '\u26AD ' + t('viewingSharedLink')),
    hasPlanningBackup ? el('button', {
      onclick: async () => {
        try {
          const backup = await planningBackupStore.load();
          if (backup) {
            state.planning = backup;
            await planningStore.save(backup);
            hasPlanningBackup = false;
            state.viewingSharedLink = false;
            update();
          }
        } catch (error) {
          state.planningPersistenceError = `Planning backup could not be restored: ${error.message}`;
          update();
        }
      },
    }, t('restoreMyPlan')) : null,
    el('button', { onclick: () => { state.viewingSharedLink = false; update(); } }, '✕'));
}

// A reading preference, so it is applied to the document root rather than
// threaded through the render: the stylesheet keys off the attribute, and
// clearing it hands the decision back to the operating system.
function applyTheme() {
  const preference = isTheme(state.theme) ? state.theme : 'auto';
  const attribute = themeAttribute(preference);
  if (attribute) document.documentElement.setAttribute('data-theme', attribute);
  else document.documentElement.removeAttribute('data-theme');
}

const THEME_ICONS = { auto: '\u25D0', light: '\u25CB', dark: '\u25CF' };

function renderHeader() {
  const themeSwitch = () => {
    const preference = isTheme(state.theme) ? state.theme : 'auto';
    const resolved = resolveTheme(preference,
      globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    return el('button', {
      class: 'themeswitch',
      title: t(`theme_${preference}`),
      'aria-label': t(`theme_${preference}`),
      'data-theme-preference': preference,
      'data-theme-resolved': resolved,
      onclick: () => { state.theme = nextTheme(preference); update(); },
    }, THEME_ICONS[preference] ?? THEME_ICONS.auto);
  };
  const languageSwitch = () => el('div', { class: 'langswitch' },
    themeSwitch(),
    ...['de', 'en'].map(language => el('button', {
      class: state.lang === language ? 'active' : '',
      onclick: () => { state.lang = language; update(); },
    }, language.toUpperCase())));
  if (HAS_SAVE_WORKSPACE && state.tab === 'home') {
    return el('header', { class: 'compact-header' },
      el('div', { class: 'product-identity' },
        el('h1', {}, t('appTitle')),
        el('p', { class: 'product-subtitle' }, t('appSubtitle'))), languageSwitch());
  }
  const showEconomyControls = ['prices', 'production', 'chain', 'analysis', 'analysisRUB', 'analysisUSD', 'vehicleprod'].includes(state.tab);
  const file = el('input', {
    type: 'file', accept: '.ini,.txt', id: 'fileInput', class: 'hidden',
    onchange: e => e.target.files[0] && handleFile(e.target.files[0]),
  });
  const drop = el('label', { class: 'dropzone', for: 'fileInput' },
    file, '\u25A4 ', state.statsName ? `${state.statsName} (${state.statsRecords?.length ?? 0} ${t('record')})` : t('dropHint'));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  const sourceSel = selectInput(
    [['default', t('sourceDefault')],
     ...(state.statsRecords?.length ? [['stats', `${t('sourceStats')} (${state.statsName})`]] : []),
     ['decade', t('sourceDecade')]],
    state.priceSource, v => { state.priceSource = v; });

  const extras = [];
  if (state.priceSource === 'stats' && state.statsRecords?.length) {
    const maxChoices = 400;
    const step = Math.max(1, Math.ceil(state.statsRecords.length / maxChoices));
    const indices = new Set(state.statsRecords.map((_, index) => index % step === 0 ? index : null)
      .filter(Number.isInteger));
    indices.add(state.recordIndex);
    indices.add(state.statsRecords.length - 1);
    const recordChoices = [...indices].sort((a, b) => a - b).map(index => {
      const record = state.statsRecords[index];
      return [index, `${record.year ?? '?'} / ${record.day ?? '?'}${record.current ? ` (${t('current')})` : ''}`];
    });
    extras.push(el('label', {}, t('record') + ' ',
      selectInput(recordChoices,
        state.recordIndex, v => { state.recordIndex = parseInt(v); })));
  }
  if (state.priceSource === 'decade') {
    extras.push(el('label', {}, t('decade') + ' ',
      selectInput(Object.keys(DATA.decades), state.decade, v => { state.decade = parseInt(v); })));
  }

  return el('header', {},
    el('div', { class: 'product-identity' },
      el('h1', {}, t('appTitle')),
      el('p', { class: 'product-subtitle' }, t('appSubtitle'))),
    el('div', { class: 'controls' },
      ...(showEconomyControls ? [drop, el('label', {}, t('priceSource') + ' ', sourceSel), ...extras] : []),
      el('label', {}, t('currency') + ' ',
        selectInput([['RUB', '₽ Rubel'], ['USD', '$ Dollar']], state.currency,
          v => { state.currency = v; state.plan.settings.currency = v; })),
      showEconomyControls && DATA.prodSets.game ? el('label', {
        title: DATA.dataVersion ? `${t('datasetRelease')}: ${DATA.dataVersion.datasetRelease}. ${t('datasetBuildUnknown')}` : '',
      }, t('dataset') + ' ',
        selectInput([['game', t('datasetGame')], ['sheet', t('datasetSheet')]],
          state.dataset, v => { state.dataset = v; }),
        DATA.dataVersion ? el('small', { class: 'dataset-version' }, DATA.dataVersion.datasetRelease) : null) : null,
      el('div', { class: 'sharebtns' },
        el('button', {
      title: t('exportPlan'), 'aria-label': t('exportPlan'), onclick: exportPlan,
    }, '\u2193'),
        el('label', { title: t('importPlan'), class: 'iconbtn' }, '\u2191',
          el('input', { type: 'file', accept: '.json', class: 'hidden',
            onchange: e => e.target.files[0] && importPlan(e.target.files[0]) })),
        el('button', {
      title: t('shareLink'), 'aria-label': t('shareLink'), onclick: shareLink,
    }, '\u26AD')),
      renderSaveSlots(),
      languageSwitch()));
}

// Named save slots (localStorage, separate from the one auto-saved plan):
// type a name and save, or pick an existing one from the list to load/delete.
function renderSaveSlots() {
  const names = namedSnapshotNames;
  return el('div', { class: 'saveslots' },
    el('input', {
      type: 'text', class: 'saveslotname', placeholder: t('saveSlotName'),
      value: state.saveSlotName, list: 'save-slot-names',
      onchange: e => { state.saveSlotName = e.target.value; },
    }),
    el('datalist', { id: 'save-slot-names' }, ...names.map(n => el('option', { value: n }))),
    el('button', {
      title: t('saveSlotSave'),
      onclick: async () => {
        const name = state.saveSlotName.trim();
        if (!name) return;
        if (names.includes(name) && !confirm(t('saveSlotOverwriteConfirm'))) return;
        const result = await saveNamedState(name);
        if (!result.ok) return alert(t('saveSlotWriteFailed') + ': ' + result.error.message);
        state.snapshotNotice = t('saveSlotSaved').replace('{name}', name);
        update();
      },
    }, '\u25A3'),
    el('button', {
      title: t('saveSlotLoad'),
      onclick: async () => {
        const name = state.saveSlotName.trim();
        if (!name || !names.includes(name)) return;
        if (confirm(t('saveSlotLoadConfirm'))) {
          if (!await loadNamedState(name)) return;
          state.snapshotNotice = t('saveSlotLoaded').replace('{name}', name);
          update();
        }
      },
    }, '\u25B7'),
    names.length ? el('button', {
      class: 'danger', title: t('saveSlotDelete'),
      onclick: async () => {
        const name = state.saveSlotName.trim();
        if (name && names.includes(name) && confirm(t('saveSlotDeleteConfirm'))) {
          const result = await deleteNamedState(name);
          if (!result.ok) return alert(t('saveSlotWriteFailed') + ': ' + result.error.message);
          state.snapshotNotice = t('saveSlotDeleted').replace('{name}', name);
          state.saveSlotName = '';
          update();
        }
      },
    }, '\u2715') : null,
    state.snapshotNotice ? el('span', { class: 'saveslotnotice' }, state.snapshotNotice) : null);
}

function renderQuickTools() {
  const activeTab = state.tab === 'analysis'
    ? (state.currency === 'USD' ? 'analysisUSD' : 'analysisRUB') : state.tab;
  const availableTools = TABS.filter(id => !LEGACY_TAB_ALIASES.has(id));
  const selectedRows = quickToolTabs.length
    ? quickToolTabs.map((id, index) => el('div', { class: 'quick-tools-row' },
      el('span', {}, t(TAB_LABEL_KEYS[id])),
      el('span', { class: 'quick-tools-row-actions' },
        el('button', {
          class: 'iconbtn', type: 'button', title: t('quickToolsMoveUp'), 'aria-label': t('quickToolsMoveUp'),
          disabled: index === 0, onclick: () => moveQuickTool(id, -1),
        }, '↑'),
        el('button', {
          class: 'iconbtn', type: 'button', title: t('quickToolsMoveDown'), 'aria-label': t('quickToolsMoveDown'),
          disabled: index === quickToolTabs.length - 1, onclick: () => moveQuickTool(id, 1),
        }, '↓'),
        el('button', {
          class: 'iconbtn', type: 'button', title: t('quickToolsRemove'), 'aria-label': t('quickToolsRemove'),
          onclick: () => toggleQuickTool(id),
        }, '×'))))
    : el('p', { class: 'hint' }, t('quickToolsEmpty'));
  const toolOptions = availableTools.map(id => {
    const selected = quickToolTabs.includes(id);
    return el('button', {
      class: `quick-tool-option${selected ? ' selected' : ''}`,
      type: 'button', 'aria-pressed': selected,
      onclick: () => toggleQuickTool(id),
    }, selected ? '✓ ' : '+ ', t(TAB_LABEL_KEYS[id]));
  });
  return el('div', { class: 'quick-tools-bar', 'aria-label': t('quickTools') },
    el('div', { class: 'quick-tools-heading' },
      el('span', { class: 'section-kicker' }, t('quickTools')),
      el('span', { class: 'quick-tools-hint' }, t('quickToolsHint'))),
    el('div', { class: 'quick-tools-body' },
      el('div', { class: 'quick-tools-links', role: 'navigation', 'aria-label': t('quickTools') },
        ...quickToolTabs.map(id => el('button', {
          class: `quick-tool${activeTab === id ? ' active' : ''}`,
          type: 'button', 'aria-current': activeTab === id ? 'page' : false,
          onclick: () => { state.tab = id; update(); },
        }, t(TAB_LABEL_KEYS[id]))),
        el('button', {
          class: 'quick-tools-manage', type: 'button', 'aria-expanded': quickToolsEditorOpen,
          onclick: () => { quickToolsEditorOpen = !quickToolsEditorOpen; update(); },
        }, t('quickToolsManage'))),
      quickToolsEditorOpen ? el('div', { class: 'quick-tools-editor' },
        el('div', { class: 'quick-tools-selected' },
          el('h3', {}, t('quickToolsSelected')),
          ...selectedRows),
        el('div', { class: 'quick-tools-available' },
          el('h3', {}, t('quickToolsAvailable')),
          ...toolOptions)) : null));
}

function renderTabs() {
  const labels = TAB_LABEL_KEYS;
  const activeTab = state.tab === 'analysis'
    ? (state.currency === 'USD' ? 'analysisUSD' : 'analysisRUB') : state.tab;
  const button = id => el('button', {
    class: activeTab === id ? 'active' : '',
    'aria-current': activeTab === id ? 'page' : false,
    onclick: () => { state.tab = id; update(); },
  }, t(labels[id]));
  const activeSection = sectionForTab(state.tab);
  const sectionButton = section => el('button', {
    class: `section-tab ${activeSection === section.id ? 'active' : ''}`,
    role: 'tab',
    'aria-selected': activeSection === section.id,
    'aria-pressed': activeSection === section.id,
    onclick: () => { state.tab = section.defaultTab; update(); },
  }, t(section.labelKey));
  const sectionTabs = tabsForSection(activeSection).filter(id => TABS.includes(id));
  return el('nav', { class: 'command-navigation', 'aria-label': t('commandNavigation') },
    el('div', { class: 'section-tabs', role: 'tablist' }, ...COMMAND_SECTIONS.map(sectionButton)),
    el('div', { class: 'context-tabs', role: 'navigation', 'aria-label': t('sectionNavigation') },
      ...sectionTabs.map(button)),
    renderQuickTools(),
    el('details', {
      class: 'more-nav',
      ontoggle: event => {
        const details = event.currentTarget;
        if (details.open) {
          openMoreToolsDetails = details;
          requestAnimationFrame(() => positionMoreToolsMenu(details));
        } else {
          if (openMoreToolsDetails === details) openMoreToolsDetails = null;
          resetMoreToolsMenu(details);
        }
      },
    },
      el('summary', {}, t('moreTools')),
      el('div', { class: 'more-nav-menu' }, ...TABS.filter(id => !sectionTabs.includes(id) && !LEGACY_TAB_ALIASES.has(id)).map(button))));
}

function renderCurrentTab() {
  switch (state.tab) {
    case 'home': return renderHome();
    case 'prices': return renderPrices();
    case 'priceedit': return renderPriceEdit();
    case 'cities': return renderCities();
    case 'history': return renderRepublicHistory();
    case 'credits': return renderCredits();
    case 'construction': return renderConstruction();
    case 'logistics': return renderLogistics();
    // 'environment' is the tab these two were split out of. Kept as an alias
    // so a restored session or a shared link from before the split still lands.
    case 'environment':
    case 'pollution': return renderEnvironment('pollution');
    case 'crime': return renderEnvironment('crime');
    case 'alerts': return renderAlertsTab();
    case 'snapshots': return renderSnapshots();
    case 'production': return renderProduction();
    case 'chain': return renderChain();
    case 'analysisRUB': return renderAnalysis('RUB');
    case 'analysisUSD': return renderAnalysis('USD');
    case 'analysis': return renderAnalysis(state.currency);
    case 'vehicleprod': return renderVehicleProduction();
    case 'city': return renderCity();
    case 'republic': return RUNTIME_CONFIG.mode === 'addon'
      ? el('div', { class: 'republic-workspace' }, renderLiveBrief(), renderRepublic())
      : renderRepublic();
    case 'map': return renderMapTab();
    case 'saveimport': return renderSaveImport();
    case 'trains': return renderTrains();
    case 'research': return renderResearch();
    case 'advanced': return renderAdvanced();
    case 'help': return renderHelp();
    default: return el('div');
  }
}

function evidenceValue(value, fallback = null) {
  return value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : fallback;
}

function renderLiveBrief() {
  const model = state.liveModel;
  const current = surfaceState({ mode: 'addon', runtimeStatus: state.runtimeStatus, hasModel: !!model });
  if (current === 'loading') {
    return el('section', { class: 'live-brief surface-loading', 'aria-live': 'polite' },
      el('span', { class: 'section-kicker' }, t('dispatchBoard')),
      el('h2', {}, t('liveRepublicBrief')),
      el('p', { class: 'hint' }, t('liveLoading')));
  }
  if (current === 'resynchronizing') {
    return el('section', { class: 'live-brief surface-resync', role: 'status', 'aria-live': 'polite' },
      el('span', { class: 'section-kicker' }, t('dispatchBoard')),
      el('h2', {}, t('liveRepublicBrief')),
      el('p', { class: 'warn' }, t('liveResynchronizing')),
      state.runtimeReason ? el('p', { class: 'hint' }, state.runtimeReason) : null);
  }
  if (current === 'error') {
    return el('section', { class: 'live-brief surface-error', role: 'alert' },
      el('span', { class: 'section-kicker' }, t('dispatchBoard')),
      el('h2', {}, t('liveRepublicBrief')),
      el('p', { class: 'neg' }, state.runtimeReason || t('liveUnavailable')));
  }
  if (!model) return null;
  const metric = (label, value, evidence) => el('div', { class: 'brief-row' },
    el('span', {}, label), el('strong', {}, value ?? '—'),
    el('span', { class: `evidence-badge ${evidence?.completeness === 'unavailable' ? 'missing' : 'exact'}` },
      evidence?.source === 'live-sdk' ? 'LIVE SDK' : 'UNAVAILABLE'));
  const population = evidenceValue(model.republic?.population);
  const date = model.gameDate ? `${model.gameDate.year} · ${model.gameDate.day}` : '—';
  return el('section', { class: 'live-brief surface-ready' },
    el('div', { class: 'brief-heading' },
      el('div', {}, el('span', { class: 'section-kicker' }, t('dispatchBoard')), el('h2', {}, t('liveRepublicBrief'))),
      el('span', { class: 'mode-stamp live' }, 'LIVE SDK')),
    el('p', { class: 'hint' }, `${t('lastObserved')} ${model.observedAt || '—'}${model.generation != null ? ` · ${t('generation')} ${model.generation}` : ''}`),
    el('div', { class: 'brief-ledger' },
      metric(t('gameDate'), date, model.sources?.lifecycle),
      metric(t('population'), population == null ? null : fmt(population, 0), model.republic?.population?.evidence),
      metric(t('cities'), model.areas?.items?.length, model.areas?.evidence),
      metric(t('buildings'), model.buildings?.items?.length, model.buildings?.evidence),
      metric(t('resources'), model.resources?.items?.length, model.resources?.evidence),
      metric(t('transport'), model.transport?.items?.length, model.transport?.evidence)),
    el('p', { class: 'hint' }, t('liveBriefHint')));
}

// ---------------------------------------------------------------- prices tab
function priceCellClass(table, key, prices, base) {
  const val = prices[table]?.[key];
  const sign = val > 0 ? ' pos' : val < 0 ? ' neg' : '';
  return base + sign
    + (state.overrides[`${table}.${key}`] !== undefined ? ' overridden' : '')
    + (prices.fallback?.[`${table}.${key}`] ? ' fallback' : '');
}

function priceFallbackTitle(table, key, prices) {
  if (!prices.fallback?.[`${table}.${key}`]) return {};
  return { title: state.lang === 'de'
    ? 'Nicht in deiner stats.ini enthalten (ältere Spielversion) – Beispielwert von 1979'
    : 'Not present in your stats.ini (older game version) – sample value from 1979' };
}

function priceCell(table, key, prices) {
  const val = prices[table]?.[key];
  return el('input', {
    type: 'number', step: 'any',
    class: priceCellClass(table, key, prices, 'num price'),
    ...priceFallbackTitle(table, key, prices),
    value: val !== undefined ? Math.round(val * 1000) / 1000 : '',
    onchange: e => {
      const v = parseFloat(e.target.value);
      if (Number.isNaN(v)) delete state.overrides[`${table}.${key}`];
      else state.overrides[`${table}.${key}`] = v;
      update();
    },
  });
}

// Observe reports prices; it never accepts one. The same cell without an input.
function priceReadCell(table, key, prices) {
  const val = prices[table]?.[key];
  return el('span', {
    class: priceCellClass(table, key, prices, 'price-read'),
    ...priceFallbackTitle(table, key, prices),
  }, val !== undefined ? fmt(Math.round(val * 1000) / 1000, 3) : '—');
}

// Both price surfaces share one table: Observe renders it read-only, Plan
// renders the same rows as editable overrides.
function priceTable({ editable }) {
  const prices = currentPrices();
  // Resource-implied exchange rates, for converting currency via trade
  // instead of just moving cash - each is a different trade direction:
  // ratioToRUB: buy abroad with $, sell at home for ₽ (higher = better $→₽).
  // ratioToUSD: buy at home with ₽, sell abroad for $ (higher = better ₽→$).
  const ratioToRUB = key => {
    const buyUSD = prices.purchaseUSD?.[key];
    const sellRUB = prices.sellRUB?.[key];
    return buyUSD > 0 && sellRUB != null ? sellRUB / buyUSD : null;
  };
  const ratioToUSD = key => {
    const buyRUB = prices.purchaseRUB?.[key];
    const sellUSD = prices.sellUSD?.[key];
    return buyRUB > 0 && sellUSD != null ? sellUSD / buyRUB : null;
  };
  const withRatio = DATA.resources.filter(r => r.key !== 'workers')
    .map(r => ({ r, ratioRUB: ratioToRUB(r.key), ratioUSD: ratioToUSD(r.key) }));

  const { col, dir } = state.priceSort;
  withRatio.sort((a, b) => {
    if (col === 'ratioRUB' || col === 'ratioUSD') {
      const va = a[col] ?? -Infinity, vb = b[col] ?? -Infinity;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    }
    return rname(a.r).localeCompare(rname(b.r)) * dir;
  });

  const th = (id, label, title) => el('th', {
    class: 'clickable' + (col === id ? ' sorted' : ''),
    onclick: () => { state.priceSort = { col: id, dir: col === id ? -dir : 1 }; update(); },
    ...(title ? { title } : {}),
  }, label + (col === id ? (dir > 0 ? ' ↑' : ' ↓') : ''));

  const cell = editable ? priceCell : priceReadCell;
  const table = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      th('name', t('resource')),
      el('th', {}, t('sellRUB')), el('th', {}, t('buyRUB')),
      el('th', {}, t('sellUSD')), el('th', {}, t('buyUSD')),
      th('ratioRUB', t('conversionRatioToRUB'), t('conversionRatioToRUBHint')),
      th('ratioUSD', t('conversionRatioToUSD'), t('conversionRatioToUSDHint')))),
    el('tbody', {}, withRatio.map(({ r, ratioRUB, ratioUSD }) => el('tr', {},
      el('td', { class: 'clickable', onclick: () => {
        state.historyKey = r.key;
        state.historyCompareKeys = (state.historyCompareKeys ?? []).filter(key => key !== r.key);
        update();
      } }, rname(r)),
      el('td', {}, cell('sellRUB', r.key, prices)),
      el('td', {}, cell('purchaseRUB', r.key, prices)),
      el('td', {}, cell('sellUSD', r.key, prices)),
      el('td', {}, cell('purchaseUSD', r.key, prices)),
      el('td', { class: 'r' }, ratioRUB != null ? fmt(ratioRUB, 2) : '—'),
      el('td', { class: 'r' }, ratioUSD != null ? fmt(ratioUSD, 2) : '—')))));

  return { prices, table };
}

// Observe: the observed price table and its history, with no way to type a
// hypothetical value into it.
function renderPriceScalars(prices, editable) {
  const fields = [
    ['workdayCostRUB', `${t('workday')} ₽`], ['workdayCostUSD', `${t('workday')} $`],
    ['deliveryCostRUB', `${t('delivery')} ₽`], ['deliveryCostUSD', `${t('delivery')} $`],
    ['imigrantCostRUB', `${t('imigrant')} ₽`], ['imigrantCostUSD', `${t('imigrant')} $`],
  ];
  return el('div', { class: `scalars ${editable ? 'scalars-editable' : 'scalars-readonly'}` },
    ...fields.map(([key, label]) => editable
      ? el('label', {}, label + ' ', el('input', {
        type: 'number', step: 'any', class: 'num',
        value: Math.round((prices[key] ?? 0) * 100) / 100,
        onchange: e => { state.overrides[key] = parseFloat(e.target.value) || 0; update(); },
      }))
      : el('div', { class: 'scalar' }, el('span', {}, label), el('strong', {}, fmt(prices[key], 2)))));
}

function renderWorkerCostSummary(prices, currency) {
  const residentCost = workerCostForType(prices, currency, 'resident');
  const guestCost = workerCostForType(prices, currency, 'guest');
  const amount = value => value == null ? '—' : `${fmt(value, 2)} ${currencySymbol(currency)}`;
  const costRow = (label, value, detail) => el('div', { class: 'worker-cost-item' },
    el('span', {}, label),
    el('strong', {}, amount(value)),
    el('small', { class: 'hint' }, detail));

  return el('div', { class: 'worker-cost-summary' },
    el('div', { class: 'worker-cost-summary-title' }, t('workerCostsPerWorkday')),
    el('div', { class: 'worker-cost-grid' },
      costRow(t('workerResidentCost'), residentCost,
        residentCost == null ? t('workerNoDirectCost') : t('workerNeedCost')),
      costRow(t('workerGuestCost'), guestCost, t('workerCost'))));
}

function renderPrices() {
  const { prices, table } = priceTable({ editable: false });
  return el('section', {},
    el('p', { class: 'hint' }, t('pricesObservedHint'), ' ',
      el('button', { class: 'linklike', onclick: () => { state.tab = 'priceedit'; update(); } },
        t('editPricesLink'))),
    renderPriceScalars(prices, false),
    renderWorkerCostSummary(prices, state.currency),
    el('div', { class: 'columns' },
      el('div', { class: 'pricetablecol' }, table),
      el('div', { class: 'pricehistorycol' }, renderHistory())));
}

// Plan: the same prices as hypotheses the user controls.
function renderPriceEdit() {
  const { prices, table } = priceTable({ editable: true });
  const scalars = renderPriceScalars(prices, true);

  const resetBtn = Object.keys(state.overrides).length
    ? el('button', { class: 'danger', onclick: () => { state.overrides = {}; update(); } }, t('reset'))
    : null;

  return el('section', {},
    returnToRepublicButton(),
    el('p', { class: 'hint' }, t('editHint'), ' ', resetBtn),
    scalars,
    el('div', { class: 'pricetablecol' }, table));
}

function renderHistory() {
  const box = el('div', { class: 'history' }, el('h3', {}, t('history')));
  if (!state.statsRecords || state.statsRecords.length < 2) {
    box.append(el('p', { class: 'hint' }, t('noHistory')));
    return box;
  }
  const primary = DATA.resources.find(resource => resource.key === state.historyKey) ?? DATA.resources[0];
  state.historyKey = primary.key;
  if (!Array.isArray(state.historyCompareKeys)) state.historyCompareKeys = [];
  state.historyCompareKeys = [...new Set(state.historyCompareKeys)]
    .filter(key => key !== primary.key && DATA.resources.some(resource => resource.key === key))
    .slice(0, 2);
  const selectedResources = [primary, ...state.historyCompareKeys.map(key =>
    DATA.resources.find(resource => resource.key === key)).filter(Boolean)];
  const addOptions = DATA.resources.filter(resource =>
    !selectedResources.some(selected => selected.key === resource.key));
  const controls = el('div', { class: 'history-controls' },
    el('span', { class: 'history-primary' }, rname(primary)),
    ...selectedResources.slice(1).map(resource => el('button', {
      class: 'history-chip',
      title: t('removeComparison'),
      onclick: () => {
        state.historyCompareKeys = state.historyCompareKeys.filter(key => key !== resource.key);
        update();
      },
    }, `${rname(resource)} ×`)),
    selectedResources.length < 3 && addOptions.length ? selectInput(
      [['', t('compareResource')], ...addOptions.map(resource => [resource.key, rname(resource)])],
      '', key => {
        if (key) state.historyCompareKeys = [...state.historyCompareKeys, key].slice(0, 2);
      }, { class: 'history-compare-select' }) : null,
    el('label', { class: 'history-log-toggle' }, el('input', {
      type: 'checkbox', checked: !!state.historyLogScale,
      onchange: event => { state.historyLogScale = event.target.checked; update(); },
    }), ' ', t('logScale')));
  box.append(controls);
  // Only plot the currently selected currency's sell/buy - RUB and USD
  // values live on incomparable scales, so mixing all four on one shared
  // axis produced a meaningless min/max and a mislabeled (single-currency)
  // axis.
  const tables = state.currency === 'USD' ? ['sellUSD', 'purchaseUSD'] : ['sellRUB', 'purchaseRUB'];
  const recs = state.statsRecords;
  const labelFor = tab => t(tab === 'sellRUB' ? 'sellRUB'
    : tab === 'purchaseRUB' ? 'buyRUB' : tab === 'sellUSD' ? 'sellUSD' : 'buyUSD');
  const series = selectedResources.flatMap((resource, resourceIndex) => tables.map((tab, tableIndex) => ({
    tab,
    colorSlot: resourceIndex * 2 + tableIndex + 1,
    label: `${rname(resource)} · ${labelFor(tab)}`,
    points: seriesFromRecords(recs, record => record[tab]?.[resource.key])
      .filter(point => !state.historyLogScale || point.y > 0),
  }))).filter(item => item.points.length);
  if (!series.length) { box.append(el('p', {}, '—')); return box; }
  const host = el('div', {});
  box.append(host);
  pendingChartMounts.push(() => mountTimeSeriesChart(host, {
    title: `${t('history')}: ${selectedResources.map(rname).join(', ')}`,
    series,
    group: 'price-history',
    logScale: !!state.historyLogScale,
    formatValue: value => fmt(value, 2),
    valueSuffix: ` ${cur()}`,
    resetZoomLabel: t('resetChartZoom'),
    summaryTemplate: t('chartSeriesSummary'),
    height: 250,
  }));
  return box;
}

// ---------------------------------------------------------------- production tab
function renderProduction() {
  const eco = economy();
  const s = state.plan.settings;
  s.currency = state.currency;
  const productionScopeIds = new Set(state.plan.rows.map(row => row.scopeId).filter(Number.isInteger));
  const scopeOptions = [['all', t('allAreas')], ['unassigned', t('unassigned')],
    ...plannerScopes().filter(scope => scope.production || productionScopeIds.has(scope.id))
      .map(scope => [String(scope.id), scope.name])];
  if (!scopeOptions.some(([value]) => value === String(state.productionScope))) state.productionScope = 'all';
  const visibleRows = state.plan.rows.map((row, index) => ({ row, index })).filter(({ row }) =>
    state.productionScope === 'all'
      || (state.productionScope === 'unassigned' ? row.scopeId == null : String(row.scopeId) === String(state.productionScope)));
  const result = evaluatePlan(
    visibleRows.map(({ row }) => ({ ...row, building: prodBuildings().find(b => b.de === row.name) })),
    state.plan.fields, s, eco);

  const workspaceBar = el('div', { class: 'workspace-bar' },
    returnToRepublicButton(),
    el('label', { class: 'workspace-context' }, el('span', {}, t('productionArea')),
      selectInput(scopeOptions, String(state.productionScope), v => { state.productionScope = v; })),
    el('label', { class: 'workspace-context compact' }, el('span', {}, t('timeUnit')),
      selectInput([['day', t('day')], ['month', t('month')], ['year', t('year')]], s.timeUnit, v => s.timeUnit = v)),
    el('div', { class: 'workspace-actions' },
      el('button', { onclick: () => { state.productionDetails = !state.productionDetails; update(); } },
        t(state.productionDetails ? 'hideEconomicDetails' : 'showEconomicDetails'))));

  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('productivity') + ' ', pctInput(s.productivity, v => s.productivity = v)),
    el('label', {}, t('seasons') + ' ', el('input', {
      type: 'checkbox', checked: s.seasons, onchange: e => { s.seasons = e.target.checked; update(); } })),
    el('label', {}, t('calendarFlow') + ' ', numInput(s.calendarFlow, v => s.calendarFlow = v || 1, { step: 0.1, min: 0 })),
    el('label', {}, t('fertilizer') + ' ', numInput(s.fertilizer, v => s.fertilizer = v || 1, { step: 0.1, min: 0 })));

  const groups = [...new Set(prodBuildings().map(b => b.group[state.lang]))];

  const bufferDetails = (row, building) => {
    if (!building) return null;
    const stores = productionBufferStatus(row, building, s, name => eco.keyForName(name))
      .map(store => ({ ...store, resources: store.resources.filter(item => Number.isFinite(item.dailyRate)) }))
      .filter(store => store.resources.length);
    const throughput = row.firstOutputThroughput;
    if (!stores.length && !throughput) return null;
    const bottleneckCount = stores.reduce((sum, store) => sum
      + store.resources.filter(item => store.inputFlag
        && Number.isFinite(item.daysRemaining) && item.daysRemaining < 1).length
      + (store.outputFlag && Number.isFinite(store.daysUntilFull) && store.daysUntilFull < 1 ? 1 : 0), 0);
    const resourceLabel = key => {
      const resource = DATA.resources.find(item => item.key === key);
      return resource ? rname(resource) : key;
    };
    return el('details', { class: 'sourceid buffer-details' },
      el('summary', {}, stores.length ? `${t('liveProductionBuffers')} (${stores.length})` : t('liveFactoryThroughput'),
        bottleneckCount ? el('span', { class: 'evidence-badge missing' },
          `${bottleneckCount} ${t('nearBufferLimit')}`) : null),
      el('p', { class: 'subline' }, `${t('exactSavedInventory')} · ${t('configuredRateEstimate')}`),
      ...stores.map(store => el('div', { class: 'buffer-store' },
        el('div', {}, `${t(store.inputFlag ? 'inputBuffer' : 'outputBuffer')}: `
          + `${fmt(store.amount, 2)} / ${fmt(store.capacity, 2)} ${t('savedUnits')}`,
        Number.isFinite(store.fillRatio)
          ? el('span', { class: 'evidence-badge exact' }, `${fmt(store.fillRatio * 100, 1)} %`) : null),
        el('ul', {}, ...store.resources.map(item => el('li', {},
          `${resourceLabel(item.resource)}: ${fmt(item.amount, 2)}`,
          store.inputFlag && Number.isFinite(item.daysRemaining)
            ? ` · ${fmt(item.daysRemaining, 2)} ${t('daysRemaining')}` : '',
          store.outputFlag && Number.isFinite(store.daysUntilFull)
            ? ` · ${fmt(store.daysUntilFull, 2)} ${t('daysUntilFull')}` : ''))))),
      throughput ? el('div', { class: 'buffer-store' },
        el('div', {}, t('liveFactoryThroughput'), el('span', { class: 'evidence-badge exact' }, t('exact'))),
        el('ul', {},
          el('li', {}, `${t('firstDeclaredOutput')}: ${resourceLabel(throughput.resource)}`),
          el('li', {}, `${t('previousNormalizedDay')}: ${fmt(throughput.previousQuantity, 4)}`),
          el('li', {}, `${t('currentPartialDay')}: ${fmt(throughput.partialQuantity, 4)}`),
          el('li', {}, `${t('normalizedDayProgress')}: ${fmt(throughput.dayProgressMin * 100, 1)}–${fmt(throughput.dayProgressMax * 100, 1)} %`),
          el('li', {}, `${t('currentFirstOutputRate')}: ${fmt(throughput.currentRate, 4)}`))) : null);
  };

  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('area')), el('th', {}, t('group')), el('th', {}, t('building')), el('th', {}, t('count')),
      el('th', {}, t('quality')), el('th', {}, t('workers')),
      el('th', {}, `${t('profit')} ${cur()}`),
      ...(state.productionDetails ? [el('th', {}, t('profitPerWorker')),
        el('th', {}, t('amortDays')), el('th', {}, `${t('income')} ${cur()}`),
        el('th', {}, `${t('expenses')} ${cur()}`), el('th', {}, `${t('buildCost')} ${cur()}`)] : []),
      el('th', {}))),
    el('tbody', {}, visibleRows.map(({ row, index: rowIndex }, visibleIndex) => {
      const b = prodBuildings().find(x => x.de === row.name);
      const res = result.rows[visibleIndex] ?? {};
      const selectedGroup = groups.includes(row.group) ? row.group : (b?.group?.[state.lang] ?? row.group);
      const groupSel = selectInput([t('none'), ...groups], selectedGroup ?? t('none'),
        v => { row.group = v; row.name = null; });
      const inGroup = prodBuildings().filter(x => x.group[state.lang] === selectedGroup);
      const bSel = selectInput(
        [[', ', t('none')], ...inGroup.map(x => [x.de, bname(x)])],
        row.name ?? ', ', v => { row.name = v === ', ' ? null : v; });
      const isMine = b && (b.usesQuality || QUALITY_BUILDINGS_DE.has(b.de));
      const areaName = plannerScopeName(row.scopeId);
      const observed = Array.isArray(row.observedBuildingIndices);
      const buildingCell = observed ? el('div', {}, bSel,
        el('div', { class: 'sourceid' },
          `${t('currentWorkers')}: ${fmt(row.currentWorkers ?? 0, 0)} · `
          + `${t('configuredWorkers')}: ${fmt(row.configuredWorkers ?? 0, 0)}`
          + (row.configuredWorkersHighEducation
            ? ` + ${fmt(row.configuredWorkersHighEducation, 0)} ${t('highEducationWorkers')}` : ''),
          el('span', { class: `evidence-badge ${(row.constructionProgress ?? 1) < 1 ? 'missing' : 'exact'}` },
            (row.constructionProgress ?? 1) < 1
              ? `${t('underConstruction')} ${fmt(row.constructionProgress * 100, 0)} %` : t('exact'))),
        planningAuthorityBadge(b), bufferDetails(row, b)) : el('div', {}, bSel, planningAuthorityBadge(b));
      return el('tr', {},
        el('td', {}, areaName), el('td', {}, groupSel), el('td', {}, buildingCell),
        el('td', {}, numInput(row.count, v => row.count = v, { min: 0, step: 1 })),
        el('td', { title: row.qualityEstimated ? 'Estimated mine quality.' : observed ? 'Exact saved mine quality.' : '' },
          isMine ? pctInput(row.quality ?? 0.5, v => { row.quality = v; row.qualityEstimated = false; }) : '—'),
        el('td', { class: 'r' }, b ? fmt(res.workers ?? b.workers * row.count, 0) : '—'),
        el('td', { class: 'r ' + ((res.profit ?? 0) < 0 ? 'neg' : 'pos') }, fmt(res.profit)),
        ...(state.productionDetails ? [
          el('td', { class: 'r ' + ((res.profitPerWorker ?? 0) < 0 ? 'neg' : 'pos') }, fmt(res.profitPerWorker)),
          el('td', { class: 'r' }, fmt(res.amortDays, 1)),
          el('td', { class: 'r' }, fmt(res.income)), el('td', { class: 'r' }, fmt(res.expenses)),
          el('td', { class: 'r' }, fmt(res.buildCost, 0)),
        ] : []),
        el('td', {}, el('button', { class: 'danger', onclick: () => { state.plan.rows.splice(rowIndex, 1); update(); } }, '✕')));
    })));

  const addBtn = el('button', {
    onclick: () => {
      const scopeId = /^\d+$/.test(String(state.productionScope)) ? Number(state.productionScope) : null;
      state.plan.rows.push({ group: groups[0], name: null, count: 1, quality: 0.5, scopeId });
      update();
    },
  }, t('addRow'));

  const f = state.plan.fields;
  const fieldsBox = el('div', { class: 'settingsbar' },
    el('strong', {}, t('fields') + ': '),
    el('label', {}, t('fieldSmall') + ' ', numInput(f.small, v => f.small = v, { min: 0, step: 1 })),
    el('label', {}, t('fieldMedium') + ' ', numInput(f.medium, v => f.medium = v, { min: 0, step: 1 })),
    el('label', {}, t('fieldLarge') + ' ', numInput(f.large, v => f.large = v, { min: 0, step: 1 })),
    el('span', { class: 'hint' },
      `${t('hectares')}: ${fmt(f.small * FIELD_SIZES.small + f.medium * FIELD_SIZES.medium + f.large * FIELD_SIZES.large, 2)}`
      + (result.fieldPlants ? ` → ${t('plantsFromFields')}: ${fmt(result.fieldPlants, 1)} t` : '')));

  // balance table
  const balRows = [...result.balance.values()].filter(e => e.produced || e.consumed);
  const balance = el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, t('resource')), el('th', {}, t('produced')),
      el('th', {}, t('consumed')), el('th', {}, t('net')))),
    el('tbody', {}, balRows.map(e => {
      const res = DATA.resources.find(r => r.de === e.name || r.en === e.name);
      const net = e.produced - e.consumed;
      return el('tr', {},
        el('td', {}, res ? rname(res) : e.name),
        el('td', { class: 'r' }, fmt(e.produced, 1)),
        el('td', { class: 'r' }, fmt(e.consumed, 1)),
        el('td', { class: 'r ' + (net < 0 ? 'neg' : 'pos') }, fmt(net, 1)));
    })));

  const totals = el('div', { class: 'totalsbox' },
    el('h3', {}, t('totals') + ` (${t(s.timeUnit)})`),
    kv(t('profit') + ` ${cur()}`, fmt(result.totalProfit), result.totalProfit < 0 ? 'neg' : 'pos'),
    kv(t('workersPerShift'), fmt(result.workersPerShift, 0)),
    kv(t('workersTotal'), fmt(result.workersPerShift * 3, 0)),
    kv(t('powerUse'), fmt(result.totalPower, 1)),
    kv(t('maxWatt'), fmt(result.totalMaxKW, 0)),
    kv(t('waterUse'), fmt(result.totalWater, 1)),
    kv(t('wasteOut'), fmt(result.totalWaste, 1)),
    kv(t('buildCost') + ` ${cur()}`, fmt(result.totalBuildCost, 0)));

  const assumptions = el('details', {
    class: 'planner-assumptions secondary-section',
    open: plannerAssumptionsOpen,
    ontoggle: event => { plannerAssumptionsOpen = event.currentTarget.open; },
  },
    el('summary', {}, t('planAssumptions')), settings, fieldsBox);
  const planEditor = el('div', { class: 'planner-main' },
    el('div', { class: 'planner-table' },
      visibleRows.length ? el('div', { class: 'tablewrap' }, tbl) : el('p', { class: 'empty-state' }, t('emptyProductionArea')),
      addBtn), totals);

  return el('section', {}, workspaceBar, assumptions, planEditor,
    el('div', {}, el('h3', {}, t('balance')), el('div', { class: 'tablewrap' }, balance)));
}

function kv(k, v, cls = '') {
  return el('div', { class: 'kv' }, el('span', {}, k), el('strong', { class: cls }, v));
}

// Editor for a resource's mine-deposit quality tiers. Every tier but the
// last is a fixed building count at that quality; the last tier's count is
// 0 for "auto-fill whatever demand the earlier tiers left over" or a real
// number to say the deposit list is exhaustive (see solveChain's opts doc).
function tierEditor(ch, key) {
  const tiers = ch.qualityTiers[key] ?? (ch.qualityTiers[key] = [{ quality: 0.5, count: 0 }]);
  return el('div', { class: 'tierlist' },
    ...tiers.map((tier, i) => {
      const isLast = i === tiers.length - 1;
      return el('div', { class: 'tier' },
        pctInput(tier.quality ?? 0.5, v => { tier.quality = v; }),
        numInput(tier.count ?? 0, v => { tier.count = v; }, { min: 0, step: 1 }),
        isLast ? el('span', { class: 'hint' }, '(' + t('chainAutoFill') + ')') : null,
        tiers.length > 1
          ? el('button', { class: 'danger', onclick: () => { tiers.splice(i, 1); update(); } }, '✕')
          : null);
    }),
    el('button', { onclick: () => { tiers.push({ quality: 0.5, count: 0 }); update(); } }, t('addTier')));
}

// ---------------------------------------------------------------- chain tab
function renderChain() {
  const eco = economy();
  const buildings = prodBuildings();
  const chains = chainPlans();
  const ch = chains[state.activeChain];
  ch.qualityTiers ??= {};
  const index = producersByResource(buildings, eco);
  const producible = [...index.keys()];
  if (!producible.includes(ch.goal)) ch.goal = producible.includes('steel') ? 'steel' : producible[0];

  // Seed a default tier for every mine-producible resource before solving,
  // so the first render already reflects the 50% default instead of
  // solveChain's own quality-1 fallback (which only applies when a key has
  // no tier at all) - otherwise the shown count would briefly assume 100%
  // while the tier input already shows 50%, until the next interaction.
  for (const [key, producers] of index) {
    if (!ch.qualityTiers[key] && producers.some(p => QUALITY_BUILDINGS_DE.has(p.building.de))) {
      ch.qualityTiers[key] = [{ quality: 0.5, count: 0 }];
    }
  }

  const resLabel = key => {
    const r = DATA.resources.find(x => x.key === key);
    return r ? rname(r) : key;
  };

  const chainTabs = el('div', { class: 'citytabs' },
    ...chains.map((c, i) => el('button', {
      class: i === state.activeChain ? 'active' : '',
      onclick: () => { state.activeChain = i; update(); },
    }, c.name || resLabel(c.goal))),
    el('button', { onclick: () => { chains.push(defaultChainPlan()); state.activeChain = chains.length - 1; update(); } }, t('addChainPlan')),
    chains.length > 1 ? el('button', {
      class: 'danger',
      onclick: () => { chains.splice(state.activeChain, 1); state.activeChain = 0; update(); },
    }, t('removeChainPlan')) : null,
    el('button', {
      onclick: () => { chains[state.activeChain] = { ...defaultChainPlan(), name: ch.name }; update(); },
    }, t('resetChainPlan')));

  const result = solveChain(ch.goal, ch.amount, buildings, eco, {
    productivity: state.plan.settings.productivity,
    currency: state.currency,
    imports: new Set(ch.imports),
    producerChoice: new Map(Object.entries(ch.producerChoice)),
    includeUtilities: ch.includeUtilities,
    qualityTiers: new Map(Object.entries(ch.qualityTiers)),
  });

  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('chainPlanName') + ' ', el('input', {
      type: 'text', placeholder: resLabel(ch.goal), value: ch.name ?? '',
      onchange: e => { ch.name = e.target.value || null; update(); } })),
    el('label', {}, t('chainGoal') + ' ',
      selectInput(producible.map(k => [k, resLabel(k)]).sort((a, b) => a[1].localeCompare(b[1])),
        ch.goal, v => { ch.goal = v; })),
    el('label', {}, t('chainAmount') + ' ', numInput(ch.amount, v => ch.amount = v, { min: 0, step: 1 })),
    el('label', {}, t('productivity') + ' ',
      pctInput(state.plan.settings.productivity, v => state.plan.settings.productivity = v)),
    el('label', {}, t('chainUtilities') + ' ', el('input', {
      type: 'checkbox', checked: ch.includeUtilities,
      onchange: e => { ch.includeUtilities = e.target.checked; update(); } })));

  // "How much can this town run?" rather than "what does this rate cost?".
  //
  // The workforce is typed by default, because a republic that has not been
  // founded yet has no areas to pick from and planning one is the commonest
  // reason to be here at all. A loaded save adds its areas as choices; it never
  // becomes the only way in.
  const chainOptions = {
    productivity: state.plan.settings.productivity,
    currency: state.currency,
    imports: new Set(ch.imports),
    producerChoice: new Map(Object.entries(ch.producerChoice)),
    includeUtilities: ch.includeUtilities,
    qualityTiers: new Map(Object.entries(ch.qualityTiers)),
  };
  const workforceSources = [['manual', t('workforceTyped')],
    ...cityPlanningAreas().map((area, index) => [`area:${index}`, area.name || `${t('area')} ${index + 1}`])];
  const chosenSource = workforceSources.some(([id]) => id === ch.workforceSource)
    ? ch.workforceSource : 'manual';
  const areaSurplus = index => {
    const area = cityPlanningAreas()[index];
    if (!area) return null;
    const evaluated = evaluateCity({ ...area, rows: (area.rows ?? []).map(row => ({
      ...row,
      building: row.importedBuilding ?? (Number.isInteger(row.buildingIndex)
        ? DATA.cityBuildings[row.buildingIndex]
        : DATA.cityBuildings.find(b => b.de === row.name)),
    })), workshops: resolveCityWorkshopRows(area.workshops, prodBuildings()) }, eco);
    return evaluated.workerSurplus;
  };
  const budget = chosenSource === 'manual'
    ? (ch.workforceBudget ?? 100)
    : areaSurplus(Number(chosenSource.slice('area:'.length)));
  const fit = largestChainForWorkforce({
    goalKey: ch.goal, workerBudget: budget, buildings, eco,
    opts: chainOptions, solve: solveChain,
  });
  const workforceBox = el('div', { class: 'settingsbar workforce-plan' },
    el('strong', {}, t('workforcePlanTitle')),
    el('label', {}, t('workforceFrom') + ' ',
      selectInput(workforceSources, chosenSource, v => { ch.workforceSource = v; })),
    chosenSource === 'manual'
      ? el('label', {}, t('workers') + ' ',
        numInput(ch.workforceBudget ?? 100, v => { ch.workforceBudget = v; }, { min: 0, step: 10 }))
      : el('span', { class: 'hint' },
        `${t('workers')}: ${Number.isFinite(budget) ? fmt(budget, 1) : '—'}`),
    fit.reason === 'fits' ? el('span', {},
      el('strong', {}, `${fmt(fit.amount, 1)} t / ${t('day')}`),
      el('span', { class: 'hint' },
        ` · ${fmt(fit.workers, 0)} / ${fmt(fit.budget, 0)} ${t('workers')}`
        + ` · ${fmt(fit.spare, 1)} ${t('workforceSpare')}`)) : null,
    fit.reason === 'smallest-chain-too-big' ? el('span', { class: 'hint warn' },
      t('workforceTooSmall').replace('{workers}', fmt(fit.smallestChainWorkers, 0))) : null,
    fit.reason === 'no-workers' ? el('span', { class: 'hint' }, t('workforceNone')) : null,
    fit.reason === 'unsolvable' ? el('span', { class: 'hint warn' }, t('chainDiverged')) : null,
    fit.reason === 'fits' ? el('button', {
      class: 'primary',
      onclick: () => { ch.amount = Number(fit.amount.toFixed(2)); update(); },
    }, t('workforceApply')) : null);

  if (result.diverged) {
    return el('section', {},
      el('p', { class: 'hint' }, t('chainHint')),
      chainTabs, settings, workforceBox,
      el('p', { class: 'neg' }, t('chainDiverged')));
  }

  const rows = [...result.rows].sort((a, b) => (a.imported ? 1 : 0) - (b.imported ? 1 : 0) || b.demand - a.demand);
  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('resource')), el('th', {}, 't / ' + t('day')),
      el('th', {}, t('chainSource')), el('th', {}, t('building')), el('th', {}, t('quality')),
      el('th', {}, t('count')), el('th', {}, t('workers')),
      el('th', {}, `${t('buildCost')} ${cur()}`), el('th', {}, `${t('chainImportCost')} ${cur()}`))),
    el('tbody', {}, rows.map(row => {
      const importable = row.imported ? row.importable : true;
      const srcToggle = importable && row.key !== ch.goal
        ? selectInput([['produce', t('chainProduce')], ['import', t('chainImport')]],
            row.imported ? 'import' : 'produce',
            v => {
              ch.imports = v === 'import'
                ? [...new Set([...ch.imports, row.key])]
                : ch.imports.filter(k => k !== row.key);
            })
        : el('span', { class: 'hint' }, row.imported ? t('chainImport') : t('chainProduce'));
      const producerSel = !row.imported && row.producers?.length > 1
        ? selectInput(row.producers.map(de => {
            const b = buildings.find(x => x.de === de);
            return [de, b ? bname(b) : de];
          }), row.building.de, v => { ch.producerChoice[row.key] = v; })
        : el('span', {}, row.imported ? '—' : bname(row.building));
      const isMine = !row.imported && QUALITY_BUILDINGS_DE.has(row.building.de);
      return el('tr', {},
        el('td', {}, resLabel(row.key)),
        el('td', { class: 'r' }, fmt(row.demand, 1)),
        el('td', {}, srcToggle),
        el('td', {}, row.imported ? producerSel : el('div', {}, producerSel,
          planningAuthorityBadge(row.building,
            ch.includeUtilities ? ['economy', 'utilities', 'construction'] : ['economy', 'construction']))),
        el('td', {}, isMine ? tierEditor(ch, row.key) : '—'),
        el('td', { class: 'r' },
          row.imported ? '—' : `${fmt(row.countCeil, 0)} (${fmt(row.count, 2)})`,
          isMine && row.output < row.demand - 1e-6
            ? el('div', { class: 'hint neg' }, `${fmt(row.output, 1)} / ${fmt(row.demand, 1)}`)
            : null),
        // Actual workers the target demand needs vs. the full capacity of the
        // buildings you'll actually construct (count is fractional, but you
        // can only build whole buildings, so countCeil is the real headcount).
        row.imported ? el('td', { class: 'r' }, '—') : workersNeededCell({
          optimal: row.building.workers * row.count, max: row.building.workers * row.countCeil,
        }),
        el('td', { class: 'r' }, row.imported ? '—' : fmt(eco.buildCost(row.building, state.currency) * row.countCeil, 0)),
        el('td', { class: 'r ' + (row.imported ? 'warn' : '') }, row.imported ? fmt(row.importCost, 0) : '—'));
    })));

  const byp = [...result.byproducts.entries()].filter(([, v]) => v > 0.05);
  const totals = el('div', { class: 'totalsbox' },
    el('h3', {}, t('totals') + ` (${t('day')})`),
    kv(t('chainRevenue') + ` ${cur()}`, fmt(result.totals.revenue, 0), 'pos'),
    kv(t('chainImportBill') + ` ${cur()}`, fmt(result.totals.importCost, 0), result.totals.importCost ? 'warn' : ''),
    kv(t('workersTotal'), fmt(result.totals.workers * 3, 0)),
    kv(t('workersPerShift'), fmt(result.totals.workers, 0)),
    kv(t('powerUse'), fmt(result.totals.power, 1)),
    kv(t('maxWatt'), fmt(result.totals.maxKW, 0)),
    kv(t('waterUse'), fmt(result.totals.water, 1)),
    kv(`${t('buildCost')} ${cur()}`, fmt(result.totals.buildCost, 0)));

  const bypBox = el('div', { class: 'totalsbox' },
    el('h3', {}, t('chainByproducts')),
    byp.length
      ? byp.map(([k, v]) => kv(resLabel(k), fmt(v, 1) + ' t'))
      : el('p', { class: 'hint' }, '—'));

  return el('section', {},
    el('p', { class: 'hint' }, t('chainHint')),
    chainTabs, settings, workforceBox, tbl,
    el('div', { class: 'columns' }, totals, bypBox));
}

// ---------------------------------------------------------------- analysis tab
const PRICE_ANALYSIS_EXCLUDED_GROUPS = new Set([
  'Wasser & Abwasser', 'Water & Wastewater', 'Heizwerk', 'Heating plant',
]);

function isPriceAnalysisBuildingEligible(building) {
  const groups = [building.group?.de, building.group?.en].filter(Boolean);
  if (groups.some(group => PRICE_ANALYSIS_EXCLUDED_GROUPS.has(group))) return false;
  const gameId = String(building.gameId ?? '').toLowerCase();
  if (gameId.includes('incinerator') || gameId === 'waste_treatment_plant') return false;
  const names = `${building.de ?? ''} ${building.en ?? ''}`.toLowerCase();
  return !/(müllbehandlungsanlage|müllverbrennung|waste treatment|waste incineration)/.test(names);
}

function renderAnalysis(currency = state.currency) {
  const prices = currentPrices();
  const workerType = state.analysisWorkerType === 'guest' ? 'guest' : 'resident';
  const costBasis = state.analysisCostBasis === 'opportunity' ? 'opportunity' : 'purchase';
  const measuredWorkerCost = workerCostForType(prices, currency, workerType);
  const workerCost = measuredWorkerCost ?? 0;
  const workerLabel = t(workerType === 'guest' ? 'workerGuest' : 'workerResident');
  const workerCostHint = workerType === 'guest'
    ? `${t('workerCost')}: ${fmt(workerCost, 2)} ${currencySymbol(currency)}`
    : measuredWorkerCost == null
      ? t('workerNoDirectCost')
      : `${t('workerNeedCost')}: ${fmt(workerCost, 2)} ${currencySymbol(currency)}`;
  const eco = economy();
  const eligibleBuildings = prodBuildings().filter(isPriceAnalysisBuildingEligible);
  const producedResources = new Map();
  for (const building of eligibleBuildings) {
    for (const resource of building.production ?? []) {
      const key = resource.de ?? resource.en;
      if (key && !producedResources.has(key)) producedResources.set(key, resource);
    }
  }
  const resourceOptions = [...producedResources.entries()]
    .sort(([, a], [, b]) => (a[state.lang] ?? a.de ?? a.en)
      .localeCompare(b[state.lang] ?? b.de ?? b.en, state.lang))
    .map(([key, resource]) => [key, resource[state.lang] ?? resource.de ?? resource.en]);
  if (state.analysisResource !== 'all' && !producedResources.has(state.analysisResource)) {
    state.analysisResource = 'all';
  }
  const rows = eligibleBuildings.filter(building => state.analysisResource === 'all'
    || building.production?.some(resource => (resource.de ?? resource.en) === state.analysisResource))
    .map(b => {
    const { income, expenses, profit } = eco.buildingProfit(b, currency, 1, 1, 1, costBasis);
    const buildCost = eco.buildCost(b, currency);
    return {
      b, income, expenses, profit,
      profitPerWorker: profitPerWorkerAfterLabor(profit, b.workers, workerCost),
      amortDays: profit > 0 ? buildCost / profit : Infinity,
      buildCost,
    };
  }).filter(r => {
    const q = state.analysisSearch.toLowerCase();
    return !q || r.b[state.lang].toLowerCase().includes(q) || r.b.group[state.lang].toLowerCase().includes(q);
  });

  const { col, dir } = state.analysisSort;
  rows.sort((a, b) => {
    const va = col === 'name' ? a.b[state.lang] : a[col];
    const vb = col === 'name' ? b.b[state.lang] : b[col];
    return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
  });

  const th = (id, label) => el('th', {
    class: 'clickable' + (col === id ? ' sorted' : ''),
    onclick: () => {
      state.analysisSort = { col: id, dir: col === id ? -dir : -1 };
      update();
    },
  }, label + (col === id ? (dir > 0 ? ' ↑' : ' ↓') : ''));

  const table = createVirtualTable({
    rows,
    columnCount: 9,
    className: 'data wide analysis-table',
    ariaLabel: currency === 'USD' ? t('tabAnalysisUSD') : t('tabAnalysisRUB'),
    rowHeight: 52,
    renderHead: () => el('thead', {}, el('tr', {},
      th('name', t('building')), el('th', {}, t('group')), el('th', {}, t('workers')),
      th('profit', `${t('profit')} ${currencySymbol(currency)}`),
      th('profitPerWorker', `${t('profitPerWorker')} (${workerLabel})`),
      th('amortDays', t('amortDays')), th('income', `${t('income')} ${currencySymbol(currency)}`),
      th('expenses', `${t('expenses')} ${currencySymbol(currency)}`), th('buildCost', `${t('buildCost')} ${currencySymbol(currency)}`))),
    renderRow: r => el('tr', {},
      el('td', {}, bname(r.b), planningAuthorityBadge(r.b, ['economy', 'construction'])),
      el('td', {}, r.b.group[state.lang]),
      el('td', { class: 'r' }, fmt(r.b.workers, 0)),
      el('td', { class: 'r ' + (r.profit < 0 ? 'neg' : 'pos') }, fmt(r.profit)),
      el('td', { class: 'r ' + (r.profitPerWorker < 0 ? 'neg' : 'pos') },
        fmt(r.profitPerWorker)),
      el('td', { class: 'r' }, fmt(r.amortDays, 1)),
      el('td', { class: 'r' }, fmt(r.income)),
      el('td', { class: 'r' }, fmt(r.expenses)),
      el('td', { class: 'r' }, fmt(r.buildCost, 0))),
  });

  return el('section', {},
    el('p', { class: 'hint' }, t('analysisHint')),
    renderPriceScalars(prices, false),
    renderWorkerCostSummary(prices, currency),
    el('div', { class: 'analysis-worker-mode' },
      el('label', {}, t('workerType'), selectInput(
        [['resident', t('workerResident')], ['guest', t('workerGuest')]],
        workerType,
        value => { state.analysisWorkerType = value; },
      )),
      el('span', { class: 'hint' }, workerCostHint),
      el('label', {}, t('costBasis'), selectInput(
        [['purchase', t('costBasisPurchase')], ['opportunity', t('costBasisOpportunity')]],
        costBasis,
        value => { state.analysisCostBasis = value; },
      )),
      el('span', { class: 'hint cost-basis-hint' },
        t(costBasis === 'purchase' ? 'costBasisPurchaseHint' : 'costBasisOpportunityHint'))),
    el('div', { class: 'analysis-filterbar' },
      el('label', {}, el('span', {}, t('producedResource')), selectInput(
        [['all', t('allProducedResources')], ...resourceOptions],
        state.analysisResource,
        value => { state.analysisResource = value; },
        { class: 'analysis-resource-select' },
      )),
      el('label', { class: 'analysis-search' }, el('span', {}, t('search')),
        el('input', {
          type: 'search', placeholder: t('searchPlaceholder'), value: state.analysisSearch,
          oninput: e => { state.analysisSearch = e.target.value; update(); },
        }))),
    table);
}

// ---------------------------------------------------------------- vehicle production tab
function renderVehicleProduction() {
  const plan = state.vehicleProduction ??= { productivity: 1, timeUnit: 'year', rows: [] };
  plan.recommendationGroup ??= 'road';
  plan.recommendationDecade ??= 'all';
  const eco = economy();
  const recipeWorkdays = vehicle => vehicleProductionRecipe(vehicle)
    .reduce((sum, [resource, amount]) => resource === 'workers' ? sum + amount : sum, 0);
  const available = DATA.vehicles
    .map((vehicle, index) => ({ vehicle, index }))
    .filter(({ vehicle }) => recipeWorkdays(vehicle) > 0);
  const finiteEnds = available
    .map(({ vehicle }) => vehicle.attrs.Bis)
    .filter(year => Number.isFinite(year) && year < 3000);
  const lastDecadeStart = Math.max(
    1900,
    finiteEnds.length ? Math.floor(Math.max(...finiteEnds) / 10) * 10 : 1900,
  );
  const recommendationDecades = [
    ['all', t('allDecades')],
    ...Array.from(
      { length: Math.floor((lastDecadeStart - 1900) / 10) + 1 },
      (_, index) => {
        const start = 1900 + index * 10;
        return [String(start), `${start}–${start + 10}`];
      },
    ),
  ];
  const selectedDecade = plan.recommendationDecade === 'all'
    ? null
    : Number(plan.recommendationDecade);
  const recommendationRange = Number.isFinite(selectedDecade)
    ? { start: selectedDecade, end: selectedDecade + 10 }
    : null;
  const types = [...new Set(available.map(({ vehicle }) => vehicle.attrs.Typ))]
    .sort((a, b) => a.localeCompare(b));
  if (!plan.rows.length && available.length) {
    const initial = available.find(({ vehicle }) => vehicle.attrs.Typ === 'Bus') ?? available[0];
    plan.rows.push({ type: initial.vehicle.attrs.Typ, vehicleIndex: initial.index, workers: 100 });
  }

  const vehicleLabel = vehicle => {
    const attrs = vehicle.attrs;
    const era = `${attrs.Von ?? '?'}–${typeof attrs.Bis === 'number' ? attrs.Bis : '∞'}`;
    return `${vehicle.name} — ${era} · ${fmt(recipeWorkdays(vehicle), 0)} ${t('workdaysShort')}`;
  };
  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('productivity') + ' ', pctInput(plan.productivity, v => plan.productivity = v)),
    el('label', {}, t('timeUnit') + ' ', selectInput(
      [['day', t('day')], ['month', t('month')], ['year', t('year')]],
      plan.timeUnit, v => plan.timeUnit = v)));

  const recommendations = recommendVehicleProduction(
    available.map(item => item.vehicle).filter(vehicle => vehicleProductionGroup(vehicle) === plan.recommendationGroup),
    { workers: 100, productivity: plan.productivity, timeUnit: plan.timeUnit, currency: state.currency },
    eco,
    5,
    recommendationRange,
  );
  const blueprintOwned = Array.isArray(state.saveImport?.blueprintOwned)
    ? state.saveImport.blueprintOwned : null;
  const blueprintCell = vehicle => {
    const quote = vehicleBlueprintQuote(vehicle, eco, blueprintOwned);
    if (quote.status === 'owned') {
      return el('span', {}, t('blueprintOwned'), ' ',
        el('span', { class: 'evidence-badge exact' }, 'stats.ini'));
    }
    if (quote.status === 'family-unknown') {
      return el('span', { class: 'hint warn', title: t('blueprintFamilyUnknownHint') },
        t('blueprintFamilyUnknown'));
    }
    if (quote.status !== 'standard' || !Number.isFinite(quote.cost)) return el('span', {}, '—');
    const native = evaluateVehicleProduction(vehicle, {
      workers: 1, productivity: 1, timeUnit: 'day', currency: quote.currency,
    }, eco);
    const profitPerUnit = native.salePrice - native.materialCostPerUnit;
    const paybackUnits = profitPerUnit > 0 ? quote.cost / profitPerUnit : null;
    return el('span', {},
      `${fmt(quote.cost, 0)} ${quote.currency === 'USD' ? '$' : '₽'}`,
      paybackUnits != null ? el('span', { class: 'subline' },
        `${fmt(paybackUnits, 1)} ${t('unitsToRepay')}`) : null,
      el('span', { class: 'evidence-badge derived' }, t('standardBlueprint')));
  };
  const recommendationRows = recommendations.length ? recommendations.map((item, rank) => {
    const source = available.find(candidate => candidate.vehicle === item.vehicle);
    return el('tr', {},
      el('td', { class: 'r' }, rank + 1),
      el('td', {}, item.vehicle.name),
      el('td', {}, item.vehicle.attrs.Typ ?? '—'),
      el('td', {}, item.vehicle.attrs.Bauland ?? '—'),
      el('td', { class: 'r' }, fmt(item.result.salePrice, 0)),
      el('td', { class: 'r' }, fmt(item.result.materialCostPerUnit, 0)),
      el('td', { class: 'r pos' }, fmt(item.result.profitPerWorker, 1)),
      el('td', { class: 'r' }, blueprintCell(item.vehicle)),
      el('td', {}, el('button', {
        title: t('addVehicle'),
        onclick: () => {
          if (source) plan.rows.push({ type: source.vehicle.attrs.Typ, vehicleIndex: source.index, workers: 100 });
          update();
        },
      }, '+')));
  }) : [el('tr', {}, el('td', { colSpan: 9, class: 'hint' }, t('noVehicleRecommendations')))];
  const recommendationTable = el('div', { class: 'tablewrap recommendations' },
    el('table', { class: 'data wide' },
      el('thead', {}, el('tr', {},
        el('th', {}, '#'), el('th', {}, t('vehicle')), el('th', {}, t('vehicleType')),
        el('th', {}, t('origin')), el('th', {}, `${t('saleValue')} ${cur()}`),
        el('th', {}, `${t('materialPerUnit')} ${cur()}`),
        el('th', {}, `${t('profitPerWorker')} / ${t(plan.timeUnit)}`),
        el('th', {}, t('blueprintAndPayback')), el('th', {}))),
      el('tbody', {}, recommendationRows)));

  const results = [];
  const table = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('vehicleType')), el('th', {}, t('vehicle')), el('th', {}, t('workers')),
      el('th', {}, `${t('saleValue')} ${cur()}`), el('th', {}, t('workdaysShort')),
      el('th', {}, t('unitsPeriod')), el('th', {}, `${t('materialPerUnit')} ${cur()}`),
      el('th', {}, `${t('income')} ${cur()}`), el('th', {}, `${t('expenses')} ${cur()}`),
      el('th', {}, `${t('profit')} ${cur()}`), el('th', {}, t('profitPerWorker')), el('th', {}))),
    el('tbody', {}, plan.rows.map((row, rowIndex) => {
      const inType = available.filter(({ vehicle }) => vehicle.attrs.Typ === row.type);
      let selected = available.find(({ index }) => index === Number(row.vehicleIndex));
      if (!selected || selected.vehicle.attrs.Typ !== row.type) selected = inType[0];
      const vehicle = selected?.vehicle;
      if (selected && row.vehicleIndex !== selected.index) row.vehicleIndex = selected.index;
      const result = evaluateVehicleProduction(vehicle, {
        workers: row.workers, productivity: plan.productivity, timeUnit: plan.timeUnit,
        currency: state.currency,
      }, eco);
      results.push({ row, result });
      const materialLine = result.materials.map(([key, amount]) => {
        const resource = DATA.resources.find(item => item.key === key);
        return `${resource ? rname(resource) : key}: ${fmt(amount, 2)} t`;
      }).join(' · ');
      const recipeBadge = vehicle ? el('span', {
        class: `evidence-badge ${result.recipeSource === 'game-file' ? 'exact' : 'derived'}`,
      }, result.recipeSource === 'game-file' ? t('exactVehicleRecipe') : t('spreadsheetFallback')) : null;
      return el('tr', {},
        el('td', {}, selectInput(types.map(type => [type, type]), row.type, v => {
          row.type = v;
          row.vehicleIndex = available.find(({ vehicle: item }) => item.attrs.Typ === v)?.index ?? null;
        })),
        el('td', {}, selectInput(
          inType.map(({ vehicle: item, index }) => [String(index), vehicleLabel(item)]),
          String(selected?.index ?? ''), v => { row.vehicleIndex = Number(v); }),
          (materialLine || recipeBadge) ? el('div', { class: 'subline' }, materialLine, recipeBadge) : null),
        el('td', {}, numInput(row.workers, v => row.workers = v, { min: 0, step: 10 })),
        el('td', { class: 'r' }, fmt(result.salePrice, 0)),
        el('td', { class: 'r' }, vehicle ? fmt(result.workdays, 0) : '—'),
        el('td', { class: 'r' }, fmt(result.units, 2)),
        el('td', { class: 'r' }, fmt(result.materialCostPerUnit, 0)),
        el('td', { class: 'r' }, fmt(result.income, 0)),
        el('td', { class: 'r' }, fmt(result.expenses, 0)),
        el('td', { class: `r ${result.profit < 0 ? 'neg' : 'pos'}` }, fmt(result.profit, 0)),
        el('td', { class: `r ${result.profitPerWorker < 0 ? 'neg' : 'pos'}` }, fmt(result.profitPerWorker, 1)),
        el('td', {}, el('button', { class: 'danger', onclick: () => { plan.rows.splice(rowIndex, 1); update(); } }, '✕')));
    })));
  const totals = results.reduce((sum, item) => {
    sum.workers += item.row.workers || 0;
    sum.income += item.result.income;
    sum.expenses += item.result.expenses;
    sum.profit += item.result.profit;
    return sum;
  }, { workers: 0, income: 0, expenses: 0, profit: 0 });

  return el('section', {},
    el('p', { class: 'hint' }, t('vehicleProdHint')),
    settings,
    el('h3', {}, t('bestVehicles')),
    Array.isArray(blueprintOwned) ? el('p', { class: 'hint' },
      `${t('blueprintsOwnedInSave')}: ${fmt(blueprintOwned.length, 0)} · stats.ini`) : null,
    el('div', { class: 'settingsbar' },
      el('label', {}, t('vehicleGroup') + ' ', selectInput(
        [['road', t('roadVehicles')], ['trains', t('trains')], ['boats', t('boats')], ['aircraft', t('aircraft')]],
        plan.recommendationGroup, value => { plan.recommendationGroup = value; })),
      el('label', {}, t('recommendationDecade') + ' ', selectInput(
        recommendationDecades,
        plan.recommendationDecade,
        value => { plan.recommendationDecade = value; },
        { class: 'vehicle-recommendation-decade' },
      ))),
    recommendationTable,
    el('p', { class: 'hint' }, t('blueprintStandardHint')),
    el('div', { class: 'tablewrap' }, table),
    el('button', { onclick: () => {
      const initial = available[0];
      if (initial) plan.rows.push({ type: initial.vehicle.attrs.Typ, vehicleIndex: initial.index, workers: 100 });
      update();
    } }, t('addVehicle')),
    el('div', { class: 'totalsbox vehicletotals' },
      kv(t('workers'), fmt(totals.workers, 0)),
      kv(`${t('income')} ${cur()}`, fmt(totals.income, 0)),
      kv(`${t('expenses')} ${cur()}`, fmt(totals.expenses, 0)),
      kv(`${t('profit')} ${cur()}`, fmt(totals.profit, 0), totals.profit < 0 ? 'neg' : 'pos')));
}

// ---------------------------------------------------------------- save import beta
function uniqueSnapshotName(base) {
  const names = new Set(namedSnapshotNames);
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base} (${suffix})`)) suffix += 1;
  return `${base} (${suffix})`;
}

function refreshPollutionDiagnostics(saveImport) {
  if (!saveImport) return;
  saveImport.pollutionDiagnostics = summarizeOccupiedBuildingPollution(
    saveImport.residenceOccupancy, saveImport.pollutionLayer,
  );
}

function presentImportStatus(message, error = false) {
  state.importStatus = message;
  state.importStatusError = error;
  for (const item of document.querySelectorAll('[data-import-status]')) {
    item.className = error ? 'import-activity neg' : 'import-activity';
    const text = item.querySelector('[data-import-status-text]') ?? item;
    text.textContent = message;
  }
}

// Failures reported after the import hands the user to the republic tab are
// otherwise invisible: the status text lives only on the start and save-import
// tabs, and the retry button only on save-import.
let dismissedImportStatus = null;

function canRetryMapLayers() {
  return deferredMapRetryMatchesState()
    && Object.entries(deferredMapRetry.files).some(([key, file]) =>
      file && state.saveImport?.sourceStatus?.[key] === 'failed');
}

function renderImportActivity() {
  const banner = importBannerState({
    importBusy: state.importBusy,
    importStatus: state.importStatus,
    importStatusError: state.importStatusError,
    mapLayersFailed: canRetryMapLayers(),
    dismissedStatus: dismissedImportStatus,
  });
  if (!banner.visible) return null;
  return el('div', {
    class: banner.tone === 'error' ? 'import-activity neg'
      : banner.tone === 'warn' ? 'import-activity warn' : 'import-activity',
    role: banner.tone === 'busy' ? 'status' : 'alert',
    'aria-live': 'polite', 'data-import-status': '',
  },
  banner.spinner ? el('span', { class: 'import-spinner', 'aria-hidden': 'true' }) : null,
  el('span', { 'data-import-status-text': '' }, banner.message),
  banner.retry ? el('button', { onclick: retryDeferredMapLayers }, t('retryMapLayers')) : null,
  banner.dismissible ? el('button', {
    class: 'linklike', 'aria-label': t('dismiss'),
    onclick: () => { dismissedImportStatus = state.importStatus; update(); },
  }, t('dismiss')) : null);
}

async function handleLocalWorkshopDirectory(fileList) {
  const candidates = [...fileList].filter(file => file.name.toLowerCase() === 'building.ini'
    && file.size <= 2 * 1024 * 1024);
  state.localWorkshopStatus = t('workshopFolderReading').replace('{count}', fmt(candidates.length, 0));
  state.importStatusError = false;
  update();
  await new Promise(resolve => setTimeout(resolve, 0));
  const buildings = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const file = candidates[index];
    const identity = workshopBuildingIdentity(file.webkitRelativePath || file.name);
    if (!identity) continue;
    buildings.push(parseWorkshopBuildingIni(await file.text(), identity.id, identity));
    if (index && index % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  DATA.localWorkshopBuildings = buildings;
  state.localWorkshopStatus = buildings.length
    ? t('workshopFolderReady').replace('{count}', fmt(buildings.length, 0))
    : t('workshopFolderEmpty');
  update();
}

function renderLocalWorkshopPicker() {
  return el('details', { class: 'workshop-local-picker secondary-section' },
    el('summary', {}, t('localWorkshopTitle')),
    el('p', { class: 'hint' }, t('localWorkshopHint')),
    el('label', { class: 'importpicker' }, '\u25A6 ', t('chooseWorkshopFolder'),
      el('input', { type: 'file', class: 'hidden', webkitdirectory: '', multiple: '',
        onchange: event => event.target.files.length && handleLocalWorkshopDirectory(event.target.files) })),
    state.localWorkshopStatus ? el('p', { class: 'pos' }, state.localWorkshopStatus) : null);
}

function presentSaveAdapterProgress(event) {
  if (event.phase === 'reading-files') return presentImportStatus(t('importReadingFiles'));
  if (event.phase === 'parsing-core') return presentImportStatus(t('importParsingCore'));
  if (event.phase === 'resolving-workshop') return presentImportStatus(t('importResolvingWorkshop'));
  if (event.phase === 'building-projection') return presentImportStatus(t('importBuildingDashboard'));
  if (event.phase === 'worker-progress') {
    return presentImportStatus(`${t('importWorking')} · ${event.file} (${event.done}/${event.total})`);
  }
  if (event.phase === 'map-progress') {
    const phase = t(event.stage === 'reading' ? 'importReadingMapFile'
      : event.stage === 'parsing' ? 'importParsingMapFile' : 'importMapFileReady');
    return presentImportStatus(phase.replace('{file}', event.file));
  }
}

// Naming the layers and the save version turns "the map is broken" into a
// report that can be acted on: map layers are read at version-dependent
// offsets, so an older save can fail exactly here with everything else intact.
function mapLayerStatus(warnings) {
  const report = mapLayerReport({
    warnings,
    saveVersion: state.saveImport?.header?.saveVersion ?? null,
  });
  if (!report.failed) return t('importComplete');
  return `${t('importCompleteMapWarnings')}: ${report.summary}`;
}

async function handleSaveDirectory(fileList) {
  // Importing a large save runs for minutes. A second run started on top of a
  // live one interleaves with it: both write the same fixed backup snapshot,
  // so the rollback target can end up being a half-imported state.
  if (state.importBusy) return;
  deferredMapRetry = null;
  dismissedImportStatus = null;
  state.importStatus = t('importWorking');
  state.importStatusError = false;
  state.importBusy = true;
  update();
  await new Promise(resolve => setTimeout(resolve, 0));

  try {
    const custom = state.customBuildings.filter(building => building.customDataset === state.dataset);
    const result = await APP_RUNTIME.importSave(fileList, {
      rawBuildings: DATA.rawBuildings ?? [],
      productionBuildings: [],
      combineProductionBuildings: workshopProduction => applyBuildingOverrides(
        state.dataset === 'game'
          ? [...(DATA.prodSets.game ?? []), ...workshopProduction, ...custom]
          : [...(DATA.prodSets.sheet ?? []), ...custom],
        state.buildingOverrides,
        state.dataset,
      ),
      rawVehicles: DATA.rawVehicles ?? [],
      workshopIndex: DATA.workshopIndex,
      localWorkshopBuildings: DATA.localWorkshopBuildings ?? [],
      resources: DATA.resources ?? [],
      resolveWorkshop: orchestrateWorkshopCatalog,
      fetchCatalog: async path => {
        const url = new URL(`../data/workshop/${path}`, import.meta.url);
        url.searchParams.set('v', DATA_V);
        const response = await fetch(url);
        return response.ok ? response.json() : null;
      },
      translate: t,
      onProgress: presentSaveAdapterProgress,
    });
    const {
      sourceName, parsed, planning: imported, statsRecords, activeLoans, productivity,
      statsFile, deferredMapFiles, workshop,
    } = result;
    DATA.workshopBuildings = workshop.workshopBuildings;
    // A modded republic is mostly Workshop buildings, so without these the map
    // draws real outlines for the vanilla ones and fallback dots for the rest.
    // The catalogue carries each mod's own `building.bbox`, in the same format
    // and the same local coordinates the retail install uses, so they merge
    // straight in.
    DATA.buildingFootprints = mergedFootprints(DATA.buildingFootprints,
      workshop.workshopBuildings);
    DATA.workshopVehicles = workshop.workshopVehicles;
    DATA.workshopProduction = workshop.workshopProduction;

    presentImportStatus(t('importSavingSnapshot'));
    const backupName = t('beforeLatestImport');
    const backupResult = await saveNamedState(backupName);
    if (!backupResult.ok) throw backupResult.error;

    const next = createCompatibleState(createInitialState());
    for (const key of ['lang', 'currency', 'priceSource', 'decade', 'overrides', 'tuning']) {
      next[key] = cloneStateValue(state[key]);
    }
    next.dataset = 'game';
    // The stats slice is decided once and applied to both the fresh state and
    // the live state, so a save without stats.ini cannot inherit the previous
    // republic's price history.
    const statsState = statsStateForImport({
      statsRecords,
      activeLoans,
      statsFileName: statsFile?.name ?? null,
      previousPriceSource: next.priceSource,
    });
    next.priceSource = statsState.priceSource;
    if (statsRecords.length) next.overrides = {};
    const sameRepublic = isSameRepublic(state.saveImport, imported.metadata);
    if (sameRepublic && state.planning) {
      const rebound = rebindPlanningAssignments(
        state.planning, state.saveImport?.scopes, imported.metadata?.scopes,
      );
      next.planning = refreshPlanningFromObservation(rebound, result.model);
    } else if (state.planning?.edited) {
      // A different save replaces observations, never the user's hypothetical
      // city. Drop only the optional link to the old real city.
      next.planning = detachPlanningAssignments(
        refreshPlanningFromObservation(state.planning, result.model),
      );
    } else {
      const planningSeed = {
        ...next.planning,
        plan: {
          ...next.planning.plan,
          settings: { ...cloneStateValue(state.plan.settings), currency: state.currency, productivity },
          rows: imported.productionRows,
        },
        cities: imported.cities,
      };
      if (typeof parsed.header?.settings?.seasonsEnabled === 'boolean') {
        planningSeed.plan.settings.seasons = parsed.header.settings.seasonsEnabled;
      }
      next.planning = seedPlanningFromObservation(result.model, planningSeed);
    }
    next.saveImport = { ...imported.metadata, observedCities: imported.cities };
    next.tab = 'republic';

    const importName = uniqueSnapshotName(sourceName);
    replaceSharedState(next);
    mapFocusBuildingIndex = null;
    mapFocusScopeId = null;
    mapSelectedBuildingIndex = null;
    compactMapExpanded = false;
    compactMapOpen = false;
    state.statsRecords = statsState.statsRecords;
    state.statsName = statsState.statsName;
    state.recordIndex = statsState.recordIndex;
    state.activeLoans = statsState.activeLoans;
    await statsStore.save(statsState.statsRecords, { name: statsState.statsName })
      .catch(error => console.error('stats history was not saved:', error));
    state.saveSlotName = importName;
    const hasDeferredMap = Object.values(deferredMapFiles).some(Boolean);
    state.importStatus = hasDeferredMap ? t('importCoreComplete') : t('importComplete');
    state.importBusy = hasDeferredMap;
    state.importStatusError = false;
    const importResult = await saveNamedState(importName);
    if (!importResult.ok) {
      await loadNamedState(backupName);
      throw importResult.error;
    }
    state.snapshotNotice = t('saveSlotSaved').replace('{name}', importName);
    update();

    if (hasDeferredMap) {
      deferredMapRetry = { importName, sourceName, files: deferredMapFiles };
      try {
        const mapResult = await parseMapLayersInWorker(deferredMapRetry.files, {
          onProgress: presentSaveAdapterProgress,
          buildingHeights: buildingHeightSamples(state.saveImport?.observedBuildings ?? []),
        });
        if (state.saveSlotName !== importName || state.saveImport?.sourceName !== sourceName) return;
        Object.assign(state.saveImport, mapResult.parsed);
        refreshPollutionDiagnostics(state.saveImport);
        state.saveImport.sourceStatus = {
          ...(state.saveImport.sourceStatus ?? {}), ...mapResult.sourceStatus,
        };
        if (mapResult.warnings.length) {
          state.saveImport.warnings = [
            ...(state.saveImport.warnings ?? []),
            ...mapResult.warnings.map(warning => `${warning.file}: ${warning.message}`),
          ];
        }
        state.importStatus = mapLayerStatus(mapResult.warnings);
        state.importBusy = false;
        if (!mapResult.warnings.length) deferredMapRetry = null;
        const mapSaveResult = await saveNamedState(importName);
        if (!mapSaveResult.ok) throw mapSaveResult.error;
        update();
      } catch (error) {
        if (state.saveSlotName === importName) {
          state.importStatus = `${t('importCoreComplete')} ${t('importMapFailed')}: ${error.message}`;
          state.importStatusError = true;
          state.importBusy = false;
          update();
        }
      }
    }
  } catch (error) {
    state.importStatus = error instanceof SaveFolderValidationError
      ? t('importMissingFiles') : `${t('importFailed')}: ${error.message}`;
    state.importStatusError = true;
    state.importBusy = false;
    update();
  }
}
function deferredMapRetryMatchesState() {
  return deferredMapRetry && state.saveImport
    && state.saveSlotName === deferredMapRetry.importName
    && state.saveImport.sourceName === deferredMapRetry.sourceName;
}

async function retryDeferredMapLayers() {
  if (!deferredMapRetryMatchesState() || state.importBusy) return;
  const retry = deferredMapRetry;
  state.importBusy = true;
  state.importStatusError = false;
  // A retry that fails again is new information, not the dismissed message.
  dismissedImportStatus = null;
  state.importStatus = t('importRetryingMap');
  update();
  try {
    const mapResult = await parseMapLayersInWorker(retry.files, {
      onProgress: presentSaveAdapterProgress,
      buildingHeights: buildingHeightSamples(state.saveImport?.observedBuildings ?? []),
    });
    if (!deferredMapRetryMatchesState() || deferredMapRetry !== retry) return;
    Object.assign(state.saveImport, mapResult.parsed);
    refreshPollutionDiagnostics(state.saveImport);
    state.saveImport.sourceStatus = {
      ...(state.saveImport.sourceStatus ?? {}), ...mapResult.sourceStatus,
    };
    const mapKeys = Object.keys(retry.files);
    state.saveImport.warnings = [
      ...(state.saveImport.warnings ?? []).filter(warning =>
        !mapKeys.some(key => warning.startsWith(`${key}:`))),
      ...mapResult.warnings.map(warning => `${warning.file}: ${warning.message}`),
    ];
    state.importStatus = mapLayerStatus(mapResult.warnings);
    state.importBusy = false;
    state.importStatusError = false;
    const saved = await saveNamedState(retry.importName);
    if (!saved.ok) throw saved.error;
    if (!mapResult.warnings.length) deferredMapRetry = null;
    update();
  } catch (error) {
    if (deferredMapRetry === retry && deferredMapRetryMatchesState()) {
      state.importStatus = `${t('importMapFailed')}: ${error.message}`;
      state.importStatusError = true;
      state.importBusy = false;
      update();
    }
  }
}

function renderHome() {
  if (!HAS_SAVE_WORKSPACE) return el('section');
  const picker = el('label', { class: 'start-card primary-start importpicker' },
    el('span', { class: 'start-icon' }, '\u25B7'),
    el('strong', {}, t('openRepublicSave')),
    el('span', { class: 'hint' }, t('openRepublicSaveHint')),
    el('input', { type: 'file', class: 'hidden', webkitdirectory: '', multiple: '',
      ...(importControls({ importBusy: state.importBusy }).pickerDisabled ? { disabled: '' } : {}),
      onchange: event => event.target.files.length && handleSaveDirectory(event.target.files) }));
  const startManual = tab => {
    if (state.saveImport && !confirm(t('startManualConfirm'))) return;
    const preserved = Object.fromEntries(['lang', 'currency', 'tuning']
      .map(key => [key, cloneStateValue(state[key])]));
    replaceSharedState({ ...createInitialState(), ...preserved, tab });
    state.statsRecords = null;
    state.statsName = null;
    state.activeLoans = [];
    update();
  };
  const manual = el('div', { class: 'start-card' },
    el('span', { class: 'start-icon' }, '\u25F1'),
    el('strong', {}, t('startManualPlan')),
    el('span', { class: 'hint' }, t('startManualPlanHint')),
    el('div', { class: 'start-actions' },
      el('button', { onclick: () => startManual('city') }, t('tabCity')),
      el('button', { onclick: () => startManual('production') }, t('tabProduction'))));
  const current = state.saveImport ? el('div', { class: 'start-card current-republic' },
    el('span', { class: 'start-icon' }, '\u25A3'),
    el('strong', {}, state.saveImport.header?.title || state.saveImport.sourceName),
    el('span', { class: 'hint' }, `${fmt(state.saveImport.citizenCount ?? 0, 0)} ${t('importedCitizens')} · `
      + `${fmt(state.saveImport.buildingCount ?? 0, 0)} ${t('importedBuildings')}`),
    lastOpenedLabel(),
    el('button', { class: 'primary', onclick: () => { state.tab = 'republic'; update(); } }, t('continueRepublic'))) : null;
  const saved = namedSnapshotNames.length ? el('details', { class: 'recent-republics secondary-section' },
    el('summary', {}, `${t('savedSnapshots')} (${fmt(namedSnapshotNames.length, 0)})`),
    el('div', { class: 'snapshot-grid' }, ...namedSnapshotNames.map(name => el('button', {
      onclick: async () => {
        if (await loadNamedState(name)) {
          state.tab = state.saveImport ? 'republic' : 'production';
          state.saveSlotName = name;
          update();
        }
      },
    }, '\u25B7 ', name)))) : null;
  return el('section', { class: 'start-page' },
    el('div', { class: 'start-hero' }, el('h2', {}, t('startTitle')), el('p', {}, t('startHint'))),
    state.importStatus ? el('p', { class: state.importStatusError ? 'neg' : 'pos' }, state.importStatus) : null,
    el('div', { class: 'start-grid' }, current, picker, manual), renderLocalWorkshopPicker(), saved);
}

function renderSaveImport() {
  if (!HAS_SAVE_WORKSPACE) return el('section');
  const info = state.saveImport;
  const areaNames = new Map(plannerScopes().map(scope => [scope.id, scope.name]));
  const workshopPackageId = type => String(type ?? '').match(/^(\d{8,})\//)?.[1] ?? null;
  const hasUnmatchedWorkshopPackages = info?.unmatched?.some(item => workshopPackageId(item.type));
  const picker = el('label', { class: 'importpicker' },
    '\u25B7 ', t('chooseSaveFolder'),
    el('input', { type: 'file', class: 'hidden', webkitdirectory: '', multiple: '',
      ...(importControls({ importBusy: state.importBusy }).pickerDisabled ? { disabled: '' } : {}),
      onchange: event => event.target.files.length && handleSaveDirectory(event.target.files) }));
  const status = state.importStatus
    ? el('p', { class: state.importStatusError ? 'neg' : 'pos' }, state.importStatus) : null;
  const retryMap = deferredMapRetryMatchesState()
    && Object.entries(deferredMapRetry.files).some(([key, file]) =>
      file && info?.sourceStatus?.[key] === 'failed')
    ? el('button', {
      ...(importControls({ importBusy: state.importBusy }).retryDisabled ? { disabled: '' } : {}), onclick: retryDeferredMapLayers,
    }, t('retryMapLayers')) : null;
  const liveStats = el('details', { class: 'secondary-section', open: !!liveStatsDirectory },
    el('summary', {}, t('liveStatsTitle')),
    el('p', { class: 'hint' }, t(liveStatsSupported() ? 'liveStatsHint' : 'liveStatsUnsupported')),
    liveStatsSupported() ? el('div', { class: 'start-actions' },
      el('button', { onclick: startLiveStatsFollow }, liveStatsDirectory
        ? t('liveStatsChooseAnother') : t('liveStatsStart')),
      liveStatsDirectory ? el('button', { onclick: () => stopLiveStatsFollow() }, t('liveStatsStop')) : null) : null,
    state.liveStatsStatus ? el('p', { class: state.liveStatsStatusError ? 'neg' : 'pos' },
      state.liveStatsStatus) : null);
  const sourceFiles = {
    namepoints: 'namepoints.bin', buildings: 'buildings_game.bin', workers: 'workers.bin',
    vehicles: 'vehicles.bin', usedVehicles: 'usedveh.bin', lines: 'lines.bin',
    road: 'road.bin', rail: 'rail.bin', pedestrian: 'pedestrianway.bin',
    cableway: 'cableway.bin',
    powerHigh: 'electro_high.bin', powerLow: 'electro_low.bin',
    heightmap: 'heightmap.dds', pollution: 'pollution.bin',
    header: 'header.bin', research: 'research.bin', events: 'events.bin', stats: 'stats.ini',
    material: 'material.mtl',
  };
  const coverage = info?.sourceStatus ? el('div', { class: 'coverage-grid' },
    ...Object.entries(sourceFiles).map(([key, filename]) => {
      const sourceState = info.sourceStatus[key] ?? 'missing';
      return el('div', { class: 'coverage-item' }, el('code', {}, filename),
        el('span', { class: `evidence-badge ${sourceState}` }, t(sourceState)));
    })) : null;

  const audit = info ? el('div', { class: 'importaudit' },
    el('h3', {}, `${t('importedSnapshot')}: ${info.sourceName}`),
    info.header ? el('div', { class: 'totalsbox save-identity' },
      kv(t('saveTitle'), info.header.title || info.sourceName),
      kv(t('saveVersion'), fmt(info.header.saveVersion, 0)),
      kv(t('savePath'), info.header.savePath || '—')) : null,
    coverage ? el('div', {}, el('h3', {}, t('sourceCoverage')), coverage) : null,
    el('div', { class: 'columns' },
      el('div', { class: 'totalsbox' },
        kv(t('importedAt'), new Date(info.importedAt).toLocaleString()),
        kv(t('importedSettlements'), fmt(info.settlementCount, 0)),
        kv(t('importedCityAreas'), fmt(info.cityScopeCount ?? state.cities.length, 0)),
        kv(t('importedProductionAreas'), fmt(info.productionScopeCount ?? 0, 0)),
        info.emptySettlementCount ? kv(t('importedEmptySettlements'), fmt(info.emptySettlementCount, 0)) : null,
        kv(t('importedBuildings'), fmt(info.buildingCount, 0)),
        kv(t('importedStatsRecords'), info.statsRecordCount ? fmt(info.statsRecordCount, 0) : t('notFound')),
        Array.isArray(info.blueprintOwned)
          ? kv(t('importedBlueprints'), fmt(info.blueprintOwned.length, 0)) : null,
        kv(t('importedCitizens'), info.citizenSummary ? fmt(info.citizenCount, 0) : t('notFound')),
        kv(t('importedVehicles'), info.vehicleFileSummary ? fmt(info.vehicleFileSummary.recordCount, 0) : t('notFound')),
        kv(t('importedUsedVehicles'), info.usedVehicleFileSummary ? fmt(info.usedVehicleFileSummary.recordCount, 0) : t('notFound')),
        kv(t('importedVehicleLines'), info.lineFileSummary
          ? `${fmt(info.vehicleLines?.summary.lineCount ?? 0, 0)} · `
            + `${fmt(info.vehicleLines?.summary.vehicleReferenceCount ?? 0, 0)} ${t('assignedVehicleReferences')}`
          : t('notFound')),
        kv(t('importedDistributionOffices'),
          `${fmt(info.distributionOffices?.summary.officeCount ?? 0, 0)} · `
          + `${fmt(info.distributionOffices?.summary.targetCount ?? 0, 0)} ${t('configuredTargets')}`),
        info.citizenSummary ? kv(t('unassignedCitizens'), fmt(info.citizenSummary.unassigned, 0)) : null,
        info.citizenSummary ? kv(t('populatedScopes'), fmt(info.citizenSummary.populatedScopeCount, 0)) : null,
        info.research ? kv(t('importedResearch'), `${fmt(info.researchComplete, 0)} / ${fmt(info.research.length, 0)}`) : null,
        info.researchPartial ? kv(t('partialResearch'), fmt(info.researchPartial, 0)) : null,
        info.latestProductivity ? kv(t('productivity'), fmt(info.latestProductivity * 100, 1) + ' %') : null,
        kv(t('importedCityBuildings'), fmt(info.cityBuildingCount, 0)),
        kv(t('importedProductionBuildings'), fmt(info.productionBuildingCount, 0)),
        Number.isFinite(info.inventoryBuildingCount)
          ? kv(t('importedInventoryBuildings'), `${fmt(info.inventoryBuildingCount, 0)} · `
            + `${fmt(info.inventoryStorageCount, 0)} ${t('storageRecords')}`) : null,
        Number.isFinite(info.throughputBuildingCount)
          ? kv(t('importedFactoryThroughput'), fmt(info.throughputBuildingCount, 0)) : null,
        info.workshopCatalog ? kv(t('workshopCatalogResolved'),
          `${fmt(info.workshopCatalog.resolved, 0)} / ${fmt(info.workshopCatalog.referenced, 0)}`) : null,
        info.workshopCatalog?.localDefinitions ? kv(t('localWorkshopDefinitions'),
          fmt(info.workshopCatalog.localDefinitions, 0)) : null,
        info.infrastructureCount ? kv(t('recognizedInfrastructure'), fmt(info.infrastructureCount, 0)) : null,
        info.inferredHousingBuildingCount ? kv(t('observedHousingFallback'),
          `${fmt(info.inferredHousingBuildingCount, 0)} · ${fmt(info.inferredHousingResidents, 0)} ${t('residentsShort')}`) : null,
        kv(t('importedTemporary'), fmt(info.temporaryCount, 0)),
        kv(t('importedUnmatched'), fmt(info.unmatchedCount, 0))),
      info.warnings?.length ? el('div', { class: 'totalsbox' },
        el('h3', {}, t('importedWarnings')),
        el('ul', {}, ...info.warnings.map(warning => el('li', {}, warning)))) : null),
    info.unrepresentedSupport?.length ? el('details', { class: 'tablewrap' },
      el('summary', {}, `${t('supportTypes')} (${fmt(info.unrepresentedSupport.length, 0)})`),
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, t('area')), el('th', {}, t('sourceGameId')), el('th', {}, t('count')))),
        el('tbody', {}, ...info.unrepresentedSupport.map(item => el('tr', {},
          el('td', {}, areaNames.get(item.scopeId) ?? t('unassigned')),
          el('td', {}, item.type), el('td', { class: 'r' }, fmt(item.count, 0))))))) : null,
    info.unmatched?.length ? (() => {
      const unmatchedScopeIds = [...new Set(info.unmatched.map(item => item.scopeId ?? null))]
        .sort((a, b) => (areaNames.get(a) ?? t('unassigned')).localeCompare(areaNames.get(b) ?? t('unassigned')));
      const scopeToken = scopeId => scopeId === null ? 'unassigned' : String(scopeId);
      if (unmatchedScopeFilter && !unmatchedScopeIds.some(scopeId => scopeToken(scopeId) === unmatchedScopeFilter)) {
        unmatchedScopeFilter = '';
      }
      const selectedScope = unmatchedScopeFilter === '' ? undefined
        : unmatchedScopeFilter === 'unassigned' ? null : Number(unmatchedScopeFilter);
      const visibleUnmatched = selectedScope === undefined ? info.unmatched
        : info.unmatched.filter(item => (item.scopeId ?? null) === selectedScope);
      const visibleInstances = visibleUnmatched.reduce((sum, item) => sum + item.count, 0);
      return el('details', {
        class: 'tablewrap unmatched-types', ...(unmatchedScopeFilter ? { open: '' } : {}),
      },
      el('summary', {}, `${t('unmatchedTypes')} (${fmt(info.unmatched.length, 0)})`),
      el('p', { class: 'hint' }, t('unmatchedExplanation')
        .replace('{instances}', fmt(info.unmatchedCount, 0))
        .replace('{groups}', fmt(info.unmatched.length, 0))),
      hasUnmatchedWorkshopPackages ? el('p', { class: 'hint' }, t('unmatchedWorkshopHint')) : null,
      el('label', {}, t('area'), selectInput([
        ['', `${t('allAreas')} (${fmt(info.unmatchedCount, 0)})`],
        ...unmatchedScopeIds.map(scopeId => [scopeToken(scopeId),
          `${areaNames.get(scopeId) ?? t('unassigned')} (${fmt(info.unmatched
            .filter(item => (item.scopeId ?? null) === scopeId)
            .reduce((sum, item) => sum + item.count, 0), 0)})`]),
      ], unmatchedScopeFilter, value => { unmatchedScopeFilter = value; }, { class: 'unmatched-area-filter' })),
      el('p', { class: 'hint unmatched-filter-status' }, t('unmatchedFilterStatus')
        .replace('{groups}', fmt(visibleUnmatched.length, 0))
        .replace('{instances}', fmt(visibleInstances, 0))),
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, t('area')), el('th', {}, t('sourceGameId')),
          el('th', {}, t('count')), el('th', {}, t('workshopItem')))),
        el('tbody', {}, ...visibleUnmatched.map(item => {
          const packageId = workshopPackageId(item.type);
          return el('tr', {},
            el('td', {}, areaNames.get(item.scopeId) ?? t('unassigned')),
            el('td', {}, item.type), el('td', { class: 'r' }, fmt(item.count, 0)),
            el('td', {}, packageId ? el('a', {
              href: `https://steamcommunity.com/sharedfiles/filedetails/?id=${packageId}`,
              target: '_blank', rel: 'noopener noreferrer',
            }, t('openWorkshopItem')) : null));
        }))));
    })() : null) : null;

  return el('section', {}, el('h2', {}, t('saveImportTitle')), el('p', { class: 'hint' }, t('saveImportHint')),
    renderLocalWorkshopPicker(), picker, status, retryMap, liveStats, audit,
    renderStoredDataReset());
}

// Snapshots persist across releases, so one written by an older build can carry
// a shape a newer one cannot use — and from the inside that looks like the app
// is broken rather than like the data is old. This is the way out that does not
// need developer tools.
function renderStoredDataReset() {
  return el('details', { class: 'secondary-section stored-data-reset' },
    el('summary', {}, t('storedDataResetTitle')),
    el('p', { class: 'hint' }, t('storedDataResetHint')),
    el('button', {
      class: 'danger',
      'data-stored-data-reset': '',
      onclick: async event => {
        if (!confirm(t('storedDataResetConfirm'))) return;
        event.currentTarget.disabled = true;
        await clearStoredData();
        const url = new URL(location.href);
        url.hash = '';
        url.searchParams.set('reset', String(Date.now()));
        location.replace(url);
      },
    }, t('storedDataResetAction')));
}

export async function clearStoredData() {
  try { localStorage.clear(); } catch { /* a locked-down profile still deserves the reload */ }
  try { sessionStorage.clear(); } catch { /* same */ }
  try { await clearIndexedDbStorage(); }
  catch { /* clearing is best effort; the reload is what the reader needs */ }
}

// ---------------------------------------------------------------- city tab
// Tells the reader how long this republic has been sitting there, so the
// choice between continuing it and opening a different save is an informed one.
function lastOpenedLabel() {
  const age = relativeAge(observationSavedAt);
  if (!age) return null;
  return el('span', { class: 'hint start-last-opened' },
    t(age.key).replace('{n}', fmt(age.value, 0)));
}

// Observe: what the save reports about each settlement. Read-only — the only
// control is navigation into the matching City planning area.
function renderCities() {
  const scopes = state.saveImport?.scopes;
  if (!Array.isArray(scopes) || !scopes.length) {
    return el('section', {}, el('p', { class: 'hint' }, t('citiesEmpty')));
  }
  const inhabited = scopes.filter(scope => scope.city || scope.production);
  const diagnostics = state.saveImport?.citizenDiagnostics?.areas;
  const diagnosticByScope = new Map((diagnostics ?? []).map(area => [area.scopeId, area]));
  const diagnosticScopes = inhabited.filter(scope =>
    diagnosticByScope.has(scope.id) || scope.citizens);
  const rows = filterCitizenDiagnostics(diagnosticScopes.map(scope => ({
    ...diagnosticByScope.get(scope.id),
    scopeId: scope.id,
    name: scope.name,
    observed: scope.citizens,
  })), { query: cityDiagnosticsSearch, sortKey: cityDiagnosticsSort });
  const pct = value => (Number.isFinite(value) ? fmt(value * 100, 1) + ' %' : '—');
  const count = value => (Number.isFinite(value) ? fmt(value, 0) : '—');
  const openArea = scopeId => {
    const index = cityPlanningAreas().findIndex(area => cityScopeIds(area).includes(scopeId));
    if (index >= 0) state.activeCity = index;
    state.tab = 'city';
    update();
  };
  const hasDiagnostics = Array.isArray(diagnostics);
  const totals = hasDiagnostics ? diagnostics.reduce((result, area) => ({
    approaching: result.approaching + area.approachingAdulthood,
    vacant: result.vacant + area.vacantCompletedResidences,
    balance: result.balance + (area.adultSpaceBalance ?? 0),
    knownAreas: result.knownAreas + (area.adultSpaceBalance == null ? 0 : 1),
  }), { approaching: 0, vacant: 0, balance: 0, knownAreas: 0 }) : null;
  const filterRows = event => {
    cityDiagnosticsSearch = event.target.value;
    const needle = cityDiagnosticsSearch.trim().toLocaleLowerCase();
    for (const row of event.target.closest('[data-citizen-diagnostics]')
      .querySelectorAll('tbody tr')) {
      row.hidden = !!needle && !row.dataset.cityName.includes(needle);
    }
  };

  return el('section', {},
    el('div', { class: 'citizen-diagnostics', 'data-citizen-diagnostics': '' },
      el('h2', {}, t('citizenDiagnosticsTitle'),
        el('span', { class: 'evidence-badge exact' }, t('exact')),
        el('span', { class: 'evidence-badge derived' }, t('derived'))),
      hasDiagnostics ? el('p', { class: 'hint' }, t('housingPressureHint')) : null,
      totals ? el('div', { class: 'citizen-diagnostic-summary' },
        el('div', {}, el('span', {}, t('knownAdultSpaceBalance')),
          el('strong', { class: totals.balance < 0 ? 'neg' : 'pos' },
            totals.knownAreas ? fmt(totals.balance, 0) : '—')),
        el('div', {}, el('span', {}, t('approachingAdulthood')),
          el('strong', {}, fmt(totals.approaching, 0))),
        el('div', {}, el('span', {}, t('vacantResidences')),
          el('strong', {}, fmt(totals.vacant, 0)))) : null,
      hasDiagnostics ? el('div', { class: 'citizen-diagnostic-controls' },
        el('label', {}, t('search'),
          el('input', {
            type: 'search', value: cityDiagnosticsSearch,
            placeholder: t('diagnosticSearchPlaceholder'), oninput: filterRows,
          })),
        el('label', {}, t('sort'),
          selectInput([
            ['pressure', t('sortHousingPressure')],
            ['residents', t('population')],
            ['approaching', t('approachingAdulthood')],
            ['vacant', t('vacantResidences')],
            ['crime', t('criminality')],
            ['health', t('health')],
          ], cityDiagnosticsSort, value => { cityDiagnosticsSort = value; }))) : null,
      el('div', { class: 'tablewrap' },
        el('table', { class: 'data' },
          el('thead', {}, el('tr', {},
            el('th', {}, t('area')), el('th', {}, t('residents')),
            el('th', { title: t('adultsVsKnownCapacity') }, t('adultsCapacityShort')),
            el('th', { title: t('knownAdultSpaceBalance') }, t('capacityMarginShort')),
            el('th', {}, t('approachingAdulthood')),
            el('th', { title: t('vacantResidences') }, t('vacantResidencesShort')),
            el('th', {}, t('higherEducationShort')), el('th', {}, t('happiness')),
            el('th', {}, t('health')), el('th', {}, t('residentCriminality')), el('th', {}, ''))),
          el('tbody', {}, rows.map(row => {
            const observed = row.observed;
            const hasKnownCapacity = row.knownCapacityResidences > 0;
            const residents = Number.isFinite(row.residents) ? row.residents : observed?.residents;
            const children = Number.isFinite(row.children)
              ? row.children : Number.isFinite(observed?.residents) && Number.isFinite(observed?.adults)
                ? observed.residents - observed.adults : null;
            return el('tr', {
              'data-city-name': row.name.toLocaleLowerCase(),
            },
            el('td', {}, row.name),
            el('td', { class: 'r' }, count(residents),
              el('span', { class: 'subline' }, `${count(children)} ${t('children')}`)),
            el('td', { class: 'r' }, hasKnownCapacity
              ? `${count(row.occupiedAdultsInKnownCapacity)} / ${count(row.adultSpaces)}` : '—',
            row.occupiedUnknownCapacityResidences
              ? el('span', { class: 'subline warn' },
                t('unknownResidenceCapacity').replace('{count}',
                  count(row.occupiedUnknownCapacityResidences))) : null),
            el('td', { class: `r ${row.adultSpaceBalance < 0 ? 'neg' : ''}` },
              count(row.adultSpaceBalance)),
            el('td', { class: 'r' }, count(row.approachingAdulthood)),
            el('td', { class: 'r' }, count(row.vacantCompletedResidences)),
            el('td', { class: 'r' }, count(Number.isFinite(row.higherEducation)
              ? row.higherEducation : observed?.highEducation)),
            el('td', { class: 'r' }, pct(Number.isFinite(row.happiness)
              ? row.happiness : observed?.happiness)),
            el('td', { class: 'r' }, pct(Number.isFinite(row.health) ? row.health : observed?.health)),
            el('td', { class: 'r' }, pct(Number.isFinite(row.criminality)
              ? row.criminality : observed?.criminality),
            row.highRiskResidents
              ? el('span', { class: 'subline warn' },
                `${count(row.highRiskResidents)} ${t('highRiskResidents')}`) : null),
            el('td', { class: 'citizen-diagnostic-action' }, el('button', {
              class: 'linklike', title: t('planThisArea'), 'aria-label': t('planThisArea'),
              onclick: () => openArea(row.scopeId),
            }, '→')));
          }))))));
}

function renderCity() {
  const areas = cityPlanningAreas();
  if (state.activeCity >= areas.length || state.activeCity < 0) state.activeCity = 0;
  const city = materializeCityArea(areas[state.activeCity]);
  if (!Array.isArray(city.workshops)) city.workshops = [];
  const assignedScopeIds = cityScopeIds(city);
  const realCityScopes = plannerScopes('city');
  const assignedRealCities = realCityScopes.length ? el('label', { class: 'city-assignment' },
    el('span', {}, t('assignRealCities')),
    el('select', {
      class: 'city-assignment-select', multiple: true,
      size: Math.min(6, Math.max(2, realCityScopes.length)),
      onchange: event => {
        setCityScopeAssignments(city, [...event.target.selectedOptions].map(option => option.value));
        update();
      },
    }, realCityScopes.map(scope => el('option', {
      value: String(scope.id), selected: assignedScopeIds.includes(scope.id),
    }, scope.name)))) : null;
  const eco = economy();
  const worstCaseProductivity = Number.isFinite(city.worstCaseProductivity)
    ? Math.max(0, city.worstCaseProductivity) : 0.5;

  const workspaceBar = el('div', { class: 'workspace-bar' },
    returnToRepublicButton(),
    el('label', { class: 'workspace-context' }, el('span', {}, t('cityArea')), selectInput(
      areas.map((item, index) => [String(index), item.name || `${t('city')} ${index + 1}`]),
      String(state.activeCity), value => { state.activeCity = Number(value); })),
    assignedRealCities,
    el('div', { class: 'workspace-actions' },
      el('button', { onclick: () => {
        state.cities.push(defaultCity());
        state.activeCity = cityPlanningAreas().length - 1;
        update();
      } }, t('addCity')),
    // Removing works on the stored city, not the listed position: scope-backed
    // areas and hand-made ones do not share an index space.
    areas.length > 1 ? el('button', {
      class: 'danger',
      onclick: () => {
        const index = state.cities.indexOf(city);
        if (index >= 0) state.cities.splice(index, 1);
        state.activeCity = 0;
        update();
      },
    }, t('removeCity')) : null));

  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('cityName') + ' ', el('input', {
      type: 'text', value: city.name, onchange: e => { city.name = e.target.value; update(); } })),
    el('label', {}, t('productivity') + ' ', pctInput(city.productivity, v => city.productivity = v)),
    el('label', {}, t('cityProductivityWorstCase') + ' ', pctInput(
      worstCaseProductivity, v => city.worstCaseProductivity = v,
    )),
    el('label', {}, t('cable') + ' ',
      selectInput(CABLES.map(c => [c.de, c[state.lang]]), city.cable, v => city.cable = v)),
    el('label', {}, t('heatExchangers') + ' ',
      selectInput([['small', t('exchangerSmall')], ['large', t('exchangerLarge')]], city.exchanger, v => city.exchanger = v)),
    el('label', {}, t('waterDivisor') + ' ', numInput(city.waterDivisor, v => city.waterDivisor = v || 3, { min: 1, step: 1 })),
    el('label', {}, t('vanillaOnly') + ' ', el('input', {
      type: 'checkbox', checked: state.vanillaOnly, onchange: e => { state.vanillaOnly = e.target.checked; update(); } })),
    el('button', { onclick: () => { state.cityDetails = !state.cityDetails; update(); } },
      t(state.cityDetails ? 'hideUtilityDetails' : 'showUtilityDetails')));
  const assumptions = el('details', {
    class: 'planner-assumptions secondary-section',
    open: plannerAssumptionsOpen,
    ontoggle: event => { plannerAssumptionsOpen = event.currentTarget.open; },
  },
    el('summary', {}, t('planAssumptions')), settings);
  const observedAggregate = aggregateCityObservations(state.saveImport?.observedCities, assignedScopeIds);
  const observed = observedAggregate?.observed ?? city.observed;
  const observedBuildingCount = observedAggregate?.rows.reduce((sum, row) =>
    sum + (Number.isFinite(row.count) ? row.count : 0), 0);
  const observedCard = observed ? el('div', { class: 'totalsbox observed-card' },
    el('h3', {}, t('observedAtSave'), el('span', { class: 'evidence-badge derived' }, t('derived'))),
    kv(t('population'), fmt(observed.residents, 0)),
    observedBuildingCount == null ? null : kv(t('observedBuildingsTotal'), fmt(observedBuildingCount, 0)),
    kv(t('adults'), fmt(observed.adults, 0)),
    kv(t('highEducation'), fmt(observed.highEducation, 0)),
    kv(t('productivity'), fmt(observed.productivity * 100, 2) + ' %'),
    kv(t('happiness'), fmt(observed.happiness * 100, 1) + ' %'),
    kv(t('food'), fmt(observed.food * 100, 1) + ' %'),
    kv(t('health'), fmt(observed.health * 100, 1) + ' %'),
    kv(t('loyalty'), fmt(observed.loyalty * 100, 1) + ' %'),
    Number.isFinite(observed.criminality)
      ? kv(t('criminality'), fmt(observed.criminality * 100, 2) + ' %') : null) : null;
  const cityOperations = state.saveImport?.operationalServices?.regional
    ?.find(scope => cityScopeIds(city).includes(scope.scopeId));
  const crime = cityOperations?.crime;
  const clinics = cityOperations?.clinics;
  const police = cityOperations?.police;
  const live = cityOperations?.live;
  const clinicLoad = clinics?.effectiveServiceCapacity > 0
    ? clinics.currentVisitors / clinics.effectiveServiceCapacity : null;
  const regionalOperationsCard = cityOperations ? el('div', { class: 'totalsbox operational-card' },
    el('h3', {}, t('regionalSafetyHealth'), el('span', { class: 'evidence-badge exact' }, t('exact'))),
    kv(t('policeStations'), fmt(police.buildingCount, 0)),
    police.underConstructionCount ? kv(t('underConstruction'), fmt(police.underConstructionCount, 0), 'warn') : null,
    kv(t('staffing'), `${fmt(police.currentWorkers, 0)} / ${fmt(police.configuredWorkers, 0)}`,
      police.buildingCount && police.currentWorkers === 0 ? 'neg' : ''),
    live ? kv(t('livePoliceCases'), fmt(live.awaitingPolice + live.underInvestigation, 0),
      live.awaitingPolice > 0 ? 'warn' : '') : kv(t('liveQueue'), t('unavailable')),
    live?.awaitingPolice ? kv(t('awaitingPolice'), fmt(live.awaitingPolice, 0), 'warn') : null,
    live?.underInvestigation ? kv(t('underInvestigation'), fmt(live.underInvestigation, 0)) : null,
    kv(t('unresolvedCrimeCases'), fmt((crime?.withoutPolice ?? 0) + (crime?.notInvestigated ?? 0), 0),
      (crime?.withoutPolice ?? 0) + (crime?.notInvestigated ?? 0) > 0 ? 'warn' : ''),
    kv(t('clinics'), fmt(clinics.buildingCount, 0)),
    clinics.underConstructionCount ? kv(t('underConstruction'), fmt(clinics.underConstructionCount, 0), 'warn') : null,
    kv(t('staffing'), `${fmt(clinics.currentWorkers, 0)} / ${fmt(clinics.configuredWorkers, 0)}`,
      clinics.buildingCount && clinics.currentWorkers === 0 ? 'neg' : ''),
    kv(t('currentPatients'), clinics.effectiveServiceCapacity > 0
      ? `${fmt(clinics.currentVisitors, 0)} / ${fmt(clinics.effectiveServiceCapacity, 0)}` : '—'),
    live ? kv(t('activeMedicalEmergencies'), fmt(live.medicalEmergencies, 0),
      live.medicalEmergencies > 0 ? 'warn' : '') : null,
    kv(t('currentClinicLoad'), clinicLoad == null ? '—' : fmt(clinicLoad * 100, 0) + ' %',
      clinicLoad > 1 ? 'neg' : clinicLoad > 0.85 ? 'warn' : 'pos'),
    el('p', { class: 'hint' }, t('crimeHistoryNote'))) : null;
  const coverageCard = city.unresolvedBuildingCount > 0 ? el('div', { class: 'totalsbox' },
    el('h3', { class: 'warn' }, t('incompleteCoverage')),
    kv(t('unresolvedCityBuildings'), fmt(city.unresolvedBuildingCount, 0), 'warn'),
    el('p', { class: 'hint warn' }, t('incompleteServiceCoverage'))) : null;

  const allIndexed = DATA.cityBuildings.map((building, index) => ({ building, index }));
  const pool = allIndexed.filter(({ building }) => !state.vanillaOnly || building.kind === 'Vanilla');
  const typeMap = new Map(pool.map(({ building }) => [building.type.de, building.type]));
  const types = [...typeMap.entries()].sort((a, b) => a[1][state.lang].localeCompare(b[1][state.lang]));
  const resolveRow = row => {
    if (row.importedBuilding) return row.importedBuilding;
    if (Number.isInteger(row.buildingIndex)) return DATA.cityBuildings[row.buildingIndex];
    return DATA.cityBuildings.find(building => building.de === row.name);
  };
  const cityBuildingLabel = building => {
    const details = [];
    if (building.inhabitants > 0) details.push(`${fmt(building.inhabitants, 0)} ${t('residentsShort')}`);
    if (building.workers > 0) details.push(`${fmt(building.workers, 0)} ${t('workersShort')}`);
    const capacity = Math.max(building.visitors ?? 0, building.special ?? 0);
    if (capacity > 0) details.push(`${fmt(capacity, 0)} ${t('capacityShort')}`);
    details.push(`${fmt(building.workdays, 0)} ${t('workdaysShort')}`);
    // 'quality' is overloaded in the data: a 0-1 housing-quality fraction for
    // residential buildings, but an unrelated 0-5 amenity rating otherwise.
    if (building.inhabitants > 0 && building.quality != null) {
      details.push(`${fmt(building.quality * 100, 0)}% ${t('qualityShort')}`);
    }
    details.push(building.kind === 'Vanilla' ? 'Vanilla' : 'Mod');
    if (building.gameId) {
      const exactFields = [];
      if (building.provenance?.workers === 'game-file') exactFields.push(t('workers'));
      if (building.provenance?.housing === 'game-file') exactFields.push(t('housingCapacity'));
      if (building.provenance?.serviceCapacity === 'game-file') exactFields.push(t('serviceCapacity'));
      details.push(`${t('gameFacts')}: ${exactFields.join(', ') || t('identity')}`);
    }
    return `${cityBuildingDisplayName(building, state.lang)} — ${details.join(' · ')}`;
  };

  const rowsResolved = city.rows.map(r => ({ ...r, building: resolveRow(r) }));
  const workshopRows = resolveCityWorkshopRows(city.workshops, prodBuildings());
  const productivityScenarios = evaluateCityProductivityScenarios(
    { ...city, rows: rowsResolved, workshops: workshopRows }, eco, worstCaseProductivity,
  );
  const res = productivityScenarios.normal;
  const scaledFact = (value, count, digits) => Number.isFinite(value)
    ? fmt(value * count, digits)
    : '—';

  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Typ'), el('th', {}, t('building')), el('th', {}, t('count')),
      el('th', {}, t('population')), el('th', {}, t('housingQuality')), el('th', {}, t('workers')),
      el('th', {}, t('workersNeeded')),
      ...(state.cityDetails ? [el('th', {}, 'kW'), el('th', {}, t('waterUse')),
        el('th', {}, t('hotwater')), el('th', {}, t('wasteOut')),
        el('th', {}, `${t('buildCost')} ${cur()}`)] : []), el('th', {}))),
    el('tbody', {}, city.rows.map((row, idx) => {
      const b = resolveRow(row);
      const selectedType = typeMap.has(row.type)
        ? row.type
        : (pool.find(({ building }) => Object.values(building.type).includes(row.type))?.building.type.de ?? row.type);
      const typeSel = selectInput([[t('none'), t('none')], ...types.map(([key, label]) => [key, label[state.lang]])],
        selectedType ?? t('none'), v => {
          row.type = v; row.name = null; delete row.buildingIndex; delete row.categoryOnly;
        });
      const inType = pool.filter(({ building }) => building.type.de === selectedType);
      const selectedIndex = Number.isInteger(row.buildingIndex)
        ? row.buildingIndex
        : allIndexed.find(({ building }) => building.de === row.name)?.index;
      const bSel = selectInput(
        [['', t('none')], ...inType.map(({ building, index }) => [String(index), cityBuildingLabel(building)])],
        selectedIndex === undefined ? '' : String(selectedIndex), v => {
          if (v === '') { row.name = null; delete row.buildingIndex; return; }
          row.buildingIndex = Number(v);
          row.name = DATA.cityBuildings[row.buildingIndex].de;
          delete row.categoryOnly;
        });
      const n = row.count || 0;
      // Per-row breakdown of the type-level utilization (only types with a
      // demand model — services, secret police, heating — have one).
      const rowMax = b ? b.workers * n : 0;
      const rowUtilization = b ? res.utilizationByType.get(b.type.de) : undefined;
      const rowWorkersNeeded = (rowMax > 0 && rowUtilization != null)
        ? { optimal: Math.min(rowMax, rowMax * rowUtilization), max: rowMax } : null;
      const typeCell = row.importedBuilding
        ? el('span', {}, row.importedBuilding.type[state.lang] ?? row.importedBuilding.type.de)
        : typeSel;
      const buildingCell = row.importedBuilding
        ? el('div', {}, bname(row.importedBuilding),
          row.importedBuilding.observedOccupancy
            ? el('div', { class: 'sourceid' }, t('observedOccupancyBaseline')) : null,
          el('div', { class: 'sourceid' }, `${t('sourceGameId')}: ${row.sourceGameId ?? row.importedBuilding.gameId}`))
        : row.categoryOnly
          ? el('div', {}, el('span', { class: 'category-placeholder' }, t('cityCategoryPlaceholder')), bSel)
          : bSel;
      return el('tr', {},
        el('td', {}, typeCell), el('td', {}, buildingCell),
        el('td', {}, numInput(row.count, v => row.count = v, { min: 0, step: 1 })),
        el('td', { class: 'r' }, b ? fmt(b.inhabitants * n, 0) : '—'),
        el('td', { class: 'r' }, b?.inhabitants > 0 && b.quality != null ? fmt(b.quality * 100, 0) + ' %' : '—'),
        el('td', { class: 'r' }, b ? fmt(b.workers * n, 0) : '—'),
        workersNeededCell(rowWorkersNeeded),
        ...(state.cityDetails ? [
          el('td', { class: 'r' }, b ? scaledFact(b.maxKW, n, 0) : '—'),
          el('td', { class: 'r' }, b ? scaledFact(b.water, n, 2) : '—'),
          el('td', { class: 'r' }, b ? scaledFact(b.hotwater, n, 2) : '—'),
          el('td', { class: 'r' }, b ? scaledFact(b.waste, n, 1) : '—'),
          el('td', { class: 'r' }, b
            ? scaledFact(eco.buildCost(b, state.currency), n, 0) : '—'),
        ] : []),
        el('td', {}, el('button', { class: 'danger', onclick: () => { city.rows.splice(idx, 1); update(); } }, '✕')));
    })));

  const addBtn = el('button', {
    onclick: () => { city.rows.push({ type: types[0]?.[0], name: null, count: 1 }); update(); },
  }, t('addRow'));
  const addCategoriesBtn = el('button', {
    onclick: () => {
      city.rows = addMissingCityCategoryRows(city.rows, CITY_CORE_CATEGORY_TYPES).rows;
      update();
    },
  }, t('cityCoreCategories'));

  const workshopCatalogue = cityWorkshopBuildings(prodBuildings());
  const workshopTable = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('building')), el('th', {}, t('count')), el('th', {}, t('workers')),
      el('th', {}, t('sourceCoverage')), el('th', {}))),
    el('tbody', {}, workshopRows.map((row, idx) => {
      const storedRow = city.workshops[idx];
      const options = [['', t('none')], ...workshopCatalogue.map(building => [
        building.gameId,
        `${bname(building)} — ${fmt(building.workers ?? 0, 0)} ${t('workers')}`,
      ])];
      if (!row.building && row.gameId) {
        options.push([row.gameId, `${t('cityWorkshopUnavailable')}: ${row.gameId}`]);
      }
      const workshopSel = selectInput(options, row.gameId ?? '', value => {
        storedRow.gameId = value || null;
        update();
      });
      return el('tr', {},
        el('td', {}, workshopSel),
        el('td', {}, numInput(row.count, value => { storedRow.count = value; }, { min: 0, step: 1 })),
        el('td', { class: 'r' }, row.building
          ? fmt((row.building.workers ?? 0) * (row.count || 0), 0) : '—'),
        el('td', {}, row.building ? t('cityWorkshopGameFact') : t('cityWorkshopUnavailable')),
        el('td', {}, el('button', {
          class: 'danger', onclick: () => { city.workshops.splice(idx, 1); update(); },
        }, '✕')));
    })));
  const workshopActions = el('div', { class: 'settingsbar city-row-actions' },
    el('button', {
      disabled: workshopCatalogue.length === 0,
      onclick: () => {
        if (!workshopCatalogue.length) return;
        city.workshops.push({ gameId: workshopCatalogue[0].gameId, count: 1 });
        update();
      },
    }, t('addRow')),
    workshopCatalogue.length === 0 ? el('span', { class: 'hint warn' }, t('cityWorkshopUnavailable')) : null);
  const workshopSection = el('div', { class: 'planner-subsection', 'data-city-workshops': '' },
    el('h3', {}, t('cityWorkshopSection')),
    el('p', { class: 'hint' }, t('cityWorkshopGameFact')),
    workshopRows.length ? el('div', { class: 'tablewrap' }, workshopTable)
      : el('p', { class: 'empty-state' }, t('emptyCityPlan')),
    workshopActions);

  const services = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('services')), el('th', {}, t('provided')),
      el('th', {}, `${t('utilization')} (${t('productivity')})`),
      el('th', {}, `${t('utilization')} (${t('cityProductivityWorstCase')})`),
      el('th', {}, t('cityRequiredProductivity')),
      el('th', {}, t('workersNeeded')))),
    el('tbody', {},
      productivityScenarios.services.map(s => el('tr', {},
        el('td', {}, t(s.id)),
        el('td', { class: 'r' }, fmt(s.provided, 0)),
        utilizationCell(s.normalUtilization),
        utilizationCell(s.worstCaseUtilization),
        el('td', { class: s.worstCaseSufficient === false ? 'r neg' : 'r' },
          s.requiredProductivity == null ? '—' : fmt(s.requiredProductivity * 100, 1) + ' %'),
        workersNeededCell(s.workersNeeded))),
      el('tr', {},
        el('td', {}, t('secretPolice') + ` (${fmt(res.residentialBuildings, 0)} ${t('residential')})`),
        el('td', { class: 'r' }, fmt(res.secretPolice.provided, 1)),
        utilizationCell(res.secretPolice.utilization),
        utilizationCell(productivityScenarios.worst.secretPolice.utilization),
        el('td', { class: 'r' }, '—'),
        workersNeededCell(res.secretPolice.workersNeeded)),
      el('tr', {},
        el('td', {}, t('heating')),
        el('td', { class: 'r' }, fmt(res.heating.provided, 0)),
        utilizationCell(res.heating.utilization),
        utilizationCell(productivityScenarios.worst.heating.utilization),
        el('td', { class: 'r' }, '—'),
        workersNeededCell(res.heating.workersNeeded))));

  const summary = el('div', { class: 'totalsbox' },
    el('h3', {}, city.name || t('city')),
    kv(t('population'), fmt(res.population, 0)),
    kv(t('housingQuality'), res.avgHousingQuality != null ? fmt(res.avgHousingQuality * 100, 0) + ' %' : '—'),
    kv(t('workers'), fmt(res.workersNeeded, 0)),
    kv(`${t('cityWorkshopSection')} ${t('workers')}`, fmt(res.workshopWorkers, 0)),
    kv(t('workerSurplus'), fmt(res.workerSurplus, 1), res.workerSurplus < 0 ? 'neg' : 'pos'),
    kv(t('maxWatt'), fmt(res.maxKW, 0)),
    kv(t('transformers'), res.transformers == null ? '—'
      : fmt(Math.ceil(res.transformers), 0) + ` (${fmt(res.transformers, 2)})`),
    kv(t('hotwater'), fmt(res.hotwater, 1)),
    kv(t('heatExchangers'), res.heatExchangers == null ? '—'
      : fmt(Math.ceil(res.heatExchangers), 0) + ` (${fmt(res.heatExchangers, 2)})`),
    kv(t('waterUse'), fmt(res.water, 1)),
    kv(t('waterConnections'), res.waterConnections == null
      ? '—' : fmt(Math.ceil(res.waterConnections), 0)),
    kv(t('wasteOut'), fmt(res.waste, 1)),
    kv(`${t('buildCost')} ₽`, fmt(res.buildCostRUB, 0)),
    kv(`${t('buildCost')} $`, fmt(res.buildCostUSD, 0)),
    kv(t('workday'), fmt(res.workdays, 0)),
    res.incomplete.utilities || res.incomplete.construction
      ? el('p', { class: 'hint warn' }, t('cityPlanningFactsUnavailable')) : null);

  // What supplies the water and the heating, which the planner could state the
  // need for and never the answer to. Counts are whole buildings and the rate
  // they are drawn from is the game's own for water; the demand they are matched
  // against is measured, so the panel is badged derived rather than exact.
  // Only the shortfall needs recommending: whatever supply is already in the
  // plan is subtracted first, so a town with two wells is told to build a
  // third rather than three.
  const utilityFactsUnavailable = res.water == null || res.hotwater == null;
  const waterShort = utilityFactsUnavailable
    ? null : Math.max(0, res.water - (res.waterSupply ?? 0));
  const utilityPlan = utilityFactsUnavailable ? [] : cityUtilityPlan({
    demand: { water: waterShort, hotwater: res.hotwater },
    catalogue: prodBuildings(),
    choice: city.utilityChoice ?? {},
  });
  const utilityBox = el('div', { class: 'totalsbox city-utilities' },
    el('h3', {}, t('cityUtilitiesTitle'),
      el('span', { class: 'evidence-badge derived' }, t('derived'))),
    utilityFactsUnavailable
      ? el('p', { class: 'hint warn' }, t('cityPlanningFactsUnavailable')) : null,
    ...utilityPlan.map(entry => {
      const label = t(entry.kind === 'water' ? 'waterUse' : 'hotwater');
      if (!entry.chosen) return kv(label, t('unavailable'));
      const options = entry.suppliers.map(o => [o.building.en, bname(o.building)]);
      const placed = entry.kind === 'water' ? (res.waterSupply ?? 0) : 0;
      return el('div', { class: 'utility-row' },
        el('span', { class: 'utility-need' },
          placed > 0
            ? `${label}: ${fmt(entry.demand, 1)} ${t('cityUtilityStillShort')}`
            + ` (${fmt(placed, 0)} ${t('cityUtilitySupplied')})`
            : `${label}: ${fmt(entry.demand, 1)}`),
        selectInput(options, entry.chosen.en, v => {
          city.utilityChoice = { ...(city.utilityChoice ?? {}), [entry.kind]: v };
        }),
        entry.coverage.count === 0
          ? el('span', { class: 'utility-count pos' }, t('cityUtilityCovered'))
          : el('span', { class: 'utility-count' }, `x ${fmt(entry.coverage.count, 0)}`),
        el('span', { class: 'hint' },
          `${fmt(entry.coverage.supplied, 0)} ${t('cityUtilitySupplied')}`
          + ` · ${fmt(entry.coverage.workers, 0)} ${t('workers')}`
          + ` · ${fmt(entry.coverage.power, 1)} ${t('power')}`));
    }));

  const mats = el('div', { class: 'totalsbox' },
    el('h3', {}, t('materials')),
    ...Object.entries(res.materials).map(([m, amt]) => {
      const keyMap = { panels: 'prefabpanels' };
      const r = DATA.resources.find(x => x.key === (keyMap[m] ?? m));
      return kv(r ? rname(r) : m, fmt(amt, 1));
    }));

  const observedBuildings = observedAggregate?.rows?.length ? el('details', { class: 'observed-buildings' },
    el('summary', {}, `${t('observedBuildingsDetail')} (${fmt(observedBuildingCount, 0)})`),
    el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, el('th', {}, t('building')), el('th', {}, t('count')))),
      el('tbody', {}, observedAggregate.rows.map(row => el('tr', {},
        el('td', {}, row.importedBuilding ? bname(row.importedBuilding) : (row.name ?? row.type ?? '—')),
        el('td', { class: 'r' }, fmt(row.count, 0)))))))) : null;

  return el('section', {}, workspaceBar,
    (observedCard || regionalOperationsCard || coverageCard)
      ? el('div', { class: 'columns operational-summary' }, observedCard, regionalOperationsCard, coverageCard) : null,
    assumptions,
    observedBuildings,
    city.rows.length ? el('div', { class: 'tablewrap' }, tbl) : el('p', { class: 'empty-state' }, t('emptyCityPlan')),
    el('div', { class: 'settingsbar city-row-actions' }, addBtn, addCategoriesBtn),
    workshopSection,
    el('div', { class: 'columns' },
      el('div', {}, el('h3', {}, t('services')), services),
      summary, utilityBox, mats));
}

function utilizationCell(u) {
  if (u === null) return el('td', { class: 'r' }, '—');
  const cls = u > 1 ? 'neg' : u > 0.85 ? 'warn' : 'pos';
  return el('td', { class: 'r ' + cls }, fmt(u * 100, 0) + ' %');
}

// Recommended staff for exactly 100% utilization, shown against the current
// max (a building's worker count can only be scaled down, never past its own
// slots — over-utilization means build more, not overstaff what's there).
function workersNeededCell(w) {
  if (w === null) return el('td', { class: 'r' }, '—');
  return el('td', { class: 'r' }, `${fmt(w.optimal, 0)} / ${fmt(w.max, 0)}`);
}

function renderRepublicLineChart(title, series, evidence = 'stats.ini', evidenceClass = 'exact') {
  const box = el('div', { class: 'history republic-chart' },
    el('h3', {}, title, el('span', { class: `evidence-badge ${evidenceClass}` }, evidence)));
  const nonEmpty = series.filter(item => item.points.length);
  if (!nonEmpty.length) return el('div', { class: 'history republic-chart' },
    el('h3', {}, title), el('p', { class: 'hint' }, t('unavailable')));
  const host = el('div', {});
  box.append(host);
  pendingChartMounts.push(() => mountTimeSeriesChart(host, {
    title,
    series: nonEmpty.map((item, index) => ({ ...item, colorSlot: index + 1 })),
    group: 'republic-history',
    formatValue: value => fmt(value, 2),
    resetZoomLabel: t('resetChartZoom'),
    summaryTemplate: t('chartSeriesSummary'),
    height: 230,
  }));
  return box;
}

function applyStandaloneMapVisibility(svg, layers, buildingFilter = '', legend = null) {
  const setGroupVisible = (selector, visible) => {
    const group = svg.querySelector(selector);
    if (group) group.style.display = visible ? '' : 'none';
  };
  setGroupVisible('.map-water', layers.water);
  setGroupVisible('.map-pollution', layers.pollution);
  setGroupVisible('.map-roads', layers.roads);
  setGroupVisible('.map-rails', layers.rails);
  setGroupVisible('.map-pedestrian', layers.pedestrian);
  setGroupVisible('.map-scopes', layers.scopes);

  const filter = String(buildingFilter ?? '').trim().toLowerCase();
  for (const marker of svg.querySelectorAll('circle[data-map-kind]')) {
    const kind = marker.dataset.mapKind;
    const outlier = marker.dataset.mapOutlier === 'true';
    if (outlier && kind !== 'border') {
      const target = layers.outliers
        ? svg.querySelector('.map-outliers')
        : svg.querySelector(marker.dataset.mapSelected === 'true' ? '.map-selected' : '.map-buildings');
      if (target && marker.parentElement !== target) target.append(marker);
    }
    const typeMatches = kind === 'border' || !filter
      || [marker.dataset.buildingType, marker.dataset.buildingLabel, marker.dataset.buildingName]
        .some(value => String(value ?? '').toLowerCase().includes(filter));
    const layerVisible = kind === 'border'
      ? layers.borders
      : kind === 'construction'
        ? layers.construction
        : outlier ? layers.buildings || layers.outliers : layers.buildings;
    marker.style.display = layerVisible && typeMatches ? '' : 'none';
  }

  if (legend) {
    const visibility = {
      water: layers.water, pollution: layers.pollution, roads: layers.roads, rails: layers.rails,
      pedestrian: layers.pedestrian, power: layers.power,
      buildings: layers.buildings, selected: layers.buildings,
      construction: layers.construction, borders: layers.borders,
      scopes: layers.scopes, outliers: layers.outliers,
    };
    for (const item of legend.querySelectorAll('[data-map-legend]')) {
      item.style.display = visibility[item.dataset.mapLegend] ? '' : 'none';
    }
  }
}

// A building's establishment is split across the save's basic and high-education
// worker sliders; institutions such as courts and police posts staff almost
// entirely from the second, so the basic slider alone reads as 8 workers out of 0.
function buildingEstablishment(building) {
  return (Number.isFinite(building.configuredWorkers) ? building.configuredWorkers : 0)
    + (Number.isFinite(building.configuredWorkersHighEducation) ? building.configuredWorkersHighEducation : 0);
}

// A Workshop building the catalogue has never heard of falls back to its saved
// type, which is a file name with a package id on the front — "3564803239/shed"
// told a reader nothing in an alert that was otherwise plain English. The id and
// the mirror marker are machine bookkeeping, so they come off; what is left is
// the asset's own name, which is at least a word.
export function readableSaveType(type) {
  return String(type ?? '')
    .replace(/^MIRRORZ_/i, '')
    .replace(/^\d{6,20}\//, '')
    .replace(/_/g, ' ')
    .trim();
}

function mapBuildingDisplayName(building, catalog = matchSaveBuilding(building.type,
  [...(DATA.rawBuildings ?? []), ...(DATA.workshopBuildings ?? [])], entry => entry.id)) {
  const localized = state.lang === 'de' ? catalog?.de : catalog?.en;
  return localized || catalog?.en || catalog?.de || catalog?.nameStr
    || readableSaveType(building.type) || t('building');
}

function standaloneWaterImageHref(water) {
  if (terrainWaterImageCache.has(water.packed)) return terrainWaterImageCache.get(water.packed);
  const canvas = document.createElement('canvas');
  canvas.width = water.width;
  canvas.height = water.height;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(water.width, water.height);
  pixels.data.set(waterRasterPixels(water.packed, water.width * water.height));
  context.putImageData(pixels, 0, 0);
  const href = canvas.toDataURL('image/png');
  terrainWaterImageCache.set(water.packed, href);
  return href;
}

function standalonePollutionImageHref(pollution) {
  if (pollutionImageCache.has(pollution.airPacked)) {
    return pollutionImageCache.get(pollution.airPacked);
  }
  const packed = Uint8Array.from(atob(pollution.airPacked), character => character.charCodeAt(0));
  const canvas = document.createElement('canvas');
  canvas.width = pollution.width;
  canvas.height = pollution.height;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(pollution.width, pollution.height);
  for (let index = 0; index < packed.length; index += 1) {
    const value = packed[index] / 255;
    if (!value) continue;
    const blend = value < 0.5 ? value * 2 : (value - 0.5) * 2;
    const from = value < 0.5 ? [45, 176, 88] : [246, 201, 55];
    const to = value < 0.5 ? [246, 201, 55] : [220, 55, 45];
    const target = index * 4;
    pixels.data[target] = Math.round(from[0] + (to[0] - from[0]) * blend);
    pixels.data[target + 1] = Math.round(from[1] + (to[1] - from[1]) * blend);
    pixels.data[target + 2] = Math.round(from[2] + (to[2] - from[2]) * blend);
    pixels.data[target + 3] = Math.round(65 + value * 190);
  }
  context.putImageData(pixels, 0, 0);
  const href = canvas.toDataURL('image/png');
  pollutionImageCache.set(pollution.airPacked, href);
  return href;
}

function themeHexRgb(value) {
  const hex = String(value).trim().replace(/^#/, '');
  const expanded = hex.length === 3
    ? [...hex].map(character => character + character).join('')
    : hex;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return [0, 0, 0];
  return [0, 2, 4].map(offset => Number.parseInt(expanded.slice(offset, offset + 2), 16));
}

function standaloneRadiationImageHref(pollution, low, high) {
  const cacheKey = `${pollution.radiationPacked}:${low.join(',')}:${high.join(',')}`;
  if (radiationImageCache.has(cacheKey)) return radiationImageCache.get(cacheKey);
  const canvas = document.createElement('canvas');
  canvas.width = pollution.width;
  canvas.height = pollution.height;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(pollution.width, pollution.height);
  pixels.data.set(radiationRasterPixels(pollution.radiationPacked, low, high));
  context.putImageData(pixels, 0, 0);
  const href = canvas.toDataURL('image/png');
  radiationImageCache.set(cacheKey, href);
  return href;
}

const WALK_SURFACE_KEYS = Object.freeze({
  mud: 'walkSurfaceMud',
  gravel: 'walkSurfaceGravel',
  asphalt: 'walkSurfaceAsphalt',
  brick: 'walkSurfaceBrick',
  asphaltLit: 'walkSurfaceAsphaltLit',
  brickLit: 'walkSurfaceBrickLit',
  bridge: 'walkSurfaceBridge',
  tunnel: 'walkSurfaceTunnel',
  other: 'walkSurfaceOther',
});

function walkSurfaceLabel(key) {
  return key ? t(WALK_SURFACE_KEYS[key] ?? 'walkSurfaceOther') : t('walkSurfaceNone');
}

// What the corridor overlay is claiming, said plainly: how far the walk goes,
// which leg ran closest to the game's limit, and how much of the budget is
// left. A building the save never connected says so instead of showing a zero.
function renderWalkReachSection(building) {
  if (!mapWalkReach || mapWalkReach.sourceIndex !== building.index) return null;
  if (mapWalkReach.unattached) {
    return el('section', { class: 'map-walk-reach', 'data-walk-reach': 'unattached' },
      el('h4', {}, t('walkReachTitle')),
      el('p', { class: 'hint' }, t('walkReachUnattached')));
  }
  const entries = [...mapWalkReach.buildings.values()];
  const furthest = entries.reduce((worst, entry) =>
    !worst || entry.budgetUsed > worst.budgetUsed ? entry : worst, null);
  // The reverse question, which is the one a player asks of a workplace: not
  // "where can I walk from here" but "who can get here".
  const catchment = workerAccessContext().evidence?.catchment?.get(building.index) ?? null;
  const count = (key, value) => t(key).replace('{count}', fmt(value, 0));
  return el('section', { class: 'map-walk-reach', 'data-walk-reach': String(entries.length) },
    el('h4', {}, t('walkReachTitle')),
    kv(t('walkReachCount'), fmt(entries.length, 0)),
    furthest ? kv(t('walkReachFurthest'),
      `${fmt(furthest.distanceMeters, 0)} m · ${fmt(furthest.budgetUsed, 0)} / ${fmt(mapWalkReach.budgetMeters ?? 480, 0)} ${t('walkReachBudget')}`) : null,
    furthest ? kv(t('walkReachLimitingLeg'), walkSurfaceLabel(furthest.limitingSurface)) : null,
    mapWalkReach.transit?.size ? kv(t('transitReachCount'),
      `${fmt(mapWalkReach.transit.size, 0)} · `
      + count('walkReachViaLines', mapWalkReach.serviceSlots?.size ?? 0)) : null,
    catchment?.walkAdults ? kv(t('walkReachCatchmentWalk'),
      `${fmt(catchment.walkAdults, 0)} ${t('walkReachPeople')} · `
      + count('walkReachFromResidences', catchment.walkResidences)) : null,
    catchment?.transitAdults ? kv(t('walkReachCatchmentTransit'),
      `${fmt(catchment.transitAdults, 0)} ${t('walkReachPeople')} · `
      + count('walkReachFromResidences', catchment.transitResidences)
      + ` · ${count('walkReachViaLines', catchment.transitLineSlots.size)}`) : null,
    el('p', { class: 'hint' }, t('walkReachHint')));
}

function renderMapBuildingInspector(building) {
  const progress = building.constructionProgress ?? 1;
  const percentOrDash = value =>
    Number.isFinite(value) ? `${fmt(value * 100, 0)} %` : '—';
  const residence = building.residenceDetail;
  return el('aside', { class: 'map-building-inspector', 'aria-live': 'polite' },
    el('h3', {}, building.displayName || mapBuildingDisplayName(building),
      el('span', { class: 'evidence-badge exact' }, t('exact'))),
    building.name ? kv(t('savedBuildingName'), building.name) : null,
    kv(t('savedBuildingType'), building.type || '—'),
    kv(t('area'), plannerScopeName(building.scopeId)),
    kv(t('building'), `#${building.index}`),
    kv(t('status'), progress < 1
      ? `${t('underConstruction')} · ${fmt(progress * 100, 0)} %` : t('completed')),
    buildingEstablishment(building) > 0
      ? kv(t('staffing'), `${fmt(building.currentWorkers ?? 0, 0)} / ${fmt(buildingEstablishment(building), 0)}`) : null,
    residence ? el('section', {
      class: 'map-residence-ledger', 'data-residence-ledger': '',
    },
    el('h4', {}, t('residenceLedger')),
    kv(t('adultSpaces'), residence.capacity == null
      ? mapCountOrDash(residence.occupiedAdultSpaces, fmt)
      : `${mapCountOrDash(residence.occupiedAdultSpaces, fmt)} / ${mapCountOrDash(residence.capacity, fmt)}`),
    kv(t('residents'),
      `${mapCountOrDash(residence.residents, fmt)} · `
      + `${mapCountOrDash(residence.children, fmt)} ${t('children')} · `
      + `${mapCountOrDash(residence.higherEducation, fmt)} ${t('higherEducationShort')}`),
    kv(t('residentWellbeing'),
      `${percentOrDash(residence.health)} ${t('health')} · `
      + `${percentOrDash(residence.happiness)} ${t('happiness')} · `
      + `${percentOrDash(residence.loyalty)} ${t('loyalty')}`),
    kv(t('residentCriminality'),
      `${t('averageShort')} ${percentOrDash(residence.criminality)} · `
      + `${t('highest')} ${percentOrDash(residence.highestCriminality)} · `
      + `${mapCountOrDash(residence.highRiskResidents, fmt)} ${t('highRiskResidents')}`)) : null,
    renderWalkReachSection(building),
    kv(t('mapCoordinates'), `X ${fmt(building.x, 1)} · Z ${fmt(building.z, 1)}`));
}

function renderMapTransportInspector(line) {
  const stopLabel = stop => stop.building?.name || stop.building?.type
    || (stop.buildingIndex < 0 ? '—' : `#${stop.buildingIndex}`);
  return el('aside', {
    class: 'map-building-inspector map-transport-inspector',
    'data-map-transport-inspector': '',
    'aria-live': 'polite',
  },
  el('h3', {}, line.name || `${t('vehicleLine')} #${line.slot}`,
    el('span', { class: 'evidence-badge exact' }, t('exact'))),
  kv(t('orderedStops'), `${fmt(line.locatedStopCount, 0)} / ${fmt(line.stopCount, 0)}`),
  el('ol', { class: 'map-transport-stops' },
    ...(line.stops ?? []).map(stop => el('li', {}, stopLabel(stop)))),
  kv(t('assignedVehicles'), fmt(line.assignedVehicles?.length ?? 0, 0)),
  Number.isFinite(line.completeObservedCycle)
    ? kv(t('completeObservedCycle'), fmt(line.completeObservedCycle, 2)) : null,
  Number.isFinite(line.largestObservedInterval)
    ? kv(t('largestObservedInterval'), fmt(line.largestObservedInterval, 2)) : null,
  el('p', { class: 'hint' }, t('mapTransportStraightLineHint')));
}

// Which rule drew the shoreline. A level measured from the buildings' own heights
// is a different claim from one guessed at by looking for a flat surface, and a
// reader comparing the map with the game deserves to know which they have.
function waterLevelNote(water) {
  if (!water?.waterHeightSource) return null;
  if (water.waterHeightSource === 'building-height-fit') {
    return el('span', { 'data-water-level': 'building-height-fit' },
      t('waterLevelMeasured')
        .replace('{count}', fmt(water.heightScale?.buildingCount ?? 0, 0))
        .replace('{r}', fmt(water.heightScale?.correlation ?? 0, 3)));
  }
  if (water.waterHeightSource === 'flat-plane') {
    return el('span', { 'data-water-level': 'flat-plane' }, t('waterLevelFlatPlane'));
  }
  return el('span', { 'data-water-level': water.waterHeightSource }, t('waterLevelUnknown'));
}

function renderStandaloneLeafletMap(model, layers, mapHintKey, outliers) {
  const mapMetric = normalizeMapMetric(state.mapMetric);
  if (state.mapMetric !== mapMetric) state.mapMetric = mapMetric;
  const scopeNames = new Map(model.scopes.map(scope => [scope.id, scope.name]));
  const catalogEntries = [...(DATA?.rawBuildings ?? []), ...(DATA?.workshopBuildings ?? [])];
  const categoryIndex = buildTypeCategoryIndex(catalogEntries);
  const residenceDetails = new Map(
    (state.saveImport?.residenceDetails?.buildings ?? [])
      .map(detail => [detail.buildingIndex, detail]),
  );
  const buildings = model.buildings.filter(building =>
    !isExternalAirLinkType(building.type) && building.type !== 'temp').map(building => {
    const catalog = matchSaveBuilding(building.type, catalogEntries, entry => entry.id);
    const category = categoryForSaveType(building.type, categoryIndex);
    return {
      ...building,
      category,
      displayName: mapBuildingDisplayName(building, catalog),
      residenceDetail: residenceDetailForBuilding(building, residenceDetails, {
        residential: category === 'living',
        capacity: Number.isFinite(catalog?.livingSpace) ? catalog.livingSpace : null,
      }),
      areaName: scopeNames.get(building.scopeId) ?? t('unassigned'),
      markScale: CATEGORY_MARKS[category]?.scale ?? CATEGORY_MARKS.other.scale,
      borderPost: isFrontierBuilding(building),
      outlier: !!building.criminalityOutlier,
      underConstruction: (building.constructionProgress ?? 1) < 1,
      selected: building.scopeId === state.republicScope,
      inspected: building.index === mapSelectedBuildingIndex,
    };
  });
  const scopes = model.scopes.map(scope => ({
    ...scope, selected: scope.id === state.republicScope,
  }));
  const transportLines = buildMapTransportLines(state.saveImport?.vehicleLines, buildings);
  const accessContext = workerAccessContext();
  const accessEvidence = accessContext.evidence;
  const accessAvailable = workerAccessAvailability(accessEvidence).available;
  const walkingAvailable = !!accessContext.network?.completeness?.walkingEdgesComplete;
  const categoryVisibility = {
    living: true, industry: true, services: true, support: true, other: true,
    ...(state.mapCategoryVisibility ?? {}),
  };
  const categoryMeta = [
    ['living', 'mapCategoryLiving'],
    ['industry', 'mapCategoryIndustry'],
    ['services', 'mapCategoryServices'],
    ['support', 'mapCategorySupport'],
    ['other', 'mapCategoryOther'],
  ];
  const categoryTotals = new Map(categoryMeta.map(([category]) => [
    category, buildings.filter(building =>
      !building.borderPost && building.category === category).length,
  ]));
  const buildingTypes = [...new Map(buildings
    .filter(building => !building.borderPost)
    .map(building => [building.type, building])).values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.type.localeCompare(b.type));
  const container = el('div', {
    class: 'republic-map leaflet-republic-map',
    role: 'application',
    'aria-label': t('schematicRepublicMap'),
  });
  let api = null;
  let mapInspector = null;
  const summary = el('div', { class: 'map-viewport-summary', 'aria-live': 'polite' },
    t('mapViewportWaiting'));
  const countLabels = new Map();
  const legend = el('div', { class: 'map-legend map-data-legend', 'aria-label': t('mapLegend') },
    ...categoryMeta.map(([category, key]) => {
      const count = el('span', { class: 'map-legend-count' }, fmt(categoryTotals.get(category), 0));
      countLabels.set(category, count);
      return el('button', {
        class: categoryVisibility[category] === false ? 'muted' : 'active',
        'data-map-category': category,
        'aria-pressed': String(categoryVisibility[category] !== false),
        onclick: event => {
          const visible = event.currentTarget.getAttribute('aria-pressed') !== 'true';
          event.currentTarget.setAttribute('aria-pressed', String(visible));
          event.currentTarget.classList.toggle('active', visible);
          event.currentTarget.classList.toggle('muted', !visible);
          categoryVisibility[category] = visible;
          state.mapCategoryVisibility = { ...categoryVisibility };
          api?.setCategory(category, visible);
          saveState();
        },
      }, el('i', { class: `building cat-${category}` }), t(key), ' ', count);
    }));
  const metricKey = el('div', {
    class: 'map-metric-key',
    'aria-label': t('mapMetricScale'),
  });
  const renderMetricKey = metric => {
    const entries = metric === 'construction' ? [
      ['construction-low', 'mapScaleConstructionLow'],
      ['construction-medium', 'mapScaleConstructionMedium'],
      ['construction-high', 'mapScaleConstructionHigh'],
      ['unknown', 'mapScaleCompleted'],
    ] : [];
    metricKey.hidden = entries.length === 0;
    metricKey.replaceChildren(...entries.map(([band, key]) =>
      el('span', {}, el('i', { class: `map-metric-swatch ${band}` }), t(key))));
  };
  renderMetricKey(mapMetric);
  const radiationAvailable = !!model.pollution?.radiationPacked;
  const radiationKey = radiationAvailable ? el('div', {
    class: 'map-radiation-key',
    'data-map-radiation-key': '',
    hidden: !layers.radiation,
    'aria-label': t('radiationScale'),
  },
  el('strong', {}, t('radiation')),
  el('span', { class: 'map-radiation-gradient', 'aria-hidden': 'true' }),
  el('span', {}, '0'),
  el('span', {}, '3'),
  el('span', { class: 'map-radiation-count' },
    model.pollution.radiationNonzero
      ? `${fmt(model.pollution.radiationNonzero, 0)} ${t('radiationCells')}`
      : t('noRadiationDetected'))) : null;
  // The line layers are named here and nowhere else — this map has no legend
  // beyond the building categories — so the toggle carries the colour swatch.
  // Without it the reader has a name and a colour and no way to pair them,
  // which is how railways and power lines read as one amber layer.
  const LINE_SWATCH = new Set(['roads', 'rails', 'pedestrian', 'power', 'transport']);
  const layerToggle = (key, label, available = true) => available ? el('label', {},
    el('input', {
      type: 'checkbox', checked: layers[key], 'data-map-layer': key,
      onchange: event => {
        layers[key] = event.target.checked;
        state.mapLayers = { ...state.mapLayers, [key]: event.target.checked };
        api?.setLayer(key, event.target.checked);
        if (key === 'radiation' && radiationKey) radiationKey.hidden = !event.target.checked;
        saveState();
      },
    }), ' ',
    LINE_SWATCH.has(key) ? el('i', { class: `layer-swatch ${key}`, 'aria-hidden': 'true' }) : null,
    label) : null;
  const modeButtons = el('div', { class: 'view-toggle map-metric-toggle', role: 'group', 'aria-label': t('mapMetric') },
    ...[
      ['category', 'mapMetricCategory'],
      ['construction', 'mapMetricConstruction'],
    ].map(([metric, key]) => el('button', {
      class: mapMetric === metric ? 'active' : '',
      'aria-pressed': String(mapMetric === metric),
      onclick: event => {
        state.mapMetric = metric;
        for (const button of event.currentTarget.parentElement.children) {
          button.classList.toggle('active', button === event.currentTarget);
          button.setAttribute('aria-pressed', String(button === event.currentTarget));
        }
        renderMetricKey(metric);
        api?.setMetric(metric);
        saveState();
      },
    }, t(key))));
  const search = el('input', {
    id: 'mapBuildingFilter',
    type: 'search',
    list: 'map-building-types',
    value: state.mapBuildingFilter ?? '',
    placeholder: t('mapSearchPlaceholder'),
    oninput: event => {
      state.mapBuildingFilter = event.target.value;
      api?.setFilter(event.target.value);
    },
    onchange: event => {
      saveState();
      const query = event.target.value.trim().toLocaleLowerCase();
      if (!query) return;
      const match = buildings.find(building =>
        [building.name, building.displayName, building.type]
          .some(value => String(value ?? '').toLocaleLowerCase() === query))
        ?? buildings.find(building =>
          [building.name, building.displayName, building.type, building.areaName]
            .some(value => String(value ?? '').toLocaleLowerCase().includes(query)));
      if (match) api?.focusBuilding(match);
    },
  });
  const toolbar = el('div', { class: 'map-toolbar map-data-toolbar' },
    el('label', { class: 'map-search' }, t('mapBuildingFilter'), search,
      el('datalist', { id: 'map-building-types' },
        ...buildingTypes.map(building =>
          el('option', { value: building.displayName, label: building.type })))),
    modeButtons,
    el('details', { class: 'map-layer-menu' },
      el('summary', {}, t('mapLayers')),
      el('fieldset', {},
        layerToggle('water', t('waterFootprint'), !!model.water),
        layerToggle('pollution', t('airPollution'), !!model.pollution),
        layerToggle('radiation', t('radiation'), radiationAvailable),
        layerToggle('roads', t('roads'), !!model.roads.length),
        layerToggle('rails', t('rails'), !!model.rails.length),
        layerToggle('pedestrian', t('pedestrianPaths'), !!model.pedestrian.length),
        layerToggle('power', t('mapPowerLines'),
          !!(model.powerHigh?.length || model.powerLow?.length)),
        layerToggle('walkReach', t('mapWalkReachLayer'), walkingAvailable),
        layerToggle('transport', t('savedTransportLines'), !!transportLines.length),
        layerToggle('buildings', t('buildings')),
        layerToggle('footprints', t('mapBuildingFootprints'),
          buildings.some(building => building.footprint?.length)),
        layerToggle('construction', t('underConstruction'),
          buildings.some(building => building.underConstruction)),
        layerToggle('borders', t('borderPosts'),
          buildings.some(building => building.borderPost)),
        layerToggle('scopes', t('areaCenters')),
        layerToggle('outliers', t('highCriminalityResidents'), !!outliers?.residents?.length),
        model.pollution ? el('label', { class: 'map-opacity' }, t('pollutionOpacity'),
          el('input', {
            type: 'range', min: '0.2', max: '1', step: '0.05',
            value: state.mapPollutionOpacity ?? 0.68,
            oninput: event => {
              state.mapPollutionOpacity = Number(event.target.value);
              api?.setPollutionOpacity(Number(event.target.value));
            },
            onchange: () => saveState(),
          })) : null,
        radiationAvailable ? el('label', { class: 'map-opacity' }, t('radiationOpacity'),
          el('input', {
            type: 'range', min: '0.2', max: '1', step: '0.05',
            value: state.mapRadiationOpacity ?? 0.72,
            oninput: event => {
              state.mapRadiationOpacity = Number(event.target.value);
              api?.setRadiationOpacity(Number(event.target.value));
            },
            onchange: () => saveState(),
          })) : null)),
    transportLines.length ? el('label', { class: 'map-transport-select' },
      t('savedTransportLine'),
      el('select', {
        'aria-label': t('savedTransportLine'),
        onchange: event => {
          const line = transportLines.find(item => String(item.slot) === event.target.value);
          if (!line) return;
          layers.transport = true;
          state.mapLayers = { ...state.mapLayers, transport: true };
          section.querySelector('[data-map-layer="transport"]').checked = true;
          api?.setLayer('transport', true);
          api?.focusTransportLine(line);
          saveState();
        },
      },
      el('option', { value: '' }, t('selectTransportLine')),
      ...transportLines.map(line => el('option', {
        value: String(line.slot),
        selected: line.slot === mapSelectedTransportLineSlot,
      }, line.name || `${t('vehicleLine')} #${line.slot}`)))) : null,
    el('div', { class: 'map-zoom-controls' },
      el('button', { onclick: () => api?.fitDeveloped() }, t('mapFitDeveloped')),
      el('button', { onclick: () => api?.fitFull() }, t('mapFullTerrain')),
      // Every layer, filter and selection is sticky across sessions, so there
      // has to be one way back to the view the map opens with.
      el('button', {
        'data-map-reset': '',
        onclick: () => {
          state.mapLayers = null;
          state.mapCategoryVisibility = null;
          state.mapBuildingFilter = '';
          state.mapMetric = 'category';
          state.mapPollutionOpacity = null;
          state.mapRadiationOpacity = null;
          mapSelectedBuildingIndex = null;
          mapSelectedTransportLineSlot = null;
          mapWalkReach = null;
          mapFocusBuildingIndex = null;
          standaloneLeafletCamera = null;
          saveState();
          update();
        },
      }, t('mapResetView'))));
  const selectedLine = transportLines.find(line => line.slot === mapSelectedTransportLineSlot);
  const selectedBuilding = buildings.find(building => building.inspected || building.focused);
  mapInspector = selectedLine ? renderMapTransportInspector(selectedLine)
    : selectedBuilding ? renderMapBuildingInspector(selectedBuilding)
    : el('aside', { class: 'map-building-inspector empty' },
      el('p', { class: 'hint' }, t('selectMapBuilding')));
  const viewport = el('div', { class: 'map-viewport standalone leaflet-map-viewport' },
    container, mapInspector, summary);
  const accessContainer = el('div', { class: 'worker-access-mount' });
  const accessSection = el('details', {
    class: 'worker-access-section',
    open: accessAvailable,
  },
  el('summary', {},
    el('strong', {}, t('workerAccessGraph')),
    el('span', {
      class: `evidence-badge ${accessAvailable ? 'exact' : 'unavailable'}`,
    }, accessAvailable ? t('exactSavedEvidence') : t('awaitingExactWalkingEvidence')),
    // Most services are not lines: a vehicle carries its own route, and a
    // cableway is scheduled by nothing at all. A reader whose workers travel
    // that way has no other way of telling whether the graph found them.
    accessEvidence?.summary?.vehicleRouteCount || accessEvidence?.summary?.cablewayRouteCount
      ? el('span', {
        class: 'hint',
        'data-access-vehicle-routes': String(accessEvidence.summary.vehicleRouteCount ?? 0),
        'data-access-cableway-routes': String(accessEvidence.summary.cablewayRouteCount ?? 0),
      }, [
        accessEvidence.summary.vehicleRouteCount
          ? t('accessVehicleRoutes').replace('{count}', fmt(accessEvidence.summary.vehicleRouteCount, 0)) : null,
        accessEvidence.summary.cablewayRouteCount
          ? t('accessCablewayRoutes').replace('{count}', fmt(accessEvidence.summary.cablewayRouteCount, 0)) : null,
      ].filter(Boolean).join(' · '))
      : null),
  accessContainer);
  const section = el('section', { class: 'map-page' },
    el('h2', {}, t('republicMapTitle')),
    el('p', { class: 'hint' }, t(mapHintKey), ' ', waterLevelNote(model.water)),
    toolbar,
    legend,
    metricKey,
    radiationKey,
    viewport,
    accessSection);

  requestAnimationFrame(() => {
    if (!container.isConnected) return;
    const accessGraph = mountWorkerAccessGraph(accessContainer, accessEvidence, {
      labels: {
        title: t('workerAccessGraph'),
        exact: t('exactSavedEvidence'),
        unavailable: t('workerAccessUnavailable'),
        missing: t('workerAccessMissing'),
        incomplete: t('workerAccessIncomplete'),
        notExact: t('workerAccessNotExact'),
        invalid: t('workerAccessInvalid'),
        select: t('workerAccessSelect'),
        locate: t('locateOnMap'),
        hint: t('workerAccessHint'),
        fit: t('workerAccessFit'),
        zoomIn: t('zoomIn'),
        zoomOut: t('zoomOut'),
        arrivesBy: t('workerAccessArrivesBy'),
        places: t('workerAccessPlaces'),
        ofCanReach: t('workerAccessOf'),
        canReach: t('workerAccessCanReach'),
        staffable: t('workerAccessStaffable'),
        notStaffable: t('workerAccessNotStaffable'),
        adults: t('workerAccessAdults'),
        leadsTo: t('workerAccessLeadsTo'),
        more: t('workerAccessMore'),
        showingOf: t('workerAccessShowingOf'),
        maxWorkers: t('workerAccessMaxWorkers'),
        ofSlots: t('workerAccessOfSlots'),
        bottleneck: t('workerAccessBottleneck'),
        walkingDistance: t('walkingDistance'),
        pathType: t('pathType'),
        connections: t('workerAccessConnections'),
        residence: t('residence'),
        stop: t('transportStop'),
        line: t('vehicleLine'),
        transfer: t('transfer'),
        workplace: t('workplace'),
        walk: t('accessLegWalk'),
        board: t('accessLegBoard'),
        ride: t('accessLegRide'),
        direct: t('walkSurfaceNone'),
        ...Object.fromEntries(Object.entries(WALK_SURFACE_KEYS)
          .map(([surface, key]) => [surface, t(key)])),
      },
      initialFocusId: accessNodeForBuilding(accessEvidence, mapSelectedBuildingIndex)?.id ?? null,
      showHeading: false,
      onLocateBuilding: index => {
        const building = buildings.find(item => item.index === index);
        if (building) api?.focusBuilding(building);
      },
    });
    const styles = getComputedStyle(document.documentElement);
    const color = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    const radiationLow = themeHexRgb(color('--blueprint', '#48657b'));
    const radiationHigh = themeHexRgb(color('--accent', '#9f2f2b'));
    api = mountRepublicLeafletMap(container, {
      model,
      buildings,
      scopes,
      transportLines,
      layers,
      categoryVisibility,
      mode: mapMetric,
      query: state.mapBuildingFilter ?? '',
      pollutionOpacity: state.mapPollutionOpacity ?? 0.68,
      radiationOpacity: state.mapRadiationOpacity ?? 0.72,
      palette: {
        living: color('--blueprint', '#4682a9'),
        industry: color('--accent', '#9f2f2b'),
        services: color('--pos', '#477a52'),
        support: color('--muted', '#626762'),
        other: color('--muted', '#626762'),
        panel: color('--panel', '#f1eadb'),
        muted: color('--muted', '#626762'),
        accent: color('--accent', '#9f2f2b'),
        accent2: color('--accent2', '#356b8c'),
        pos: color('--pos', '#477a52'),
        warn: color('--warn', '#b17a18'),
        neg: color('--neg', '#b63b35'),
        pedestrian: '#e7bd69',
        transport: color('--focus', '#d19042'),
        power: color('--power', '#6b3fa0'),
      },
      waterHref: standaloneWaterImageHref,
      pollutionHref: standalonePollutionImageHref,
      radiationHref: pollution => standaloneRadiationImageHref(
        pollution, radiationLow, radiationHigh,
      ),
      transportTooltipFor: line => el('div', { class: 'map-tooltip-content' },
        el('strong', {}, line.name || `${t('vehicleLine')} #${line.slot}`),
        el('span', {}, `${line.locatedStopCount} / ${line.stopCount} ${t('orderedStops')}`),
        el('span', {}, `${line.assignedVehicles?.length ?? 0} ${t('assignedVehicles')}`)),
      tooltipFor: (building, reach) => el('div', { class: 'map-tooltip-content' },
        el('strong', {}, building.displayName),
        building.name ? el('span', {}, building.name) : null,
        el('span', {}, building.areaName),
        buildingEstablishment(building) > 0
          ? el('span', {}, `${t('staffing')}: ${fmt(building.currentWorkers ?? 0, 0)} / ${fmt(buildingEstablishment(building), 0)}`)
          : null,
        reach ? el('span', { class: 'map-tooltip-walk' },
          `${t('walkingDistance')}: ${fmt(reach.distanceMeters, 0)} m · ${walkSurfaceLabel(reach.limitingSurface)}`)
          : null,
        building.underConstruction
          ? el('span', {}, `${t('underConstruction')}: ${fmt(building.constructionProgress * 100, 0)} %`)
          : null),
      walkReachFor: walkingAvailable ? walkableBuildingsFrom : null,
      onWalkReach: reach => {
        mapWalkReach = reach;
        if (mapSelectedBuildingIndex == null) return;
        const building = buildings.find(item => item.index === mapSelectedBuildingIndex);
        if (building) mapInspector.replaceWith(mapInspector = renderMapBuildingInspector(building));
      },
      onSelectBuilding: building => {
        mapSelectedTransportLineSlot = null;
        mapSelectedBuildingIndex = building.index;
        mapInspector.replaceWith(mapInspector = renderMapBuildingInspector(building));
        container.dataset.selectedBuilding = String(building.index);
        container.dataset.selectedTransportLine = '';
        const graphNode = accessNodeForBuilding(accessEvidence, building.index);
        if (graphNode) accessGraph.focus(graphNode.id);
      },
      onSelectTransportLine: line => {
        mapSelectedBuildingIndex = null;
        mapSelectedTransportLineSlot = line.slot;
        mapInspector.replaceWith(mapInspector = renderMapTransportInspector(line));
        container.dataset.selectedBuilding = '';
        container.dataset.selectedTransportLine = String(line.slot);
      },
      onSelectScope: scope => {
        mapFocusBuildingIndex = null;
        mapFocusScopeId = scope.id;
        state.republicScope = scope.id;
        update();
      },
      onViewportSummary: value => {
        summary.replaceChildren(
          el('strong', {}, `${fmt(value.buildings, 0)} ${t('buildings')}`),
          el('span', {}, `${t('staffing')}: ${fmt(value.workers, 0)} / ${fmt(value.positions, 0)}`),
          el('span', {}, `${t('underConstruction')}: ${fmt(value.underConstruction, 0)}`));
      },
      initialCamera: standaloneLeafletCamera,
    });
    standaloneLeafletMap = api;
  });
  return section;
}

// The pedestrian network arrives in the deferred map pass, so the access graph
// cannot be built at import time. Building it costs about a tenth of a second
// on the largest republic tested, which is worth paying once and keeping: the
// map overlay reruns a walking search on every click and needs the same graph.
let accessCache = { key: null, network: null, evidence: null };

function accessKeyForImport(imported) {
  if (!imported?.pedestrianNetwork) return null;
  return [imported.sourceName, imported.importedAt,
    imported.pedestrianNetwork.summary?.byteLength ?? 0,
    imported.roadNetwork?.summary?.byteLength ?? 0,
    imported.cablewayNetwork?.summary?.byteLength ?? 0,
    imported.ownedVehicles?.length ?? 0,
    imported.observedBuildings?.length ?? 0].join('|');
}

// Citizens walk beside roads as well as on footpaths, so both networks are
// joined into one walking graph at the nodes they share.
function walkingNetworksOf(imported) {
  return { pedestrian: imported?.pedestrianNetwork ?? null, road: imported?.roadNetwork ?? null };
}

function workerAccessContext() {
  const imported = state.saveImport;
  const key = accessKeyForImport(imported);
  if (!key) return { network: null, evidence: null };
  if (accessCache.key === key) return accessCache;
  const buildings = imported.observedBuildings ?? [];
  accessCache = {
    key,
    network: buildWalkingNetwork(walkingNetworksOf(imported), buildings),
    evidence: buildWorkerAccessEvidence({
      pedestrianNetwork: walkingNetworksOf(imported),
      buildings,
      residenceOccupancy: imported.residenceOccupancy,
      vehicleLines: imported.vehicleLines,
      vehicleRoutes: buildVehicleRoutes({
        // The import stores the resolved fleet as ownedVehicles; there is no
        // `vehicles` on it, and reading one silently found no transport at all.
        vehicles: imported.ownedVehicles ?? [],
        buildings,
        lineVehicleIds: (Array.isArray(imported.vehicleLines)
          ? imported.vehicleLines : imported.vehicleLines?.lines ?? [])
          .flatMap(line => line.vehicleIds ?? []),
      }),
      cablewayRoutes: buildCablewayRoutes(imported.cablewayNetwork, buildings),
      cablewayLabel: t('accessCablewayLine'),
      labelFor: mapBuildingDisplayName,
    }),
  };
  return accessCache;
}

// A map click should move the graph to that building. Several nodes can carry
// the same building — a stop is both boarded at and alighted at — so the one
// the reader most likely means is picked rather than whichever came first.
const ACCESS_NODE_PRIORITY = ['residence', 'workplace', 'stop', 'transfer'];

function accessNodeForBuilding(evidence, buildingIndex) {
  const candidates = (evidence?.nodes ?? []).filter(node => node.buildingIndex === buildingIndex);
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => {
    const rank = kind => {
      const at = ACCESS_NODE_PRIORITY.indexOf(kind);
      return at === -1 ? ACCESS_NODE_PRIORITY.length : at;
    };
    return rank(a.kind) - rank(b.kind) || a.stage - b.stage;
  })[0];
}

// One search per building, reused for both halves of the overlay and cheap
// enough to keep: a walking search is bounded by the 480 m budget.
let overlayReachCache = { key: null, byBuilding: new Map() };

function reachOfBuilding(network, key) {
  if (overlayReachCache.key !== key) overlayReachCache = { key, byBuilding: new Map() };
  return index => {
    if (!overlayReachCache.byBuilding.has(index)) {
      overlayReachCache.byBuilding.set(index, walkingReachFrom(network, index));
    }
    return overlayReachCache.byBuilding.get(index);
  };
}

// Clicking a building asks "who can get here, and how" — and on a republic that
// runs cableways or trains, the walking half alone answers almost nothing.
function walkableBuildingsFrom(buildingIndex) {
  const { network, evidence, key } = workerAccessContext();
  if (!network || !Number.isInteger(buildingIndex)) return null;
  const reachOf = reachOfBuilding(network, key);
  const walk = reachOf(buildingIndex);
  if (!walk.available) return null;
  const services = evidence?.services;
  const reach = services
    ? transitReachFrom(buildingIndex, { reachOf, ...services })
    : { transit: new Map(), serviceSlots: new Set() };
  return {
    ...walk,
    transit: reach.transit ?? new Map(),
    serviceSlots: reach.serviceSlots ?? new Set(),
  };
}

function renderSchematicRepublicMap(buildings, scopes, outliers, { standalone = false } = {}) {
  if (!standalone && !compactMapExpanded
    && !Number.isInteger(mapFocusBuildingIndex) && !Number.isInteger(mapFocusScopeId)) {
    const locatedCount = (buildings ?? []).filter(building =>
      Number.isFinite(building.x) && Number.isFinite(building.z)).length;
    return el('details', {
      class: 'secondary-section map-section map-deferred',
      ontoggle: event => {
        if (!event.currentTarget.open) return;
        compactMapExpanded = true;
        compactMapOpen = true;
        update();
      },
    },
      el('summary', {}, `${t('schematicRepublicMap')} (${fmt(locatedCount, 0)})`),
      el('p', { class: 'hint' }, t('mapDeferredHint')));
  }
  const model = buildSchematicMap(buildings, scopes, outliers, {
    focusBuildingIndex: mapFocusBuildingIndex,
    roadNetwork: state.saveImport?.roadNetwork,
    railNetwork: state.saveImport?.railNetwork,
    pedestrianNetwork: standalone ? state.saveImport?.pedestrianNetwork : null,
    powerHighNetwork: standalone ? state.saveImport?.powerHighNetwork : null,
    powerLowNetwork: standalone ? state.saveImport?.powerLowNetwork : null,
    terrainWater: state.saveImport?.terrainWater,
    pollutionLayer: state.saveImport?.pollutionLayer,
    footprints: standalone ? DATA.buildingFootprints : null,
  });
  if (!model) return null;
  const layers = standalone ? {
    water: true, pollution: true, radiation: false, roads: true, rails: true, pedestrian: false, buildings: true,
    transport: false, construction: true, scopes: true, borders: true, outliers: true, walkReach: true,
    footprints: true, power: false,
    ...(state.mapLayers ?? {}),
  } : {
    water: true, pollution: false, radiation: false, roads: true, rails: true, pedestrian: false, buildings: true,
    construction: true, scopes: true, borders: true, outliers: true,
  };
  const buildingFilter = standalone ? String(state.mapBuildingFilter ?? '').trim().toLowerCase() : '';
  if (standalone) {
    const mapHintKey = model.rails.length
      ? (model.water ? 'schematicMapNetworksWaterHint' : 'schematicMapNetworksHint')
      : model.water
        ? (model.roads.length ? 'schematicMapRoadWaterHint' : 'schematicMapWaterHint')
        : (model.roads.length ? 'schematicMapRoadHint' : 'schematicMapHint');
    return renderStandaloneLeafletMap(model, layers, mapHintKey, outliers);
  }
  const ns = 'http://www.w3.org/2000/svg';
  const node = (tag, attrs = {}) => {
    const item = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
    return item;
  };
  const focusedBuilding = model.buildings.find(building => building.focused);
  const zoomWidth = model.width / 4;
  const zoomHeight = model.height / 4;
  const zoomX = focusedBuilding
    ? Math.max(0, Math.min(model.width - zoomWidth, focusedBuilding.mapX - zoomWidth / 2)) : 0;
  const zoomY = focusedBuilding
    ? Math.max(0, Math.min(model.height - zoomHeight, focusedBuilding.mapY - zoomHeight / 2)) : 0;
  const fullViewBox = { x: 0, y: 0, width: model.width, height: model.height };
  const clampViewBox = view => {
    const width = Math.max(model.width / 32, Math.min(model.width, view.width));
    const height = width * model.height / model.width;
    return {
      x: Math.max(0, Math.min(model.width - width, view.x)),
      y: Math.max(0, Math.min(model.height - height, view.y)),
      width, height,
    };
  };
  const fitView = (points, { minimumWidth = 80, marginRatio = 0.12 } = {}) => {
    if (!points.length) return fullViewBox;
    const xs = points.map(point => point.mapX);
    const ys = points.map(point => point.mapY);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const margin = Math.max(10, Math.max(spanX, spanY) * marginRatio);
    let width = Math.max(minimumWidth, spanX + margin * 2);
    let height = Math.max(minimumWidth * model.height / model.width, spanY + margin * 2);
    const aspect = model.width / model.height;
    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;
    return clampViewBox({
      x: (Math.min(...xs) + Math.max(...xs) - width) / 2,
      y: (Math.min(...ys) + Math.max(...ys) - height) / 2,
      width, height,
    });
  };
  const developedBuildings = model.buildings.filter(building =>
    !isFrontierBuilding(building) && !isExternalAirLinkType(building.type));
  const developedViewBox = fitView(developedBuildings, { minimumWidth: 95, marginRatio: 0.08 });
  const scopeBuildings = Number.isInteger(mapFocusScopeId)
    ? model.buildings.filter(building => building.scopeId === mapFocusScopeId) : [];
  const scopeViewBox = scopeBuildings.length ? (() => {
    return fitView(scopeBuildings);
  })() : null;
  const activeStandaloneViewBox = standaloneMapViewBox
    ? clampViewBox(standaloneMapViewBox)
    : standalone && focusedBuilding
      ? clampViewBox({ x: zoomX, y: zoomY, width: zoomWidth, height: zoomHeight }) : developedViewBox;
  if (standalone && !standaloneMapViewBox) {
    standaloneMapViewBox = activeStandaloneViewBox;
  }
  const compactViewBox = focusedBuilding
    ? clampViewBox({ x: zoomX, y: zoomY, width: zoomWidth, height: zoomHeight })
    : scopeViewBox ?? developedViewBox;
  const mapPointScale = (standalone ? activeStandaloneViewBox.width : compactViewBox.width) / model.width;
  const svg = node('svg', {
    viewBox: standalone
      ? `${activeStandaloneViewBox.x} ${activeStandaloneViewBox.y} ${activeStandaloneViewBox.width} ${activeStandaloneViewBox.height}`
      : `${compactViewBox.x} ${compactViewBox.y} ${compactViewBox.width} ${compactViewBox.height}`,
    class: `republic-map${standalone ? ' standalone' : ''}`,
    role: standalone ? 'group' : 'img', 'aria-label': t('schematicRepublicMap'),
  });
  const applyStandaloneViewBox = view => {
    standaloneMapViewBox = clampViewBox(view);
    const current = standaloneMapViewBox;
    svg.setAttribute('viewBox', `${current.x} ${current.y} ${current.width} ${current.height}`);
  };
  if (standalone) {
    let drag = null;
    let pendingView = null;
    let cameraFrame = null;
    let wheelTarget = null;
    let wheelFrame = null;
    let cachedRect = null;
    const currentCamera = () => pendingView ?? standaloneMapViewBox ?? fullViewBox;
    const mapRect = () => cachedRect ??= svg.getBoundingClientRect();
    const scheduleCamera = view => {
      pendingView = clampViewBox(view);
      if (cameraFrame !== null) return;
      cameraFrame = requestAnimationFrame(() => {
        const next = pendingView;
        pendingView = null;
        cameraFrame = null;
        cachedRect = null;
        if (next) applyStandaloneViewBox(next);
      });
    };
    const stopWheelAnimation = () => {
      if (wheelFrame !== null) cancelAnimationFrame(wheelFrame);
      wheelFrame = null;
      wheelTarget = null;
    };
    const animateWheel = () => {
      wheelFrame = null;
      if (!wheelTarget) return;
      const current = standaloneMapViewBox ?? fullViewBox;
      const target = wheelTarget;
      const next = {
        x: current.x + (target.x - current.x) * 0.32,
        y: current.y + (target.y - current.y) * 0.32,
        width: current.width + (target.width - current.width) * 0.32,
      };
      next.height = next.width * model.height / model.width;
      const remaining = Math.max(Math.abs(target.x - next.x), Math.abs(target.y - next.y),
        Math.abs(target.width - next.width));
      if (remaining < 0.02) {
        applyStandaloneViewBox(target);
        wheelTarget = null;
        return;
      }
      applyStandaloneViewBox(next);
      wheelFrame = requestAnimationFrame(animateWheel);
    };
    const scheduleWheel = view => {
      wheelTarget = clampViewBox(view);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        applyStandaloneViewBox(wheelTarget);
        wheelTarget = null;
      } else if (wheelFrame === null) {
        wheelFrame = requestAnimationFrame(animateWheel);
      }
    };
    svg.addEventListener('wheel', event => {
      event.preventDefault();
      const current = wheelTarget ?? currentCamera();
      const rect = mapRect();
      const anchorX = current.x + (event.clientX - rect.left) / rect.width * current.width;
      const anchorY = current.y + (event.clientY - rect.top) / rect.height * current.height;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const factor = Math.max(0.84, Math.min(1.19, Math.exp(delta * 0.0015)));
      const width = current.width * factor;
      const height = width * model.height / model.width;
      scheduleWheel({
        x: anchorX - (anchorX - current.x) * width / current.width,
        y: anchorY - (anchorY - current.y) * height / current.height,
        width, height,
      });
    }, { passive: false });
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      stopWheelAnimation();
      const current = currentCamera();
      drag = { x: event.clientX, y: event.clientY, view: { ...current }, rect: mapRect() };
      // Deliberately not capturing the pointer here. Capturing on press
      // retargets the following click to the svg, so a marker's own click
      // handler never ran and selecting a building did nothing at all.
      // Capture starts below, once the pointer has actually moved.
    });
    svg.addEventListener('pointermove', event => {
      if (!drag) return;
      const travelled = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
      // A press that has not moved is still a click in progress. Only a real
      // drag needs the pointer captured, and then it needs it so that panning
      // continues when the cursor leaves the map.
      if (travelled <= 3) return;
      if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
      scheduleCamera({
        ...drag.view,
        x: drag.view.x - (event.clientX - drag.x) / drag.rect.width * drag.view.width,
        y: drag.view.y - (event.clientY - drag.y) / drag.rect.height * drag.view.height,
      });
    });
    svg.addEventListener('pointerup', event => {
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      drag = null;
    });
    svg.addEventListener('pointercancel', () => { drag = null; });
  }
  const waterImageHref = water => {
    if (terrainWaterImageCache.has(water.packed)) return terrainWaterImageCache.get(water.packed);
    const canvas = document.createElement('canvas');
    canvas.width = water.width;
    canvas.height = water.height;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(water.width, water.height);
    pixels.data.set(waterRasterPixels(water.packed, water.width * water.height));
    context.putImageData(pixels, 0, 0);
    const href = canvas.toDataURL('image/png');
    terrainWaterImageCache.set(water.packed, href);
    return href;
  };
  const waterLayer = node('g', { class: 'map-water' });
  if (model.water) waterLayer.append(node('image', {
    href: waterImageHref(model.water),
    x: model.water.mapX.toFixed(2), y: model.water.mapY.toFixed(2),
    width: model.water.mapWidth.toFixed(2), height: model.water.mapHeight.toFixed(2),
    preserveAspectRatio: 'none',
  }));
  const pollutionImageHref = pollution => {
    if (pollutionImageCache.has(pollution.airPacked)) return pollutionImageCache.get(pollution.airPacked);
    const packed = Uint8Array.from(atob(pollution.airPacked), character => character.charCodeAt(0));
    const canvas = document.createElement('canvas');
    canvas.width = pollution.width;
    canvas.height = pollution.height;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(pollution.width, pollution.height);
    for (let index = 0; index < packed.length; index += 1) {
      const value = packed[index] / 255;
      if (!value) continue;
      const blend = value < 0.5 ? value * 2 : (value - 0.5) * 2;
      const from = value < 0.5 ? [45, 176, 88] : [246, 201, 55];
      const to = value < 0.5 ? [246, 201, 55] : [220, 55, 45];
      const target = index * 4;
      pixels.data[target] = Math.round(from[0] + (to[0] - from[0]) * blend);
      pixels.data[target + 1] = Math.round(from[1] + (to[1] - from[1]) * blend);
      pixels.data[target + 2] = Math.round(from[2] + (to[2] - from[2]) * blend);
      pixels.data[target + 3] = Math.round(65 + value * 190);
    }
    context.putImageData(pixels, 0, 0);
    const href = canvas.toDataURL('image/png');
    pollutionImageCache.set(pollution.airPacked, href);
    return href;
  };
  const pollutionLayer = node('g', {
    class: 'map-pollution', opacity: String(state.mapPollutionOpacity ?? 0.68),
  });
  if (model.pollution) pollutionLayer.append(node('image', {
    href: pollutionImageHref(model.pollution),
    x: model.pollution.mapX.toFixed(2), y: model.pollution.mapY.toFixed(2),
    width: model.pollution.mapWidth.toFixed(2), height: model.pollution.mapHeight.toFixed(2),
    preserveAspectRatio: 'none', 'data-polluted-cells': model.pollution.airNonzero,
  }));
  const scopeNames = new Map(model.scopes.map(scope => [scope.id, scope.name]));
  const railLayer = node('g', { class: 'map-rails' });
  if (model.rails.length) {
    railLayer.append(node('path', {
      d: model.rails.map(rail => rail.points.map((point, index) =>
        `${index ? 'L' : 'M'}${point.mapX.toFixed(2)} ${point.mapY.toFixed(2)}`).join(' ')).join(' '),
      'data-rail-count': model.rails.length,
    }));
  }
  const roadLayer = node('g', { class: 'map-roads' });
  if (model.roads.length) {
    roadLayer.append(node('path', {
      d: model.roads.map(road => road.points.map((point, index) =>
        `${index ? 'L' : 'M'}${point.mapX.toFixed(2)} ${point.mapY.toFixed(2)}`).join(' ')).join(' '),
      'data-road-count': model.roads.length,
    }));
  }
  const pedestrianLayer = node('g', { class: 'map-pedestrian' });
  if (model.pedestrian.length) {
    pedestrianLayer.append(node('path', {
      d: model.pedestrian.map(edge => edge.points.map((point, index) =>
        `${index ? 'L' : 'M'}${point.mapX.toFixed(2)} ${point.mapY.toFixed(2)}`).join(' ')).join(' '),
      'data-pedestrian-count': model.pedestrian.length,
    }));
  }
  const normalLayer = node('g', { class: 'map-buildings' });
  const selectedLayer = node('g', { class: 'map-selected' });
  const borderLayer = node('g', { class: 'map-borders' });
  const outlierLayer = node('g', { class: 'map-outliers' });
  let mapInspector = null;
  const renderBuildingInspector = building => {
    const progress = building.constructionProgress ?? 1;
    return el('aside', { class: 'map-building-inspector', 'aria-live': 'polite' },
      el('h3', {}, mapBuildingDisplayName(building),
        el('span', { class: 'evidence-badge exact' }, t('exact'))),
      building.name ? kv(t('savedBuildingName'), building.name) : null,
      kv(t('savedBuildingType'), building.type || '—'),
      kv(t('area'), plannerScopeName(building.scopeId)),
      kv(t('building'), `#${building.index}`),
      kv(t('status'), progress < 1
        ? `${t('underConstruction')} · ${fmt(progress * 100, 0)} %` : t('completed')),
      buildingEstablishment(building) > 0
        ? kv(t('staffing'), `${fmt(building.currentWorkers ?? 0, 0)} / ${fmt(buildingEstablishment(building), 0)}`) : null,
      kv(t('mapCoordinates'), `X ${fmt(building.x, 1)} · Z ${fmt(building.z, 1)}`));
  };
  // One pass over the dataset, so each marker costs a Map lookup rather than a
  // search through it.
  const categoryIndex = buildTypeCategoryIndex(
    [...(DATA?.rawBuildings ?? []), ...(DATA?.workshopBuildings ?? [])]);
  const markFor = building => CATEGORY_MARKS[categoryForSaveType(building.type, categoryIndex)]
    ?? CATEGORY_MARKS.other;

  const inspectBuilding = (building, circle) => {
    mapSelectedBuildingIndex = building.index;
    for (const marker of svg.querySelectorAll('.map-inspected')) marker.classList.remove('map-inspected');
    circle.classList.add('map-inspected');
    if (mapInspector) mapInspector.replaceWith(mapInspector = renderBuildingInspector(building));
  };
  for (const building of model.buildings) {
    if (isExternalAirLinkType(building.type)) continue;
    // The game writes a `temp` object per construction site. They are
    // scaffolding rather than buildings, no dataset entry describes them, and
    // they were a fifth of every marker on the map.
    if (building.type === 'temp') continue;
    const borderPost = isFrontierBuilding(building);
    const selected = building.scopeId === state.republicScope;
    const outlier = building.criminalityOutlier;
    const underConstruction = (building.constructionProgress ?? 1) < 1;
    const displayName = mapBuildingDisplayName(building);
    const mark = markFor(building);
    const special = borderPost || outlier || building.focused;
    const radius = (building.focused ? 7.5 : borderPost ? 4.5 : outlier ? 5.5
      : selected ? 2.4 : 1.35 * mark.scale) * mapPointScale;
    const shape = special ? 'circle' : mark.shape;
    const cx = Number(building.mapX.toFixed(2));
    const cy = Number(building.mapY.toFixed(2));
    const geometry = shape === 'square'
      ? { x: (cx - radius).toFixed(2), y: (cy - radius).toFixed(2),
        width: (radius * 2).toFixed(2), height: (radius * 2).toFixed(2) }
      : shape === 'diamond'
        ? { points: [[cx, cy - radius], [cx + radius, cy], [cx, cy + radius], [cx - radius, cy]]
          .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ') }
        : { cx: cx.toFixed(2), cy: cy.toFixed(2), r: radius };
    const circle = node(shape === 'square' ? 'rect' : shape === 'diamond' ? 'polygon' : 'circle', {
      ...geometry,
      'data-map-category': special ? 'status' : categoryForSaveType(building.type, categoryIndex),
      'data-building-type': building.type ?? '',
      'data-building-label': displayName,
      'data-building-name': building.name ?? '',
      'data-map-kind': borderPost ? 'border' : underConstruction ? 'construction' : 'building',
      'data-map-outlier': outlier ? 'true' : 'false',
      'data-map-selected': selected ? 'true' : 'false',
      ...(standalone ? { tabindex: '0', role: 'button', 'aria-label': displayName } : {}),
      class: [building.focused ? 'focused' : '', underConstruction ? 'under-construction' : '',
        borderPost ? 'border-post' : '', building.index === mapSelectedBuildingIndex ? 'map-inspected' : '']
        .filter(Boolean).join(' '),
    });
    const title = node('title');
    const buildingTitle = outlier
      ? `${t('citizen')} #${outlier.citizenIndex} · ${fmt(outlier.criminality * 100, 2)} % · `
        + `${building.name || building.type || t('building')} #${building.index} · ${scopeNames.get(building.scopeId) ?? t('unassigned')}`
      : `${building.name || building.type || t('building')} #${building.index} · ${scopeNames.get(building.scopeId) ?? t('unassigned')}`;
    title.textContent = buildingTitle + (underConstruction
      ? ` · ${t('underConstruction')} ${fmt(building.constructionProgress * 100, 0)} %` : '');
    circle.append(title);
    if (standalone) {
      circle.addEventListener('click', () => inspectBuilding(building, circle));
      circle.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        inspectBuilding(building, circle);
      });
    }
    (borderPost ? borderLayer : outlier ? outlierLayer : selected ? selectedLayer : normalLayer).append(circle);
  }
  const scopeBuildingTypes = new Map();
  for (const building of model.buildings) {
    if (!Number.isInteger(building.scopeId)) continue;
    const types = scopeBuildingTypes.get(building.scopeId) ?? [];
    types.push(building.type);
    scopeBuildingTypes.set(building.scopeId, types);
  }
  const borderOnlyScopeIds = new Set([...scopeBuildingTypes.entries()]
    .filter(([, types]) => types.length && types.every(type => isBorderPostType(type)
      || isExternalAirLinkType(type)
      || String(type ?? '').toLowerCase().includes('transformator_customin')))
    .map(([scopeId]) => scopeId));
  const scopeLayer = node('g', { class: 'map-scopes' });
  for (const scope of model.scopes) {
    if (borderOnlyScopeIds.has(scope.id)) continue;
    const focusedScopeId = focusedBuilding?.scopeId ?? (scopeViewBox ? mapFocusScopeId : null);
    if (Number.isInteger(focusedScopeId) && scope.id !== focusedScopeId) continue;
    const marker = node('circle', {
      cx: scope.mapX.toFixed(2), cy: scope.mapY.toFixed(2),
      r: (scope.id === state.republicScope ? 6 : 4) * mapPointScale,
      tabindex: '0', role: 'button', 'aria-label': scope.name,
    });
    const focusScope = () => {
      mapFocusBuildingIndex = null;
      mapFocusScopeId = scope.id;
      state.republicScope = scope.id;
      update();
    };
    marker.addEventListener('click', focusScope);
    marker.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      focusScope();
    });
    const title = node('title');
    title.textContent = scope.name;
    marker.append(title);
    scopeLayer.append(marker);
  }
  svg.append(waterLayer, pollutionLayer, railLayer, roadLayer, pedestrianLayer);
  svg.append(normalLayer, selectedLayer, borderLayer, scopeLayer, outlierLayer);
  const mapHintKey = model.rails.length
    ? (model.water ? 'schematicMapNetworksWaterHint' : 'schematicMapNetworksHint')
    : model.water
      ? (model.roads.length ? 'schematicMapRoadWaterHint' : 'schematicMapWaterHint')
      : (model.roads.length ? 'schematicMapRoadHint' : 'schematicMapHint');
  const focusedScope = scopeViewBox ? model.scopes.find(scope => scope.id === mapFocusScopeId) : null;
  const scopeUnderConstruction = scopeBuildings.filter(building =>
    (building.constructionProgress ?? 1) < 1).length;
  const hasUnderConstruction = model.buildings.some(building =>
    (building.constructionProgress ?? 1) < 1);
  const scopeSummary = focusedScope ? el('div', { class: 'map-scope-summary' },
    el('strong', {}, focusedScope.name),
    el('span', {}, `${t('mappedBuildings')}: ${fmt(scopeBuildings.length, 0)}`),
    el('span', {}, `${t('underConstruction')}: ${fmt(scopeUnderConstruction, 0)}`),
    el('span', { class: 'evidence-badge exact' }, t('exact'))) : null;
  const borderPosts = model.buildings.filter(building => isFrontierBuilding(building));
  const legend = el('div', { class: 'map-legend' },
    model.water ? el('span', { 'data-map-legend': 'water' }, el('i', { class: 'water' }), t('waterFootprint')) : null,
    model.pollution ? el('span', {
      'data-map-legend': 'pollution',
      title: `${fmt(model.pollution.airNonzero, 0)} ${t('pollutedCells')}`,
    }, el('i', { class: 'pollution' }), t('airPollution')) : null,
    model.roads.length ? el('span', { 'data-map-legend': 'roads' }, el('i', { class: 'road' }), t('roads')) : null,
    model.rails.length ? el('span', { 'data-map-legend': 'rails' }, el('i', { class: 'rail' }), t('rails')) : null,
    model.pedestrian.length ? el('span', { 'data-map-legend': 'pedestrian' }, el('i', { class: 'pedestrian' }), t('pedestrianPaths')) : null,
    // The grid was drawn with no legend entry at all, so its lines were both
    // the same colour as the railways and unnamed.
    (model.powerLow?.length || model.powerHigh?.length)
      ? el('span', { 'data-map-legend': 'power' }, el('i', { class: 'power' }), t('mapPowerLines')) : null,
    // One grey dot said 'Buildings' while the map drew four shapes in four
    // colours, so the legend explained none of what a reader was looking at.
    el('span', { 'data-map-legend': 'buildings' },
      el('i', { class: 'building cat-living' }), t('mapCategoryLiving')),
    el('span', { 'data-map-legend': 'buildings' },
      el('i', { class: 'building cat-industry' }), t('mapCategoryIndustry')),
    el('span', { 'data-map-legend': 'buildings' },
      el('i', { class: 'building cat-services' }), t('mapCategoryServices')),
    el('span', { 'data-map-legend': 'buildings' },
      el('i', { class: 'building cat-support' }), t('mapCategorySupport')),
    Number.isInteger(state.republicScope)
      ? el('span', { 'data-map-legend': 'selected' }, el('i', { class: 'selected' }), t('selectedAreaBuildings')) : null,
    hasUnderConstruction
      ? el('span', { 'data-map-legend': 'construction' }, el('i', { class: 'construction' }), t('underConstruction')) : null,
    borderPosts.length ? el('span', { 'data-map-legend': 'borders' }, el('i', { class: 'border' }), t('borderPosts')) : null,
    el('span', { 'data-map-legend': 'scopes' }, el('i', { class: 'scope' }), t('areaCenters')),
    el('span', { 'data-map-legend': 'outliers' }, el('i', { class: 'outlier' }), t('highCriminalityResidents')));
  applyStandaloneMapVisibility(svg, layers, buildingFilter, legend);
  if (standalone) {
    const layerToggle = (key, label, available = true) => available ? el('label', {},
      el('input', {
        type: 'checkbox', checked: layers[key], 'data-map-layer': key,
        onchange: event => {
          state.mapLayers = { ...state.mapLayers, [key]: event.target.checked };
          layers[key] = event.target.checked;
          applyStandaloneMapVisibility(svg, layers, state.mapBuildingFilter, legend);
          saveState();
        },
      }), ' ', label) : null;
    const buildingTypes = [...new Map(model.buildings
      .filter(building => !isFrontierBuilding(building) && !isExternalAirLinkType(building.type))
      .map(building => [building.type, {
        type: building.type, label: mapBuildingDisplayName(building),
      }])).values()].sort((a, b) => a.label.localeCompare(b.label) || a.type.localeCompare(b.type));
    const currentView = () => standaloneMapViewBox ?? fullViewBox;
    const zoom = factor => {
      const view = currentView();
      const width = view.width * factor;
      const height = width * model.height / model.width;
      applyStandaloneViewBox({
        x: view.x + (view.width - width) / 2,
        y: view.y + (view.height - height) / 2,
        width, height,
      });
    };
    return el('section', { class: 'map-page' },
      el('h2', {}, t('republicMapTitle')),
      el('p', { class: 'hint' }, t(mapHintKey)),
      model.pedestrian.length ? el('p', { class: 'hint' }, t('pedestrianPathsHint')) : null,
      el('div', { class: 'map-toolbar' },
        el('fieldset', {}, el('legend', {}, t('mapLayers')),
          layerToggle('water', t('waterFootprint'), !!model.water),
          layerToggle('pollution', t('airPollution'), !!model.pollution),
          layerToggle('roads', t('roads'), !!model.roads.length),
          layerToggle('rails', t('rails'), !!model.rails.length),
          layerToggle('pedestrian', t('pedestrianPaths'), !!model.pedestrian.length),
          layerToggle('buildings', t('buildings')),
          layerToggle('construction', t('underConstruction'), hasUnderConstruction),
          layerToggle('borders', t('borderPosts'), !!borderPosts.length),
          layerToggle('scopes', t('areaCenters')),
          layerToggle('outliers', t('highCriminalityResidents'), !!outliers?.residents?.length)),
        model.pollution ? el('label', {}, t('pollutionOpacity'), ' ',
          el('input', {
            type: 'range', min: '0.2', max: '1', step: '0.05',
            value: state.mapPollutionOpacity ?? 0.68,
            oninput: event => {
              state.mapPollutionOpacity = Number(event.target.value);
              svg.querySelector('.map-pollution')?.setAttribute('opacity', event.target.value);
            },
            onchange: () => saveState(),
          })) : null,
        el('label', {}, t('mapBuildingFilter'), ' ',
          el('input', {
            id: 'mapBuildingFilter', type: 'search', list: 'map-building-types',
            value: state.mapBuildingFilter ?? '', placeholder: t('mapAllBuildingTypes'),
            oninput: event => {
              state.mapBuildingFilter = event.target.value;
              applyStandaloneMapVisibility(svg, layers, state.mapBuildingFilter, legend);
            },
            onchange: () => saveState(),
          }),
          el('datalist', { id: 'map-building-types' },
            ...buildingTypes.map(item => el('option', { value: item.label, label: item.type })))),
        el('div', { class: 'map-zoom-controls' },
          el('button', { title: t('mapZoomIn'), onclick: () => zoom(0.7) }, '+'),
          el('button', { title: t('mapZoomOut'), onclick: () => zoom(1.4) }, '−'),
          el('button', {
            title: t('mapReset'),
            onclick: () => {
              mapFocusBuildingIndex = null;
              mapFocusScopeId = null;
              standaloneMapViewBox = developedViewBox;
              update();
            },
          }, t('mapFitDeveloped')),
          el('button', {
            onclick: () => {
              mapFocusBuildingIndex = null;
              mapFocusScopeId = null;
              standaloneMapViewBox = fullViewBox;
              update();
            },
          }, t('mapFullTerrain')))),
      legend,
      // The inspector sits over the map rather than above it. Rendered before
      // the map, it updated off-screen behind anyone who had scrolled down to
      // click a building: the marker highlighted and nothing appeared to
      // happen.
      // The viewport carries the standalone marker, not the svg: the
      // inspector is the svg's sibling, so a selector rooted at the svg could
      // never reach it and the overlay styling silently did nothing.
      el('div', { class: 'map-viewport standalone' }, svg, mapInspector = (() => {
        const selectedBuilding = model.buildings.find(building =>
          building.index === mapSelectedBuildingIndex || building.focused);
        return selectedBuilding ? renderBuildingInspector(selectedBuilding)
          : el('aside', { class: 'map-building-inspector empty' },
            el('p', { class: 'hint' }, t('selectMapBuilding')));
      })()));
  }
  return el('details', {
    class: 'secondary-section map-section',
    ...(focusedBuilding || scopeViewBox || (!standalone && compactMapOpen) ? { open: '' } : {}),
    ...(!standalone ? { ontoggle: event => { compactMapOpen = event.currentTarget.open; } } : {}),
  },
    el('summary', {}, `${t('schematicRepublicMap')} (${fmt(model.buildings.length, 0)})`),
    el('p', { class: 'hint' }, t(mapHintKey)),
    legend,
    focusedBuilding || scopeViewBox ? el('button', {
      onclick: () => {
        mapFocusBuildingIndex = null;
        mapFocusScopeId = null;
        compactMapExpanded = true;
        compactMapOpen = true;
        update();
        document.querySelector('details.map-section')?.setAttribute('open', '');
      },
    }, t('showWholeRepublic')) : null,
    scopeSummary,
    svg);
}

function renderMapTab() {
  const buildings = state.saveImport?.observedBuildings;
  const scopes = state.saveImport?.scopes;
  if (!Array.isArray(buildings) || !buildings.length || !Array.isArray(scopes)) {
    return el('section', {}, el('h2', {}, t('republicMapTitle')),
      el('p', { class: 'hint' }, t('unavailable')));
  }
  return renderSchematicRepublicMap(buildings, scopes,
    state.saveImport?.criminalityOutliers, { standalone: true });
}

// ---------------------------------------------------------------- republic overview tab
// Combines the City tab's plan(s) and the Production tab's plan - both are
// the app's own hypothetical-plan state already, so no save-file parsing is
// needed. Food/clothes/alcohol demand vs. production is NOT shown: no
// per-citizen consumption rate was found in the game files, our datasets,
// or the accessible spreadsheet (see ROADMAP.md 2.2).

// Observe: the save's own recorded history. Twelve series over the full span
// of the republic — this was previously collapsed at the foot of the overview,
// where a 3,002-record history sat 92% of the way down the page.
function electronicsForecastFor(currency, year, variant, eco) {
  const normalIndex = buildPriceIndex(state.statsRecords, { currency, basis: 'base' });
  const electronicsIndex = buildResourcePriceIndex(state.statsRecords, {
    resource: 'eletronics', currency, basis: 'sell',
  });
  const recipe = electronicsComponentIndex({
    buildings: DATA.rawBuildings ?? [], startYear: year, years: 30, variant,
    priceFor: key => eco.buy(key, currency),
  });
  const rates = deriveForecastRateScenarios({
    normalRates: rollingAnnualRateIntervals(normalIndex),
    electronicsRates: rollingAnnualRateIntervals(electronicsIndex),
    componentRates: rollingAnnualRateIntervals(historicalElectronicsComponentIndex({
      buildings: DATA.rawBuildings ?? [], records: state.statsRecords,
      currency, variant,
    })),
  });
  const paths = forecastElectronicsPrices({
    currentPrice: eco.sell('eletronics', currency), rateScenarios: rates,
    componentIndex: recipe, months: 360,
  });
  return { normalIndex, electronicsIndex, recipe, rates, paths };
}

function renderCreditDataStatus(context) {
  return el('section', { class: 'credit-data-status' },
    el('h3', {}, t('creditDataStatusTitle')),
    el('div', { class: 'credit-data-status-facts' },
      el('span', { class: 'credit-status-provenance' },
        context.provenanceKeys.map(key => t(key)).join(' · ')),
      el('span', {}, t('creditDataActiveCount'), el('strong', {}, fmt(context.activeCredits.length, 0))),
      el('span', {}, t('creditDataHistoryCount'), el('strong', {}, fmt(context.normalIndex.length, 0))),
      el('span', {}, t('creditDataUsedOffers'), el('strong', {}, fmt(context.quotes.length, 0)))));
}

function renderActiveCreditPosition(context) {
  return el('section', { class: 'active-credit-card' },
    el('h3', {}, t('creditActivePositionTitle')),
    el('p', { class: 'hint' }, t('creditPaymentReality')),
    el('div', { class: 'active-credit-facts' },
      context.activeCredits.length
        ? context.activeCredits.map(({ loan, summary }, index) => el('article', {
          class: `credit-ledger-card ${context.verdictClass(summary)}`,
          'data-credit-currency': loan.currency,
        },
        el('div', { class: 'credit-ledger-heading' },
          el('strong', {}, `${t('creditActiveContracts')} #${index + 1} · ${loan.currency}`),
          el('span', { class: `credit-verdict-strip ${context.verdictClass(summary)}` },
            t(creditVerdictKey(summary)))),
        el('dl', { class: 'credit-fact-ledger' },
          el('div', {}, el('dt', {}, t('loanPrincipal')),
            el('dd', {}, context.amountFor(loan.currentAmount, loan.currency))),
          Number(loan.penaltyAmount) > 0
            ? el('div', { class: 'penalty' }, el('dt', {}, t('loanPenalty')),
              el('dd', {}, context.amountFor(loan.penaltyAmount, loan.currency))) : null,
          el('div', {}, el('dt', {}, t('loanDays')), el('dd', {}, fmt(loan.remainingDays, 0))),
          el('div', {}, el('dt', {}, t('creditTotalRepayment')),
            el('dd', {}, context.amountFor(summary.totalPaid, loan.currency))),
          el('div', {}, el('dt', {}, t('creditMaximumDailyPayment')),
            el('dd', {}, context.amountFor(summary.maxDailyPayment, loan.currency))),
          el('div', {}, el('dt', {}, t('loanEffectiveRate')), el('dd', {}, context.rate(summary.effectiveRate))),
          el('div', {}, el('dt', {}, t('creditExpectedRealRate')), el('dd', {},
            summary.hasInflationEvidence ? context.rate(summary.expectedRealRate) : t('creditInflationUnavailable'))))))
        : el('p', { class: 'empty-state' }, t('noActiveLoans'))),
    context.activeCredits.length ? el('details', { class: 'credit-assessment-disclosure' },
      el('summary', {}, t('creditAssessmentDetails')),
      el('p', { class: 'hint' }, t('loanDecisionHint')),
      ...context.activeCredits.map(({ summary, scenarios }, index) => el('div', { class: 'credit-scenario-row' },
        el('strong', {}, `#${index + 1}`),
        summary.hasInflationEvidence ? el('span', {},
          `${t('loanRealBest')}: ${context.rate(scenarios.realRates.best)}`) : el('span', {},
          t('creditInflationUnavailable')),
        summary.hasInflationEvidence ? el('span', {},
          `${t('loanRealBase')}: ${context.rate(scenarios.realRates.base)}`) : null,
        summary.hasInflationEvidence ? el('span', {},
          `${t('loanRealWorst')}: ${context.rate(scenarios.realRates.worst)}`) : null)))
      : null);
}

function renderNewCreditCalculator(context) {
  return el('section', { class: 'credit-calculator' },
    el('h3', {}, t('creditNewCalculatorTitle')),
    el('p', { class: 'hint' }, t('creditCalculatorHint')),
    el('div', { class: 'credit-calculator-results' },
      el('div', { class: 'settingsbar credit-calculator-controls' },
        el('label', {}, t('creditAmount'), numInput(state.creditAmount,
          value => { state.creditAmount = value; }, { min: 0 })),
        el('label', {}, t('loanApr'), numInput(state.creditApr,
          value => { state.creditApr = value; }, { min: 0, step: .1 })),
        el('label', {}, t('creditTermYears'), numInput(state.creditTermYears,
          value => { state.creditTermYears = value; }, { min: .1, step: .5 })),
        el('label', {}, t('inflationCurrency'), selectInput(
          [['RUB', '₽ · RUB'], ['USD', '$ · USD']], context.currency,
          value => { state.historyCurrency = value; }))),
      el('div', { class: 'credit-calculator-result-grid' },
        el('output', {}, el('span', {}, t('creditTotalRepayment')),
          el('strong', {}, context.amount(context.hypotheticalSummary.totalPaid))),
        el('output', {}, el('span', {}, t('creditAdditionalCost')),
          el('strong', {}, context.amount(context.hypotheticalSummary.additionalCost))),
        el('output', {}, el('span', {}, t('creditMaximumDailyPayment')),
          el('strong', {}, context.amount(context.hypotheticalSummary.maxDailyPayment))),
        el('output', {}, el('span', {}, t('loanEffectiveRate')),
          el('strong', {}, context.rate(context.hypotheticalSummary.effectiveRate))),
        el('output', {}, el('span', {}, t('creditExpectedRealRate')),
          el('strong', {}, context.hypotheticalSummary.hasInflationEvidence
            ? context.rate(context.hypotheticalSummary.expectedRealRate) : '—'))),
      el('div', { class: `credit-verdict-strip ${context.verdictClass(context.hypotheticalSummary)}` },
        el('strong', {}, t(creditVerdictKey(context.hypotheticalSummary))))),
    el('details', { class: 'credit-inflation-disclosure' },
      el('summary', {}, t('creditCompareInflationDetails')),
      context.hypotheticalSummary.hasInflationEvidence
        ? el('div', { class: 'credit-inflation-comparison' },
          el('span', {}, t('creditGeneralPriceDevelopment')),
          el('strong', {}, context.rate(context.normalSummary.latestAnnual)),
          el('p', { class: 'hint' }, t('normalInflationLoanEvidence')))
        : el('p', { class: 'empty-state' }, t('creditHistoryNeedsStats'))));
}

function renderOptionalElectronicsStrategy(context) {
  return el('details', {
    class: 'credit-electronics-disclosure',
    ...(creditElectronicsOpen ? { open: '' } : {}),
    ontoggle: event => { creditElectronicsOpen = event.currentTarget.open; },
  },
    el('summary', {},
      el('span', {}, t('electronicsOptionalTitle')),
      context.electronicsAvailability.requiresUsedMarket
        ? el('span', { class: 'hint' }, ` — ${t(context.electronicsAvailability.messageKey)}`)
        : null),
    el('div', { class: 'credit-disclosure-body' },
      el('p', { class: 'credit-experimental-warning' }, t('electronicsExperimentalWarning')),
      el('div', { class: 'electronics-missing-costs' },
        el('strong', {}, t('electronicsMissingCosts')),
        el('ul', {},
          el('li', {}, t('electronicsMissingOperations')),
          el('li', {}, t('electronicsMissingTransport')),
          el('li', {}, t('electronicsMissingStorage')),
          el('li', {}, t('electronicsMissingRules')))),
      el('div', { class: 'settingsbar credit-electronics-controls' },
        el('label', {}, t('creditFinancingTerms'), selectInput(
          context.financingOptions,
          context.financingOptions.some(([value]) => value === state.creditFinancingSource)
            ? state.creditFinancingSource : 'hypothetical',
          value => { state.creditFinancingSource = value; })),
        el('label', {}, t('electronicsProductionChain'), selectInput(
          [['vanilla', t('electronicsProductionChainVanilla')],
            ['dlc3', t('electronicsProductionChainDlc3')]],
          context.variant, value => { state.creditRecipeVariant = value; }))),
      context.best ? el('div', { class: 'electronics-strategy-result' },
        el('p', { class: `credit-verdict-strip ${context.best.assessment}` },
          t('electronicsBreakEvenConditional').replace(
            '{years}', fmt(context.best.baseBreakEvenMonth / 12, 1))),
        el('dl', { class: 'credit-fact-ledger electronics-primary-facts' },
          el('div', {}, el('dt', {}, t('creditRequiredPrincipal')),
            el('dd', {}, context.amount(context.best.capitalRequired))),
          el('div', {}, el('dt', {}, t('electronicsHoldingExpected')),
            el('dd', {}, context.monthLabel(context.best.baseBreakEvenMonth))),
          el('div', {}, el('dt', {}, t('electronicsHoldingCautious')),
            el('dd', {}, context.monthLabel(context.best.adverseBreakEvenMonth))),
          el('div', {}, el('dt', {}, t('creditExitCurrency')),
            el('dd', {}, context.best.exitCurrency))),
        el('p', { class: 'hint' }, `${context.best.shipName} · ${fmt(context.best.capacity, 0)} t`))
        : el('p', { class: 'empty-state' }, t(context.electronicsAvailability.messageKey)),
      context.best ? el('details', {
        class: 'credit-electronics-assumptions',
        ...(creditElectronicsAssumptionsOpen ? { open: '' } : {}),
        ontoggle: event => { creditElectronicsAssumptionsOpen = event.currentTarget.open; },
      },
        el('summary', {}, t('electronicsAssumptionsDetails')),
        el('p', { class: 'hint' }, t('electronicsTradeCaveat')),
        el('div', { class: 'credit-recipe-evidence' },
          el('strong', {}, t('electronicsProductionChain')),
          el('span', {}, context.variant === 'dlc3'
            ? t('electronicsProductionChainDlc3') : t('electronicsProductionChainVanilla')),
          context.activeRecipe?.length ? el('span', {}, t('electronicsRecipePressure')
            .replace('{years}', '30'), `: ${fmt(context.activeRecipe.at(-1).index - 100, 1)} %`) : null),
        context.best.alternateRoutes.length ? el('div', { class: 'tablewrap' },
          el('table', { class: 'data credit-investment-table' },
            el('thead', {}, el('tr', {}, el('th', {}, t('creditAlternateExits')),
              el('th', {}, t('electronicsHoldingExpected')),
              el('th', {}, t('electronicsHoldingCautious')))),
            el('tbody', {}, ...context.best.alternateRoutes.map(route => el('tr', {},
              el('td', {}, route.exitCurrency),
              el('td', { class: 'r' }, context.monthLabel(route.baseBreakEvenMonth)),
              el('td', { class: 'r' }, context.monthLabel(route.adverseBreakEvenMonth))))))) : null,
        renderRepublicLineChart(t('creditAmortizationTitle'), [
          { label: t('creditScenarioBase'), color: '#2980b9',
            points: seriesFromRecords(context.forecastRecords, row => row.base) },
          { label: t('creditScenarioFavorable'), color: '#27ae60',
            points: seriesFromRecords(context.forecastRecords, row => row.favorable) },
          { label: t('creditScenarioAdverse'), color: '#c0392b',
            points: seriesFromRecords(context.forecastRecords, row => row.adverse) },
          { label: '0', color: '#7f8c8d',
            points: seriesFromRecords(context.forecastRecords, row => row.zero) },
        ], t('creditForecastEvidence'), 'derived'),
        el('table', { class: 'data credit-milestone-ledger' },
          el('thead', {}, el('tr', {}, el('th', {}, t('creditScenarioBase')),
            ...[5, 10, 20, 30].map(years => el('th', {}, `${years} ${t('creditTermYears')}`)))),
          el('tbody', {}, el('tr', {}, el('td', {}, t('creditAmortizationTitle')),
            ...[5, 10, 20, 30].map(years => el('td', { class: 'r' },
              context.amount(context.best.milestones.base?.[years])))))))
        : null));
}

function renderCreditHistoryEvidence(context) {
  return el('details', {
    class: 'credit-history-disclosure',
    ...(creditHistoryOpen ? { open: '' } : {}),
    ontoggle: event => { creditHistoryOpen = event.currentTarget.open; },
  },
    el('summary', {}, t('creditHistoryEvidenceTitle')),
    el('div', { class: 'credit-disclosure-body' },
      el('div', { class: 'settingsbar credit-history-controls' },
        el('label', {}, t('inflationCurrency'), selectInput(
          [['RUB', '₽ · RUB'], ['USD', '$ · USD']], context.currency,
          value => { state.historyCurrency = value; })),
        el('label', {}, t('inflationSeries'), selectInput(
          [['base', t('inflationNormal')], ['purchase', t('inflationImport')], ['sell', t('inflationExport')]],
          context.basis, value => { state.historyInflationBasis = value; }))),
      context.visibleInflationSufficient
        ? renderRepublicLineChart(
          `${context.basisLabel} · ${t('inflationIndex')} (${context.currency})`,
          [{ label: context.basisLabel,
            color: context.currency === 'USD' ? '#27ae60' : '#8e44ad',
            points: seriesFromRecords(context.visibleIndex, point => point.index) }],
          t('creditStatsEvidence'), 'exact')
        : el('p', { class: 'empty-state' }, t('creditHistoryNeedsStats')),
      context.visibleInflationSufficient ? el('dl', { class: 'credit-history-values' },
        el('div', {}, el('dt', {}, t('inflationLatestAnnual')),
          el('dd', {}, context.rate(context.visibleSummary.latestAnnual))),
        el('div', {}, el('dt', {}, t('inflationFiveYear')),
          el('dd', {}, context.rate(context.visibleSummary.fiveYearAnnual))),
        el('div', {}, el('dt', {}, t('inflationAllHistory')),
          el('dd', {}, context.rate(context.visibleSummary.allAnnual)))) : null,
      context.historicalValues.length ? el('section', { class: 'credit-saved-values' },
        el('h4', {}, t('creditSavedValuesTitle')),
        el('dl', { class: 'credit-history-values' }, ...context.historicalValues.map(item =>
          el('div', {}, el('dt', {}, t(item.key)), el('dd', {}, context.amount(item.value))))))
        : null,
      el('p', { class: 'hint' }, context.basis === 'base'
        ? t('normalInflationLoanEvidence') : t('marketInflationRiskHint')),
      el('p', { class: 'hint credit-history-boundary' }, t('creditHistoricalBoundary'))));
}

function renderCredits() {
  const historyRecords = state.statsRecords ?? [];
  const currency = state.historyCurrency === 'USD' ? 'USD' : 'RUB';
  const basis = ['base', 'purchase', 'sell'].includes(state.historyInflationBasis)
    ? state.historyInflationBasis : 'base';
  const normalIndex = buildPriceIndex(state.statsRecords, { currency, basis: 'base' });
  const visibleIndex = buildPriceIndex(historyRecords, { currency, basis });
  const normalSummary = summarizeInflation(normalIndex);
  const visibleSummary = summarizeInflation(visibleIndex);
  const visibleInflationSufficient = hasUsableInflationEvidence(visibleIndex);
  const rate = value => Number.isFinite(value)
    ? `${value >= 0 ? '+' : ''}${fmt(value * 100, 2)} %` : '—';
  const amountFor = (value, code) => Number.isFinite(value)
    ? `${fmt(value, 0)} ${currencySymbol(code)}` : '—';
  const amount = value => amountFor(value, currency);
  const verdictClass = summary => !summary.hasInflationEvidence ? 'unavailable'
    : summary.recommendation;
  const basisLabel = {
    base: t('creditGeneralPriceDevelopment'), purchase: t('inflationImport'), sell: t('inflationExport'),
  }[basis];
  const selectedLoans = state.activeLoans.filter(loan => loan.currency === currency);
  const activeCredits = state.activeLoans.map(loan => {
    const loanCurrency = loan.currency === 'USD' ? 'USD' : 'RUB';
    const loanNormalIndex = buildPriceIndex(state.statsRecords, {
      currency: loanCurrency, basis: 'base',
    });
    const normalizedLoan = loan.currency === loanCurrency ? loan : { ...loan, currency: loanCurrency };
    return {
      loan: normalizedLoan,
      summary: summarizeCreditTerms({ loan: normalizedLoan, normalIndex: loanNormalIndex }),
      scenarios: evaluateLoanScenarios(normalizedLoan, loanNormalIndex),
    };
  });
  const hypotheticalLoan = {
    currency, currentAmount: Math.max(0, state.creditAmount), penaltyAmount: 0,
    annualRate: Math.max(0, state.creditApr),
    remainingDays: Math.max(1, Math.round(state.creditTermYears * 365)),
  };
  const hypotheticalNominal = simulateLoan(hypotheticalLoan, {
    maxDays: hypotheticalLoan.remainingDays + 1,
  });
  const hypotheticalSummary = {
    ...summarizeCreditTerms({ loan: hypotheticalLoan, normalIndex }),
    totalPaid: hypotheticalNominal.totalPaid,
    additionalCost: hypotheticalNominal.totalPaid - hypotheticalLoan.currentAmount,
    maxDailyPayment: hypotheticalNominal.maxDailyPayment,
  };
  const financingOptions = [
    ['hypothetical', t('creditHypotheticalTerms')],
    ...selectedLoans.map((loan, index) => [
      `active-${index}`,
      `${t('creditActiveTerms')} #${index + 1} · ${fmt(loan.annualRate, 2)} % · ${fmt(loan.remainingDays, 0)} d`,
    ]),
  ];
  const activeSourceIndex = /^active-(\d+)$/.exec(state.creditFinancingSource)?.[1];
  const investmentLoan = Number.isInteger(Number(activeSourceIndex))
    && selectedLoans[Number(activeSourceIndex)]
    ? selectedLoans[Number(activeSourceIndex)] : hypotheticalLoan;
  const currentRecord = state.statsRecords?.[
    Math.min(state.recordIndex, (state.statsRecords?.length ?? 1) - 1)
  ];
  const year = Number(currentRecord?.year ?? state.statsRecords?.at(-1)?.year);
  const variant = state.creditRecipeVariant === 'dlc3' ? 'dlc3' : 'vanilla';
  const eco = currentRecord
    ? new Economy(DATA.resources, recordToPrices(currentRecord, state.statsRecords)) : null;
  const forecasts = Object.fromEntries(['RUB', 'USD'].map(code =>
    [code, eco ? electronicsForecastFor(code, year, variant, eco) : {}]));
  const rubPerUsd = rubPerUsdFromBasePrices(currentRecord);
  const exchange = forecasts.RUB.rates && forecasts.USD.rates && rubPerUsd
    ? futureExchangePath({
      currentRubPerUsd: rubPerUsd,
      rubNormalRate: forecasts.RUB.rates.base.normal,
      usdNormalRate: forecasts.USD.rates.base.normal,
      months: 360,
    }) : null;
  const rawUsedOffers = Array.isArray(state.saveImport?.usedVehicleOffers)
    ? state.saveImport.usedVehicleOffers : [];
  const quotes = eco ? rawUsedOffers.map(offer =>
    vehicleUsedMarketQuote(offer, { year, currency, economy: eco })).filter(Boolean)
    : [];
  const hasForecastEvidence = Boolean(eco && exchange
    && Number(eco.buy('eletronics', investmentLoan.currency)) > 0
    && ['RUB', 'USD'].every(code => {
      const forecast = forecasts[code];
      return hasUsableInflationEvidence(forecast?.normalIndex)
        && hasUsableInflationEvidence(forecast?.electronicsIndex)
        && Array.isArray(forecast?.recipe)
        && ['base', 'favorable', 'adverse'].every(name =>
          Array.isArray(forecast?.paths?.[name]));
    }));
  let compatibleQuoteCount = 0;
  let evaluatedCorridorCount = 0;
  const opportunities = rankRelevantCreditOpportunities({
    quotes, loans: [investmentLoan], horizonYears: 30,
    forecastContext: { corridorFor: ({ quote, loan }) => {
      compatibleQuoteCount += 1;
      if (!hasForecastEvidence) return null;
      const conversionPaths = loan.currency === 'RUB'
        ? {
          RUB: exchange.map(point => ({ month: point.month, factor: 1 })),
          USD: exchange.map(point => ({ month: point.month, factor: point.rubPerUsd })),
        } : {
          USD: exchange.map(point => ({ month: point.month, factor: 1 })),
          RUB: exchange.map(point => ({ month: point.month, factor: 1 / point.rubPerUsd })),
        };
      const corridor = amortizationCorridor({
        quote, loan, cargoPurchasePrice: eco.buy('eletronics', loan.currency),
        financingCurrency: loan.currency,
        exitPricePaths: { RUB: forecasts.RUB.paths, USD: forecasts.USD.paths },
        conversionPaths,
      });
      if (Object.values(corridor?.routes ?? {}).some(route => Array.isArray(route?.base))) {
        evaluatedCorridorCount += 1;
      }
      return corridor;
    } },
  });
  const best = opportunities[0];
  const electronicsAvailability = electronicsAvailabilityState({
    hasImportedSave: Boolean(state.saveImport),
    marketSourceStatus: state.saveImport?.sourceStatus?.usedVehicles ?? null,
    usedOfferCount: rawUsedOffers.length,
    hasForecastEvidence,
    compatibleQuoteCount,
    evaluatedCorridorCount,
    hasQualifyingStrategy: Boolean(best),
  });
  const provenanceKeys = creditProvenanceKeys({
    hasStatsInflation: hasUsableInflationEvidence(normalIndex),
    hasImportedSave: Boolean(state.saveImport),
    hasForecastEvidence: electronicsAvailability.forecastEvidenceAvailable,
  });
  const monthLabel = month => Number.isFinite(month)
    ? `${fmt(month / 12, 1)} ${t('creditTermYears')}` : '—';
  const forecastRecords = best?.paths?.base?.map((point, index) => ({
    year: year + Math.floor(point.month / 12), day: Math.round((point.month % 12) * 365 / 12),
    base: point.net, favorable: best.paths.favorable?.[index]?.net,
    adverse: best.paths.adverse?.[index]?.net, zero: 0,
  })) ?? [];
  const historicalField = field => [...historyRecords].reverse()
    .map(record => Number(record?.[`${field}${currency}`])).find(Number.isFinite);
  const historicalValues = [
    { key: 'creditHistoricalBalance', value: historicalField('loanBalance') },
    { key: 'creditHistoricalInterest', value: historicalField('loanInterest') },
  ].filter(item => Number.isFinite(item.value));
  const context = {
    historyRecords, currency, basis, normalIndex, visibleIndex, normalSummary, visibleSummary,
    visibleInflationSufficient,
    rate, amount, amountFor, verdictClass, basisLabel, selectedLoans, activeCredits, hypotheticalLoan,
    hypotheticalSummary, financingOptions, investmentLoan, currentRecord, year, variant, eco,
    forecasts, exchange, quotes, opportunities, best, electronicsAvailability,
    monthLabel, forecastRecords,
    historicalValues, provenanceKeys, activeRecipe: forecasts[currency]?.recipe,
  };

  return el('section', { class: 'credit-center economic-decision-strip' },
    el('div', { class: 'economic-decision-heading' },
      el('div', {}, el('h2', {}, t('creditCenterTitle')),
        el('p', { class: 'hint' }, t('creditCenterHint')))),
    renderCreditDataStatus(context),
    renderActiveCreditPosition(context),
    renderNewCreditCalculator(context),
    renderOptionalElectronicsStrategy(context),
    renderCreditHistoryEvidence(context));
}

function renderRepublicHistory() {
  if (!state.statsRecords?.length) {
    return el('section', {}, el('p', { class: 'hint' }, t('noHistory')));
  }
  const historyRecords = filterRange(state.statsRecords ?? [], state.republicRange);
  const series = (label, color, valueOf) => ({ label, color, points: seriesFromRecords(historyRecords, valueOf) });
  const currencySuffix = state.currency === 'USD' ? 'USD' : 'RUB';
  const resourceKeys = resourceHistoryKeys(state.statsRecords);
  if (!resourceKeys.includes(state.republicResource)) {
    const latest = state.statsRecords?.at(-1);
    state.republicResource = resourceKeys.sort((a, b) =>
      (latest?.resourcesProduced?.[b] ?? 0) - (latest?.resourcesProduced?.[a] ?? 0))[0] ?? null;
  }
  const resourceOptions = resourceKeys.map(key => {
    const resource = DATA.resources.find(item => item.key === key);
    return [key, resource ? rname(resource) : key === 'waste_mixed' ? t('mixedWaste') : key];
  }).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  const selectedResourceLabel = resourceOptions.find(([key]) => key === state.republicResource)?.[1]
    ?? state.republicResource;
  const hasSelectedWasteHistory = state.republicResource && historyRecords.some(record =>
    ['wasteProductionFactories', 'wasteProductionPeople', 'wasteProductionDemolition']
      .some(field => Number.isFinite(record[field]?.[state.republicResource])));
  const hasSelectedInternationalHistory = state.republicResource && historyRecords.some(record =>
    ['resourcesImportInternationalRUB', 'resourcesImportInternationalUSD',
      'resourcesExportInternationalRUB', 'resourcesExportInternationalUSD']
      .some(field => Number.isFinite(record[field]?.[state.republicResource])));
  const charts = el('section', { class: 'history-section' },
    el('h2', {}, `${t('republicHistory')} (${fmt(state.statsRecords.length, 0)})`),
    el('div', { class: 'chart-controls settingsbar' },
      ...['month', 'year', 'all'].map(range => el('button', {
        class: state.republicRange === range ? 'active' : '',
        onclick: () => {
          resetChartGroup('republic-history');
          state.republicRange = range;
          update();
        },
      }, t(`range.${range}`))),
      resourceOptions.length ? selectInput(resourceOptions, state.republicResource,
        value => { state.republicResource = value; }) : null),
    el('div', { class: 'chart-grid' },
      renderRepublicLineChart(t('citizenHistory'), [
        series(t('adults'), '#d35400', record => record.adults),
        series(t('children'), '#2980b9', record =>
          Number.isFinite(record.childrenSmall) || Number.isFinite(record.childrenMedium)
            ? (record.childrenSmall ?? 0) + (record.childrenMedium ?? 0) : null),
        series(t('unemployed'), '#c0392b', record => record.unemployed),
      ]),
      renderRepublicLineChart(t('birthDeathHistory'), [
        series(t('births'), '#27ae60', record => record.born),
        series(t('deaths'), '#7f8c8d', record => record.dead),
      ]),
      renderRepublicLineChart(t('migrationHistory'), [
        series(t('escapedCitizens'), '#c0392b', record => record.escaped),
        series(t('sovietImmigrants'), '#2980b9', record => record.immigrantsSoviet),
        series(t('africanImmigrants'), '#d35400', record => record.immigrantsAfrica),
      ]),
      renderRepublicLineChart(t('educationHistory'), [
        series(t('noEducation'), '#c0392b', record => record.educationNone),
        series(t('basicEducation'), '#f1c40f', record => record.educationBasic),
        series(t('higherEducation'), '#2980b9', record => record.educationHigh),
      ]),
      renderRepublicLineChart(t('electronicsHistory'), [
        series(t('noElectronics'), '#7f8c8d', record => record.electronicsNone),
        series(t('radioOwners'), '#d35400', record => record.electronicsRadio),
        series(t('tvOwners'), '#2980b9', record => record.electronicsTV),
        series(t('computerOwners'), '#8e44ad', record => record.electronicsComputer),
      ]),
      renderRepublicLineChart(t('longevityHistory'), [
        series(t('averageAge'), '#2980b9', record => record.averageAge),
        series(t('averageLifespan'), '#27ae60', record => record.averageLifespan),
      ]),
      renderRepublicLineChart(t('productivityHistory'), [
        series(t('productivity'), '#27ae60', record => Number.isFinite(record.averageProductivity)
          ? record.averageProductivity * 100 : null),
      ]),
      renderRepublicLineChart(t('crimeHistory'), [
        series(t('minorCrimes'), '#f1c40f', record => record.minorCrimes),
        series(t('mediumCrimes'), '#e67e22', record => record.mediumCrimes),
        series(t('seriousCrimes'), '#c0392b', record => record.seriousCrimes),
      ]),
      renderRepublicLineChart(`${t('vehicleTradeHistory')} (${cur()})`, [
        series(t('imports'), '#c0392b', record => record[`vehicleImport${currencySuffix}`]),
        series(t('exports'), '#27ae60', record => record[`vehicleExport${currencySuffix}`]),
      ]),
      renderRepublicLineChart(`${t('loanHistory')} (${cur()})`, [
        series(t('loanBalance'), '#8e44ad', record => record[`loanBalance${currencySuffix}`]),
        series(t('loanInterest'), '#d35400', record => record[`loanInterest${currencySuffix}`]),
      ]),
      state.republicResource ? renderRepublicLineChart(
        selectedResourceLabel, [
          series(t('produced'), '#2980b9', record => record.resourcesProduced?.[state.republicResource]),
          series(t('importsRUB'), '#c0392b', record => record.resourcesImportRUB?.[state.republicResource]),
          series(t('importsUSD'), '#e67e22', record => record.resourcesImportUSD?.[state.republicResource]),
          series(t('exportsRUB'), '#27ae60', record => record.resourcesExportRUB?.[state.republicResource]),
          series(t('exportsUSD'), '#16a085', record => record.resourcesExportUSD?.[state.republicResource]),
        ]) : null,
      state.republicResource ? renderRepublicLineChart(
        `${selectedResourceLabel} · ${t('resourceUse')}`, [
          series(t('factoryUse'), '#8e44ad', record => record.resourcesSpendFactories?.[state.republicResource]),
          series(t('shopUse'), '#d35400', record => record.resourcesSpendShops?.[state.republicResource]),
          series(t('constructionUse'), '#7f8c8d', record => record.resourcesSpendConstructions?.[state.republicResource]),
          series(t('vehicleUse'), '#2c3e50', record => record.resourcesSpendVehicles?.[state.republicResource]),
        ]) : null,
      hasSelectedInternationalHistory ? renderRepublicLineChart(
        `${selectedResourceLabel} · ${t('internationalTradeHistory')}`, [
          series(t('internationalImportsRUB'), '#c0392b', record =>
            record.resourcesImportInternationalRUB?.[state.republicResource]),
          series(t('internationalImportsUSD'), '#e67e22', record =>
            record.resourcesImportInternationalUSD?.[state.republicResource]),
          series(t('internationalExportsRUB'), '#27ae60', record =>
            record.resourcesExportInternationalRUB?.[state.republicResource]),
          series(t('internationalExportsUSD'), '#16a085', record =>
            record.resourcesExportInternationalUSD?.[state.republicResource]),
        ]) : null,
      hasSelectedWasteHistory ? renderRepublicLineChart(
        `${selectedResourceLabel} · ${t('wasteHistory')}`, [
          series(t('factoryWaste'), '#8e44ad', record => record.wasteProductionFactories?.[state.republicResource]),
          series(t('citizenWaste'), '#d35400', record => record.wasteProductionPeople?.[state.republicResource]),
          series(t('demolitionOutput'), '#7f8c8d', record => record.wasteProductionDemolition?.[state.republicResource]),
        ]) : null),
    el('p', { class: 'hint' }, t('demographicHistoryMeaning')));
  return charts;
}


// Compare: this republic against another saved snapshot. It carried the name
// of the Compare section while living at the foot of the republic overview.
function renderSnapshots() {
  if (!state.saveImport) {
    return el('section', {}, el('p', { class: 'hint' }, t('comparisonNotImported')));
  }
  const comparisonNames = namedSnapshotNames.filter(name => name !== state.saveSlotName);
  if (comparisonSnapshotName && !comparisonNames.includes(comparisonSnapshotName)) {
    comparisonSnapshotName = '';
    comparisonSnapshot = null;
    comparisonSnapshotError = '';
  }
  const comparison = comparisonSnapshot?.saveImport && state.saveImport
    ? compareObservedSnapshots(state.saveImport, comparisonSnapshot.saveImport,
      state.statsRecords, comparisonSnapshot.statsRecords) : null;
  const comparisonValue = (key, value) => {
    if (!Number.isFinite(value)) return '—';
    return ['productivity', 'health', 'criminality'].includes(key)
      ? `${fmt(value * 100, key === 'criminality' ? 2 : 1)} %`
      : fmt(value, 0);
  };
  const comparisonDelta = (key, value) => {
    if (!Number.isFinite(value)) return '—';
    const scaled = ['productivity', 'health', 'criminality'].includes(key) ? value * 100 : value;
    const suffix = ['productivity', 'health', 'criminality'].includes(key) ? ' pp' : '';
    return `${scaled > 0 ? '+' : ''}${fmt(scaled, key === 'criminality' ? 2 : 1)}${suffix}`;
  };
  const comparisonRate = (key, value) => {
    if (!Number.isFinite(value)) return '—';
    return `${value > 0 ? '+' : ''}${fmt(value, key === 'population' ? 1 : 2)}`;
  };
  const comparisonMetrics = [
    ['statsRecordCount', t('statsHistoryRecords')],
    ['population', t('population')], ['liveBuildingCount', t('importedBuildings')],
    ['configuredIndustryWorkers', t('configuredWorkers')],
    ['currentIndustryWorkers', t('currentWorkers')], ['productivity', t('productivity')],
    ['health', t('health')], ['criminality', t('criminality')],
    ['minorCrimes', t('minorCrimes')], ['mediumCrimes', t('mediumCrimes')],
    ['seriousCrimes', t('seriousCrimes')],
    ['medicalEmergencies', t('activeMedicalEmergencies')],
    ['activeCrimes', t('activeCriminalCases')], ['awaitingPolice', t('awaitingPolice')],
    ['underInvestigation', t('underInvestigation')], ['atCourt', t('liveCourtCases')],
  ];
  const comparisonAreaRows = comparison?.sameRepublic ? comparison.areas.filter(area =>
    Object.values(area.deltas).some(value => Number.isFinite(value) && Math.abs(value) > 1e-9))
    .sort((a, b) => Math.abs(b.deltas.population ?? 0) - Math.abs(a.deltas.population ?? 0)
      || String(a.name).localeCompare(String(b.name))) : [];
  const comparisonAreaRow = area => el('tr', {},
    el('td', {}, area.name),
    ...['population', 'currentIndustryWorkers', 'productivity', 'health', 'criminality',
      'minorCrimes', 'mediumCrimes', 'seriousCrimes']
      .map(key => el('td', { class: 'r' }, comparisonDelta(key, area.deltas[key]))));
  const snapshotComparison = el('section', { class: 'snapshot-comparison' },
    el('h2', {}, t('compareSnapshots')),
    el('p', { class: 'hint' }, t('compareSnapshotsHint')),
    comparisonNames.length ? el('label', {}, t('baselineSnapshot'), ' ', selectInput(
      [['', t('chooseSnapshot')], ...comparisonNames.map(name => [name, name])],
      comparisonSnapshotName, value => { loadComparisonSnapshot(value); }))
      : el('p', { class: 'hint' }, t('noComparisonSnapshots')),
    comparisonSnapshotError ? el('p', { class: 'warn' }, comparisonSnapshotError) : null,
    comparison ? el('div', { class: 'snapshot-comparison-results' },
      el('p', { class: 'hint' }, `${state.saveSlotName || state.saveImport.sourceName} − ${comparisonSnapshotName}`),
      el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, t('metric')), el('th', {}, t('baseline')),
          el('th', {}, t('current')), el('th', {}, t('change')),
          el('th', {}, t('per30GameDays')))),
        el('tbody', {}, el('tr', {},
          el('td', {}, t('gameDate')),
          el('td', { class: 'r' }, comparison.dates.baseline
            ? `${comparison.dates.baseline.year} / ${comparison.dates.baseline.day}` : '—'),
          el('td', { class: 'r' }, comparison.dates.current
            ? `${comparison.dates.current.year} / ${comparison.dates.current.day}` : '—'),
          el('td', { class: 'r' }, Number.isFinite(comparison.elapsedGameDays)
            ? t('elapsedGameDays').replace('{days}', fmt(comparison.elapsedGameDays, 0)) : '—'),
          el('td', { class: 'r' }, '—')),
        ...comparisonMetrics.map(([key, label]) => el('tr', {},
          el('td', {}, label),
          el('td', { class: 'r' }, comparisonValue(key, comparison.baseline.totals[key])),
          el('td', { class: 'r' }, comparisonValue(key, comparison.current.totals[key])),
          el('td', { class: 'r' }, comparisonDelta(key, comparison.deltas[key])),
          el('td', { class: 'r' }, comparisonRate(key, comparison.ratesPer30Days[key]))))))),
      !comparison.sameRepublic ? el('p', { class: 'warn' }, t('differentRepublicComparison'))
        : comparisonAreaRows.length ? el('details', { class: 'secondary-section' },
          el('summary', {}, `${t('areaChanges')} (${fmt(comparisonAreaRows.length, 0)})`),
          el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
            el('thead', {}, el('tr', {}, el('th', {}, t('area')), el('th', {}, t('population')),
              el('th', {}, t('currentWorkers')), el('th', {}, t('productivity')),
              el('th', {}, t('health')), el('th', {}, t('criminality')),
              el('th', {}, t('minorCrimes')), el('th', {}, t('mediumCrimes')),
              el('th', {}, t('seriousCrimes')))),
            el('tbody', {}, ...comparisonAreaRows.map(comparisonAreaRow)))))
          : el('p', { class: 'hint' }, t('noObservedChanges'))) : null);
  return snapshotComparison;
}


// Diagnose: where the republic is hurting its own people. Pollution exposure
// and criminality outliers were two collapsed disclosures on the overview,
// which is where a reader looks for what is, not for what is wrong.
function renderEnvironment(which = 'pollution') {
  if (!state.saveImport) {
    return el('section', {}, el('p', { class: 'hint' }, t('citiesEmpty')));
  }
  const criminalityOutliers = state.saveImport?.criminalityOutliers;
  const locateOutlierResidence = resident => {
    mapFocusBuildingIndex = resident.residenceBuildingIndex;
    mapFocusScopeId = null;
    state.republicScope = resident.residence?.scopeId ?? state.republicScope;
    update();
    setTimeout(() => document.querySelector('.map-section')?.scrollIntoView({
      behavior: 'smooth', block: 'center',
    }), 0);
  };

  const criminalityOutlierDetails = criminalityOutliers?.residents?.length ? el('section', {
    class: 'secondary-section',
  },
    // The heading counts every outlier the save holds. The line under it says
    // how many of those could be placed and how many are shown, because the
    // three numbers used to appear as two unrelated fractions.
    el('h2', {}, `${t('highCriminalityResidents')} (`
      + `${fmt(criminalityOutliers.locatedOutlierCount + criminalityOutliers.unlocatedOutlierCount, 0)})`),
    el('p', { class: 'hint' }, t('criminalityOutlierRule')
      .replace('{average}', fmt(criminalityOutliers.averageCriminality * 100, 2))
      .replace('{threshold}', fmt(criminalityOutliers.threshold * 100, 2))),
    el('p', { class: 'hint' }, t('criminalityOutlierShown')
      .replace('{shown}', fmt(criminalityOutliers.residents.length, 0))
      .replace('{located}', fmt(criminalityOutliers.locatedOutlierCount, 0))),
    criminalityOutliers.unlocatedOutlierCount ? el('p', { class: 'hint warn' },
      t('unlocatedCriminalityOutliers').replace('{count}', fmt(criminalityOutliers.unlocatedOutlierCount, 0))) : null,
    el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {},
        el('th', {}, t('citizen')), el('th', {}, t('criminality')),
        el('th', {}, t('area')), el('th', {}, t('residence')), el('th', {}, t('building')), el('th', {}))),
      el('tbody', {}, ...criminalityOutliers.residents.map(resident => el('tr', {},
        el('td', {}, `#${resident.citizenIndex}`),
        el('td', { class: 'r warn' }, fmt(resident.criminality * 100, 2) + ' %'),
        el('td', {}, plannerScopeName(resident.residence?.scopeId)),
        el('td', {}, resident.residence?.name || resident.residence?.type || '—'),
        el('td', { class: 'r' }, Number.isInteger(resident.residenceBuildingIndex)
          ? `#${resident.residenceBuildingIndex}` : '—'),
        el('td', {}, Number.isInteger(resident.residenceBuildingIndex) ? el('button', {
          onclick: () => locateOutlierResidence(resident),
        }, t('locateOnMap')) : null))))))) : null;
  const pollutionDiagnostics = state.saveImport?.pollutionDiagnostics;
  const locatePollutedResidence = residence => {
    mapFocusBuildingIndex = residence.buildingIndex;
    mapSelectedBuildingIndex = residence.buildingIndex;
    mapFocusScopeId = null;
    standaloneMapViewBox = null;
    state.republicScope = residence.scopeId ?? state.republicScope;
    state.mapLayers = { ...state.mapLayers, pollution: true, buildings: true };
    state.mapBuildingFilter = '';
    state.tab = 'map';
    update();
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };
  const pollutionDetails = pollutionDiagnostics?.affectedBuildingCount ? el('section', {
    class: 'secondary-section pollution-hotspots',
  },
    el('h2', {}, t('occupiedPollutionHotspots')
      .replace('{buildings}', fmt(pollutionDiagnostics.affectedBuildingCount, 0))
      .replace('{residents}', fmt(pollutionDiagnostics.affectedResidentCount, 0))),
    el('p', { class: 'hint' }, t('occupiedPollutionMeaning')),
    el('div', { class: 'tablewrap' }, el('table', { class: 'data pollution-area-summary' },
      el('thead', {}, el('tr', {}, el('th', {}, t('area')),
        el('th', {}, t('occupiedBuildings')), el('th', {}, t('residents')),
        el('th', {}, t('residentWeightedPollution')), el('th', {}, t('maximumCellValue')))),
      el('tbody', {}, ...pollutionDiagnostics.scopes.map(scope => el('tr', {},
        el('td', {}, plannerScopeName(scope.scopeId)),
        el('td', { class: 'r' }, fmt(scope.buildingCount, 0)),
        el('td', { class: 'r' }, fmt(scope.residents, 0)),
        el('td', { class: 'r' }, fmt(scope.residentWeightedAir, 4)),
        el('td', { class: 'r' }, fmt(scope.maxAir, 4))))))),
    el('h4', {}, t('highestOccupiedPollutionCells')),
    el('div', { class: 'tablewrap' }, el('table', { class: 'data pollution-building-table' },
      el('thead', {}, el('tr', {}, el('th', {}, t('area')), el('th', {}, t('residence')),
        el('th', {}, t('residents')), el('th', {}, t('savedPollutionCellValue')),
        el('th', {}, t('building')), el('th', {}))),
      el('tbody', {}, ...pollutionDiagnostics.buildings.slice(0, 12).map(residence => el('tr', {},
        el('td', {}, plannerScopeName(residence.scopeId)),
        el('td', {}, residence.name || residence.type || '—'),
        el('td', { class: 'r' }, fmt(residence.residents, 0)),
        el('td', { class: 'r warn' }, fmt(residence.airValue, 4)),
        el('td', { class: 'r' }, `#${residence.buildingIndex}`),
        el('td', {}, el('button', { onclick: () => locatePollutedResidence(residence) },
          t('locateOnMap'))))))))) : null;
  // Crime and air pollution answer different questions and were only ever in
  // one tab because they arrived together; each is now its own.
  const wanted = which === 'crime' ? criminalityOutlierDetails : pollutionDetails;
  if (!wanted) {
    return el('section', {}, el('h2', {}, t(which === 'crime' ? 'tabCrime' : 'tabPollution')),
      el('p', { class: 'hint' }, t('unavailable')));
  }
  return el('section', {}, wanted);
}


// Observe: what the republic is currently building. Three hundred and thirty
// five active projects on one test save, previously the single largest thing
// hidden on the overview at 2,560px behind one collapsed summary.
function renderConstruction() {
  if (!state.saveImport) {
    return el('section', {}, el('p', { class: 'hint' }, t('citiesEmpty')));
  }
  const allConstructionProjects = activeConstructionProjects(state.saveImport?.observedBuildings);
  const positiveConstructionCount = allConstructionProjects.filter(project =>
    project.constructionProgress > 0).length;
  if (constructionProgressFilter === 'positive' && !positiveConstructionCount) {
    constructionProgressFilter = 'all';
  }
  const constructionScopeIds = [...new Set(allConstructionProjects.map(project => project.scopeId ?? null))]
    .sort((a, b) => plannerScopeName(a).localeCompare(plannerScopeName(b)));
  const constructionScopeToken = scopeId => scopeId === null ? 'unassigned' : String(scopeId);
  if (constructionScopeFilter && !constructionScopeIds.some(scopeId =>
    constructionScopeToken(scopeId) === constructionScopeFilter)) constructionScopeFilter = '';
  const selectedConstructionScope = constructionScopeFilter === '' ? undefined
    : constructionScopeFilter === 'unassigned' ? null : Number(constructionScopeFilter);
  const constructionProjects = filterConstructionProjects(allConstructionProjects, {
    progress: constructionProgressFilter,
    scopeId: selectedConstructionScope,
    query: constructionSearch,
  });
  const constructionPageSize = 50;
  const constructionPageCount = Math.max(1, Math.ceil(constructionProjects.length / constructionPageSize));
  constructionPage = Math.max(1, Math.min(constructionPage, constructionPageCount));
  const visibleConstructionProjects = constructionProjects.slice(
    (constructionPage - 1) * constructionPageSize, constructionPage * constructionPageSize,
  );
  const locateConstructionProject = project => {
    mapFocusBuildingIndex = project.index;
    mapSelectedBuildingIndex = project.index;
    mapFocusScopeId = null;
    standaloneMapViewBox = null;
    state.republicScope = project.scopeId ?? state.republicScope;
    state.mapLayers = { ...state.mapLayers, construction: true, buildings: true };
    state.mapBuildingFilter = '';
    state.tab = 'map';
    update();
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };
  const constructionTable = el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, t('area')), el('th', {}, t('building')),
      el('th', {}, t('savedBuildingType')), el('th', {}, t('progress')),
      el('th', {}, t('saveIndex')), el('th', {}))),
    el('tbody', {}, ...visibleConstructionProjects.map(project => el('tr', {},
      el('td', {}, plannerScopeName(project.scopeId)),
      el('td', {}, project.name || project.type || '—'),
      el('td', {}, el('code', {}, project.type || '—')),
      el('td', { class: 'r' }, el('progress', {
        value: project.constructionProgress, max: 1,
        'aria-label': `${fmt(project.constructionProgress * 100, 1)} %`,
      }), ` ${fmt(project.constructionProgress * 100, 1)} %`),
      el('td', { class: 'r' }, `#${project.index}`),
      el('td', {}, Number.isFinite(project.x) && Number.isFinite(project.z)
        ? el('button', { onclick: () => locateConstructionProject(project) }, t('locateOnMap'))
        : null))))));
  const constructionPagination = constructionPageCount > 1
    ? el('div', { class: 'settingsbar fleet-pagination' },
      el('button', {
        ...(constructionPage <= 1 ? { disabled: '' } : {}),
        onclick: () => { constructionPage -= 1; update(); },
      }, `← ${t('fleetPreviousPage')}`),
      el('span', {}, t('fleetPageStatus')
        .replace('{page}', fmt(constructionPage, 0)).replace('{pages}', fmt(constructionPageCount, 0))
        .replace('{from}', fmt((constructionPage - 1) * constructionPageSize + 1, 0))
        .replace('{to}', fmt(Math.min(constructionProjects.length,
          constructionPage * constructionPageSize), 0))
        .replace('{total}', fmt(constructionProjects.length, 0))),
      el('button', {
        ...(constructionPage >= constructionPageCount ? { disabled: '' } : {}),
        onclick: () => { constructionPage += 1; update(); },
      }, `${t('fleetNextPage')} →`)) : null;
  const constructionDetails = allConstructionProjects.length ? el('section', {
    class: 'secondary-section construction-projects',
    ...(constructionDetailsOpen ? { open: '' } : {}),
    ontoggle: event => { constructionDetailsOpen = event.currentTarget.open; },
  },
    el('h2', {}, `${t('activeConstruction')} (${fmt(allConstructionProjects.length, 0)})`),
    el('p', { class: 'hint' }, t('constructionProjectMeaning')),
    el('div', { class: 'settingsbar construction-filters' },
      el('label', {}, t('area'), selectInput([
        ['', `${t('allAreas')} (${fmt(allConstructionProjects.length, 0)})`],
        ...constructionScopeIds.map(scopeId => [constructionScopeToken(scopeId),
          `${plannerScopeName(scopeId)} (${fmt(allConstructionProjects.filter(project =>
            (project.scopeId ?? null) === scopeId).length, 0)})`]),
      ], constructionScopeFilter, value => {
        constructionScopeFilter = value;
        constructionPage = 1;
      }, { class: 'construction-area-filter' })),
      el('label', {}, t('constructionSearch'), el('input', {
        type: 'search', value: constructionSearch,
        onkeydown: event => {
          if (event.key !== 'Enter') return;
          constructionSearch = event.currentTarget.value;
          constructionPage = 1;
          update();
        },
      })),
      el('button', {
        onclick: event => {
          constructionSearch = event.currentTarget.parentElement.querySelector('input[type="search"]')?.value ?? '';
          constructionPage = 1;
          update();
        },
      }, t('fleetSearchApply'))),
    positiveConstructionCount && positiveConstructionCount < allConstructionProjects.length
      ? el('div', { class: 'settingsbar construction-filters progress-filters' },
        ...[['all', allConstructionProjects.length], ['positive', positiveConstructionCount]]
          .map(([filter, count]) => el('button', {
            class: constructionProgressFilter === filter ? 'active' : '',
            onclick: () => {
              constructionProgressFilter = filter;
              constructionPage = 1;
              update();
            },
          }, `${t(filter === 'all' ? 'constructionAll' : 'constructionAboveZero')} (${fmt(count, 0)})`)))
      : null,
    el('p', { class: 'hint construction-filter-status' }, t('constructionFilterStatus')
      .replace('{visible}', fmt(constructionProjects.length, 0))
      .replace('{total}', fmt(allConstructionProjects.length, 0))),
    constructionProjects.length ? constructionTable : el('p', { class: 'hint' }, t('constructionNoResults')),
    constructionPagination) : null;
  return constructionDetails ?? el('section', {}, el('h2', {}, t('tabConstruction')),
    el('p', { class: 'hint' }, t('unavailable')));
}


// Observe: how goods and people actually move. Owned fleet and its replacement
// opportunities, vehicle lines, and distribution offices — three surfaces that
// shared the foot of the overview, several of them nesting a disclosure per
// line and per office.
function renderLegacyScrapProfitTable(scrapArbitrage, scrapTrades, scrapArbitrageTotal) {
  if (!scrapArbitrage.length) return null;
  return el('div', { class: 'used-fleet-offers scrap-arbitrage' },
    el('div', { class: 'scrap-headline' },
      el('strong', {}, `${fmt(scrapArbitrageTotal, 0)} ${cur()}`),
      el('span', {}, t('fleetScrapTotalHint').replace('{n}', fmt(scrapTrades.length, 0)))),
    el('p', { class: 'hint' }, t('fleetScrapArbitrageHint')),
    el('p', { class: 'hint' }, t('fleetScrapAllHint')
      .replace('{n}', fmt(scrapArbitrage.length, 0))),
    el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {},
        el('th', {}, t('vehicle')),
        el('th', { class: 'r' }, t('fleetScrapBuyPrice')),
        el('th', { class: 'r' }, t('fleetScrapRecovered')),
        el('th', { class: 'r' }, t('fleetScrapLabor')),
        el('th', { class: 'r' }, t('fleetScrapProfit')))),
      el('tbody', {}, ...scrapArbitrage.map(row => el('tr', {},
        el('td', {}, row.quote.offer.modelFacts.name),
        el('td', { class: 'r' }, fmt(row.purchaseValue, 0)),
        el('td', { class: 'r' }, fmt(row.recoveredValue.immediateExportValue, 0)),
        el('td', { class: 'r' }, '-' + fmt(row.laborCost, 0)),
        el('td', { class: row.worthBuying ? 'r pos' : 'r neg' }, fmt(row.profit, 0))))))));
}

function renderBorderScrapProfitTable(routes) {
  if (!routes.length) return null;
  const profitableRoutes = routes.filter(route => route.available && route.worthBuying);
  const borderLabel = border => t(border === 'east' ? 'fleetScrapEast' : 'fleetScrapWest');
  const routeLabel = route => `${borderLabel(route.sourceBorder)} → ${borderLabel(route.targetBorder)}`;
  return el('div', { class: 'used-fleet-offers scrap-arbitrage scrap-border-routes' },
    el('div', { class: 'scrap-headline' },
      el('strong', {}, `${fmt(profitableRoutes.length, 0)} ${t('fleetScrapWorthBuying')}`),
      el('span', {}, t('fleetScrapBorderCount').replace('{n}', fmt(routes.length, 0)))),
    el('p', { class: 'hint' }, t('fleetScrapBorderHint')),
    el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {},
        el('th', {}, t('vehicle')),
        el('th', {}, t('fleetScrapSourceBorder')),
        el('th', {}, t('fleetScrapBorderHeading')),
        el('th', { class: 'r' }, t('fleetScrapBuyPrice')),
        el('th', { class: 'r' }, t('fleetScrapRecovered')),
        el('th', { class: 'r' }, t('fleetScrapLabor')),
        el('th', { class: 'r' }, t('fleetScrapNetValue')),
        el('th', { class: 'r' }, t('fleetScrapProfit')),
        el('th', {}, t('fleetScrapStatus')))),
      el('tbody', {}, ...routes.map(route => {
        const facts = route.offer?.modelFacts;
        const status = !route.available
          ? 'fleetScrapUnavailable'
          : route.worthBuying ? 'fleetScrapWorthBuying' : 'fleetScrapNotWorthBuying';
        const value = key => route.available ? fmt(route[key], 0) : '—';
        return el('tr', { class: route.available ? '' : 'scrap-route-unavailable' },
          el('td', {}, facts?.name || '—', el('div', { class: 'subline' }, `#${route.offerIndex + 1}`)),
          el('td', {}, `${borderLabel(route.sourceBorder)} · ${route.sourceCurrency}`),
          el('td', {}, `${routeLabel(route)} · ${route.targetCurrency}`),
          el('td', { class: 'r' }, value('purchaseValue')),
          el('td', { class: 'r' }, route.available ? fmt(route.recoveredValue.immediateExportValue, 0) : '—'),
          el('td', { class: 'r' }, route.available ? '-' + fmt(route.laborCost, 0) : '—'),
          el('td', { class: 'r' }, value('netRecycleValue')),
          el('td', { class: route.worthBuying ? 'r pos' : route.available ? 'r neg' : 'r' }, value('profit')),
          el('td', { class: route.worthBuying ? 'pos' : route.available ? 'neg' : 'warn' }, t(status)));
      })))));
}

function renderLogistics() {
  if (!state.saveImport) {
    return el('section', {}, el('p', { class: 'hint' }, t('citiesEmpty')));
  }
  const eco = economy();
  const fleetRecords = state.saveImport?.ownedVehicles ?? [];
  const fleetSettings = state.saveImport?.header?.settings;
  const priceRecord = state.statsRecords?.[Math.min(state.recordIndex, (state.statsRecords?.length ?? 1) - 1)];
  const exactFleetOpportunities = fleetSettings && Number.isFinite(priceRecord?.year)
    ? fleetRecords.map(record => vehicleEconomicOpportunity(record, {
      year: priceRecord.year,
      currency: state.currency,
      saleAdjustmentLevel: fleetSettings.vehicleSaleAdjustmentLevel,
      depreciationLevel: fleetSettings.depreciationLevel,
      economy: eco,
    })).filter(Boolean).sort((a, b) => (b.advantage ?? -Infinity) - (a.advantage ?? -Infinity)) : [];
  const usedFleetRecords = state.saveImport?.usedVehicleOffers ?? [];
  const exactUsedVehicleQuotes = Number.isFinite(priceRecord?.year)
    ? usedFleetRecords.map(offer => vehicleUsedMarketQuote(offer, {
      year: priceRecord.year, currency: state.currency, economy: eco,
    })).filter(Boolean).sort((a, b) => a.purchaseValue - b.purchaseValue) : [];
  // Buy off the used market and scrap it for materials: a trade to act on now,
  // as opposed to an appraisal of vehicles already owned.
  const scrapArbitrage = rankUsedMarketArbitrage(exactUsedVehicleQuotes, {
    currency: state.currency, economy: eco,
  });
  const scrapTrades = scrapArbitrage.filter(row => row.worthBuying);
  const scrapArbitrageTotal = scrapTrades.reduce((sum, row) => sum + row.profit, 0);
  const scrapBorderRoutes = rankUsedMarketBorderRoutes(usedFleetRecords, { economy: eco });
  const replacementCandidates = rankUsedVehicleReplacements(
    exactFleetOpportunities, exactUsedVehicleQuotes,
  );
  const fleetFilterDefaults = { category: 'all', action: 'all', sort: 'advantage', search: '', page: 1 };
  const fleetFilter = { ...fleetFilterDefaults, ...(state.fleetFilter ?? {}) };
  state.fleetFilter = fleetFilter;
  const filteredFleetOpportunities = filterAndSortVehicleOpportunities(
    exactFleetOpportunities, fleetFilter,
  );
  const fleetPage = paginateVehicleOpportunities(filteredFleetOpportunities, {
    page: fleetFilter.page, pageSize: 50,
  });
  if (fleetPage.page && fleetPage.page !== fleetFilter.page) fleetFilter.page = fleetPage.page;
  const fleetActionLabel = action => t(action === 'recycle' ? 'fleetRecycle' : 'fleetExport');
  const fleetCategoryLabel = facts => t(`fleetCategory.${vehicleCategoryGroup(facts?.runtimeCategory)}`);
  const fleetCapacityUnit = facts => facts?.transportSubtype === 7 ? t('fleetPassengers') : 't';
  const materialSummary = opportunity => Object.entries(opportunity.recycling.materials)
    .filter(([, amount]) => amount > 0.01)
    .map(([key, amount]) => {
      const resource = DATA.resources.find(item => item.key === key);
      return `${resource ? rname(resource) : key}: ${fmt(amount, 2)} t`;
    }).join(' · ');
  const opportunityCard = opportunity => el('div', { class: 'totalsbox institution-card' },
    el('h3', {}, opportunity.record.modelFacts.name,
      el('span', { class: 'evidence-badge derived' }, fleetActionLabel(opportunity.cashOutAction))),
    el('p', { class: 'subline' }, fleetCategoryLabel(opportunity.record.modelFacts)),
    kv(t('fleetExportPayout'), `${fmt(opportunity.exportValue, 0)} ${cur()}`),
    kv(t('fleetRecycleAfterLabor'), Number.isFinite(opportunity.recycleAfterLabor)
      ? `${fmt(opportunity.recycleAfterLabor, 0)} ${cur()}` : '—'),
    kv(t('fleetAdvantage'), Number.isFinite(opportunity.advantage)
      ? `${fmt(opportunity.advantage, 0)} ${cur()}` : '—'),
    opportunity.recycling.ignoredCargo.length
      ? el('p', { class: 'hint warn' }, t('fleetCargoExcluded')) : null);
  const fleetDetailsTable = state.fleetDetails && fleetPage.rows.length ? el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('vehicle')), el('th', {}, t('fleetCashOutAction')),
      el('th', {}, t('fleetExportPayout')), el('th', {}, t('fleetRecycleGross')),
      el('th', {}, t('fleetLaborCost')), el('th', {}, t('fleetRecycleAfterLabor')),
      el('th', {}, t('fleetAdvantage')), el('th', {}, t('fleetWorkdays')))),
    el('tbody', {}, ...fleetPage.rows.map(opportunity => el('tr', {},
      el('td', {}, opportunity.record.modelFacts.name,
        el('div', { class: 'subline' }, fleetCategoryLabel(opportunity.record.modelFacts)),
        el('div', { class: 'subline' }, `${t('fleetSavedMultiplier')}: ${fmt(opportunity.exportMultiplier.multiplier * 100, 1)} %`),
        el('div', { class: 'subline' }, materialSummary(opportunity)),
        opportunity.recycling.ignoredCargo.length
          ? el('div', { class: 'subline warn' }, t('fleetCargoExcluded')) : null),
      el('td', {}, fleetActionLabel(opportunity.cashOutAction)),
      el('td', { class: 'r' }, fmt(opportunity.exportValue, 0)),
      el('td', { class: 'r' }, Number.isFinite(opportunity.recoveredValue.immediateExportValue)
        ? fmt(opportunity.recoveredValue.immediateExportValue, 0) : '—'),
      el('td', { class: 'r' }, Number.isFinite(opportunity.laborOpportunityCost)
        ? fmt(opportunity.laborOpportunityCost, 0) : '—'),
      el('td', { class: 'r' }, Number.isFinite(opportunity.recycleAfterLabor)
        ? fmt(opportunity.recycleAfterLabor, 0) : '—'),
      el('td', { class: 'r' }, Number.isFinite(opportunity.advantage)
        ? fmt(opportunity.advantage, 0) : '—'),
      el('td', { class: 'r' }, fmt(opportunity.recycling.workdays, 0))))))
    : el('p', { class: 'hint warn' }, t('fleetNoFilterResults'));
  const scrapProfitTable = RUNTIME_CONFIG.scrapProfitTable === 'legacy'
    ? renderLegacyScrapProfitTable(scrapArbitrage, scrapTrades, scrapArbitrageTotal)
    : renderBorderScrapProfitTable(scrapBorderRoutes);
  const fleetOpportunities = fleetRecords.length ? el('section', { class: 'institution-overview' },
    el('h3', {}, t('fleetEconomicOpportunities'), el('span', { class: 'evidence-badge exact' }, t('exact'))),
    el('p', { class: 'hint' }, t('fleetEconomicHint')),
    exactFleetOpportunities.length
      ? el('div', { class: 'institution-grid' }, ...exactFleetOpportunities.slice(0, 3).map(opportunityCard))
      : el('p', { class: 'hint warn' }, t('fleetNoExactOpportunities')),
    el('p', { class: 'hint' }, t('fleetCoverageHint')
      .replace('{exact}', fmt(exactFleetOpportunities.length, 0)).replace('{total}', fmt(fleetRecords.length, 0))),
    exactUsedVehicleQuotes.length ? el('div', { class: 'used-fleet-offers' },
      el('h4', {}, t('fleetUsedHeading')),
      el('p', { class: 'hint' }, t('fleetUsedHint')),
      el('div', { class: 'institution-grid' }, ...exactUsedVehicleQuotes.slice(0, 3).map(quote =>
        el('div', { class: 'totalsbox institution-card' },
          el('h3', {}, quote.offer.modelFacts.name,
            el('span', { class: 'evidence-badge exact' }, t('exact'))),
          el('p', { class: 'subline' }, fleetCategoryLabel(quote.offer.modelFacts)),
          kv(t('fleetUsedPrice'), `${fmt(quote.purchaseValue, 0)} ${cur()}`),
          kv(t('fleetOfferFactor'), `${fmt(quote.factor * 100, 1)} %`),
          kv(t('fleetCapacity'), Number.isFinite(quote.offer.modelFacts.capacity)
            ? `${fmt(quote.offer.modelFacts.capacity, 0)} ${fleetCapacityUnit(quote.offer.modelFacts)}` : '—')))),
      el('p', { class: 'hint' }, t('fleetUsedCoverage')
        .replace('{exact}', fmt(exactUsedVehicleQuotes.length, 0)).replace('{total}', fmt(usedFleetRecords.length, 0)))) : null,
    replacementCandidates.length ? el('div', { class: 'used-fleet-offers' },
      el('h4', {}, t('fleetReplacementHeading')),
      el('p', { class: 'hint' }, t('fleetReplacementHint')),
      el('div', { class: 'institution-grid' }, ...replacementCandidates.slice(0, 3).map(candidate => {
        const offerFacts = candidate.quote.offer.modelFacts;
        const ownedFacts = candidate.targetOpportunity.record.modelFacts;
        const releasesCash = candidate.netCashRequired < 0;
        return el('div', { class: 'totalsbox institution-card' },
          el('h3', {}, offerFacts.name,
            el('span', { class: 'evidence-badge derived' }, t('fleetReplacement'))),
          el('p', { class: 'subline' }, fleetCategoryLabel(offerFacts)),
          kv(t('fleetReplacementTarget'), ownedFacts.name),
          kv(t('fleetCapacityChange'), `${fmt(ownedFacts.capacity, 0)} → ${fmt(offerFacts.capacity, 0)} ${fleetCapacityUnit(offerFacts)}`),
          kv(t(releasesCash ? 'fleetCashReleased' : 'fleetNetCashRequired'),
            `${fmt(Math.abs(candidate.netCashRequired), 0)} ${cur()}`),
          kv(t('fleetCompatibleOwned'), fmt(candidate.compatibleOwnedCount, 0)));
      }))) : null,
    exactFleetOpportunities.length ? el('details', {
      class: 'secondary-section',
      ...(state.fleetDetails ? { open: '' } : {}),
      ontoggle: event => {
        const open = event.currentTarget.open;
        if (open === state.fleetDetails) return;
        state.fleetDetails = open;
        update();
      },
    },
      el('summary', {}, `${t('fleetDetails')} (${fmt(filteredFleetOpportunities.length, 0)} / ${fmt(exactFleetOpportunities.length, 0)})`),
      state.fleetDetails ? el('div', { class: 'fleet-details-content' },
        el('p', { class: 'hint warn' }, t('fleetKeepCaveat')),
        el('div', { class: 'settingsbar' },
          el('label', {}, t('fleetCategoryFilter'), selectInput([
            ['all', t('fleetAllCategories')], ['ship', t('fleetShips')],
            ['road', t('fleetRoad')], ['rail', t('fleetRail')], ['air', t('fleetAir')],
          ], fleetFilter.category, value => {
            state.fleetFilter.category = value; state.fleetFilter.page = 1;
          })),
          el('label', {}, t('fleetActionFilter'), selectInput([
            ['all', t('fleetAllActions')], ['export', t('fleetExport')],
            ['recycle', t('fleetRecycle')],
          ], fleetFilter.action, value => {
            state.fleetFilter.action = value; state.fleetFilter.page = 1;
          })),
          el('label', {}, t('sortBy'), selectInput([
            ['advantage', t('fleetAdvantage')], ['export', t('fleetExportPayout')],
            ['recycle', t('fleetRecycleAfterLabor')], ['name', t('vehicle')],
          ], fleetFilter.sort, value => {
            state.fleetFilter.sort = value; state.fleetFilter.page = 1;
          })),
          el('label', {}, t('fleetSearch'), el('input', {
            type: 'search', value: fleetFilter.search ?? '',
            oninput: event => { event.currentTarget.dataset.pendingValue = event.currentTarget.value; },
            onkeydown: event => {
              if (event.key !== 'Enter') return;
              state.fleetFilter.search = event.currentTarget.value;
              state.fleetFilter.page = 1;
              update();
            },
          })),
          el('button', {
            onclick: event => {
              const input = event.currentTarget.parentElement.querySelector('input[type="search"]');
              state.fleetFilter.search = input?.value ?? '';
              state.fleetFilter.page = 1;
              update();
            },
          }, t('fleetSearchApply'))),
        fleetPage.pageCount > 1 ? el('div', { class: 'settingsbar fleet-pagination' },
          el('button', {
            ...(fleetPage.page <= 1 ? { disabled: '' } : {}),
            onclick: () => { state.fleetFilter.page = fleetPage.page - 1; update(); },
          }, `← ${t('fleetPreviousPage')}`),
          el('span', {}, t('fleetPageStatus')
            .replace('{page}', fmt(fleetPage.page, 0)).replace('{pages}', fmt(fleetPage.pageCount, 0))
            .replace('{from}', fmt((fleetPage.page - 1) * fleetPage.pageSize + 1, 0))
            .replace('{to}', fmt(Math.min(fleetPage.total, fleetPage.page * fleetPage.pageSize), 0))
            .replace('{total}', fmt(fleetPage.total, 0))),
          el('button', {
            ...(fleetPage.page >= fleetPage.pageCount ? { disabled: '' } : {}),
            onclick: () => { state.fleetFilter.page = fleetPage.page + 1; update(); },
          }, `${t('fleetNextPage')} →`)) : null,
        el('div', { class: 'tablewrap' }, fleetDetailsTable)) : null) : null) : null;

  const lineOperations = state.saveImport?.vehicleLines;
  const distributionOperations = state.saveImport?.distributionOffices;
  const lineSummary = lineOperations?.summary;
  const distributionSummary = distributionOperations?.summary;
  const scheduleKeys = block => [...new Set((block?.entries ?? []).map(entry => entry.key || '∅'))].join(', ') || '—';
  const operationalBuildingLabel = ref => ref?.building?.name || ref?.building?.type
    || (Number.isInteger(ref?.buildingIndex) ? `#${ref.buildingIndex}` : '—');
  const lineVehiclePosition = vehicle => {
    const op = vehicle.operational;
    if (!op) return el('li', {}, vehicle.name || vehicle.model || `#${vehicle.id}`);
    const routeCount = op.routeTargets?.length ?? 0;
    const cursor = op.hasValidScheduleCursor ? `${op.currentScheduleCursor}/${routeCount}` : '—';
    const relationships = [
      op.currentBuilding ? `${t('currentBuilding')}: ${operationalBuildingLabel(op.currentBuilding)}` : null,
      op.homeWorkplace ? `${t('homeWorkplace')}: ${operationalBuildingLabel(op.homeWorkplace)}` : null,
      op.stationBuilding ? `${t('stationBuilding')}: ${operationalBuildingLabel(op.stationBuilding)}` : null,
      op.movingInsideBuilding ? `${t('insideBuilding')}: ${operationalBuildingLabel(op.movingInsideBuilding)}` : null,
    ].filter(Boolean).join(' · ');
    return el('li', {},
      `${vehicle.name || vehicle.model || `#${vehicle.id}`} · ${t('savedRouteCursor')} ${cursor}`
        + ` · ${t('currentTarget')}: ${operationalBuildingLabel(op.currentScheduleTarget)}`
        + (Number.isFinite(op.currentLineIntervalRaw)
          ? ` · ${t('currentLineIntervalRaw')}: ${fmt(op.currentLineIntervalRaw, 2)}` : ''),
      relationships ? el('div', { class: 'subline' }, relationships) : null);
  };
  const distributionResourceLabel = key => {
    const resource = DATA.resources.find(item => item.key === key);
    return resource ? rname(resource) : key;
  };
  const distributionThresholdLine = (assignment, state) => {
    const target = assignment.target?.name || assignment.target?.type
      || `#${assignment.targetBuildingIndex}`;
    const action = t(state.direction === 'load' ? 'loadAction' : 'unloadAction');
    if (state.status === 'unrestricted') return `${target} · ${action}: ${t('noExplicitResource')}`;
    const resource = distributionResourceLabel(state.resource);
    if (state.status !== 'resolved') {
      const key = {
        'resource-not-directly-stored': 'resourceNotDirectlyStored',
        'ambiguous-storage-role': 'ambiguousStorageRole',
        'no-finite-capacity': 'noFiniteCapacity',
        'invalid-target': 'invalidTarget',
      }[state.status] ?? 'unresolvedThresholds';
      return `${target} · ${action} ${resource}: ${t(key)}`;
    }
    const operator = state.direction === 'load' ? '>' : '<';
    return `${target} · ${action} ${resource}: ${fmt(state.ratio * 100, 1)} % ${operator} `
      + `${fmt(state.threshold * 100, 1)} % · ${t(state.conditionMet ? 'conditionMet' : 'conditionNotMet')}`;
  };
  const logisticsOperations = lineOperations || distributionSummary?.officeCount ? el('section', {
    class: 'institution-overview',
  },
    el('h3', {}, t('savedLogisticsOperations'),
      el('span', { class: 'evidence-badge exact' }, t('exact'))),
    el('p', { class: 'hint' }, t('savedLogisticsHint')),
    el('div', { class: 'columns' },
      lineSummary ? el('div', { class: 'totalsbox' },
        el('h4', {}, t('vehicleLines')),
        kv(t('vehicleLines'), fmt(lineSummary.lineCount, 0)),
        kv(t('linesWithAssignedVehicles'), fmt(lineSummary.assignedLineCount, 0)),
        kv(t('assignedVehicleReferences'), fmt(lineSummary.vehicleReferenceCount, 0)),
        kv(t('orderedStopReferences'), fmt(lineSummary.stopReferenceCount, 0)),
        kv(t('completeObservedCycles'), fmt(lineSummary.completeObservedCycleCount, 0)),
        kv(t('validRouteCursors'), fmt(lineSummary.validScheduleCursorVehicleCount ?? 0, 0)),
        kv(t('positiveCurrentIntervals'), fmt(lineSummary.positiveCurrentIntervalVehicleCount ?? 0, 0))) : null,
      distributionSummary?.officeCount ? el('div', { class: 'totalsbox' },
        el('h4', {}, t('distributionOffices')),
        kv(t('distributionOffices'), `${fmt(distributionSummary.officeCount, 0)} · `
          + `${fmt(distributionSummary.roadCount, 0)} ${t('fleetRoad')} / `
          + `${fmt(distributionSummary.railCount, 0)} ${t('fleetRail')}`),
        kv(t('configuredTargets'), fmt(distributionSummary.targetCount, 0)),
        kv(t('associatedVehicleReferences'), fmt(distributionSummary.associatedVehicleReferenceCount, 0)),
        kv(t('officesWithoutTargets'), fmt(distributionSummary.officesWithoutTargets, 0),
          distributionSummary.officesWithoutTargets ? 'warn' : ''),
        kv(t('officesWithoutAssociatedVehicles'), fmt(distributionSummary.officesWithoutAssociatedVehicles, 0),
          distributionSummary.officesWithoutAssociatedVehicles ? 'warn' : ''),
        kv(t('configuredWithoutFleet'), fmt(distributionSummary.configuredWithoutFleetOfficeCount ?? 0, 0),
          distributionSummary.configuredWithoutFleetOfficeCount ? 'warn' : ''),
        kv(t('inactiveAssignments'), fmt(distributionSummary.neitherActionCount ?? 0, 0),
          distributionSummary.neitherActionCount ? 'warn' : ''),
        kv(t('pickupConditionsMet'), fmt(distributionSummary.pickupConditionMetCount ?? 0, 0)),
        kv(t('deliveryConditionsMet'), fmt(distributionSummary.deliveryConditionMetCount ?? 0, 0)),
        kv(t('unresolvedThresholds'), fmt(distributionSummary.unresolvedThresholdCount ?? 0, 0),
          distributionSummary.unresolvedThresholdCount ? 'warn' : '')) : null),
    lineOperations ? el('details', { class: 'secondary-section' },
      el('summary', {}, `${t('vehicleLineDetails')} (${fmt(lineSummary.lineCount, 0)})`),
      el('p', { class: 'hint warn' }, t('observedIntervalCaveat')),
      el('div', { class: 'tablewrap' }, el('table', { class: 'data wide' },
        el('thead', {}, el('tr', {},
          el('th', {}, t('vehicleLine')), el('th', {}, t('assignedVehicles')),
          el('th', {}, t('orderedStops')), el('th', {}, t('scheduleRules')),
          el('th', {}, t('completeObservedCycle')), el('th', {}, t('largestObservedInterval')))),
        el('tbody', {}, ...lineOperations.lines.map(line => el('tr', {},
          el('td', {}, line.name || `#${line.slot}`),
          el('td', {}, line.assignedVehicles.length
            ? el('details', {},
              el('summary', {}, `${fmt(line.assignedVehicles.length, 0)} · `
                + line.assignedVehicles.map(vehicle => vehicle.name || vehicle.model || `#${vehicle.id}`).join(', ')),
              el('ul', {}, ...line.assignedVehicles.map(lineVehiclePosition))) : '—'),
          el('td', {}, line.stops.length ? line.stops.map(stop =>
            stop.building?.name || stop.building?.type || (stop.buildingIndex < 0 ? '—' : `#${stop.buildingIndex}`)).join(' → ') : '—'),
          el('td', {}, line.stops.map((stop, index) =>
            `${index + 1}: P[${scheduleKeys(stop.primary)}] · S[${scheduleKeys(stop.secondary)}]`).join(' | ') || '—'),
          el('td', { class: 'r' }, Number.isFinite(line.completeObservedCycle)
            ? fmt(line.completeObservedCycle, 2) : '—'),
          el('td', { class: 'r' }, Number.isFinite(line.largestObservedInterval)
            ? fmt(line.largestObservedInterval, 2) : '—'))))))) : null,
    distributionSummary?.officeCount ? el('details', { class: 'secondary-section' },
      el('summary', {}, `${t('distributionOfficeDetails')} (${fmt(distributionSummary.officeCount, 0)})`),
      el('p', { class: 'hint warn' }, t('distributionCoverageCaveat')),
      el('p', { class: 'hint' }, t('distributionThresholdHint')),
      el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {},
          el('th', {}, t('distributionOffice')), el('th', {}, t('kind')),
          el('th', {}, t('configuredTargets')), el('th', {}, t('associatedVehicles')),
          el('th', {}, t('configuredActions')), el('th', {}, t('thresholdDiagnostics')))),
        el('tbody', {}, ...distributionOperations.offices.map(office => {
          const loads = office.assignments.filter(assignment => assignment.load.enabled).length;
          const unloads = office.assignments.filter(assignment => assignment.unload.enabled).length;
          const thresholdStates = office.assignments.flatMap(assignment =>
            (assignment.thresholdStates ?? []).map(state => ({ assignment, state })));
          const operational = office.operational ?? {
            inactiveAssignmentCount: office.assignments.filter(assignment =>
              !assignment.load.enabled && !assignment.unload.enabled).length,
            pickupConditionMetCount: 0, deliveryConditionMetCount: 0, unresolvedThresholdCount: 0,
          };
          const stateSummary = [
            `${t('pickupConditionsMet')}: ${fmt(operational.pickupConditionMetCount, 0)}`,
            `${t('deliveryConditionsMet')}: ${fmt(operational.deliveryConditionMetCount, 0)}`,
            `${t('unresolvedThresholds')}: ${fmt(operational.unresolvedThresholdCount, 0)}`,
          ].join(' · ');
          return el('tr', {},
            el('td', {}, office.name || office.type || `#${office.buildingIndex}`,
              office.configuredWithoutFleet
                ? el('div', { class: 'subline warn' }, t('configuredWithoutFleet')) : null),
            el('td', {}, t(office.kind === 'rail' ? 'fleetRail' : 'fleetRoad')),
            el('td', { class: `r ${office.assignments.length ? '' : 'warn'}` }, fmt(office.assignments.length, 0)),
            el('td', { class: `r ${office.associatedVehicles.length ? '' : 'warn'}` }, fmt(office.associatedVehicles.length, 0)),
            el('td', {}, `${t('loadAction')}: ${fmt(loads, 0)} · ${t('unloadAction')}: ${fmt(unloads, 0)}`,
              operational.inactiveAssignmentCount
                ? el('div', { class: 'subline warn' },
                  `${t('inactiveAssignments')}: ${fmt(operational.inactiveAssignmentCount, 0)}`) : null),
            el('td', {}, thresholdStates.length || operational.inactiveAssignmentCount
              ? el('details', {},
                el('summary', {}, stateSummary),
                el('ul', {},
                  ...thresholdStates.map(({ assignment, state }) => el('li', {
                    class: state.status !== 'resolved'
                      || (state.conditionMet && office.configuredWithoutFleet) ? 'warn' : '',
                  }, distributionThresholdLine(assignment, state))),
                  ...office.assignments.filter(assignment => assignment.inactive
                    || (!assignment.load.enabled && !assignment.unload.enabled)).map(assignment =>
                    el('li', { class: 'warn' }, `${assignment.target?.name || assignment.target?.type
                      || `#${assignment.targetBuildingIndex}`} · ${t('inactiveAssignments')}`)))) : '—'));
        }))))) : null) : null;
  if (!fleetOpportunities && !scrapProfitTable && !logisticsOperations) {
    return el('section', {}, el('h2', {}, t('tabLogistics')),
      el('p', { class: 'hint' }, t('unavailable')));
  }
  return el('section', {}, scrapProfitTable, fleetOpportunities, logisticsOperations);
}

// The full alert list, which is what "diagnose" means: every finding the save
// supports, filterable and silenceable. The overview keeps the critical ones so
// that a republic in trouble is visible without changing section, but the
// complete list lives here rather than at the bottom of an overview page.
function renderAlertsTab() {
  const { alerts } = republicSnapshot();
  const scopeInfo = new Map(plannerScopes().map(scope => [scope.id, scope]));
  const mappableScopeIds = new Set((state.saveImport?.observedBuildings ?? [])
    .map(building => building.scopeId).filter(Number.isInteger));
  const grouped = state.republicAlertGroup
    ? alerts.filter(alert => alertGroup(alert) === state.republicAlertGroup) : alerts;
  const alertCategories = ['workforce', 'needs', 'buffers', 'coverage'];
  if (!['all', ...alertCategories].includes(state.republicAlertFilter)) {
    state.republicAlertFilter = 'all';
  }
  const categoryCounts = new Map(alertCategories.map(category => [category,
    grouped.filter(alert => alertCategory(alert) === category).length]));
  const filteredAlerts = filterRepublicAlerts(grouped, state.republicAlertFilter);
  const alertPresentation = visibleRepublicAlerts(filteredAlerts, {
    expanded: state.republicAlertsExpanded,
  });
  const silenceAccessAlert = buildingIndex => {
    state.accessAlertsMuted = [...new Set([...(state.accessAlertsMuted ?? []), buildingIndex])];
    update();
  };
  const alertAction = alert => {
    if (alert.metric?.startsWith('access.') || alert.metric?.startsWith('power.')
      || alert.metric?.startsWith('water.') || alert.metric?.startsWith('heat.')
      || alert.metric?.startsWith('waste.')) {
      return el('span', { class: 'alert-actions' },
        el('button', { onclick: () => locateBuildingOnMap(alert.buildingIndex, alert.scopeId) },
          t('locateOnMap')),
        el('button', {
          class: 'secondary', title: t('silenceAlertHint'),
          onclick: () => silenceAccessAlert(alert.buildingIndex),
        }, t('silenceAlert')));
    }
    if (!Number.isInteger(alert.scopeId)) return null;
    const scope = scopeInfo.get(alert.scopeId) ?? {};
    if (HAS_SAVE_WORKSPACE && alert.metric === 'coverage.workshop') {
      return el('button', { onclick: () => {
        unmatchedScopeFilter = String(alert.scopeId);
        state.tab = 'saveimport';
        update();
        setTimeout(() => document.querySelector('details.unmatched-types')?.scrollIntoView({
          behavior: 'smooth', block: 'start',
        }), 0);
      } }, t('reviewUnmatched'));
    }
    if (alert.metric.startsWith('buffer.') && scope.production) {
      return el('button', { onclick: () => openArea(alert.scopeId, 'production') }, t('openProduction'));
    }
    if (['health', 'food'].includes(alert.metric) && scope.city) {
      return el('button', { onclick: () => openArea(alert.scopeId, 'city') }, t('openCity'));
    }
    return mappableScopeIds.has(alert.scopeId)
      ? el('button', { onclick: () => locateAreaOnMap(alert.scopeId) }, t('locateOnMap')) : null;
  };
  const alertItems = filteredAlerts.length ? alertPresentation.visible.map(alert => el('div', { class: `alert ${alert.severity}` },
      el('strong', {}, alert.scopeName || t('republicOverview')),
      el('span', {}, t(`alert.${alert.metric}`),
        (alert.metric?.startsWith('power.') || alert.metric?.startsWith('water.')
          || alert.metric?.startsWith('heat.') || alert.metric?.startsWith('waste.')) && alert.areaName ? el('span', { class: 'alert-trend' },
          ` · ${alert.areaName}`) : null,
        alert.metric?.startsWith('access.') ? el('span', { class: 'alert-trend' },
          ` · ${fmt(alert.reachableAdults, 0)} / ${fmt(alert.slots, 0)} `
          + `${t('accessAlertReachable')}${alert.areaName ? ` · ${alert.areaName}` : ''}`) : null,
        alert.trend?.years >= 1 ? el('span', { class: 'alert-trend' },
          ` · ${t(alert.trend.years === 1 ? 'trendOneYear' : 'trendYears')
            .replace('{n}', fmt(alert.trend.years, 0))}`) : null),
      el('span', { class: 'alert-tail' },
        Number.isFinite(alert.observed) ? el('span', { class: 'alert-value' },
          alert.metric === 'staffing' || alert.metric === 'health' || alert.metric === 'food'
            || alert.metric.startsWith('access.') || alert.metric === 'waste.full'
            ? fmt(alert.observed * 100, 1) + ' %'
            : alert.metric.startsWith('buffer.') ? `${fmt(alert.observed, 2)} ${t('day')}`
              : fmt(alert.observed, 1)) : null,
        alertAction(alert))))
    : [el('p', { class: 'hint pos' }, t('noAlerts'))];
  const alertList = el('div', { class: 'alert-list' },
    el('h3', {}, filteredAlerts.length === alerts.length
      ? `${t('attention')} (${fmt(alerts.length, 0)})`
      : `${t('attention')} (${fmt(filteredAlerts.length, 0)} / ${fmt(alerts.length, 0)})`),
    // Arriving from a cluster, the reader has to be told what they are looking
    // at and be able to get back out of it.
    state.republicAlertGroup ? el('div', { class: 'alert-group-chip' },
      el('span', {}, t(`alertGroup.${state.republicAlertGroup}`)),
      el('button', {
        class: 'secondary', 'data-clear-alert-group': state.republicAlertGroup,
        onclick: () => {
          state.republicAlertGroup = null;
          state.republicAlertsExpanded = false;
          update();
        },
      }, t('showAllKinds'))) : null,
    grouped.length > 8 ? el('div', { class: 'settingsbar alert-filters' },
      ...[['all', grouped.length], ...alertCategories.map(category =>
        [category, categoryCounts.get(category)])].filter(([, count]) => count > 0).map(([category, count]) =>
        el('button', {
          class: state.republicAlertFilter === category ? 'active' : '',
          onclick: () => {
            state.republicAlertFilter = category;
            state.republicAlertsExpanded = false;
            update();
          },
        }, `${t(`alertCategory.${category}`)} (${fmt(count, 0)})`))) : null,
    ...alertItems,
    (state.accessAlertsMuted ?? []).length ? el('p', { class: 'hint', 'data-access-alerts-muted': String(state.accessAlertsMuted.length) },
      t('accessAlertsSilenced').replace('{count}', fmt(state.accessAlertsMuted.length, 0)),
      ' ',
      el('button', {
        class: 'secondary',
        onclick: () => { state.accessAlertsMuted = []; update(); },
      }, t('accessAlertsRestore'))) : null,
    filteredAlerts.length > 8 ? el('button', {
      class: 'secondary',
      onclick: () => { state.republicAlertsExpanded = !state.republicAlertsExpanded; update(); },
    }, state.republicAlertsExpanded ? t('showFewerAlerts')
      : t('showAllAlerts').replace('{count}', fmt(alertPresentation.hiddenCount, 0))) : null);
  return el('section', {}, el('h2', {}, t('tabAlerts')), alertList);
}

// Shared by the overview and the alert list, which both offer these actions.
function openArea(scopeId, tab) {
    state.republicScope = scopeId;
    if (tab === 'production') state.productionScope = String(scopeId);
    if (tab === 'city') {
    const index = cityPlanningAreas().findIndex(area => cityScopeIds(area).includes(scopeId));
      if (index >= 0) state.activeCity = index;
    }
    state.tab = tab;
    update();
  }

function locateAreaOnMap(scopeId) {
    mapFocusBuildingIndex = null;
    mapFocusScopeId = scopeId;
    state.republicScope = scopeId;
    update();
    setTimeout(() => document.querySelector('.map-section')?.scrollIntoView({
      behavior: 'smooth', block: 'center',
    }), 0);
  }

function locateBuildingOnMap(buildingIndex, scopeId) {
    mapFocusBuildingIndex = buildingIndex;
    mapSelectedBuildingIndex = buildingIndex;
    mapFocusScopeId = null;
    standaloneMapViewBox = null;
    if (Number.isInteger(scopeId)) state.republicScope = scopeId;
    state.mapLayers = { ...state.mapLayers, buildings: true, walkReach: true };
    state.mapBuildingFilter = '';
    state.tab = 'map';
    update();
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

// Everything the republic overview and the alert list both need.
//
// Both surfaces ask for the same alerts: the overview shows the critical ones
// so a burning republic is visible without changing section, and the Diagnose
// tab shows all of them with filters and silencing. Computing this twice per
// render would evaluate every city and chain plan twice, so it is cached for
// the render that asked and dropped at the start of the next one.
let republicSnapshotCache = null;
function republicSnapshot() {
  if (republicSnapshotCache) return republicSnapshotCache;
  const eco = economy();
  if (!state.cities.length && !Array.isArray(state.saveImport?.scopes)) state.cities.push(defaultCity());
  state.plan.settings.currency = state.currency;
  const chains = chainPlans();
  const buildings = prodBuildings();
  const chainLabel = c => {
    if (c.name) return c.name;
    const r = DATA.resources.find(x => x.key === c.goal);
    return r ? rname(r) : c.goal;
  };

  const overviewCities = Array.isArray(state.saveImport?.scopes)
    ? cityPlanningAreas()
    : state.cities;
  const cityResults = overviewCities.map(city => {
    const rowsResolved = city.rows.map(r => ({
      ...r,
      building: r.importedBuilding ?? (Number.isInteger(r.buildingIndex)
        ? DATA.cityBuildings[r.buildingIndex]
        : DATA.cityBuildings.find(b => b.de === r.name)),
    }));
    const assignedScopeIds = cityScopeIds(city);
    const industryRows = assignedScopeIds.length
      ? state.plan.rows.filter(row => assignedScopeIds.includes(row.scopeId)).map(row => ({
        ...row, building: prodBuildings().find(building => building.de === row.name),
      })) : [];
    const industry = evaluatePlan(industryRows, { small: 0, medium: 0, large: 0, hectares: 0 }, state.plan.settings, eco);
    return {
      city,
      res: evaluateCity({
        ...city,
        rows: rowsResolved,
        workshops: resolveCityWorkshopRows(city.workshops, prodBuildings()),
      }, eco),
      industry,
    };
  });
  const sumCities = fn => cityResults.reduce((a, { res }) => a + (fn(res) || 0), 0);
  const sumCitiesKnown = fn => cityResults.some(({ res }) => fn(res) == null)
    ? null
    : cityResults.reduce((a, { res }) => a + fn(res), 0);
  const cityTotals = {
    population: sumCities(r => r.population),
    workersNeeded: sumCities(r => r.workersNeeded),
    workerSurplus: sumCities(r => r.workerSurplus),
    power: sumCitiesKnown(r => r.power),
    maxKW: sumCitiesKnown(r => r.maxKW),
    water: sumCitiesKnown(r => r.water),
    waste: sumCitiesKnown(r => r.waste),
    buildCostRUB: sumCitiesKnown(r => r.buildCostRUB),
    buildCostUSD: sumCitiesKnown(r => r.buildCostUSD),
  };
  const cityBuildCost = state.currency === 'USD' ? cityTotals.buildCostUSD : cityTotals.buildCostRUB;

  const planRows = state.plan.rows.map(r => ({ ...r, building: prodBuildings().find(b => b.de === r.name) }));
  const plan = evaluatePlan(planRows, state.plan.fields, state.plan.settings, eco);

  // Both sides are already per-shift figures (the sheet's workerSurplus
  // formula accounts for the city's own 3-shift service staffing), so they
  // compare directly: workers the cities can send out vs. what industry needs.
  const netWorkers = cityTotals.workerSurplus - plan.workersPerShift;
  const plannedAreas = cityResults.map(({ city, res, industry }) => {
    const workforceLinked = !city.syntheticArea && cityScopeIds(city).length > 0;
    return {
      scopeId: cityScopeIds(city)[0] ?? null,
      scopeIds: cityScopeIds(city),
      name: city.name,
      population: res.population,
      configuredIndustryWorkers: industry.workersPerShift,
      netWorkers: workforceLinked ? res.workerSurplus - industry.workersPerShift : null,
      workforceLinked,
      power: addKnown(res.power, industry.totalPower),
      water: addKnown(res.water, industry.totalWater),
      waste: addKnown(res.waste, industry.totalWaste),
      unresolvedBuildingCount: city.unresolvedBuildingCount ?? 0,
    };
  });
  const observedImport = state.saveImport?.version >= 2 ? {
    scopes: state.saveImport.scopes,
    productionRows: state.saveImport.observedProductionRows ?? [],
    liveBuildingCount: state.saveImport.observedBuildings?.length ?? state.saveImport.buildingCount,
    sourceStatus: state.saveImport.sourceStatus,
  } : null;
  const republicModel = buildRepublicModel({
    observed: observedImport ?? { scopes: [], productionRows: [], sourceStatus: {} },
    planned: {
      totals: {
        population: cityTotals.population,
        configuredIndustryWorkers: plan.workersPerShift,
        netWorkers,
        power: addKnown(cityTotals.power, plan.totalPower),
        water: addKnown(cityTotals.water, plan.totalWater),
        waste: addKnown(cityTotals.waste, plan.totalWaste),
      },
      areas: plannedAreas,
    },
  });
  const bufferAlerts = productionBufferAlerts(
    state.plan.rows, prodBuildings(), state.plan.settings, name => eco.keyForName(name),
  ).map(alert => ({ ...alert, scopeName: plannerScopeName(alert.scopeId) }));
  const severityOrder = { critical: 0, warning: 1 };
  // Alerts the snapshot cannot raise: a republic in a three-year decline has
  // nothing wrong with it at this instant, which is why nothing else says so.
  const trendAlerts = republicTrendAlerts(state.statsRecords ?? []);
  const accessContextForAlerts = HAS_SAVE_WORKSPACE ? workerAccessContext() : {};
  const accessAlerts = workerAccessAlerts({
    evidence: accessContextForAlerts.evidence,
    walkingNetwork: accessContextForAlerts.network,
    buildings: state.saveImport?.observedBuildings ?? [],
    labelFor: mapBuildingDisplayName,
    scopeNameFor: plannerScopeName,
    muted: state.accessAlertsMuted ?? [],
  });
  const powerAlerts = unpoweredBuildingAlerts({
    buildings: state.saveImport?.observedBuildings ?? [],
    occupiedResidences: (state.saveImport?.residenceOccupancy ?? [])
      .filter(row => (row.residents ?? 0) > 0).map(row => row.buildingIndex),
    labelFor: mapBuildingDisplayName,
    scopeNameFor: plannerScopeName,
    muted: state.accessAlertsMuted ?? [],
  });
  // Water and heat record themselves exactly as electricity does, so they are
  // read the same way rather than inferred from anything.
  const utilityAlerts = ['water', 'heat'].flatMap(resource => missingUtilityAlerts({
    resource,
    buildings: state.saveImport?.observedBuildings ?? [],
    occupiedResidences: (state.saveImport?.residenceOccupancy ?? [])
      .filter(row => (row.residents ?? 0) > 0).map(row => row.buildingIndex),
    labelFor: mapBuildingDisplayName,
    scopeNameFor: plannerScopeName,
    muted: state.accessAlertsMuted ?? [],
  }));
  // A waste store reads the other way round: it fills until something empties it.
  const wasteAlerts = fullWasteStorageAlerts({
    buildings: state.saveImport?.observedBuildings ?? [],
    labelFor: mapBuildingDisplayName,
    scopeNameFor: plannerScopeName,
    muted: state.accessAlertsMuted ?? [],
  });
  const alerts = [...republicAlerts(republicModel), ...trendAlerts, ...bufferAlerts,
    ...accessAlerts, ...powerAlerts, ...utilityAlerts, ...wasteAlerts].sort((a, b) =>
    severityOrder[a.severity] - severityOrder[b.severity]
      || (a.observed ?? Infinity) - (b.observed ?? Infinity)
      || String(a.scopeName).localeCompare(String(b.scopeName)));
  republicSnapshotCache = { alerts, buildings, chainLabel, chains, cityBuildCost, cityResults, cityTotals, eco, netWorkers, observedImport, plan, republicModel };
  return republicSnapshotCache;
}

function renderRepublic() {
  const { alerts, buildings, chainLabel, chains, cityBuildCost, cityResults, cityTotals, eco, netWorkers, observedImport, plan, republicModel } = republicSnapshot();
  if (!observedImport && state.republicView !== 'plan') state.republicView = 'plan';

  const cityBody = cityResults.map(({ city, res, industry }, i) => {
    const available = city.syntheticArea ? null : res.workerSurplus - industry.workersPerShift;
    return el('tr', {},
      el('td', {}, city.name || `${t('city')} ${i + 1}`),
      el('td', { class: 'r' }, fmt(res.population, 0)),
      el('td', { class: 'r ' + (res.workerSurplus < 0 ? 'neg' : 'pos') }, fmt(res.workerSurplus, 1)),
      el('td', { class: 'r' }, fmt(industry.workersPerShift, 0)),
      el('td', { class: 'r ' + (available == null ? '' : available < 0 ? 'neg' : 'pos') },
        available == null ? '—' : fmt(available, 1)),
      el('td', { class: 'r' }, fmt(res.maxKW, 0)),
      el('td', { class: 'r' }, fmt(res.water, 1)),
      el('td', { class: 'r' }, fmt(res.waste, 1)),
      el('td', {}, city.syntheticArea ? '—' : selectInput(
        [['', t('unassigned')], ...chains.map((c, ci) => [String(ci), chainLabel(c)])],
        Number.isInteger(city.assignedChain) ? String(city.assignedChain) : '',
        value => { city.assignedChain = value === '' ? null : Number(value); })));
  });
  const cityRows = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, Array.isArray(state.saveImport?.scopes) ? t('area') : t('city')), el('th', {}, t('population')), el('th', {}, t('workerSurplus')),
      el('th', {}, t('industryWorkers')), el('th', {}, t('netAvailableWorkers')),
      el('th', {}, t('maxWatt')), el('th', {}, t('waterUse')), el('th', {}, t('wasteOut')),
      el('th', {}, t('assignedChain')))),
    el('tbody', {}, cityBody));

  // Solve every chain plan (same seeding renderChain does, so the numbers
  // shown here match what that tab would show) and pair each with whichever
  // cities were assigned to it, so you can check e.g. "does City 1 have
  // enough spare workers for the Steel plan" instead of one grand total.
  const chainIndex = producersByResource(buildings, eco);
  const chainResults = chains.map((chp, ci) => {
    chp.qualityTiers ??= {};
    for (const [key, producers] of chainIndex) {
      if (!chp.qualityTiers[key] && producers.some(p => QUALITY_BUILDINGS_DE.has(p.building.de))) {
        chp.qualityTiers[key] = [{ quality: 0.5, count: 0 }];
      }
    }
    const result = solveChain(chp.goal, chp.amount, buildings, eco, {
      productivity: state.plan.settings.productivity,
      currency: state.currency,
      imports: new Set(chp.imports),
      producerChoice: new Map(Object.entries(chp.producerChoice)),
      includeUtilities: chp.includeUtilities,
      qualityTiers: new Map(Object.entries(chp.qualityTiers)),
    });
    const assigned = cityResults.filter(({ city }) => city.assignedChain === ci);
    const population = assigned.reduce((a, { res }) => a + res.population, 0);
    const workerSurplus = assigned.reduce((a, { res }) => a + res.workerSurplus, 0);
    const industryWorkers = result.diverged ? null : result.totals.workers;
    return { chp, ci, assigned, population, workerSurplus, industryWorkers, result };
  });
  const unassignedCities = cityResults.filter(({ city }) => !city.syntheticArea && !Number.isInteger(city.assignedChain));

  const pairingRows = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('chainGoal')), el('th', {}, t('republicCities')), el('th', {}, t('population')),
      el('th', {}, t('workerSurplus')), el('th', {}, t('republicIndustryWorkers')), el('th', {}, t('republicNetWorkers')))),
    el('tbody', {},
      ...chainResults.map(({ chp, assigned, population, workerSurplus, industryWorkers }) => {
        const net = industryWorkers == null ? null : workerSurplus - industryWorkers;
        return el('tr', {},
          el('td', {}, chainLabel(chp)),
          el('td', {}, assigned.length ? assigned.map(({ city }, i) => (i ? ', ' : '') + (city.name || t('city'))).join('') : '—'),
          el('td', { class: 'r' }, fmt(population, 0)),
          el('td', { class: 'r ' + (workerSurplus < 0 ? 'neg' : 'pos') }, fmt(workerSurplus, 1)),
          el('td', { class: 'r' }, industryWorkers == null ? t('chainDiverged') : fmt(industryWorkers, 0)),
          el('td', { class: 'r ' + (net != null && net < 0 ? 'neg' : 'pos') }, net == null ? '—' : fmt(net, 1)));
      }),
      unassignedCities.length ? el('tr', {},
        el('td', {}, t('unassigned')),
        el('td', {}, unassignedCities.map(({ city }, i) => (i ? ', ' : '') + (city.name || t('city'))).join('')),
        el('td', { class: 'r' }, fmt(unassignedCities.reduce((a, { res }) => a + res.population, 0), 0)),
        el('td', { class: 'r pos' }, fmt(unassignedCities.reduce((a, { res }) => a + res.workerSurplus, 0), 1)),
        el('td', { class: 'r' }, '—'), el('td', { class: 'r' }, '—')) : null));

  const totals = el('div', { class: 'totalsbox' },
    el('h3', {}, t('republicWorkers')),
    kv(t('population'), fmt(cityTotals.population, 0)),
    kv(t('republicCityWorkers'), fmt(cityTotals.workersNeeded, 0)),
    kv(t('workerSurplus'), fmt(cityTotals.workerSurplus, 1), cityTotals.workerSurplus < 0 ? 'neg' : 'pos'),
    kv(t('republicIndustryWorkers'), fmt(plan.workersPerShift, 0)),
    kv(t('republicNetWorkers'), fmt(netWorkers, 1), netWorkers < 0 ? 'neg' : 'pos'));

  const utilities = el('div', { class: 'totalsbox' },
    el('h3', {}, t('republicUtilities')),
    kv(t('maxWatt'), fmt(addKnown(cityTotals.maxKW, plan.totalMaxKW), 0)),
    kv(t('powerUse'), fmt(addKnown(cityTotals.power, plan.totalPower), 1)),
    kv(t('waterUse'), fmt(addKnown(cityTotals.water, plan.totalWater), 1)),
    kv(t('wasteOut'), fmt(addKnown(cityTotals.waste, plan.totalWaste), 1)),
    kv(`${t('buildCost')} ${cur()}`, fmt(addKnown(cityBuildCost, plan.totalBuildCost), 0)));

  const view = republicModel[state.republicView];
  const metricCard = (label, value, evidence, cls = '') => el('div', { class: `metric-card ${cls}` },
    el('span', { class: 'metric-label' }, label),
    el('strong', {}, value == null || Number.isNaN(value) ? '—' : value),
    el('span', { class: `evidence-badge ${evidence === t('exact') ? 'exact' : 'derived'}` }, evidence));
  const staffingRatio = republicModel.actual.totals.configuredIndustryWorkers
    ? republicModel.actual.totals.currentIndustryWorkers
      / republicModel.actual.totals.configuredIndustryWorkers : null;
  const cards = state.republicView === 'actual' ? [
    metricCard(t('population'), fmt(view.totals.population, 0), t('derived')),
    metricCard(t('configuredWorkers'), fmt(view.totals.configuredIndustryWorkers, 0), t('exact')),
    metricCard(t('currentStaffing'), staffingRatio == null ? null : fmt(staffingRatio * 100, 1) + ' %', t('exact'), staffingRatio < 0.7 ? 'warn' : ''),
    metricCard(t('productivity'), Number.isFinite(state.saveImport?.latestProductivity)
      ? fmt(state.saveImport.latestProductivity * 100, 1) + ' %'
      : view.totals.productivity == null ? null : fmt(view.totals.productivity * 100, 2) + ' %',
    Number.isFinite(state.saveImport?.latestProductivity) ? 'stats.ini' : t('derived')),
  ] : [
    metricCard(t('population'), Number.isFinite(view.totals.population) ? fmt(view.totals.population, 0) : null, t('editablePlan')),
    metricCard(t('configuredWorkers'), Number.isFinite(view.totals.configuredIndustryWorkers)
      ? fmt(view.totals.configuredIndustryWorkers, 0) : null, t('editablePlan')),
    metricCard(t('republicNetWorkers'), Number.isFinite(view.totals.netWorkers) ? fmt(view.totals.netWorkers, 1) : null,
      state.republicView === 'plan' ? t('editablePlan') : t('derived'), view.totals.netWorkers < 0 ? 'negative' : ''),
    metricCard(t('powerUse'), Number.isFinite(view.totals.power) ? fmt(view.totals.power, 1) : null, t('derived')),
    metricCard(t('waterUse'), Number.isFinite(view.totals.water) ? fmt(view.totals.water, 1) : null, t('derived')),
    metricCard(t('wasteOut'), Number.isFinite(view.totals.waste) ? fmt(view.totals.waste, 1) : null, t('derived')),
  ];


  const actualArea = new Map(republicModel.actual.areas.map(area => [area.scopeId, area]));
  const planArea = new Map(republicModel.plan.areas.map(area => [area.scopeId, area]));
  const scopeInfo = new Map(plannerScopes().map(scope => [scope.id, scope]));
  const mappableScopeIds = new Set((state.saveImport?.observedBuildings ?? [])
    .map(building => building.scopeId).filter(Number.isInteger));

  // An understaffed building is only answerable on the map, where the reader can
  // see which housing does and does not reach it, so the alert opens it there
  // already selected rather than leaving them to hunt for it.

  const severities = new Map();
  for (const alert of alerts) if (alert.scopeId != null && !severities.has(alert.scopeId)) severities.set(alert.scopeId, alert.severity);
  const areaIds = [...new Set([...actualArea.keys(), ...planArea.keys()])].filter(scopeId => {
    const actual = actualArea.get(scopeId) ?? {};
    const planned = planArea.get(scopeId) ?? {};
    const scope = scopeInfo.get(scopeId) ?? {};
    return (actual.population ?? 0) > 0
      || (actual.productionBuildingCount ?? 0) > 0
      || (planned.population ?? 0) > 0
      || (planned.configuredIndustryWorkers ?? 0) > 0
      || scope.city || scope.production;
  });
  const areaTable = el('table', { class: 'data wide area-health' },
    el('thead', {}, el('tr', {}, el('th', {}, t('area')), el('th', {}, t('population')),
      el('th', {}, t('productivity')), el('th', {}, t('health')), el('th', {}, t('criminality')),
      el('th', {}, t('configuredWorkers')), el('th', {}, t('currentWorkers')),
      el('th', {}, t('plannedWorkers')), el('th', {}, t('netAvailableWorkers')), el('th', {}, t('status')), el('th', {}))),
    el('tbody', {}, ...areaIds.map(scopeId => {
      const actual = actualArea.get(scopeId) ?? {};
      const planned = planArea.get(scopeId) ?? {};
      const scope = scopeInfo.get(scopeId) ?? {};
      const severity = severities.get(scopeId) ?? 'ok';
      return el('tr', { class: `${severity}${state.republicScope === scopeId ? ' selected-area' : ''}` },
        el('td', {}, actual.name ?? planned.name ?? `${t('area')} ${scopeId}`,
          (planned.unresolvedBuildingCount ?? 0) > 0
            ? el('small', { class: 'warn' }, ` · ${fmt(planned.unresolvedBuildingCount, 0)} ${t('unresolvedShort')}`)
            : null,
          (actual.constructionBuildingCount ?? 0) > 0
            ? el('small', { class: 'warn' }, ` · ${fmt(actual.constructionBuildingCount, 0)} ${t('underConstruction')}`)
            : null),
        el('td', { class: 'r' }, actual.population == null ? '—' : fmt(actual.population, 0)),
        el('td', { class: 'r' }, actual.productivity == null ? '—' : fmt(actual.productivity * 100, 1) + ' %'),
        el('td', { class: 'r' }, actual.health == null ? '—' : fmt(actual.health * 100, 1) + ' %'),
        el('td', { class: `r ${(actual.criminality ?? 0) >= 0.01 ? 'warn' : ''}` },
          actual.criminality == null ? '—' : fmt(actual.criminality * 100, 2) + ' %'),
        el('td', { class: 'r' }, fmt(actual.configuredIndustryWorkers ?? 0, 0)),
        el('td', { class: 'r' }, fmt(actual.currentIndustryWorkers ?? 0, 0)),
        el('td', { class: 'r' }, fmt(planned.configuredIndustryWorkers ?? 0, 0)),
        el('td', { class: `r ${(planned.netWorkers ?? 0) < 0 ? 'neg' : ''}` },
          Number.isFinite(planned.netWorkers) ? fmt(planned.netWorkers, 1) : '—'),
        el('td', { class: severity === 'ok' ? 'pos' : severity === 'critical' ? 'neg' : 'warn' }, t(severity)),
        el('td', { class: 'area-actions' },
          mappableScopeIds.has(scopeId)
            ? el('button', { onclick: () => locateAreaOnMap(scopeId) }, t('locateOnMap')) : null,
          scope.city ? el('button', { onclick: () => openArea(scopeId, 'city') }, t('openCity')) : null,
          scope.production ? el('button', { onclick: () => openArea(scopeId, 'production') }, t('openProduction')) : null));
    })));





  const republicOperations = state.saveImport?.operationalServices?.republic;
  const republicLiveQueue = republicOperations?.liveQueue ?? { available: false };
  const facilityStaff = facility => facility.buildingCount
    ? `${fmt(facility.currentWorkers, 0)} / ${fmt(facility.configuredWorkers, 0)}` : '—';
  const institutionCard = (title, facility, extra = []) => el('div', { class: 'totalsbox institution-card' },
    el('h3', {}, title, el('span', { class: 'evidence-badge exact' }, t('exact'))),
    kv(t('building'), fmt(facility.buildingCount, 0)),
    facility.underConstructionCount ? kv(t('underConstruction'), fmt(facility.underConstructionCount, 0), 'warn') : null,
    kv(t('staffing'), facilityStaff(facility),
      facility.buildingCount && facility.currentWorkers === 0 ? 'neg' : ''),
    ...extra);
  const crimeHistoryByScope = new Map((state.saveImport?.operationalServices?.regional ?? [])
    .map(scope => [scope.scopeId, scope.crime]));
  const topCrimeAreas = republicModel.actual.areas
    .filter(area => Number.isFinite(area.criminality) && (area.population ?? 0) > 0)
    .sort((a, b) => b.criminality - a.criminality)
    .slice(0, 5);
  const crimeRanking = topCrimeAreas.length ? el('div', { class: 'crime-ranking' },
    el('h4', {}, t('topCrimeAreas')),
    el('div', { class: 'tablewrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, el('th', {}), el('th', {}, t('area')),
        el('th', {}, t('criminality')), el('th', {}, t('unresolvedCrimeCases')))),
      el('tbody', {}, ...topCrimeAreas.map((area, index) => {
        const history = crimeHistoryByScope.get(area.scopeId);
        return el('tr', {},
          el('td', { class: 'r' }, `${index + 1}.`),
          el('td', {}, area.name),
          el('td', { class: `r ${area.criminality >= 0.01 ? 'warn' : ''}` },
            fmt(area.criminality * 100, 2) + ' %'),
          el('td', { class: 'r' }, history ? fmt(history.unresolvedCrimes ?? 0, 0) : '—'));
      })))),
    el('p', { class: 'hint' }, t('currentCrimeRankingNote'))) : null;
  const institutionOverview = republicOperations ? el('section', { class: 'institution-overview' },
    el('h3', {}, t('republicInstitutions')),
    el('div', { class: 'institution-grid' },
      institutionCard(t('courts'), republicOperations.courts, [
        republicLiveQueue.available
          ? kv(t('liveCourtCases'), fmt(republicLiveQueue.atCourt, 0),
            republicLiveQueue.atCourt > 0 ? 'warn' : '')
          : kv(t('liveQueue'), t('unavailable')),
        kv(t('casesWithoutCourt'), fmt(republicOperations.crime.withoutCourt, 0),
          republicOperations.crime.withoutCourt > 0 ? 'warn' : ''),
        !republicLiveQueue.available
          ? el('p', { class: 'hint' }, t('liveQueueUnavailable')) : null,
      ]),
      institutionCard(t('prisons'), republicOperations.prisons, [
        kv(t('occupants'), fmt(republicOperations.prisons.occupants, 0)),
        kv(t('effectiveServiceCapacity'), republicOperations.prisons.effectiveServiceCapacity > 0
          ? fmt(republicOperations.prisons.effectiveServiceCapacity, 0) : '—'),
        kv(t('prisonersEscaped'), fmt(republicOperations.crime.prisonersEscaped, 0),
          republicOperations.crime.prisonersEscaped > 0 ? 'warn' : ''),
      ]),
      institutionCard(t('orphanages'), republicOperations.orphanages, [
        kv(t('occupants'), fmt(republicOperations.orphanages.occupants, 0)),
        kv(t('serviceCapacity'), republicOperations.orphanages.configuredCapacity > 0
          ? fmt(republicOperations.orphanages.configuredCapacity, 0) : '—'),
      ])),
    republicLiveQueue.available ? el('div', { class: 'live-queue-summary' },
      el('h4', {}, t('liveRepublicCases')),
      kv(t('activeMedicalEmergencies'), fmt(republicLiveQueue.medicalEmergencies, 0),
        republicLiveQueue.medicalEmergencies > 0 ? 'warn' : ''),
      kv(t('awaitingPolice'), fmt(republicLiveQueue.awaitingPolice, 0),
        republicLiveQueue.awaitingPolice > 0 ? 'warn' : ''),
      kv(t('underInvestigation'), fmt(republicLiveQueue.underInvestigation, 0)),
      kv(t('liveCourtCases'), fmt(republicLiveQueue.atCourt, 0)),
      kv(t('crimeSeverity'), `${fmt(republicLiveQueue.mild, 0)} / ${fmt(republicLiveQueue.medium, 0)} / ${fmt(republicLiveQueue.serious, 0)} ${t('mildMediumSerious')}`)) : null,
    crimeRanking,
    el('p', { class: 'hint' }, t('crimeHistoryNote'))) : null;



  // Forty years of history live on their own tab now; keep a way through to it
  // from the overview, which is where someone reading the republic starts.
  const historyLink = state.statsRecords?.length ? el('p', { class: 'hint' },
    el('button', { class: 'linklike', onclick: () => { state.tab = 'history'; update(); } },
      `${t('republicHistory')} (${fmt(state.statsRecords.length, 0)}) →`)) : null;

  const incompleteResearch = state.saveImport?.research?.filter(item => item.progress < 1)
    .sort((a, b) => b.progress - a.progress) ?? [];
  const researchTable = state.saveImport?.research ? el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('researchKey')), el('th', {}, t('progress')), el('th', {}, t('building')))),
    el('tbody', {}, ...incompleteResearch.map(item => el('tr', {},
      el('td', {}, item.key),
      el('td', { class: 'r' }, fmt(item.progress * 100, 1) + ' %'),
      el('td', { class: 'r' }, item.buildingIndex >= 0 ? fmt(item.buildingIndex, 0) : '—'))))) : null;
  const researchDetails = state.saveImport?.research ? el('details', { class: 'planning-details secondary-section' },
    el('summary', {}, `${t('researchProgress')}: ${state.saveImport.researchComplete} / ${state.saveImport.research.length}`),
    el('div', { class: 'tablewrap' }, researchTable)) : null;
  const importedSettings = state.saveImport?.header?.settings;
  const mapClimate = state.saveImport?.mapClimate;
  const settingLevel = (prefix, value, legal) => legal.includes(value)
    ? t(`${prefix}.${value}`) : `${t('unknownSettingValue')} (${value})`;
  const settingsDetails = importedSettings ? el('details', { class: 'planning-details secondary-section' },
    el('summary', {}, t('gameSettings')),
    el('div', { class: 'totalsbox' },
      Number.isInteger(importedSettings.energyManagementLevel)
        ? kv(t('energyManagement'), settingLevel('energyManagement', importedSettings.energyManagementLevel, [0, 1, 2])) : null,
      Number.isInteger(importedSettings.unsatisfiedCitizensReactionLevel)
        ? kv(t('unsatisfiedCitizensReaction'), settingLevel('unsatisfiedCitizensReaction',
          importedSettings.unsatisfiedCitizensReactionLevel, [0, 1, 2])) : null,
      Number.isInteger(importedSettings.dayNightCycleLevel)
        ? kv(t('dayNightCycle'), settingLevel('dayNightCycle', importedSettings.dayNightCycleLevel, [0, 1, 2])) : null,
      kv(t('seasons'), t(importedSettings.seasonsEnabled ? 'enabled' : 'disabled')),
      Number.isInteger(importedSettings.globalEventsLevel)
        ? kv(t('globalEvents'), settingLevel('globalEvents', importedSettings.globalEventsLevel, [0, 1, 2])) : null,
      Number.isInteger(importedSettings.buildingFiresLevel)
        ? kv(t('buildingFires'), settingLevel('buildingFires', importedSettings.buildingFiresLevel, [0, 1, 2])) : null,
      typeof importedSettings.pollutionEnabled === 'boolean'
        ? kv(t('pollution'), t(importedSettings.pollutionEnabled ? 'enabled' : 'disabled')) : null,
      Number.isInteger(importedSettings.vehicleAvailabilityLevel)
        ? kv(t('vehicleAvailability'), settingLevel('vehicleAvailability', importedSettings.vehicleAvailabilityLevel, [0, 1, 2])) : null,
      Number.isInteger(importedSettings.educationSimulationLevel)
        ? kv(t('educationSimulation'), settingLevel('educationSimulation',
          importedSettings.educationSimulationLevel, [0, 1])) : null,
      typeof importedSettings.waterManagementEnabled === 'boolean'
        ? kv(t('waterManagement'), t(importedSettings.waterManagementEnabled ? 'enabled' : 'disabled')) : null,
      typeof importedSettings.crimeJusticeEnabled === 'boolean'
        ? kv(t('crimeJustice'), t(importedSettings.crimeJusticeEnabled ? 'enabled' : 'disabled')) : null,
      typeof importedSettings.trafficSimulationEnabled === 'boolean'
        ? kv(t('trafficSimulation'), t(importedSettings.trafficSimulationEnabled ? 'enabled' : 'disabled')) : null,
      typeof importedSettings.realisticModeEnabled === 'boolean'
        ? kv(t('realisticMode'), t(importedSettings.realisticModeEnabled ? 'enabled' : 'disabled')) : null,
      typeof importedSettings.researchEnabled === 'boolean'
        ? kv(t('researchSetting'), t(importedSettings.researchEnabled ? 'enabled' : 'disabled')) : null,
      Number.isInteger(importedSettings.wasteManagementLevel)
        ? kv(t('wasteManagement'), settingLevel('wasteManagement', importedSettings.wasteManagementLevel, [0, 1, 2])) : null,
      typeof importedSettings.maintenanceEnabled === 'boolean'
        ? kv(t('maintenanceSetting'), t(importedSettings.maintenanceEnabled ? 'enabled' : 'disabled')) : null,
      Number.isFinite(importedSettings.vehicleSaleAdjustmentLevel)
        ? kv(t('fleetStateAdjustmentSetting'), `${importedSettings.vehicleSaleAdjustmentLevel < 2 ? 80 : 20} %`) : null,
      Number.isFinite(importedSettings.depreciationLevel)
        ? kv(t('fleetDepreciationSetting'), t(importedSettings.depreciationLevel > 0 ? 'enabled' : 'disabled')) : null,
      mapClimate ? kv(t('mapClimate'), t(`climate.${mapClimate.id}`)) : null,
      kv(t('heatingCalculation'), t(importedSettings.seasonsEnabled && (mapClimate?.heatingRequired ?? true)
        ? 'enabled' : 'disabled')),
      el('p', { class: 'hint' }, t('verifiedSettingsOnly')))) : null;

  return el('section', {},
    el('div', { class: 'command-center' },
      el('div', { class: 'command-header' },
        el('div', {}, el('h2', {}, state.saveImport?.header?.title || t('republicOverview')),
          state.saveImport ? el('p', { class: 'hint' },
            `${new Date(state.saveImport.importedAt).toLocaleString()} · ${state.saveImport.sourceName}`) : null),
        el('div', { class: 'view-toggle' }, ...['actual', 'plan', 'difference'].map(name => el('button', {
          class: state.republicView === name ? 'active' : '',
          ...(!observedImport && name !== 'plan' ? { disabled: '' } : {}),
          onclick: () => { state.republicView = name; update(); },
        }, t(`view.${name}`))))),
      state.saveImport ? el('div', { class: 'command-meta' },
        el('span', {}, `${fmt(view.totals.occupiedNamedAreas ?? state.saveImport.settlementCount, 0)} ${t('importedSettlements')}`),
        el('span', {}, `${fmt(view.totals.liveBuildingCount ?? state.saveImport.buildingCount, 0)} ${t('importedBuildings')}`),
        state.saveImport.research ? el('span', {}, `${fmt(state.saveImport.researchComplete, 0)} / ${fmt(state.saveImport.research.length, 0)} ${t('importedResearch')}`) : null) : null,
      el('div', { class: 'metric-grid' }, ...cards),
      // The overview carries only what cannot wait, so a republic in trouble is
      // visible without changing section. The full list, with filters and
      // silencing, is the Diagnose tab's job.
      // Counted by kind rather than listed. Five raw criticals said less than
      // "11 buildings held no water" does, and each tile opens the full list
      // already narrowed to the thing it names.
      (() => {
        const groups = groupRepublicAlerts(alerts);
        return el('div', { class: 'alert-list overview-alerts' },
          el('h3', {}, `${t('attention')} (${fmt(alerts.length, 0)})`),
          groups.length ? el('div', { class: 'alert-clusters' }, ...groups.map(group =>
            el('button', {
              class: `alert-cluster ${group.severity}`,
              'data-alert-group': group.group,
              onclick: () => {
                state.tab = 'alerts';
                state.republicAlertGroup = group.group;
                state.republicAlertFilter = 'all';
                state.republicAlertsExpanded = false;
                update();
              },
            }, el('span', { class: 'alert-cluster-count' }, fmt(group.count, 0)),
            el('span', { class: 'alert-cluster-name' }, t(`alertGroup.${group.group}`)))))
            : el('p', { class: 'hint pos' }, t('noCriticalAlerts')),
          el('button', {
            class: 'secondary',
            onclick: () => {
              state.tab = 'alerts';
              state.republicAlertGroup = null;
              update();
            },
          }, t('openAllAlerts').replace('{count}', fmt(alerts.length, 0))));
      })(),
      institutionOverview,
      el('div', { class: 'tablewrap area-table-panel' }, areaTable),
      historyLink,
      researchDetails,
      settingsDetails,
      el('details', { class: 'planning-details' }, el('summary', {}, t('planningDetails')),
        el('p', { class: 'hint' }, t('republicHint')),
        el('p', { class: 'hint warn' }, t('republicConsumptionBlocked')),
        el('div', { class: 'tablewrap' }, cityRows),
        el('h3', {}, t('republicPairings')),
        el('div', { class: 'tablewrap' }, pairingRows),
        el('div', { class: 'columns' }, totals, utilities))));
}

// ---------------------------------------------------------------- trains tab
const CARGO_COLORS = {
  'Kipper': '#8a6d3b', 'Offene Ladefläche': '#7a8a4a', 'Abgedeckte Ladefläche': '#4a7a8a',
  'Flüssigkeitstank': '#5b5b8a', 'Kühlung': '#4a8a7d', 'Passagiere': '#8a4a6b',
  'Staubgut-Behälter': '#8a7d4a', 'Beton': '#6f6f6f', 'Müll': '#556b2f',
  'Vieh': '#a0785a', 'Ladung': '#4a6d8a',
};

function trainConsist() {
  const tr = state.train;
  if (!Array.isArray(tr.consist)) {
    // migrate from the old single-loco/single-wagon shape
    tr.consist = [];
    if (tr.locoName) tr.consist.push({ name: tr.locoName, count: tr.locoCount || 1 });
    if (tr.wagonName) tr.consist.push({ name: tr.wagonName, count: tr.wagonCountOverride || 10 });
  }
  return tr.consist;
}

function vehicleCost(v, eco, currency) {
  return vehicleProductionRecipe(v).reduce((cost, [resource, amount]) => cost
    + amount * (resource === 'workers' ? eco.workday(currency) : eco.buy(resource, currency)), 0);
}

function renderTrains() {
  const tr = state.train;
  const consist = trainConsist();
  const byName = new Map(DATA.vehicles.map(v => [v.name, v]));
  const locos = DATA.vehicles.filter(isLocomotive)
    .sort((a, b) => (b.attrs['Motorleistung'] ?? 0) - (a.attrs['Motorleistung'] ?? 0));
  const wagons = DATA.vehicles.filter(v => ['Güterwagon', 'Passagierwagen'].includes(v.attrs['Typ']));

  const resDeNames = new Set(DATA.resources.map(r => r.de));
  resDeNames.add('Passagiere');
  const cargoSet = new Set();
  for (const w of wagons) for (const cargo of resDeNames) {
    if (vehicleSupportsCargo(w, cargo)) cargoSet.add(cargo);
  }
  const cargos = [...cargoSet].sort((a, b) => a.localeCompare(b));
  if (!cargos.includes(tr.cargo)) tr.cargo = cargos[0];

  const cargoLabel = c => {
    const r = DATA.resources.find(x => x.de === c);
    return r ? rname(r) : (c === 'Passagiere' ? (state.lang === 'de' ? 'Passagiere' : 'Passengers') : c);
  };
  const locoLabel = l => {
    const a = l.attrs;
    return `${l.name} — ${fmt(a['Motorleistung'] ?? 0, 0)} kW, ${fmt(a['Max. Geschwindigkeit'] ?? 0, 0)} km/h, `
      + `${a['Länge'] ?? '?'} m, ${vehicleDrive(l)} (${a['Von'] ?? '?'}–${a['Bis'] ?? '?'})`;
  };

  // Each wagon segment is assigned the cargo it was added under — a wagon
  // carries one cargo at a time even if it could take alternatives.
  const addToConsist = (name, front = false, cargo = null) => {
    const seg = consist.find(s => s.name === name && s.cargo === cargo);
    if (seg) { seg.count++; update(); return; }
    const entry = { name, count: 1, cargo };
    if (front) {
      consist.unshift(entry);
    } else {
      consist.push(entry);
    }
    update();
  };

  // ---- settings
  const eco = economy();
  if (!tr.reco) tr.reco = { rows: [{ cargo: tr.cargo, tons: 300 }], kwt: 2, drive: 'all' };
  const eraLocos = locos.filter(l => eraOk(l, tr.year));
  if (!eraLocos.some(l => l.name === tr.pickLoco)) tr.pickLoco = eraLocos[0]?.name;
  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('trainLength') + ' ', numInput(tr.length, v => tr.length = v, { min: 0, step: 10 })),
    el('label', {}, t('eraYear') + ' ', el('input', {
      type: 'number', class: 'num', value: tr.year ?? '', placeholder: '—', min: 1900, step: 1,
      onchange: e => { tr.year = parseInt(e.target.value) || null; update(); } })),
    el('label', {}, t('loco') + ' ',
      selectInput(eraLocos.map(l => [l.name, locoLabel(l)]), tr.pickLoco, v => { tr.pickLoco = v; })),
    el('button', { onclick: () => addToConsist(tr.pickLoco, true) }, '+ ' + t('loco')),
    el('label', {}, t('cargo') + ' ', selectInput(cargos.map(c => [c, cargoLabel(c)]), tr.cargo, v => tr.cargo = v)),
    consist.length ? el('button', { class: 'danger', onclick: () => { tr.consist = []; update(); } }, t('reset')) : null);

  // ---- recommendation panel
  const reco = tr.reco;
  const recoBox = el('div', { class: 'settingsbar' },
    el('strong', {}, t('recoTitle')),
    ...reco.rows.map((r, i) => el('span', { class: 'recorow' },
      selectInput(cargos.map(c => [c, cargoLabel(c)]), r.cargo, v => r.cargo = v),
      numInput(r.tons, v => r.tons = v, { min: 0, step: 50 }), ' t ',
      reco.rows.length > 1 ? el('button', { class: 'danger', onclick: () => { reco.rows.splice(i, 1); update(); } }, '✕') : null)),
    reco.rows.length < 4 ? el('button', {
      onclick: () => { reco.rows.push({ cargo: cargos.find(c => !reco.rows.some(r => r.cargo === c)) ?? cargos[0], tons: 100 }); update(); },
    }, '+ ' + t('cargo')) : null,
    el('label', {}, t('targetKwt') + ' ', numInput(reco.kwt, v => reco.kwt = v || 2, { min: 0.5, step: 0.5 })),
    el('label', {}, t('drive') + ' ',
      selectInput([['all', t('all')], ['D', 'Diesel'], ['E', 'E'], ['S', 'Dampf/Steam']], reco.drive, v => reco.drive = v)),
    el('button', { class: 'primary', onclick: () => {
      const rec = recommendTrain(tr, locos, wagons);
      if (rec) { tr.consist = rec; update(); }
    } }, '\u25C8 ' + t('recommend')));

  // ---- wagon table (click = add)
  const usedLen = evaluateConsist(consist, byName, resDeNames).totalLength;
  const rows = wagons
    .filter(w => vehicleSupportsCargo(w, tr.cargo) && eraOk(w, tr.year))
    .map(w => ({
      w, len: w.attrs['Länge'] ?? 0, cap: vehicleCargoCapacity(w, tr.cargo),
      cost: vehicleCost(w, eco, state.currency), from: w.attrs['Von'],
      fit: w.attrs['Länge'] > 0 ? Math.floor(Math.max(0, tr.length - usedLen) / w.attrs['Länge']) : 0,
    }))
    .sort((a, b) => b.cap / (b.len || 1) - a.cap / (a.len || 1));

  const tbl = el('table', { class: 'data wide selectable' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('wagon')), el('th', {}, t('length')), el('th', {}, `t / ${t('wagon')}`),
      el('th', {}, 't/m'), el('th', {}, t('from')), el('th', {}, `${t('prodCost')} ${cur()}`),
      el('th', {}, t('stillFits')), el('th', {}))),
    el('tbody', {}, rows.map(r => el('tr', {
      class: consist.some(s => s.name === r.w.name) ? 'selected' : '',
      onclick: () => addToConsist(r.w.name, false, tr.cargo),
    },
      el('td', {}, r.w.name,
        el('span', { class: `evidence-badge ${r.w.provenance?.cargoCapacities === 'game-file' ? 'exact' : 'derived'}` },
          r.w.provenance?.cargoCapacities === 'game-file' ? t('exact') : t('spreadsheetFallback'))),
      el('td', { class: 'r' }, fmt(r.len, 1)),
      el('td', { class: 'r' }, fmt(r.cap, 1)),
      el('td', { class: 'r' }, fmt(r.len ? r.cap / r.len : 0, 2)),
      el('td', { class: 'r' }, r.from ?? '—'),
      el('td', { class: 'r' }, fmt(r.cost, 0)),
      el('td', { class: 'r' }, fmt(r.fit, 0)),
      el('td', {}, el('button', {}, '+'))))));

  // ---- consist evaluation
  const editableSegs = consist
    .map((s, origIdx) => ({ ...s, origIdx, v: byName.get(s.name) }))
    .filter(s => s.v);
  for (const s of editableSegs) {
    // migrated/legacy segments: assign the first cargo the wagon can carry
    if (!s.cargo && !isLocomotive(s.v)) {
      s.cargo = cargos.find(cargo => vehicleSupportsCargo(s.v, cargo)) ?? null;
      const orig = consist.find(c => c.name === s.name && !c.cargo);
      if (orig) orig.cargo = s.cargo;
    }
  }
  const evaluated = evaluateConsist(consist, byName, resDeNames);
  const segs = evaluated.segments.map(s => ({ ...s, v: s.vehicle, origIdx: s.sourceIndex }));
  const {
    totalLength: totalLen, powerKW, emptyWeight: emptyW, capacities,
    loadedWeight: loadedW, kwPerT, maxSpeed: vmax,
    availableFrom: eraFrom, isElectric,
  } = evaluated;
  const totalCost = segs.reduce((a, s) => a + vehicleCost(s.v, eco, state.currency) * s.count, 0);
  const kwCls = kwPerT >= 2 ? 'pos' : kwPerT >= 1 ? 'warn' : 'neg';

  // ---- visual train (SVG, widths proportional to real lengths)
  const svgNS = 'http://www.w3.org/2000/svg';
  const viewLen = Math.max(tr.length, totalLen) + 14;
  const H = 46;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewLen} ${H}`);
  svg.setAttribute('class', 'trainviz');
  svg.setAttribute('preserveAspectRatio', 'none');
  // rail
  const rail = document.createElementNS(svgNS, 'rect');
  rail.setAttribute('x', 0); rail.setAttribute('y', H - 6);
  rail.setAttribute('width', viewLen); rail.setAttribute('height', 1.6);
  rail.setAttribute('fill', 'var(--border)');
  svg.append(rail);
  // desired-length marker
  const marker = document.createElementNS(svgNS, 'line');
  marker.setAttribute('x1', tr.length); marker.setAttribute('x2', tr.length);
  marker.setAttribute('y1', 2); marker.setAttribute('y2', H - 2);
  marker.setAttribute('stroke', totalLen > tr.length ? 'var(--neg)' : 'var(--accent2)');
  marker.setAttribute('stroke-dasharray', '3 2');
  marker.setAttribute('stroke-width', '1');
  svg.append(marker);
  let x = 2;
  for (const s of segs) {
    const len = s.v.attrs['Länge'] ?? 10;
    const loco = isLocomotive(s.v);
    const color = loco ? 'var(--accent)' : (CARGO_COLORS[s.v.attrs['Frachtart']] ?? '#666');
    for (let i = 0; i < s.count; i++) {
      const g = document.createElementNS(svgNS, 'g');
      const body = document.createElementNS(svgNS, loco ? 'polygon' : 'rect');
      const w = len - 1;
      if (loco) {
        body.setAttribute('points',
          `${x},${H - 8} ${x},${H - 26} ${x + w * 0.72},${H - 26} ${x + w * 0.86},${H - 33} ${x + w},${H - 33} ${x + w},${H - 8}`);
      } else {
        body.setAttribute('x', x); body.setAttribute('y', H - 24);
        body.setAttribute('width', w); body.setAttribute('height', 16);
        body.setAttribute('rx', 1.4);
      }
      body.setAttribute('fill', color);
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = `${s.name} (${len} m)`;
      g.append(body, title);
      for (const wx of [x + w * 0.2, x + w * 0.8]) {
        const wheel = document.createElementNS(svgNS, 'circle');
        wheel.setAttribute('cx', wx); wheel.setAttribute('cy', H - 7);
        wheel.setAttribute('r', 1.8);
        wheel.setAttribute('fill', '#2a2d33');
        g.append(wheel);
      }
      svg.append(g);
      x += len;
    }
  }

  // ---- consist editor
  const editor = el('div', { class: 'consist' },
    editableSegs.length ? null : el('p', { class: 'hint' }, t('trainHint')),
    ...editableSegs.flatMap(s => {
      const rows = [el('div', { class: 'consistseg' },
        el('i', { style: `background:${isLocomotive(s.v) ? 'var(--accent)' : (CARGO_COLORS[s.v.attrs['Frachtart']] ?? '#666')}` }),
        el('span', { class: 'segname' }, s.name + (s.cargo && !isLocomotive(s.v) ? ` → ${cargoLabel(s.cargo)}` : '')),
        numInput(s.count, v => {
          consist[s.origIdx].count = Math.max(0, Math.round(v));
          if (!consist[s.origIdx].count) consist.splice(s.origIdx, 1);
        }, { min: 0, step: 1 }),
        el('button', { class: 'danger', onclick: () => { consist.splice(s.origIdx, 1); update(); } }, '✕'))];
      if (isLocomotive(s.v) && s.v.tender) {
        rows.push(el('div', { class: 'consistseg locked' },
          el('i', { style: 'background:#666' }),
          el('span', { class: 'segname' }, s.v.tender.name),
          el('span', { class: 'locklabel' }, `${s.count} × ${t('included')}`)));
      }
      return rows;
    }));

  const summary = el('div', { class: 'totalsbox' },
    el('h3', {}, t('yourTrain')),
    kv(t('totalLength'), fmt(totalLen, 1) + ' m / ' + fmt(tr.length, 0) + ' m', totalLen > tr.length ? 'neg' : 'pos'),
    ...[...capacities.entries()].map(([k, v]) =>
      kv(cargoLabel(k), fmt(v, 1) + (k === 'Passagiere' ? '' : ' t'), 'pos')),
    kv(t('emptyWeight'), fmt(emptyW, 1) + ' t'),
    kv(t('loadedWeight'), fmt(loadedW, 1) + ' t'),
    kv(t('power'), fmt(powerKW, 0) + ' kW' + (isElectric ? ' (E)' : '')),
    kv(t('powerPerTon'), fmt(kwPerT, 2) + ' kW/t', kwCls),
    kv(t('speedLoco'), vmax !== null ? fmt(vmax, 0) + ' km/h' : '—'),
    kv(t('from'), eraFrom ? String(eraFrom) : '—'),
    kv(`${t('prodCost')} ${cur()}`, fmt(totalCost, 0)),
    isElectric ? el('p', { class: 'hint' }, t('catenaryNote')) : null,
    el('p', { class: 'hint' }, t('wagonSpeedNote')),
    el('p', { class: 'hint' }, t('powerHint')));

  return el('section', {},
    el('p', { class: 'hint' }, t('trainHint2')),
    settings,
    recoBox,
    el('div', { class: 'trainvizbox' }, svg),
    el('div', { class: 'columns' },
      el('div', {}, tbl),
      el('div', { class: 'consistcol' }, el('h3', {}, t('consist')), editor, summary)));
}

// ---------------------------------------------------------------- research tab
function importedLowTechValues() {
  return lowTechSaveValues(state.saveImport, {
    definitions: DATA.research,
    gameDate: state.planning?.evidence?.gameDate,
    statsRecords: state.statsRecords,
  });
}

function makeLowTechManual(values) {
  const lt = state.lowtech;
  if (lt.inputSource === 'manual') return;
  Object.assign(lt, lowTechDisplayValues(lt, values), { inputSource: 'manual' });
}

function renderResearch() {
  const lt = state.lowtech;
  const saveValues = importedLowTechValues();
  const effective = lowTechDisplayValues(lt, saveValues);
  const paidResearch = DATA.research.filter(item => item.pointCost === 1)
    .sort((a, b) => (a[state.lang] || a.en).localeCompare(b[state.lang] || b.en, state.lang));
  const checkedKeys = Array.isArray(effective.researchKeys) ? new Set(effective.researchKeys) : null;
  const researched = checkedKeys ? checkedKeys.size : effective.researched;
  const pts = lowTechPoints({ ...effective, researched });
  const setResearchChecked = (key, checked) => {
    makeLowTechManual(saveValues);
    const keys = new Set(lt.researchKeys ?? []);
    if (checked) keys.add(key); else keys.delete(key);
    lt.researchKeys = [...keys].sort();
    lt.researched = lt.researchKeys.length;
    update();
  };
  const importedPaidKeys = completedPaidResearchKeys(DATA.research, state.saveImport?.research);
  const saveValuesAvailable = Object.keys(saveValues).length > 0;
  const startSource = lt.inputSource === 'manual' || !Number.isInteger(saveValues.startYear)
    ? t('ltStartManual') : t('ltHistoryStart');
  const saveSource = saveValuesAvailable
    ? el('p', { class: 'hint' }, lt.inputSource === 'manual' ? t('ltManualSource') : t('ltSaveSource'), ' ', startSource)
    : null;
  const saveButton = saveValuesAvailable && lt.inputSource === 'manual'
    ? el('button', { onclick: () => { lt.inputSource = 'auto'; update(); } }, t('ltUseSave'))
    : null;
  return el('section', {},
    el('p', { class: 'hint' }, t('ltHint'), ' ',
      el('a', { href: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3046902889', target: '_blank' }, 'Steam Guide')),
    saveSource,
    el('div', { class: 'settingsbar column' },
      el('label', {}, t('ltPop') + ' ', numInput(effective.population, v => { makeLowTechManual(saveValues); lt.population = v; }, { min: 0, step: 100 })),
      el('label', {}, t('ltCities') + ' ', numInput(effective.cities, v => { makeLowTechManual(saveValues); lt.cities = v; }, { min: 0, step: 1 })),
      el('label', {}, t('ltStart') + ' ', numInput(effective.startYear, v => { makeLowTechManual(saveValues); lt.startYear = v; }, { min: 1900, step: 1 })),
      el('label', {}, t('ltYear') + ' ', numInput(effective.currentYear, v => { makeLowTechManual(saveValues); lt.currentYear = v; }, { min: 1900, step: 1 })),
      checkedKeys
        ? el('span', {}, `${t('ltDone')}: `, el('strong', {}, fmt(researched, 0)), ' / ', fmt(paidResearch.length, 0))
        : el('label', {}, t('ltDone') + ' ', numInput(effective.researched, v => { makeLowTechManual(saveValues); lt.researched = v; }, { min: 0, step: 1 })),
      checkedKeys ? el('button', { onclick: () => {
        makeLowTechManual(saveValues); lt.researched = researched; lt.researchKeys = null; update();
      } },
        t('ltUseManual')) : el('button', { onclick: () => {
          makeLowTechManual(saveValues); lt.researchKeys = []; lt.researched = 0; update();
        } }, t('ltUseChecklist')),
      saveButton,
      importedPaidKeys.length ? el('button', { class: 'primary', onclick: () => {
        makeLowTechManual(saveValues);
        lt.researchKeys = importedPaidKeys; lt.researched = importedPaidKeys.length; update();
      } }, t('ltUseImported').replace('{count}', fmt(importedPaidKeys.length, 0))) : null),
    el('div', { class: 'totalsbox big' },
      kv(t('ltAvail'), fmt(pts, 0), pts < 0 ? 'neg' : 'pos')),
    checkedKeys ? el('details', { class: 'secondary-section research-checklist', open: '' },
      el('summary', {}, `${t('ltChecklist')} (${fmt(researched, 0)} / ${fmt(paidResearch.length, 0)})`),
      el('p', { class: 'hint' }, t('ltChecklistHint').replace('{free}', fmt(DATA.research.length - paidResearch.length, 0))),
      el('div', { class: 'research-check-grid' }, ...paidResearch.map(item => el('label', {},
        el('input', { type: 'checkbox', checked: checkedKeys.has(item.key),
          onchange: event => setResearchChecked(item.key, event.target.checked) }),
        el('span', {}, item[state.lang] || item.en, el('small', {}, item.key)))))) : null);
}

// ---------------------------------------------------------------- advanced tab
const TUNABLE_GROUPS = [
  { title: 'advFields', keys: ['seasonFactor', 'noSeasonFactor', 'fieldSmall', 'fieldMedium', 'fieldLarge'] },
  { title: 'advServices', keys: ['serviceShopping', 'serviceKindergarten', 'serviceSchool', 'serviceUniversity',
    'serviceCourt', 'servicePolice', 'serviceAttraction', 'serviceHospital'] },
  { title: 'advCity', keys: ['secretPolicePerBuildings', 'heatPerSpecial', 'exchangerSmall', 'exchangerLarge'] },
];

function renderAdvanced() {
  const overridden = Object.keys(state.tuning).length;
  const sourceBuildings = baseProdBuildings();
  const buildingOptions = sourceBuildings
    .map(building => [buildingOverrideKey(state.dataset, building),
      `${building[state.lang] || building.en || building.de} — ${building.group?.[state.lang] || building.group?.en || building.group?.de}`])
    .sort((a, b) => a[1].localeCompare(b[1], state.lang));
  if (!buildingOptions.some(([key]) => key === state.advancedBuildingKey)) {
    state.advancedBuildingKey = buildingOptions[0]?.[0] ?? null;
  }
  const selectedBuilding = sourceBuildings.find(building =>
    buildingOverrideKey(state.dataset, building) === state.advancedBuildingKey);
  const selectedOverride = state.buildingOverrides[state.advancedBuildingKey] ?? {};
  const storeBuildingOverride = next => {
    const all = { ...state.buildingOverrides };
    if (Object.keys(next).length) all[state.advancedBuildingKey] = next;
    else delete all[state.advancedBuildingKey];
    state.buildingOverrides = all;
    update();
  };
  const setScalarOverride = (field, raw) => {
    const value = parseFloat(raw);
    const next = { ...selectedOverride };
    if (!Number.isFinite(value) || value < 0 || value === selectedBuilding[field]) delete next[field];
    else next[field] = value;
    storeBuildingOverride(next);
  };
  const setRateOverride = (kind, item, raw) => {
    const value = parseFloat(raw);
    const rateKey = item.en || item.de;
    const rates = { ...(selectedOverride[kind] ?? {}) };
    if (!Number.isFinite(value) || value < 0 || value === item.rate) delete rates[rateKey];
    else rates[rateKey] = value;
    const next = { ...selectedOverride };
    if (Object.keys(rates).length) next[kind] = rates;
    else delete next[kind];
    storeBuildingOverride(next);
  };
  const overrideInput = (value, changed, onchange) => el('input', {
    type: 'number', min: 0, step: 'any', class: `num price${changed ? ' overridden' : ''}`,
    value, onchange: event => onchange(event.target.value),
  });
  const resourceField = {
    gravel: 'gravel', bricks: 'bricks', steel: 'steel', concrete: 'concrete', asphalt: 'asphalt',
    boards: 'boards', panels: 'prefabpanels', ecomponents: 'ecomponents', mcomponents: 'mcomponents',
  };
  const scalarLabel = field => ({
    workers: t('advBuildingWorkers'), power: t('advBuildingPower'), maxKW: t('maxWatt'),
    water: t('waterUse'), hotwater: t('hotwater'), wastePerWorker: t('advBuildingWaste'),
    workdays: t('advBuildingWorkdays'),
  })[field] ?? DATA.resources.find(resource => resource.key === resourceField[field])?.[state.lang] ?? field;
  const scalarRows = fields => fields.map(field => el('tr', {},
    el('td', {}, scalarLabel(field)),
    el('td', { class: 'r' }, overrideInput(selectedOverride[field] ?? selectedBuilding?.[field] ?? 0,
      selectedOverride[field] !== undefined, value => setScalarOverride(field, value)))));
  const rateRows = kind => (selectedBuilding?.[kind] ?? []).map(item => {
    const key = item.en || item.de;
    return el('tr', {}, el('td', {}, kind === 'production' ? t('advOutput') : t('advInput')),
      el('td', {}, item[state.lang] || item.en || item.de),
      el('td', { class: 'r' }, overrideInput(selectedOverride[kind]?.[key] ?? item.rate,
        selectedOverride[kind]?.[key] !== undefined, value => setRateOverride(kind, item, value))));
  });
  const buildingOverrideCount = Object.keys(state.buildingOverrides).length;
  const uniqueCustomName = (desired, excludeId = null) => {
    const names = new Set(sourceBuildings.filter(building => building.gameId !== excludeId)
      .flatMap(building => [building.de, building.en]));
    if (!names.has(desired)) return desired;
    let suffix = 2;
    while (names.has(`${desired} ${suffix}`)) suffix += 1;
    return `${desired} ${suffix}`;
  };
  const duplicateSelectedBuilding = () => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${state.customBuildings.length}`;
    const effective = applyBuildingOverrides([selectedBuilding], state.buildingOverrides, state.dataset)[0];
    const custom = duplicateCustomBuilding(effective, state.dataset, id);
    custom.de = custom.en = uniqueCustomName(custom.en);
    state.customBuildings = [...state.customBuildings, custom];
    state.advancedBuildingKey = buildingOverrideKey(state.dataset, custom);
    update();
  };
  const renameCustomBuilding = name => {
    const clean = uniqueCustomName(name.trim(), selectedBuilding?.gameId);
    if (!clean || !selectedBuilding?.customBuilding) return update();
    const oldName = selectedBuilding.de;
    state.customBuildings = state.customBuildings.map(building => building.gameId === selectedBuilding.gameId
      ? { ...building, de: clean, en: clean } : building);
    state.plan.rows = state.plan.rows.map(row => row.name === oldName ? { ...row, name: clean } : row);
    for (const chain of state.chains ?? []) {
      for (const [resource, producer] of Object.entries(chain.producerChoice ?? {})) {
        if (producer === oldName) chain.producerChoice[resource] = clean;
      }
    }
    update();
  };
  const deleteCustomBuilding = () => {
    if (!selectedBuilding?.customBuilding) return;
    state.customBuildings = state.customBuildings.filter(building => building.gameId !== selectedBuilding.gameId);
    const all = { ...state.buildingOverrides };
    delete all[state.advancedBuildingKey];
    state.buildingOverrides = all;
    state.advancedBuildingKey = null;
    update();
  };
  return el('section', {},
    el('p', { class: 'hint' }, t('advHint')),
    ...TUNABLE_GROUPS.map(g => el('div', { class: 'totalsbox advgroup' },
      el('h3', {}, t(g.title)),
      ...g.keys.map(key => el('div', { class: 'kv' },
        el('span', { class: state.tuning[key] !== undefined ? 'warn' : '' }, t('adv_' + key)),
        el('input', {
          type: 'number', step: 'any', class: 'num price' + (state.tuning[key] !== undefined ? ' overridden' : ''),
          value: TUNABLES[key],
          onchange: e => {
            const v = parseFloat(e.target.value);
            if (Number.isNaN(v) || v === TUNABLE_DEFAULTS[key]) delete state.tuning[key];
            else state.tuning[key] = v;
            update();
          },
        }))))),
    overridden ? el('button', { class: 'danger', onclick: () => { state.tuning = {}; update(); } },
      `${t('reset')} (${overridden})`) : null,
    el('p', { class: 'hint' }, t('advShareHint')),
    el('div', { class: 'totalsbox advanced-building' },
      el('h3', {}, t('advBuildingOverrides')),
      el('p', { class: 'hint' }, t('advBuildingHint')),
      el('div', { class: 'settingsbar' },
        el('label', {}, t('dataset') + ' ', el('strong', {}, state.dataset === 'game' ? t('datasetGame') : t('datasetSheet'))),
        el('label', {}, t('advBuilding') + ' ', selectInput(buildingOptions, state.advancedBuildingKey,
          value => { state.advancedBuildingKey = value; })),
        selectedBuilding?.customBuilding ? el('label', {}, t('advCustomName') + ' ', el('input', {
          type: 'text', value: selectedBuilding.en, onchange: event => renameCustomBuilding(event.target.value),
        })) : el('button', { onclick: duplicateSelectedBuilding }, `+ ${t('advDuplicateCustom')}`),
        selectedBuilding?.customBuilding ? el('button', { class: 'danger', onclick: deleteCustomBuilding },
          t('advDeleteCustom')) : null,
        Object.keys(selectedOverride).length ? el('button', { class: 'danger', onclick: () => storeBuildingOverride({}) },
          t('advResetBuilding')) : null,
        buildingOverrideCount ? el('button', { class: 'danger', onclick: () => { state.buildingOverrides = {}; update(); } },
          `${t('advResetAllBuildings')} (${buildingOverrideCount})`) : null),
      selectedBuilding ? el('div', { class: 'advanced-building-grid' },
        el('table', { class: 'data' }, el('thead', {}, el('tr', {}, el('th', {}, t('advOperations')), el('th', {}, t('advValue')))),
          el('tbody', {}, ...scalarRows(BUILDING_OVERRIDE_FIELDS.slice(0, 6)))),
        el('table', { class: 'data' }, el('thead', {}, el('tr', {}, el('th', {}, t('advDirection')),
          el('th', {}, t('advResource')), el('th', {}, t('advRate')))),
          el('tbody', {}, ...rateRows('production'), ...rateRows('consumption'))),
        el('table', { class: 'data' }, el('thead', {}, el('tr', {}, el('th', {}, t('advConstruction')), el('th', {}, t('advValue')))),
          el('tbody', {}, ...scalarRows(BUILDING_OVERRIDE_FIELDS.slice(6))))) : null));
}

// ---------------------------------------------------------------- help tab
function renderHelp() {
  const de = state.lang === 'de';
  return el('section', { class: 'help' },
    el('h2', {}, de ? 'Woher bekomme ich die stats.ini?' : 'Where do I get the stats.ini?'),
    el('p', {}, de
      ? 'Workers & Resources: Soviet Republic schreibt Wirtschafts-Statistiken in die Datei stats.ini in deinem Spielstand-Ordner, typischerweise: '
      : 'Workers & Resources: Soviet Republic writes economy statistics to stats.ini inside your savegame folder, typically: '),
    el('pre', {}, 'Documents\\SovietRepublic\\media_soviet\\save\\<savename>\\stats.ini'),
    el('p', {}, de
      ? 'Die Datei enthält mehrere Snapshots ($STAT_RECORD) – dieser Planer liest alle und nutzt standardmäßig den neuesten. Alles läuft lokal im Browser, es wird nichts hochgeladen.'
      : 'The file contains multiple snapshots ($STAT_RECORD) – this planner reads them all and defaults to the newest. Everything runs locally in your browser, nothing is uploaded.'),
    el('h2', {}, de ? 'Was wird berechnet?' : 'What is calculated?'),
    el('ul', {},
      el('li', {}, de ? 'Preise: Kauf-/Verkaufspreise in Rubel & Dollar, editierbar, mit Preisverlauf über alle Snapshots.' : 'Prices: buy/sell prices in rubles & dollars, editable, with price history across all snapshots.'),
      el('li', {}, de ? 'Produktion: Profit, Profit pro Arbeiter, Amortisationszeit und Warenbilanz für deine Industrie-Planung.' : 'Production: profit, profit per worker, amortization time and resource balance for your industry plan.'),
      el('li', {}, de ? 'Preisanalyse: Ranking aller Produktionsgebäude nach Profitabilität bei aktuellen Preisen.' : 'Price analysis: ranking of all production buildings by profitability at current prices.'),
      el('li', {}, de ? 'Stadtplanung: Einwohner, Arbeiterüberschuss, Dienstleistungs-Abdeckung (Einkauf, Schule, Polizei …), Umspannwerke, Wärmetauscher, Baukosten.' : 'City planning: population, worker surplus, service coverage (shopping, school, police …), transformers, heat exchangers, construction cost.'),
      el('li', {}, de ? 'Zugplaner: Wagon-Anzahl und Kapazität je Zuglänge und Ware.' : 'Train planner: wagon count and capacity per train length and cargo.')),
    el('h2', {}, de ? 'Datenquellen und Genauigkeit' : 'Data sources and accuracy'),
    el('p', {}, de
      ? 'Standardmäßig sind Arbeiterzahlen, Produktions- und Verbrauchsraten sowie verfügbare Bauressourcen direkt aus den gebündelten Spieldateien maßgeblich. Die Heißwasser-Ausgabe von Heizwerken bleibt wegen ungeklärter Roh-Einheiten als Spreadsheet-Planungswert gekennzeichnet. Workshop-Gebäude werden ebenso aus ihrer building.ini gelesen. Bei Fahrzeugen überschreiben exakte Spieldaten die alten Tabellenwerte.'
      : 'By default, worker counts, production and consumption rates, and available construction resources come authoritatively from the bundled game files. Heating-plant hot-water output remains labelled as a spreadsheet planning value because its raw units are not yet proven. Workshop buildings are likewise read from their building.ini. For vehicles, exact game fields override the older sheet values.'),
    DATA.dataVersion ? el('p', { class: 'hint' }, `${t('datasetRelease')}: ${DATA.dataVersion.datasetRelease}. ${t('datasetBuildUnknown')}`) : null,
    el('p', {}, de
      ? 'Das Community-Spreadsheet bleibt nur dort eine gekennzeichnete Ergänzung, wo das Spiel keine direkt nutzbare Planungszahl liefert: insbesondere Versorgungs-Richtwerte, einige gemessene Strom-/Wasserwerte, Fahrzeuglängen und fehlende automatische Baukosten. Der Umschalter „Altes Spreadsheet“ dient dem Vergleich; er ist nicht die Standardeinstellung.'
      : 'The community spreadsheet remains a labeled supplement only where the game exposes no directly usable planning value: notably service ratios, some measured power/water values, vehicle lengths, and missing automatic construction costs. The Legacy spreadsheet switch exists for comparison and is not the default.'),
    el('p', {}, de
      ? 'Die ursprüngliche Baukostenformel bepreiste Ziegel, Asphalt und Plattenbauteile versehentlich mit Arbeitstagskosten; hier verwendet jedes Material seinen eigenen Preis.'
      : 'The original construction-cost formula accidentally priced bricks, asphalt, and prefab panels as workdays; this planner uses each material\'s own price.'),
    el('p', {}, el('a', { href: 'https://docs.google.com/spreadsheets/d/1rq76hTLnW1C5QbiQynHSbIJwOgg-wfOgSfZmsfm9kh0/edit', target: '_blank' },
      de ? 'Original-Spreadsheet' : 'Original spreadsheet')));
}

// ---------------------------------------------------------------- share / routing
function sharedState() {
  const projected = stateProjection(SHARE_KEYS);
  projected.saveImport = shareSafeSaveImport(projected.saveImport);
  projected.planning = planningProjection(state.planning);
  return projected;
}

function cloneStateValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// Full plan loads are replacements, not patches. Restoring absent keys from
// defaults prevents state created later (notably production chains) leaking
// into an older snapshot that never contained those keys.
function stateProjection(keys) {
  return Object.fromEntries(keys.map(key => [key, cloneStateValue(state[key])]));
}

function snapshotState() {
  return { ...stateProjection(SNAPSHOT_KEYS), planning: planningProjection(state.planning) };
}

function replaceStateProjection(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Plan state must be an object');
  const defaults = createInitialState();
  const hasCanonicalPlanning = obj.planning && typeof obj.planning === 'object'
    && !Array.isArray(obj.planning);
  for (const key of keys) {
    if (hasCanonicalPlanning && isPlanningKey(key)) continue;
    const value = obj[key] !== undefined ? obj[key] : defaults[key];
    if (value === undefined) delete state[key];
    else state[key] = cloneStateValue(value);
  }

  if (hasCanonicalPlanning) state.planning = createPlanningModel(obj.planning);

  // Pre-multi-chain exports stored one `chain` object rather than `chains`.
  if (obj.chains === undefined && obj.chain && typeof obj.chain === 'object') {
    state.chains = [{ name: null, ...cloneStateValue(obj.chain) }];
  }
  if (!Array.isArray(state.cities)) state.cities = [];
  for (const city of state.cities) {
    if (!Array.isArray(city.workshops)) city.workshops = [];
  }
  // A restored save supplies its areas through saveImport.scopes, so the
  // hand-made placeholder must not be planted on top of them.
  if (!state.cities.length && !Array.isArray(state.saveImport?.scopes)) {
    state.cities.push(defaultCity());
  }
  if (!Array.isArray(state.chains) || !state.chains.length) state.chains = [defaultChainPlan()];
  state.activeCity = Math.max(0, Math.min(Number(state.activeCity) || 0, cityPlanningAreas().length - 1));
  state.activeChain = Math.max(0, Math.min(Number(state.activeChain) || 0, state.chains.length - 1));
  if (!HAS_SAVE_WORKSPACE && state.tab === 'saveimport') state.tab = 'republic';
}

function replaceSharedState(obj) {
  replaceStateProjection(obj, SHARE_KEYS);
}

function exportPlan() {
  downloadJson(sharedState(), 'wr-plan.json');
}

function importPlan(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      replaceSharedState(JSON.parse(reader.result));
      update();
    } catch (e) { alert('Invalid plan file: ' + e.message); }
  };
  reader.readAsText(file);
}

// Named snapshots include private save history and therefore live in IndexedDB
// rather than localStorage's small synchronous quota. Share links deliberately
// continue to use sharedState(), which omits statsRecords.
async function refreshNamedSnapshotNames() {
  namedSnapshotNames = await snapshotStore.names();
}

async function initializeNamedSnapshots() {
  const legacy = localStorage.getItem(SAVES_KEY);
  if (legacy) {
    await migrateLegacySnapshots(snapshotStore, legacy);
    localStorage.removeItem(SAVES_KEY);
  }
  await refreshNamedSnapshotNames();
}

async function restoreNamedMapLayers() {
  const expectsPollution = state.saveImport?.sourceStatus?.pollution === 'exact';
  const expectsPedestrian = state.saveImport?.sourceStatus?.pedestrian === 'exact';
  const expectsCableway = state.saveImport?.sourceStatus?.cableway === 'exact';
  if ((!state.saveImport || (state.saveImport.roadNetwork && state.saveImport.railNetwork
      && (!expectsPedestrian || state.saveImport.pedestrianNetwork)
      && (!expectsCableway || state.saveImport.cablewayNetwork)
      && state.saveImport.terrainWater && (!expectsPollution || state.saveImport.pollutionLayer)))
    || !state.saveSlotName
    || !namedSnapshotNames.includes(state.saveSlotName)) return;
  const saved = await snapshotStore.load(state.saveSlotName);
  const candidate = saved?.saveImport;
  if (!candidate || candidate.sourceName !== state.saveImport.sourceName) return;
  const currentPath = state.saveImport.header?.savePath;
  const candidatePath = candidate.header?.savePath;
  if (currentPath && candidatePath && currentPath !== candidatePath) return;
  if (!state.saveImport.roadNetwork && candidate.roadNetwork) state.saveImport.roadNetwork = candidate.roadNetwork;
  if (!state.saveImport.railNetwork && candidate.railNetwork) state.saveImport.railNetwork = candidate.railNetwork;
  if (!state.saveImport.pedestrianNetwork && candidate.pedestrianNetwork) {
    state.saveImport.pedestrianNetwork = candidate.pedestrianNetwork;
  }
  if (!state.saveImport.cablewayNetwork && candidate.cablewayNetwork) {
    state.saveImport.cablewayNetwork = candidate.cablewayNetwork;
  }
  for (const key of ['powerHighNetwork', 'powerLowNetwork']) {
    if (!state.saveImport[key] && candidate[key]) state.saveImport[key] = candidate[key];
  }
  if (!state.saveImport.terrainWater && candidate.terrainWater) state.saveImport.terrainWater = candidate.terrainWater;
  if (!state.saveImport.pollutionLayer && candidate.pollutionLayer) {
    state.saveImport.pollutionLayer = candidate.pollutionLayer;
  }
  refreshPollutionDiagnostics(state.saveImport);
}

async function saveNamedState(name) {
  try {
    await snapshotStore.save(name, snapshotState());
    await refreshNamedSnapshotNames();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function loadNamedState(name) {
  const saved = await snapshotStore.load(name);
  if (!saved) return false;
  replaceStateProjection(saved, SNAPSHOT_KEYS);
  mapFocusBuildingIndex = null;
  mapFocusScopeId = null;
  return true;
}

async function loadComparisonSnapshot(name) {
  comparisonSnapshotName = name;
  comparisonSnapshot = null;
  comparisonSnapshotError = '';
  if (!name) return update();
  try {
    const saved = await snapshotStore.load(name);
    if (!saved?.saveImport) comparisonSnapshotError = t('comparisonNotImported');
    else comparisonSnapshot = saved;
  } catch (error) {
    comparisonSnapshotError = `${t('comparisonLoadFailed')}: ${error.message}`;
  }
  update();
}

async function deleteNamedState(name) {
  try {
    await snapshotStore.remove(name);
    await refreshNamedSnapshotNames();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function shareLink() {
  const frag = await stateToFragment(sharedState());
  const url = `${location.origin}${location.pathname}#s=${frag}`;
  try {
    await navigator.clipboard.writeText(url);
    alert(t('shareCopied'));
  } catch (e) {
    prompt(t('shareLink'), url);
  }
}

function syncHash() {
  const want = '#/' + state.tab;
  if (location.hash !== want) history.replaceState(null, '', want);
}

async function applyHash() {
  const h = location.hash;
  if (h.startsWith('#s=')) {
    try {
      // Back up the canonical plan in IndexedDB before a shared link replaces
      // it, so restoring a local plan never depends on localStorage.
      await planningBackupStore.save(state.planning);
      hasPlanningBackup = true;
      replaceSharedState(await fragmentToState(h.slice(3)));
      state.viewingSharedLink = true; // transient — not in SHARE_KEYS, not persisted
    } catch (e) {
      state.planningPersistenceError = `Shared plan could not be opened safely: ${e.message}`;
      console.warn('bad share link', e);
    }
    history.replaceState(null, '', '#/' + state.tab);
  } else if (h.startsWith('#/') && TABS.includes(h.slice(2))) {
    state.tab = h.slice(2);
  }
}

window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (h.startsWith('#/') && TABS.includes(h.slice(2)) && h.slice(2) !== state.tab) {
    state.tab = h.slice(2);
    update();
  }
});

// ---------------------------------------------------------------- boot
let liveRuntimeTimer = null;

function applyRuntimeResult(result) {
  state.runtimeStatus = result?.status ?? 'unavailable';
  state.runtimeReason = result?.reason ?? result?.error?.message ?? '';
  state.runtimeGeneration = result?.generation ?? null;
  state.runtimeObservedAt = result?.model?.observedAt ?? null;
  state.liveModel = result?.model ?? null;
}

async function refreshAddonRuntime() {
  if (RUNTIME_CONFIG.mode !== 'addon' || !APP_RUNTIME.live?.refresh) return;
  try {
    applyRuntimeResult(await APP_RUNTIME.live.refresh());
    update();
  } catch (error) {
    applyRuntimeResult({ status: 'unavailable', error });
    update();
  }
}

// A stale shell is invisible from the inside — the app looks like it simply
// stopped working — so it has to say so, and offer the one action that fixes it.
async function announceNewerBuild() {
  const mismatch = await checkForNewerBuild();
  if (!mismatch || document.querySelector('[data-stale-build]')) return;
  const reload = el('button', {
    onclick: async () => {
      // A reload alone can be answered from the same cached shell, which is
      // what put the reader here; the query makes it a different document.
      try {
        const keys = await globalThis.caches?.keys?.();
        await Promise.all((keys ?? []).map(key => caches.delete(key)));
      } catch { /* best effort; the fresh URL is what actually matters */ }
      const url = new URL(location.href);
      url.searchParams.set('build', mismatch.deployed);
      location.replace(url);
    },
  }, t('staleBuildReload'));
  document.body.prepend(el('div', {
    class: 'stale-build-banner',
    role: 'status',
    'data-stale-build': mismatch.deployed,
  }, el('span', {}, t('staleBuildNotice')), reload));
}

function update() {
  applyTuning(state.tuning);
  saveState();
  syncHash();
  render();
}

loadState().then(() => {
  if (!HAS_SAVE_WORKSPACE && state.tab === 'saveimport') state.tab = 'republic';
  return loadData();
}).then(async () => {
  applyRuntimeResult(await APP_RUNTIME.start());
  if (RUNTIME_CONFIG.mode === 'addon') {
    if (liveRuntimeTimer) clearInterval(liveRuntimeTimer);
    liveRuntimeTimer = setInterval(refreshAddonRuntime, 5_000);
  }
  await initializeNamedSnapshots();
  await restoreNamedMapLayers();
  await applyHash();
  // After applyHash on purpose: syncHash writes the last tab into the URL, so
  // the restored hash would otherwise put us straight back into it.
  if (HAS_SAVE_WORKSPACE && shouldOpenStartPage({
    lastSavedAt: observationSavedAt,
    hasSave: !!state.saveImport,
    viewingSharedLink: state.viewingSharedLink,
  })) {
    state.tab = 'home';
  }
  if (!state.cities.length && !Array.isArray(state.saveImport?.scopes)) {
    state.cities.push(defaultCity());
  }
  applyTuning(state.tuning);
  saveState();
  syncHash();
  render();
  // Tells the shell's boot guard that the module graph linked and ran, so a
  // retry it recorded is not held against the next visit.
  dispatchEvent(new Event('appready'));
  announceNewerBuild();
}).catch(err => {
  $('#app').textContent = 'Failed to load data files: ' + err +
    ' — if you opened index.html directly, serve the folder with a local web server (e.g. `python3 -m http.server`).';
});
