import { STRINGS } from './i18n.js?v=85';
import { recordToPrices } from './statsini.js?v=18';
import { parseLiveStatsFile } from './live_stats.js?v=2';
import { Economy, evaluatePlan, evaluateCity, evaluateVehicleProduction, recommendVehicleProduction, vehicleBlueprintQuote, vehicleProductionGroup, vehicleProductionRecipe, buildingPlanningAuthority, CABLES, QUALITY_BUILDINGS_DE, lowTechPoints, FIELD_SIZES } from './calc.js?v=29';
import { stateToFragment, fragmentToState, downloadJson } from './share.js?v=13';
import { solveChain, producersByResource, defaultProducer } from './chain.js?v=15';
import { TUNABLES, TUNABLE_DEFAULTS, applyTuning } from './community_constants.js?v=13';
import { applyBuildingOverrides, buildingOverrideKey, BUILDING_OVERRIDE_FIELDS, duplicateCustomBuilding } from './building_overrides.js?v=2';
import { completedPaidResearchKeys } from './research.js?v=1';
import {
  isLocomotive, evaluateConsist, eraOk, recommendTrain, mergeVehiclePools,
  vehicleCargoCapacity, vehicleSupportsCargo, vehicleDrive,
} from './train.js?v=17';
import { createIndexedDbSnapshotStore, migrateLegacySnapshots } from './storage.js?v=1';
import {
  aggregateCitizensByScope, compactObservedBuildings, groupObservedProduction,
  inferObservedHousing, latestProductivity, matchObservedBuilding, productionBufferStatus,
  productionBufferAlerts, summarizeDistributionOffices, summarizeVehicleLines,
  summarizeCriminalityOutliers,
  buildSchematicMap,
  isNonPlannerSupportType, isBorderPostType, isExternalAirLinkType,
} from './save_model.js?v=17';
import { buildRepublicModel, compareObservedSnapshots, republicAlerts } from './republic.js?v=8';
import { filterRange, seriesFromRecords, downsampleMinMax } from './timeseries.js?v=1';
import { parseWorkshopBuildingIni, workshopBuildingIdentity } from './workshop_ini.js?v=1';
import {
  filterAndSortVehicleOpportunities, rankUsedVehicleReplacements, resolveVehicleModels,
  paginateVehicleOpportunities, shareSafeSaveImport, vehicleCategoryGroup,
  vehicleEconomicOpportunity, vehicleUsedMarketQuote,
} from './fleet.js?v=13';

const IS_BETA = location.pathname.split('/').includes('beta');
const TABS = [...(IS_BETA ? ['home'] : []), 'republic', 'map', 'production', 'city', 'chain',
  'prices', 'analysis', 'vehicleprod', ...(IS_BETA ? ['saveimport'] : []),
  'trains', 'research', 'advanced', 'help'];
// Keys worth sharing/exporting (statsRecords stay local: big + personal to the save).
const SHARE_KEYS = ['lang', 'currency', 'priceSource', 'decade', 'overrides', 'plan',
  'cities', 'activeCity', 'vanillaOnly', 'vehicleProduction', 'train', 'lowtech', 'calcOpts', 'dataset',
  'chains', 'activeChain', 'tuning', 'productionScope', 'saveImport', 'republicView',
  'buildingOverrides', 'customBuildings',
  'republicRange', 'republicResource', 'republicScope', 'mapLayers', 'mapBuildingFilter',
  'mapPollutionOpacity', 'tab'];
const SNAPSHOT_KEYS = [...SHARE_KEYS, 'statsRecords', 'statsName', 'recordIndex'];

// ---------------------------------------------------------------- state
const LS_KEY = 'wr-planner-v1';
const LS_KEY_BACKUP = 'wr-planner-v1-backup'; // local plan saved before a shared link overwrote it
const SAVES_KEY = 'wr-planner-saves-v1';
const snapshotStore = createIndexedDbSnapshotStore();
let namedSnapshotNames = [];
let comparisonSnapshotName = '';
let comparisonSnapshot = null;
let comparisonSnapshotError = '';
let mapFocusBuildingIndex = null;
let mapFocusScopeId = null;
let standaloneMapViewBox = null;
const terrainWaterImageCache = new Map();
const pollutionImageCache = new Map();

function createInitialState() {
  return {
    lang: 'en',
    tab: IS_BETA ? 'home' : 'prices',
    currency: 'RUB',
    priceSource: 'default',      // default | stats | decade
    decade: 1980,
    recordIndex: 0,
    statsRecords: null,          // parsed stats.ini records
    statsName: null,
    overrides: {},               // {"sellRUB.steel": 123}
    historyKey: 'steel',
    historyCompareKeys: [],
    historyLogScale: false,
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
    calcOpts: { inputPriceMode: 'sell', includeDelivery: false },
    dataset: 'game',   // 'game' (current game files) | 'sheet' (spreadsheet snapshot)
    tuning: {},        // advanced-mode overrides for community constants
    buildingOverrides: {}, // dataset-scoped advanced production-building overrides
    customBuildings: [],
    advancedBuildingKey: null,
    lowtech: { population: 2500, cities: 1, currentYear: 1930, startYear: 1920, researched: 0, researchKeys: null },
    chains: [defaultChainPlan()],
    activeChain: 0,
    productionScope: 'all',
    republicView: 'actual',
    republicRange: 'all',
    republicResource: null,
    republicScope: null,
    mapLayers: {
      water: true, pollution: true, roads: true, rails: true, buildings: true,
      construction: true, scopes: true, borders: true, outliers: true,
    },
    mapBuildingFilter: '',
    mapPollutionOpacity: 0.68,
    saveImport: null,
    analysisSort: { col: 'profit', dir: -1 },
    analysisSearch: '',
    priceSort: { col: 'name', dir: 1 },
    saveSlotName: '',   // transient UI field for the named-save-slot input, not shared/exported
    snapshotNotice: '', // transient feedback for named snapshot actions
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
  };
}

const state = createInitialState();

function plannerScopes(kind = null) {
  const imported = state.saveImport?.scopes;
  if (Array.isArray(imported)) return kind ? imported.filter(scope => scope[kind]) : imported;
  return state.cities.filter(city => Number.isInteger(city.scopeId)).map(city => ({
    id: city.scopeId, name: city.name, city: true, production: true,
  }));
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
    waterDivisor: 3, rows: [], assignedChain: null,
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
  const {
    statsRecords, viewingSharedLink, snapshotNotice, importStatus, importStatusError, importBusy,
    localWorkshopStatus, liveStatsStatus, liveStatsStatusError, ...rest
  } = state;
  // Exact road/rail samples belong in the IndexedDB named snapshot. Keeping the
  // multi-megabyte geometry out of the small synchronous localStorage slot
  // prevents unrelated settings changes from silently hitting browser quota.
  const hasLocalMapData = rest.saveImport?.roadNetwork || rest.saveImport?.railNetwork
    || rest.saveImport?.terrainWater || rest.saveImport?.pollutionLayer;
  const persistent = hasLocalMapData
    ? { ...rest, saveImport: (({ roadNetwork, railNetwork, terrainWater, pollutionLayer, ...summary }) => summary)(rest.saveImport) }
    : rest;
  try { localStorage.setItem(LS_KEY, JSON.stringify(persistent)); } catch (e) { /* quota */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(state, s);
    // Price-table sorting is a view preference, not plan state. Each launch
    // starts with the resource names in ascending alphabetical order.
    state.priceSort = { col: 'name', dir: 1 };
    state.localWorkshopStatus = '';
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- data
let DATA = null; // {resources, defaults, prodBuildings, cityBuildings, vehicles, decades}

// Data version: bumped together with the ?v= in index.html on each release so
// GitHub Pages' 10-minute cache can't serve stale JSON to a fresh app.
const DATA_V = new URL(import.meta.url).searchParams.get('v') ?? '0';

async function loadData() {
  const get = path => {
    const url = new URL(`../${path}`, import.meta.url);
    url.searchParams.set('v', DATA_V);
    return fetch(url);
  };
  const [res, prod, prodGame, city, rawBuildings, workshopIndex, veh, rail, rawVehicles, dec, research, dataVersion] = await Promise.all([
    get('data/resources.json').then(r => r.json()),
    get('data/production_buildings.json').then(r => r.json()),
    get('data/game/production_buildings.json').then(r => r.ok ? r.json() : null).catch(() => null),
    get('data/city_buildings.json').then(r => r.json()),
    IS_BETA ? get('data/game/buildings_raw.json').then(r => r.ok ? r.json() : []).catch(() => []) : [],
    IS_BETA ? get('data/workshop/index.json').then(r => r.ok ? r.json() : null).catch(() => null) : null,
    get('data/vehicles.json').then(r => r.json()),
    get('data/game/rail_vehicles.json').then(r => r.ok ? r.json() : []).catch(() => []),
    get('data/game/vehicles_raw.json').then(r => r.ok ? r.json() : []).catch(() => []),
    get('data/decade_prices.json').then(r => r.json()),
    get('data/game/research.json').then(r => r.ok ? r.json() : []).catch(() => []),
    get('data/VERSION.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  DATA = {
    resources: res.resources, defaults: res.defaults,
    prodSets: { sheet: prod, game: prodGame },
    cityBuildings: city,
    rawBuildings, rawVehicles, workshopIndex, workshopBuildings: [], workshopVehicles: [],
    localWorkshopBuildings: [], workshopProduction: [],
    // Game-only rail vehicles join the pool; hard-attached tenders stay nested.
    sheetVehicles: veh.vehicles,
    vehicles: mergeVehiclePools(veh.vehicles, rail, rawVehicles),
    decades: dec, research, dataVersion,
  };
}

async function loadWorkshopCatalogForSave(buildings, vehicles = []) {
  const ids = [...new Set([
    ...buildings.map(building => /^(\d{6,20})\//.exec(building.type)?.[1]),
    ...vehicles.map(vehicle => /^(\d{6,20})\//.exec(vehicle.model)?.[1]),
  ].filter(Boolean))];
  const available = ids.filter(id => DATA.workshopIndex?.items?.[id]);
  const loaded = await Promise.all(available.map(async id => {
    const entry = DATA.workshopIndex.items[id];
    try {
      const url = new URL(`../data/workshop/${entry.path}`, import.meta.url);
      url.searchParams.set('v', DATA_V);
      const response = await fetch(url);
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }));
  const combined = new Map();
  for (const building of loaded.flatMap(item => item?.buildings ?? [])) combined.set(building.id, building);
  for (const building of DATA.localWorkshopBuildings ?? []) combined.set(building.id, building);
  DATA.workshopBuildings = [...combined.values()];
  DATA.workshopVehicles = loaded.flatMap(item => item?.vehicles ?? []);
  DATA.workshopProduction = DATA.workshopBuildings.map(workshopProductionBuilding).filter(Boolean);
  const resolvedIds = new Set([
    ...DATA.workshopBuildings.map(building => building.workshopId),
    ...DATA.workshopVehicles.map(vehicle => vehicle.workshopId),
  ].filter(Boolean));
  return {
    referenced: ids.length,
    resolved: ids.filter(id => resolvedIds.has(id)).length,
    buildingDefinitions: DATA.workshopBuildings.length,
    vehicleDefinitions: DATA.workshopVehicles.length,
    localDefinitions: DATA.localWorkshopBuildings?.length ?? 0,
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
  return new Economy(DATA.resources, currentPrices(), state.calcOpts);
}

// Shared toggles for how profit is computed (production + analysis tabs).
function renderCalcOpts() {
  return el('div', { class: 'settingsbar' },
    el('label', {}, t('inputPriceMode') + ' ',
      selectInput([['sell', t('inputPriceSell')], ['buy', t('inputPriceBuy')]],
        state.calcOpts.inputPriceMode, v => { state.calcOpts.inputPriceMode = v; })),
    el('label', {}, t('includeDelivery') + ' ', el('input', {
      type: 'checkbox', checked: state.calcOpts.includeDelivery,
      onchange: e => { state.calcOpts.includeDelivery = e.target.checked; update(); } })));
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
function cur() { return state.currency === 'USD' ? '$' : '₽'; }

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'selected' || k === 'value') e[k] = v;
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
    state.statsName = parsed.name;
    state.recordIndex = parsed.records.length - 1;
    state.priceSource = 'stats';
    state.overrides = {};
    const productivity = latestProductivity(parsed.records, state.plan.settings.productivity || 1);
    state.plan.settings.productivity = productivity;
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
  document.title = t('appTitle');
  const root = $('#app');

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

  root.replaceChildren(renderHeader(), ...(IS_BETA ? [renderBetaBanner()] : []),
    ...(state.viewingSharedLink ? [renderSharedLinkBanner()] : []),
    ...(state.importBusy ? [renderImportActivity()] : []),
    renderTabs(), renderCurrentTab());
  decorateResponsiveTables(root);

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

function renderSharedLinkBanner() {
  const hasBackup = !!localStorage.getItem(LS_KEY_BACKUP);
  return el('div', { class: 'sharedlinkbanner' },
    el('span', {}, '🔗 ' + t('viewingSharedLink')),
    hasBackup ? el('button', {
      onclick: () => {
        const backup = localStorage.getItem(LS_KEY_BACKUP);
        if (backup) { localStorage.setItem(LS_KEY, backup); localStorage.removeItem(LS_KEY_BACKUP); }
        location.hash = '';
        location.reload();
      },
    }, t('restoreMyPlan')) : null,
    el('button', { onclick: () => { state.viewingSharedLink = false; update(); } }, '✕'));
}

function renderHeader() {
  const languageSwitch = () => el('div', { class: 'langswitch' },
    ...['de', 'en'].map(language => el('button', {
      class: state.lang === language ? 'active' : '',
      onclick: () => { state.lang = language; update(); },
    }, language.toUpperCase())));
  if (IS_BETA && state.tab === 'home') {
    return el('header', { class: 'compact-header' },
      el('h1', {}, t('appTitle')), languageSwitch());
  }
  const showEconomyControls = ['prices', 'production', 'chain', 'analysis', 'vehicleprod'].includes(state.tab);
  const file = el('input', {
    type: 'file', accept: '.ini,.txt', id: 'fileInput', class: 'hidden',
    onchange: e => e.target.files[0] && handleFile(e.target.files[0]),
  });
  const drop = el('label', { class: 'dropzone', for: 'fileInput' },
    file, '📄 ', state.statsName ? `${state.statsName} (${state.statsRecords?.length ?? 0} ${t('record')})` : t('dropHint'));
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
    el('h1', {}, t('appTitle')),
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
        el('button', { title: t('exportPlan'), onclick: exportPlan }, '⬇'),
        el('label', { title: t('importPlan'), class: 'iconbtn' }, '⬆',
          el('input', { type: 'file', accept: '.json', class: 'hidden',
            onchange: e => e.target.files[0] && importPlan(e.target.files[0]) })),
        el('button', { title: t('shareLink'), onclick: shareLink }, '🔗')),
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
    }, '💾'),
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
    }, '📂'),
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
    }, '🗑') : null,
    state.snapshotNotice ? el('span', { class: 'saveslotnotice' }, state.snapshotNotice) : null);
}

function renderTabs() {
  const labels = { home: 'tabHome', prices: 'tabPrices', production: 'tabProduction', chain: 'tabChain',
    analysis: 'tabAnalysis', vehicleprod: 'tabVehicleProd', city: 'tabCity', republic: 'tabRepublic',
    map: 'tabMap', saveimport: 'tabSaveImport', trains: 'tabTrains', research: 'tabResearch', advanced: 'tabAdvanced', help: 'tabHelp' };
  const button = id => el('button', {
    class: state.tab === id ? 'active' : '',
    onclick: () => { state.tab = id; update(); },
  }, t(labels[id]));
  const primary = TABS.filter(id => ['home', 'republic', 'map', 'production', 'city'].includes(id));
  const secondary = TABS.filter(id => !primary.includes(id));
  const activeSecondary = secondary.includes(state.tab);
  return el('nav', {}, ...primary.map(button),
    el('details', { class: 'more-nav' },
      el('summary', { class: activeSecondary ? 'active' : '' }, activeSecondary ? t(labels[state.tab]) : t('moreTools')),
      el('div', { class: 'more-nav-menu' }, ...secondary.map(button))));
}

function renderCurrentTab() {
  switch (state.tab) {
    case 'home': return renderHome();
    case 'prices': return renderPrices();
    case 'production': return renderProduction();
    case 'chain': return renderChain();
    case 'analysis': return renderAnalysis();
    case 'vehicleprod': return renderVehicleProduction();
    case 'city': return renderCity();
    case 'republic': return renderRepublic();
    case 'map': return renderMapTab();
    case 'saveimport': return renderSaveImport();
    case 'trains': return renderTrains();
    case 'research': return renderResearch();
    case 'advanced': return renderAdvanced();
    case 'help': return renderHelp();
    default: return el('div');
  }
}

// ---------------------------------------------------------------- prices tab
function priceCell(table, key, prices) {
  const val = prices[table]?.[key];
  const isFallback = prices.fallback?.[`${table}.${key}`];
  const sign = val > 0 ? ' pos' : val < 0 ? ' neg' : '';
  return el('input', {
    type: 'number', step: 'any',
    class: 'num price' + sign + (state.overrides[`${table}.${key}`] !== undefined ? ' overridden' : '') + (isFallback ? ' fallback' : ''),
    ...(isFallback ? { title: state.lang === 'de'
      ? 'Nicht in deiner stats.ini enthalten (ältere Spielversion) – Beispielwert von 1979'
      : 'Not present in your stats.ini (older game version) – sample value from 1979' } : {}),
    value: val !== undefined ? Math.round(val * 1000) / 1000 : '',
    onchange: e => {
      const v = parseFloat(e.target.value);
      if (Number.isNaN(v)) delete state.overrides[`${table}.${key}`];
      else state.overrides[`${table}.${key}`] = v;
      update();
    },
  });
}

function renderPrices() {
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
      el('td', {}, priceCell('sellRUB', r.key, prices)),
      el('td', {}, priceCell('purchaseRUB', r.key, prices)),
      el('td', {}, priceCell('sellUSD', r.key, prices)),
      el('td', {}, priceCell('purchaseUSD', r.key, prices)),
      el('td', { class: 'r' }, ratioRUB != null ? fmt(ratioRUB, 2) : '—'),
      el('td', { class: 'r' }, ratioUSD != null ? fmt(ratioUSD, 2) : '—')))));

  const scalars = el('div', { class: 'scalars' },
    ...[['workdayCostRUB', `${t('workday')} ₽`], ['workdayCostUSD', `${t('workday')} $`],
        ['deliveryCostRUB', `${t('delivery')} ₽`], ['deliveryCostUSD', `${t('delivery')} $`],
        ['imigrantCostRUB', `${t('imigrant')} ₽`], ['imigrantCostUSD', `${t('imigrant')} $`]]
      .map(([k, label]) => el('label', {}, label + ' ', el('input', {
        type: 'number', step: 'any', class: 'num',
        value: Math.round((prices[k] ?? 0) * 100) / 100,
        onchange: e => { state.overrides[k] = parseFloat(e.target.value) || 0; update(); },
      }))));

  const resetBtn = Object.keys(state.overrides).length
    ? el('button', { class: 'danger', onclick: () => { state.overrides = {}; update(); } }, t('reset'))
    : null;

  return el('section', {},
    el('p', { class: 'hint' }, t('editHint'), ' ', resetBtn),
    scalars,
    el('div', { class: 'columns' },
      el('div', { class: 'pricetablecol' }, table),
      el('div', { class: 'pricehistorycol' }, renderHistory())));
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
  const colors = [
    ['#c0392b', '#e67e22'], ['#2980b9', '#3498db'], ['#8e44ad', '#9b59b6'],
  ];
  const recs = state.statsRecords;
  const labelFor = tab => t(tab === 'sellRUB' ? 'sellRUB'
    : tab === 'purchaseRUB' ? 'buyRUB' : tab === 'sellUSD' ? 'sellUSD' : 'buyUSD');
  const series = selectedResources.flatMap((resource, resourceIndex) => tables.map((tab, tableIndex) => ({
    tab, color: colors[resourceIndex][tableIndex],
    label: `${rname(resource)} · ${labelFor(tab)}`,
    points: seriesFromRecords(recs, record => record[tab]?.[resource.key])
      .filter(point => !state.historyLogScale || point.y > 0),
  }))).filter(item => item.points.length);
  const all = series.flatMap(item => item.points);
  if (!all.length) { box.append(el('p', {}, '—')); return box; }
  const W = 460, H = 220, P = 34;
  const min = state.historyLogScale ? Math.min(...all.map(point => point.y))
    : Math.min(0, ...all.map(point => point.y));
  const max = Math.max(...all.map(point => point.y));
  const minX = Math.min(...all.map(point => point.x));
  const maxX = Math.max(...all.map(point => point.x));
  const x = value => P + (W - 2 * P) * ((value - minX) / ((maxX - minX) || 1));
  const yValue = value => state.historyLogScale ? Math.log10(value) : value;
  const minY = yValue(min), maxY = yValue(max);
  const y = value => H - P - (H - 2 * P) * ((yValue(value) - minY) / ((maxY - minY) || 1));
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${t('history')}: ${selectedResources.map(rname).join(', ')}`);
  for (const item of series) {
    const sampled = downsampleMinMax(item.points, 160);
    const pl = document.createElementNS(svgNS, 'polyline');
    pl.setAttribute('points', sampled.map(point => `${x(point.x)},${y(point.y)}`).join(' '));
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', item.color);
    pl.setAttribute('stroke-width', '1.6');
    pl.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(pl);
    appendChartPointMarkers(svg, item, sampled, x, y, svgNS, ` ${cur()}`);
  }
  appendChartAxisLabel(svg, `${fmt(max)} ${cur()}`, 3, 12, svgNS);
  appendChartAxisLabel(svg, fmt(min), 3, H - 4, svgNS);
  appendChartAxisLabel(svg, all.reduce((a, b) => a.x <= b.x ? a : b).label, P, H - 5, svgNS);
  appendChartAxisLabel(svg, all.reduce((a, b) => a.x >= b.x ? a : b).label,
    W - P, H - 5, svgNS, 'end');
  box.append(svg,
    el('div', { class: 'legend' }, ...series.map(item =>
      el('span', {}, el('i', { style: `background:${item.color}` }), item.label))));
  return box;
}

function appendChartAxisLabel(svg, value, x, y, ns, anchor = null) {
  const node = document.createElementNS(ns, 'text');
  node.setAttribute('x', x);
  node.setAttribute('y', y);
  node.setAttribute('class', 'axislabel');
  if (anchor) node.setAttribute('text-anchor', anchor);
  node.textContent = value;
  svg.append(node);
}

function appendChartPointMarkers(svg, item, points, x, y, ns, suffix = '') {
  for (const point of points) {
    const marker = document.createElementNS(ns, 'circle');
    marker.setAttribute('class', 'chart-point');
    marker.setAttribute('cx', x(point.x));
    marker.setAttribute('cy', y(point.y));
    marker.setAttribute('r', 2.6);
    marker.setAttribute('fill', item.color);
    const tooltip = document.createElementNS(ns, 'title');
    tooltip.textContent = `${item.label}: ${point.label} = ${fmt(point.y, 2)}${suffix}`;
    marker.append(tooltip);
    svg.append(marker);
  }
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

  const assumptions = el('details', { class: 'planner-assumptions secondary-section' },
    el('summary', {}, t('planAssumptions')), settings, renderCalcOpts(), fieldsBox);
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

  if (result.diverged) {
    return el('section', {},
      el('p', { class: 'hint' }, t('chainHint')),
      chainTabs, settings,
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
    chainTabs, settings, tbl,
    el('div', { class: 'columns' }, totals, bypBox));
}

// ---------------------------------------------------------------- analysis tab
function renderAnalysis() {
  const eco = economy();
  const rows = prodBuildings().map(b => {
    const { income, expenses, profit } = eco.buildingProfit(b, state.currency);
    const buildCost = eco.buildCost(b, state.currency);
    return {
      b, income, expenses, profit,
      profitPerWorker: b.workers ? profit / (b.workers / 2) : 0,
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

  return el('section', {},
    el('p', { class: 'hint' }, t('analysisHint')),
    renderCalcOpts(),
    el('input', {
      type: 'search', placeholder: t('searchPlaceholder'), value: state.analysisSearch,
      oninput: e => { state.analysisSearch = e.target.value; update(); },
    }),
    el('table', { class: 'data wide' },
      el('thead', {}, el('tr', {},
        th('name', t('building')), el('th', {}, t('group')), el('th', {}, t('workers')),
        th('profit', `${t('profit')} ${cur()}`), th('profitPerWorker', t('profitPerWorker')),
        th('amortDays', t('amortDays')), th('income', `${t('income')} ${cur()}`),
        th('expenses', `${t('expenses')} ${cur()}`), th('buildCost', `${t('buildCost')} ${cur()}`))),
      el('tbody', {}, rows.map(r => el('tr', {},
        el('td', {}, bname(r.b), planningAuthorityBadge(r.b, ['economy', 'construction'])),
        el('td', {}, r.b.group[state.lang]),
        el('td', { class: 'r' }, fmt(r.b.workers, 0)),
        el('td', { class: 'r ' + (r.profit < 0 ? 'neg' : 'pos') }, fmt(r.profit)),
        el('td', { class: 'r ' + (r.profitPerWorker < 0 ? 'neg' : 'pos') }, fmt(r.profitPerWorker)),
        el('td', { class: 'r' }, fmt(r.amortDays, 1)),
        el('td', { class: 'r' }, fmt(r.income)), el('td', { class: 'r' }, fmt(r.expenses)),
        el('td', { class: 'r' }, fmt(r.buildCost, 0)))))));
}

// ---------------------------------------------------------------- vehicle production tab
function renderVehicleProduction() {
  const plan = state.vehicleProduction ??= { productivity: 1, timeUnit: 'year', rows: [] };
  plan.recommendationGroup ??= 'road';
  const eco = economy();
  const recipeWorkdays = vehicle => vehicleProductionRecipe(vehicle)
    .reduce((sum, [resource, amount]) => resource === 'workers' ? sum + amount : sum, 0);
  const available = DATA.vehicles
    .map((vehicle, index) => ({ vehicle, index }))
    .filter(({ vehicle }) => recipeWorkdays(vehicle) > 0);
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
  const recommendationTable = el('div', { class: 'tablewrap recommendations' },
    el('table', { class: 'data wide' },
      el('thead', {}, el('tr', {},
        el('th', {}, '#'), el('th', {}, t('vehicle')), el('th', {}, t('vehicleType')),
        el('th', {}, t('origin')), el('th', {}, `${t('saleValue')} ${cur()}`),
        el('th', {}, `${t('materialPerUnit')} ${cur()}`),
        el('th', {}, `${t('profitPerWorker')} / ${t(plan.timeUnit)}`),
        el('th', {}, t('blueprintAndPayback')), el('th', {}))),
      el('tbody', {}, recommendations.map((item, rank) => {
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
      }))));

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
    settings, renderCalcOpts(),
    el('h3', {}, t('bestVehicles')),
    Array.isArray(blueprintOwned) ? el('p', { class: 'hint' },
      `${t('blueprintsOwnedInSave')}: ${fmt(blueprintOwned.length, 0)} · stats.ini`) : null,
    el('div', { class: 'settingsbar' },
      el('label', {}, t('vehicleGroup') + ' ', selectInput(
        [['road', t('roadVehicles')], ['trains', t('trains')], ['boats', t('boats')], ['aircraft', t('aircraft')]],
        plan.recommendationGroup, value => { plan.recommendationGroup = value; }))),
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

const WORKSHOP_PRODUCTION_GROUPS = new Map([
  ['eletric', ['Strom', 'Electricity']], ['heat', ['Heizwerk', 'Heating plant']],
  ['water', ['Wasser & Abwasser', 'Water & Wastewater']], ['usagewater', ['Wasser & Abwasser', 'Water & Wastewater']],
  ['plants', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['food', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['alcohol', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['meat', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['livestock', ['Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants']],
  ['gravel', ['Bauindustrie', 'Construction industry']], ['rawgravel', ['Bauindustrie', 'Construction industry']],
  ['cement', ['Bauindustrie', 'Construction industry']], ['concrete', ['Bauindustrie', 'Construction industry']],
  ['asphalt', ['Bauindustrie', 'Construction industry']], ['bricks', ['Bauindustrie', 'Construction industry']],
  ['boards', ['Bauindustrie', 'Construction industry']], ['wood', ['Bauindustrie', 'Construction industry']],
  ['prefabpanels', ['Bauindustrie', 'Construction industry']],
  ['rawcoal', ['Fossile Brennstoffe', 'Fossil fuels']], ['coal', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['oil', ['Fossile Brennstoffe', 'Fossil fuels']], ['fuel', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['bitumen', ['Fossile Brennstoffe', 'Fossil fuels']], ['chemicals', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['plastics', ['Fossile Brennstoffe', 'Fossil fuels']],
  ['rawiron', ['Metallurgie', 'Metallurgy']], ['iron', ['Metallurgie', 'Metallurgy']],
  ['steel', ['Metallurgie', 'Metallurgy']], ['rawbauxite', ['Metallurgie', 'Metallurgy']],
  ['bauxite', ['Metallurgie', 'Metallurgy']], ['alumina', ['Metallurgie', 'Metallurgy']],
  ['aluminium', ['Metallurgie', 'Metallurgy']],
]);

function workshopProductionBuilding(raw) {
  const pseudo = new Set(['vehicles', 'trains']);
  const productionKeys = Object.keys(raw.production ?? {}).filter(key => !pseudo.has(key));
  const consumptionKeys = Object.keys(raw.consumption ?? {})
    .filter(key => !pseudo.has(key) && key !== 'eletric');
  if ((!productionKeys.length && !consumptionKeys.length) || raw.types?.includes('TYPE_FARM')) return null;
  const resource = key => DATA.resources.find(item => item.key === key);
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
    gameId: raw.id, de: raw.nameStr || raw.de || raw.id, en: raw.nameStr || raw.en || raw.de || raw.id,
    group: { de: group[0], en: group[1] }, workers: raw.workers ?? 0,
    production: lines(productionKeys, raw.production, true),
    consumption: lines(consumptionKeys, raw.consumption, false),
    usesQuality: raw.types?.some(type => type.startsWith('TYPE_MINE_')) ?? false,
    power: 0, maxKW: 0, water: 0, hotwater: 0, wastePerWorker: 0,
    workdays: materials.workers ?? 0, gravel: materials.gravel ?? 0,
    bricks: materials.bricks ?? 0, steel: materials.steel ?? 0,
    concrete: materials.concrete ?? 0, asphalt: materials.asphalt ?? 0,
    boards: materials.boards ?? 0, panels: materials.prefabpanels ?? 0,
    ecomponents: materials.ecomponents ?? 0, mcomponents: materials.mcomponents ?? 0,
    provenance: { workers: 'workshop-ini', production: 'workshop-ini', consumption: 'workshop-ini' },
  };
}

function saveTypeCandidates(type) {
  const clean = type.replace(/^MIRRORZ_/, '');
  const candidates = [type, clean];
  if (clean.startsWith('CWC_')) candidates.push(`cwc/${clean.slice(4)}`);
  const aliases = {
    concrete_plant_v2: 'concrete_plant',
    brick_factory_v2: 'brick_factory',
    oil_rafinery_v2: 'oil_rafinery',
  };
  if (aliases[clean]) candidates.push(aliases[clean]);
  return [...new Set(candidates.map(value => value.toLowerCase()))];
}

function matchSaveBuilding(type, entries, idOf) {
  const candidates = saveTypeCandidates(type);
  const exact = new Map(entries.map(entry => [String(idOf(entry) ?? '').toLowerCase(), entry]));
  for (const candidate of candidates) if (exact.has(candidate)) return exact.get(candidate);

  if (/^\d{6,20}\//.test(candidates.at(-1))) return null;
  const basename = candidates.at(-1).split('/').at(-1);
  const matches = entries.filter(entry => String(idOf(entry) ?? '').toLowerCase().split('/').at(-1) === basename);
  return matches.length === 1 ? matches[0] : null;
}

function importedCityBuilding(raw, sourceType) {
  const mappedType = raw.types.map(type => IMPORTED_CITY_TYPES.get(type)).find(Boolean);
  if (!mappedType) return null;
  const capacity = (raw.workers ?? 0) * (raw.citizenAbleServe ?? 0);
  const specialTypes = new Set(['Gerichtsgebäude', 'Polizei']);
  const materials = raw.constructionResources ?? {};
  return {
    de: raw.de || raw.nameStr || sourceType, en: raw.en || raw.nameStr || raw.de || sourceType,
    type: { de: mappedType[0], en: mappedType[1] },
    kind: 'Save', gameId: raw.id, sourceType,
    quality: raw.qualityOfLiving ?? null,
    workers: raw.workers ?? 0,
    special: specialTypes.has(mappedType[0]) ? capacity : 0,
    visitors: specialTypes.has(mappedType[0]) ? 0 : capacity,
    inhabitants: raw.livingSpace ?? 0,
    citizenAbleServe: raw.citizenAbleServe ?? 0,
    power: 0, maxKW: 0, water: 0, hotwater: 0, waste: 0, workdays: 0,
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

const OPERATIONAL_TYPES = new Map([
  ['TYPE_HOSPITAL', 'clinics'],
  ['TYPE_POLICE_STATION', 'police'],
  ['TYPE_COURT_HOUSE', 'courts'],
  ['TYPE_PRISON', 'prisons'],
  ['TYPE_ORPHANAGE', 'orphanages'],
]);

function emptyFacilitySummary() {
  return {
    buildingCount: 0, currentWorkers: 0, configuredWorkers: 0,
    nominalWorkers: 0, configuredCapacity: 0, nominalCapacity: 0, occupants: 0,
    currentVisitors: 0, effectiveServiceCapacity: 0, assignedEvents: 0,
    underConstructionCount: 0,
  };
}

function addFacility(summary, record, raw, occupants, assignedEvents = 0) {
  const serve = raw?.citizenAbleServe ?? 0;
  summary.buildingCount += 1;
  summary.currentWorkers += record.currentWorkers ?? 0;
  summary.configuredWorkers += record.configuredWorkers ?? 0;
  summary.nominalWorkers += raw?.workers ?? 0;
  summary.configuredCapacity += (record.configuredWorkers ?? 0) * serve;
  summary.nominalCapacity += (raw?.workers ?? 0) * serve;
  summary.occupants += occupants ?? 0;
  summary.currentVisitors += record.currentVisitors ?? 0;
  summary.effectiveServiceCapacity += record.effectiveServiceCapacity ?? 0;
  summary.assignedEvents += assignedEvents;
}

function buildOperationalServices(buildings, citizens, rawBuildings, cityStats, events) {
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
    available: true, total: events.length, medicalEmergencies: 0,
    crimes: 0, awaitingPolice: 0, underInvestigation: 0, atCourt: 0,
    mild: 0, medium: 0, serious: 0,
  } : { available: false };
  const scopeLive = scopeId => {
    const current = liveByScope.get(scopeId) ?? {
      medicalEmergencies: 0, crimes: 0, awaitingPolice: 0,
      underInvestigation: 0, atCourt: 0, mild: 0, medium: 0, serious: 0,
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
    const stage = event.state === 0 ? 'awaitingPolice' : event.state === 2 ? 'underInvestigation'
      : event.state === 3 ? 'atCourt' : null;
    if (stage) {
      liveQueue[stage] += 1;
      if (scope) scope[stage] += 1;
    }
    for (const assignment of event.assignments) {
      if (assignment.objectKind !== 0) continue;
      assignedEventsByBuilding.set(assignment.objectIndex,
        (assignedEventsByBuilding.get(assignment.objectIndex) ?? 0) + 1);
      if (event.state === 2) eventPoliceBuildings.add(assignment.objectIndex);
      if (event.state === 3) eventCourtBuildings.add(assignment.objectIndex);
    }
  }
  const crimeByScope = new Map((cityStats ?? []).map(record => [record.scopeId, record]));
  const regional = new Map();
  const republic = {
    courts: emptyFacilitySummary(), prisons: emptyFacilitySummary(),
    orphanages: emptyFacilitySummary(), crime: {
      recordedCrimes: 0, unresolvedCrimes: 0, withoutPolice: 0,
      notInvestigated: 0, withoutCourt: 0, prisonersEscaped: 0,
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
        scopeId: record.scopeId, clinics: emptyFacilitySummary(), police: emptyFacilitySummary(),
      };
      if ((record.constructionProgress ?? 1) < 1) scope[key].underConstructionCount += 1;
      else addFacility(scope[key], record, raw, residentsByBuilding.get(record.index),
        assignedEventsByBuilding.get(record.index));
      regional.set(record.scopeId, scope);
    } else {
      if ((record.constructionProgress ?? 1) < 1) republic[key].underConstructionCount += 1;
      else addFacility(republic[key], record, raw, residentsByBuilding.get(record.index),
        assignedEventsByBuilding.get(record.index));
    }
  }
  for (const crime of crimeByScope.values()) {
    for (const key of Object.keys(republic.crime)) republic.crime[key] += crime[key] ?? 0;
    if (!regional.has(crime.scopeId)) {
      regional.set(crime.scopeId, {
        scopeId: crime.scopeId, clinics: emptyFacilitySummary(), police: emptyFacilitySummary(),
      });
    }
  }
  for (const scopeId of liveByScope.keys()) {
    if (!regional.has(scopeId)) regional.set(scopeId, {
      scopeId, clinics: emptyFacilitySummary(), police: emptyFacilitySummary(),
    });
  }
  return {
    regional: [...regional.values()].map(scope => ({
      ...scope, crime: crimeByScope.get(scope.scopeId) ?? null,
      live: events ? liveByScope.get(scope.scopeId) ?? scopeLive(scope.scopeId) : null,
    })),
    republic: { ...republic, liveQueue },
  };
}

function buildImportedPlanning(sourceName, settlements, buildings, membershipAudit, {
  citizens = null, citizenFileSummary = null, header = null, research = null,
  vehicles = null, vehicleFileSummary = null,
  vehicleLines = null, lineFileSummary = null,
  usedVehicleOffers = null, usedVehicleFileSummary = null,
  vehicleModelCoverage = null, usedVehicleModelCoverage = null,
  sourceStatus = {}, parserWarnings = [], defaultProductivity = 1, workshopCatalog = null,
  cityStats = [], mapClimate = null, events = null,
  roadNetwork = null, railNetwork = null,
  terrainWater = null,
} = {}) {
  const occupiedScopeIds = new Set(buildings.map(building => building.scopeId).filter(Number.isInteger));
  const occupiedSettlements = settlements.filter(settlement => occupiedScopeIds.has(settlement.id));
  const cityRows = new Map(occupiedSettlements.map(s => [s.id, new Map()]));
  const citizenResult = citizens ? aggregateCitizensByScope(citizens, buildings) : null;
  const citizenScopes = citizenResult?.scopes ?? new Map();
  const rawBuildings = [...(DATA.rawBuildings ?? []), ...(DATA.workshopBuildings ?? [])];
  const inferredHousing = citizens ? inferObservedHousing(citizens, buildings, building => {
    const raw = matchSaveBuilding(building.type, rawBuildings, entry => entry.id);
    return !!(raw && importedCityBuilding(raw, building.type)?.inhabitants > 0);
  }) : [];
  const inferredHousingIndices = new Set(inferredHousing.flatMap(group => group.buildingIndices));
  const productionGrouped = groupObservedProduction(
    buildings.filter(record => record.type !== 'temp'), prodBuildings(), rawBuildings);
  const productionRows = productionGrouped.rows.map(row => ({
    ...row,
    productivity: citizenScopes.get(row.scopeId)?.productivity ?? defaultProductivity,
  }));
  const unmatched = new Map();
  const unrepresentedSupport = new Map();
  let cityCount = 0, productionCount = 0, temporaryCount = 0, infrastructureCount = 0;

  for (const record of buildings) {
    if (record.type === 'temp') { temporaryCount += 1; continue; }
    const productionBuilding = matchObservedBuilding(record.type, prodBuildings());
    if (productionBuilding) {
      productionCount += 1;
      continue;
    }

    const raw = matchSaveBuilding(record.type, rawBuildings, b => b.id);
    const cityBuilding = raw ? importedCityBuilding(raw, record.type) : null;
    if (cityBuilding && cityRows.has(record.scopeId)) {
      const rows = cityRows.get(record.scopeId);
      const key = cityBuilding.gameId;
      const current = rows.get(key) ?? {
        type: cityBuilding.type.de, name: cityBuilding.de, count: 0,
        importedBuilding: cityBuilding, sourceGameId: record.type,
        currentWorkers: 0, configuredWorkers: 0, nominalWorkers: 0,
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
    if (raw && !Object.keys(raw.production ?? {}).length && !Object.keys(raw.consumption ?? {}).length) {
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
    const current = unmatched.get(key) ?? { scopeId: record.scopeId, type: record.type, count: 0 };
    current.count += 1;
    unmatched.set(key, current);
  }

  // Imported service calculations honor the save's per-building worker limit.
  // Rows are grouped, so store the mean per instance before evaluateCity applies count.
  for (const rows of cityRows.values()) for (const row of rows.values()) {
    const serve = row.importedBuilding.citizenAbleServe ?? 0;
    if (!(serve > 0) || !(row.count > 0)) continue;
    const configuredPerBuilding = row.configuredWorkers / row.count;
    row.importedBuilding = {
      ...row.importedBuilding,
      workers: configuredPerBuilding,
      visitors: configuredPerBuilding * serve,
    };
  }

  for (const group of inferredHousing) {
    if (!cityRows.has(group.scopeId)) continue;
    const importedBuilding = {
      de: `${group.type} — observed occupancy`, en: `${group.type} — observed occupancy`,
      type: { de: 'Wohngebäude', en: 'Housing' }, kind: 'Save', gameId: group.type,
      sourceType: group.type, quality: null, workers: 0, special: 0, visitors: 0,
      inhabitants: group.residents, power: 0, maxKW: 0, water: 0, hotwater: 0,
      waste: 0, workdays: 0, gravel: 0, bricks: 0, steel: 0, concrete: 0,
      asphalt: 0, boards: 0, panels: 0, ecomponents: 0, mcomponents: 0,
      recommendedFor: 0, observedOccupancy: true, observedBuildingCount: group.buildingCount,
      maxObservedOccupancy: group.maxObservedOccupancy,
    };
    cityRows.get(group.scopeId).set(`observed:${group.type}`, {
      type: importedBuilding.type.de, name: importedBuilding.de, count: 1,
      importedBuilding, sourceGameId: group.type,
    });
    cityCount += group.buildingCount;
  }

  const unresolvedByScope = new Map();
  for (const item of unmatched.values()) {
    if (!Number.isInteger(item.scopeId)) continue;
    unresolvedByScope.set(item.scopeId, (unresolvedByScope.get(item.scopeId) ?? 0) + item.count);
  }
  const productionScopeIds = new Set(productionRows.map(row => row.scopeId).filter(Number.isInteger));
  const cities = occupiedSettlements.filter(settlement =>
    cityRows.get(settlement.id).size || citizenScopes.has(settlement.id)).map(settlement => ({
    ...defaultCity(),
    name: settlement.name || settlement.extraName || `${t('city')} ${settlement.id + 1}`,
    scopeId: settlement.id,
    source: 'save',
    productivity: citizenScopes.get(settlement.id)?.productivity ?? defaultProductivity,
    heatingEnabled: (header?.settings?.seasonsEnabled ?? true) && (mapClimate?.heatingRequired ?? true),
    heatingClimate: mapClimate?.id ?? null,
    observed: citizenScopes.get(settlement.id) ?? null,
    unresolvedBuildingCount: unresolvedByScope.get(settlement.id) ?? 0,
    sourcePosition: { x: settlement.x, y: settlement.y, z: settlement.z },
    rows: [...cityRows.get(settlement.id).values()],
  }));
  const warnings = [];
  if (membershipAudit.duplicateMembers.length) warnings.push(
    `${membershipAudit.duplicateMembers.length} duplicate member reference(s); primary building ownership was used.`);
  if (membershipAudit.invalidMemberRefs.length) warnings.push(`${membershipAudit.invalidMemberRefs.length} invalid member reference(s).`);
  if (membershipAudit.fallbackAssignments) warnings.push(`${membershipAudit.fallbackAssignments} building assignment(s) used the namepoint fallback.`);
  if (membershipAudit.unassigned) warnings.push(`${membershipAudit.unassigned} building(s) have no settlement assignment.`);
  for (const warning of parserWarnings) warnings.push(`${warning.file}: ${warning.message}`);
  const researchComplete = research?.filter(item => item.progress >= 1).length ?? 0;
  const researchPartial = research?.filter(item => item.progress > 0 && item.progress < 1).length ?? 0;
  const operationalServices = buildOperationalServices(buildings, citizens, rawBuildings, cityStats, events);
  const distributionOperations = summarizeDistributionOffices(buildings, vehicles ?? []);
  const lineOperations = vehicleLines
    ? summarizeVehicleLines(vehicleLines, vehicles ?? [], buildings) : null;
  const criminalityOutliers = citizens
    ? summarizeCriminalityOutliers(citizens, buildings) : null;
  const inventoryBuildings = buildings.filter(building =>
    building.storages?.some(storage => storage.resources?.length));
  const inventoryStorageCount = inventoryBuildings.reduce((sum, building) =>
    sum + building.storages.filter(storage => storage.resources?.length).length, 0);
  const throughputBuildingCount = productionRows.reduce((sum, row) =>
    sum + (row.firstOutputThroughput?.instanceCount ?? 0), 0);

  return {
    cities,
    productionRows,
    metadata: {
      version: 5, sourceName, importedAt: new Date().toISOString(), header, sourceStatus,
      mapClimate,
      roadNetwork,
      railNetwork,
      terrainWater,
      settlementCount: occupiedSettlements.length, sourceSettlementCount: settlements.length,
      emptySettlementCount: settlements.length - occupiedSettlements.length, buildingCount: buildings.length,
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
      vehicleModelCoverage,
      usedVehicleOffers,
      usedVehicleFileSummary,
      usedVehicleModelCoverage,
      observedBuildings: compactObservedBuildings(buildings),
      observedProductionRows: cloneStateValue(productionRows),
      research: research ?? null,
      cityStats,
      operationalServices,
      researchComplete, researchPartial,
      inventoryBuildingCount: inventoryBuildings.length, inventoryStorageCount,
      throughputBuildingCount,
      cityScopeCount: cities.length, productionScopeCount: productionScopeIds.size,
      scopes: occupiedSettlements.map(settlement => ({
        id: settlement.id,
        name: settlement.name || settlement.extraName || `${t('area')} ${settlement.id + 1}`,
        position: { x: settlement.x, y: settlement.y, z: settlement.z },
        city: cityRows.get(settlement.id).size > 0 || citizenScopes.has(settlement.id),
        production: productionScopeIds.has(settlement.id),
        citizens: citizenScopes.get(settlement.id) ?? null,
      })),
      cityBuildingCount: cityCount, productionBuildingCount: productionCount,
      infrastructureCount, workshopCatalog,
      inferredHousingBuildingCount: inferredHousing.reduce((sum, group) => sum + group.buildingCount, 0),
      inferredHousingResidents: inferredHousing.reduce((sum, group) => sum + group.residents, 0),
      temporaryCount, unmatchedCount: [...unmatched.values()].reduce((sum, item) => sum + item.count, 0),
      unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
      unrepresentedSupportCount: [...unrepresentedSupport.values()]
        .reduce((sum, item) => sum + item.count, 0),
      unrepresentedSupport: [...unrepresentedSupport.values()]
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
      warnings,
    },
  };
}

function uniqueSnapshotName(base) {
  const names = new Set(namedSnapshotNames);
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base} (${suffix})`)) suffix += 1;
  return `${base} (${suffix})`;
}

function parseSaveInWorker(payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./savegame_worker.js?v=24', import.meta.url), { type: 'module' });
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'Save parser worker failed'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        presentImportStatus(`${t('importWorking')} · ${data.file} (${data.done}/${data.total})`);
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

function parseMapLayersInWorker(files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./savegame_map_worker.js?v=2', import.meta.url), { type: 'module' });
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'Map parser worker failed'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        const phase = t(data.phase === 'reading' ? 'importReadingMapFile'
          : data.phase === 'parsing' ? 'importParsingMapFile' : 'importMapFileReady');
        presentImportStatus(phase.replace('{file}', data.file));
      } else if (data.type === 'complete') {
        worker.terminate();
        resolve(data);
      }
    };
    worker.postMessage(files);
  });
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

function renderImportActivity() {
  if (!state.importBusy) return null;
  return el('div', {
    class: state.importStatusError ? 'import-activity neg' : 'import-activity',
    role: 'status', 'aria-live': 'polite', 'data-import-status': '',
  }, el('span', { class: 'import-spinner', 'aria-hidden': 'true' }),
  el('span', { 'data-import-status-text': '' }, state.importStatus));
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
    el('label', { class: 'importpicker' }, '🧩 ', t('chooseWorkshopFolder'),
      el('input', { type: 'file', class: 'hidden', webkitdirectory: '', multiple: '',
        onchange: event => event.target.files.length && handleLocalWorkshopDirectory(event.target.files) })),
    state.localWorkshopStatus ? el('p', { class: 'pos' }, state.localWorkshopStatus) : null);
}

async function handleSaveDirectory(fileList) {
  const files = [...fileList];
  const byName = new Map(files.map(file => [file.name.toLowerCase(), file]));
  const namepoints = byName.get('namepoints.bin');
  const buildingsFile = byName.get('buildings_game.bin');
  const statsFile = byName.get('stats.ini');
  const workersFile = byName.get('workers.bin');
  const vehiclesFile = byName.get('vehicles.bin');
  const usedVehiclesFile = byName.get('usedveh.bin');
  const linesFile = byName.get('lines.bin');
  const roadFile = byName.get('road.bin');
  const railFile = byName.get('rail.bin');
  const heightmapFile = byName.get('heightmap.dds');
  const pollutionFile = byName.get('pollution.bin');
  const headerFile = byName.get('header.bin');
  const researchFile = byName.get('research.bin');
  const eventsFile = byName.get('events.bin');
  const materialFile = byName.get('material.mtl');
  if (!namepoints || !buildingsFile) {
    state.importStatus = t('importMissingFiles');
    state.importStatusError = true;
    return update();
  }

  state.importStatus = t('importWorking');
  state.importStatusError = false;
  state.importBusy = true;
  update();
  await new Promise(resolve => setTimeout(resolve, 0));

  try {
    presentImportStatus(t('importReadingFiles'));
    const readOptional = file => file ? file.arrayBuffer() : Promise.resolve(null);
    const [namepointBuffer, buildingBuffer, workerBuffer, vehicleBuffer, usedVehicleBuffer, lineBuffer,
      headerBuffer, researchBuffer, eventsBuffer, statsText, materialText] = await Promise.all([
      namepoints.arrayBuffer(), buildingsFile.arrayBuffer(), readOptional(workersFile),
      readOptional(vehiclesFile), readOptional(usedVehiclesFile),
      readOptional(linesFile), readOptional(headerFile), readOptional(researchFile), readOptional(eventsFile), statsFile ? statsFile.text() : '',
      materialFile ? materialFile.text() : '',
    ]);
    presentImportStatus(t('importParsingCore'));
    const parsed = await parseSaveInWorker({
      namepoints: namepointBuffer, buildings: buildingBuffer, workers: workerBuffer,
      vehicles: vehicleBuffer, usedVehicles: usedVehicleBuffer,
      lines: lineBuffer, road: null, rail: null, heightmap: null, pollution: null,
      header: headerBuffer, research: researchBuffer, events: eventsBuffer, stats: statsText, material: materialText,
    });
    const relative = namepoints.webkitRelativePath || buildingsFile.webkitRelativePath || '';
    const sourceName = parsed.header?.title || relative.split('/')[0]
      || namepoints.name.replace(/\.bin$/i, '') || 'W&R save';
    const statsRecords = parsed.statsRecords ?? [];
    const productivity = latestProductivity(statsRecords, 1);
    presentImportStatus(t('importResolvingWorkshop'));
    const workshopCatalog = await loadWorkshopCatalogForSave(parsed.buildings, parsed.vehicles ?? []);
    const ownedFleet = parsed.vehicles
      ? resolveVehicleModels(parsed.vehicles, { game: DATA.rawVehicles, workshop: DATA.workshopVehicles }) : null;
    const usedMarket = parsed.usedVehicleOffers
      ? resolveVehicleModels(parsed.usedVehicleOffers, { game: DATA.rawVehicles, workshop: DATA.workshopVehicles }) : null;
    presentImportStatus(t('importBuildingDashboard'));
    const imported = buildImportedPlanning(sourceName, parsed.settlements, parsed.buildings,
      parsed.membershipAudit, {
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
        workshopCatalog,
        cityStats: parsed.cityStats ?? [],
        mapClimate: parsed.mapClimate,
        roadNetwork: parsed.roadNetwork,
        railNetwork: parsed.railNetwork,
        terrainWater: parsed.terrainWater,
      });
    imported.metadata.statsRecordCount = statsRecords.length;
    imported.metadata.latestProductivity = productivity;
    imported.metadata.blueprintOwned = parsed.blueprintOwned;

    presentImportStatus(t('importSavingSnapshot'));
    const backupName = t('beforeLatestImport');
    const backupResult = await saveNamedState(backupName);
    if (!backupResult.ok) throw backupResult.error;

    const next = createInitialState();
    for (const key of ['lang', 'currency', 'priceSource', 'decade', 'overrides', 'calcOpts', 'tuning']) {
      next[key] = cloneStateValue(state[key]);
    }
    next.dataset = 'game';
    if (statsRecords.length) {
      next.priceSource = 'stats';
      next.overrides = {};
    }
    next.plan.settings = { ...cloneStateValue(state.plan.settings), currency: state.currency };
    next.plan.settings.productivity = productivity;
    if (typeof parsed.header?.settings?.seasonsEnabled === 'boolean') {
      next.plan.settings.seasons = parsed.header.settings.seasonsEnabled;
    }
    next.plan.rows = imported.productionRows;
    next.cities = imported.cities;
    next.saveImport = imported.metadata;
    next.tab = 'republic';

    const importName = uniqueSnapshotName(sourceName);
    replaceSharedState(next);
    mapFocusBuildingIndex = null;
    mapFocusScopeId = null;
    if (statsRecords.length) {
      state.statsRecords = statsRecords;
      state.statsName = statsFile.name;
      state.recordIndex = statsRecords.length - 1;
    }
    state.saveSlotName = importName;
    const hasDeferredMap = !!(roadFile || railFile || heightmapFile || pollutionFile);
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
      try {
        const mapResult = await parseMapLayersInWorker({
          road: roadFile ?? null,
          rail: railFile ?? null,
          heightmap: heightmapFile ?? null,
          pollution: pollutionFile ?? null,
        });
        // A second import or snapshot load may have replaced the visible state
        // while the optional map files were parsing. Never attach them there.
        if (state.saveSlotName !== importName || state.saveImport?.sourceName !== sourceName) return;
        Object.assign(state.saveImport, mapResult.parsed);
        state.saveImport.sourceStatus = {
          ...(state.saveImport.sourceStatus ?? {}), ...mapResult.sourceStatus,
        };
        if (mapResult.warnings.length) {
          state.saveImport.warnings = [
            ...(state.saveImport.warnings ?? []),
            ...mapResult.warnings.map(warning => `${warning.file}: ${warning.message}`),
          ];
        }
        state.importStatus = mapResult.warnings.length ? t('importCompleteMapWarnings') : t('importComplete');
        state.importBusy = false;
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
    state.importStatus = `${t('importFailed')}: ${error.message}`;
    state.importStatusError = true;
    state.importBusy = false;
    update();
  }
}

function renderHome() {
  if (!IS_BETA) return el('section');
  const picker = el('label', { class: 'start-card primary-start importpicker' },
    el('span', { class: 'start-icon' }, '📂'),
    el('strong', {}, t('openRepublicSave')),
    el('span', { class: 'hint' }, t('openRepublicSaveHint')),
    el('input', { type: 'file', class: 'hidden', webkitdirectory: '', multiple: '',
      onchange: event => event.target.files.length && handleSaveDirectory(event.target.files) }));
  const startManual = tab => {
    if (state.saveImport && !confirm(t('startManualConfirm'))) return;
    const preserved = Object.fromEntries(['lang', 'currency', 'calcOpts', 'tuning']
      .map(key => [key, cloneStateValue(state[key])]));
    replaceSharedState({ ...createInitialState(), ...preserved, tab });
    state.statsRecords = null;
    state.statsName = null;
    update();
  };
  const manual = el('div', { class: 'start-card' },
    el('span', { class: 'start-icon' }, '✏️'),
    el('strong', {}, t('startManualPlan')),
    el('span', { class: 'hint' }, t('startManualPlanHint')),
    el('div', { class: 'start-actions' },
      el('button', { onclick: () => startManual('city') }, t('tabCity')),
      el('button', { onclick: () => startManual('production') }, t('tabProduction'))));
  const current = state.saveImport ? el('div', { class: 'start-card current-republic' },
    el('span', { class: 'start-icon' }, '🏛️'),
    el('strong', {}, state.saveImport.header?.title || state.saveImport.sourceName),
    el('span', { class: 'hint' }, `${fmt(state.saveImport.citizenCount ?? 0, 0)} ${t('importedCitizens')} · `
      + `${fmt(state.saveImport.buildingCount ?? 0, 0)} ${t('importedBuildings')}`),
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
    }, '📁 ', name)))) : null;
  return el('section', { class: 'start-page' },
    el('div', { class: 'start-hero' }, el('h2', {}, t('startTitle')), el('p', {}, t('startHint'))),
    state.importStatus ? el('p', { class: state.importStatusError ? 'neg' : 'pos' }, state.importStatus) : null,
    el('div', { class: 'start-grid' }, current, picker, manual), renderLocalWorkshopPicker(), saved);
}

function renderSaveImport() {
  if (!IS_BETA) return el('section');
  const info = state.saveImport;
  const areaNames = new Map(plannerScopes().map(scope => [scope.id, scope.name]));
  const picker = el('label', { class: 'importpicker' },
    '📂 ', t('chooseSaveFolder'),
    el('input', { type: 'file', class: 'hidden', webkitdirectory: '', multiple: '',
      onchange: event => event.target.files.length && handleSaveDirectory(event.target.files) }));
  const status = state.importStatus
    ? el('p', { class: state.importStatusError ? 'neg' : 'pos' }, state.importStatus) : null;
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
    road: 'road.bin', rail: 'rail.bin',
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
        info.latestProductivity ? kv(t('productivity'), fmt(info.latestProductivity * 100, 4) + ' %') : null,
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
    info.unmatched?.length ? el('details', { class: 'tablewrap' },
      el('summary', {}, `${t('unmatchedTypes')} (${fmt(info.unmatched.length, 0)})`),
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, t('area')), el('th', {}, t('sourceGameId')), el('th', {}, t('count')))),
        el('tbody', {}, ...info.unmatched.map(item => el('tr', {},
          el('td', {}, areaNames.get(item.scopeId) ?? t('unassigned')),
          el('td', {}, item.type), el('td', { class: 'r' }, fmt(item.count, 0))))))) : null) : null;

  return el('section', {}, el('h2', {}, t('saveImportTitle')), el('p', { class: 'hint' }, t('saveImportHint')),
    renderLocalWorkshopPicker(), picker, status, liveStats, audit);
}

// ---------------------------------------------------------------- city tab
function renderCity() {
  if (!state.cities.length) state.cities.push(defaultCity());
  if (state.activeCity >= state.cities.length) state.activeCity = 0;
  const city = state.cities[state.activeCity];
  const eco = economy();

  const workspaceBar = el('div', { class: 'workspace-bar' },
    returnToRepublicButton(),
    el('label', { class: 'workspace-context' }, el('span', {}, t('cityArea')), selectInput(
      state.cities.map((item, index) => [String(index), item.name || `${t('city')} ${index + 1}`]),
      String(state.activeCity), value => { state.activeCity = Number(value); })),
    el('div', { class: 'workspace-actions' },
      el('button', { onclick: () => { state.cities.push(defaultCity()); state.activeCity = state.cities.length - 1; update(); } }, t('addCity')),
    state.cities.length > 1 ? el('button', {
      class: 'danger',
      onclick: () => { state.cities.splice(state.activeCity, 1); state.activeCity = 0; update(); },
    }, t('removeCity')) : null));

  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('cityName') + ' ', el('input', {
      type: 'text', value: city.name, onchange: e => { city.name = e.target.value; update(); } })),
    el('label', {}, t('productivity') + ' ', pctInput(city.productivity, v => city.productivity = v)),
    el('label', {}, t('cable') + ' ',
      selectInput(CABLES.map(c => [c.de, c[state.lang]]), city.cable, v => city.cable = v)),
    el('label', {}, t('heatExchangers') + ' ',
      selectInput([['small', t('exchangerSmall')], ['large', t('exchangerLarge')]], city.exchanger, v => city.exchanger = v)),
    el('label', {}, t('waterDivisor') + ' ', numInput(city.waterDivisor, v => city.waterDivisor = v || 3, { min: 1, step: 1 })),
    el('label', {}, t('vanillaOnly') + ' ', el('input', {
      type: 'checkbox', checked: state.vanillaOnly, onchange: e => { state.vanillaOnly = e.target.checked; update(); } })),
    el('button', { onclick: () => { state.cityDetails = !state.cityDetails; update(); } },
      t(state.cityDetails ? 'hideUtilityDetails' : 'showUtilityDetails')));
  const assumptions = el('details', { class: 'planner-assumptions secondary-section' },
    el('summary', {}, t('planAssumptions')), settings);
  const observedCard = city.observed ? el('div', { class: 'totalsbox observed-card' },
    el('h3', {}, t('observedAtSave'), el('span', { class: 'evidence-badge derived' }, t('derived'))),
    kv(t('population'), fmt(city.observed.residents, 0)),
    kv(t('adults'), fmt(city.observed.adults, 0)),
    kv(t('highEducation'), fmt(city.observed.highEducation, 0)),
    kv(t('productivity'), fmt(city.observed.productivity * 100, 2) + ' %'),
    kv(t('happiness'), fmt(city.observed.happiness * 100, 1) + ' %'),
    kv(t('food'), fmt(city.observed.food * 100, 1) + ' %'),
    kv(t('health'), fmt(city.observed.health * 100, 1) + ' %'),
    kv(t('loyalty'), fmt(city.observed.loyalty * 100, 1) + ' %'),
    Number.isFinite(city.observed.criminality)
      ? kv(t('criminality'), fmt(city.observed.criminality * 100, 2) + ' %') : null) : null;
  const cityOperations = state.saveImport?.operationalServices?.regional
    ?.find(scope => scope.scopeId === city.scopeId);
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
    return `${building[state.lang]} — ${details.join(' · ')}`;
  };

  const rowsResolved = city.rows.map(r => ({ ...r, building: resolveRow(r) }));
  const res = evaluateCity({ ...city, rows: rowsResolved }, eco);

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
        selectedType ?? t('none'), v => { row.type = v; row.name = null; delete row.buildingIndex; });
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
        : bSel;
      return el('tr', {},
        el('td', {}, typeCell), el('td', {}, buildingCell),
        el('td', {}, numInput(row.count, v => row.count = v, { min: 0, step: 1 })),
        el('td', { class: 'r' }, b ? fmt(b.inhabitants * n, 0) : '—'),
        el('td', { class: 'r' }, b?.inhabitants > 0 && b.quality != null ? fmt(b.quality * 100, 0) + ' %' : '—'),
        el('td', { class: 'r' }, b ? fmt(b.workers * n, 0) : '—'),
        workersNeededCell(rowWorkersNeeded),
        ...(state.cityDetails ? [
          el('td', { class: 'r' }, b ? fmt(b.maxKW * n, 0) : '—'),
          el('td', { class: 'r' }, b ? fmt(b.water * n, 2) : '—'),
          el('td', { class: 'r' }, b ? fmt(b.hotwater * n, 2) : '—'),
          el('td', { class: 'r' }, b ? fmt(b.waste * n, 1) : '—'),
          el('td', { class: 'r' }, b ? fmt(eco.buildCost(b, state.currency) * n, 0) : '—'),
        ] : []),
        el('td', {}, el('button', { class: 'danger', onclick: () => { city.rows.splice(idx, 1); update(); } }, '✕')));
    })));

  const addBtn = el('button', {
    onclick: () => { city.rows.push({ type: types[0]?.[0], name: null, count: 1 }); update(); },
  }, t('addRow'));

  const services = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('services')), el('th', {}, t('provided')), el('th', {}, t('utilization')),
      el('th', {}, t('workersNeeded')))),
    el('tbody', {},
      res.services.map(s => el('tr', {},
        el('td', {}, t(s.id)),
        el('td', { class: 'r' }, fmt(s.provided, 0)),
        utilizationCell(s.utilization),
        workersNeededCell(s.workersNeeded))),
      el('tr', {},
        el('td', {}, t('secretPolice') + ` (${fmt(res.residentialBuildings, 0)} ${t('residential')})`),
        el('td', { class: 'r' }, fmt(res.secretPolice.provided, 1)),
        utilizationCell(res.secretPolice.utilization),
        workersNeededCell(res.secretPolice.workersNeeded)),
      el('tr', {},
        el('td', {}, t('heating')),
        el('td', { class: 'r' }, fmt(res.heating.provided, 0)),
        utilizationCell(res.heating.utilization),
        workersNeededCell(res.heating.workersNeeded))));

  const summary = el('div', { class: 'totalsbox' },
    el('h3', {}, city.name || t('city')),
    kv(t('population'), fmt(res.population, 0)),
    kv(t('housingQuality'), res.avgHousingQuality != null ? fmt(res.avgHousingQuality * 100, 0) + ' %' : '—'),
    kv(t('workers'), fmt(res.workersNeeded, 0)),
    kv(t('workerSurplus'), fmt(res.workerSurplus, 1), res.workerSurplus < 0 ? 'neg' : 'pos'),
    kv(t('maxWatt'), fmt(res.maxKW, 0)),
    kv(t('transformers'), fmt(Math.ceil(res.transformers), 0) + ` (${fmt(res.transformers, 2)})`),
    kv(t('hotwater'), fmt(res.hotwater, 1)),
    kv(t('heatExchangers'), fmt(Math.ceil(res.heatExchangers), 0) + ` (${fmt(res.heatExchangers, 2)})`),
    kv(t('waterUse'), fmt(res.water, 1)),
    kv(t('waterConnections'), fmt(Math.ceil(res.waterConnections), 0)),
    kv(t('wasteOut'), fmt(res.waste, 1)),
    kv(`${t('buildCost')} ₽`, fmt(res.buildCostRUB, 0)),
    kv(`${t('buildCost')} $`, fmt(res.buildCostUSD, 0)),
    kv(t('workday'), fmt(res.workdays, 0)));

  const mats = el('div', { class: 'totalsbox' },
    el('h3', {}, t('materials')),
    ...Object.entries(res.materials).map(([m, amt]) => {
      const keyMap = { panels: 'prefabpanels' };
      const r = DATA.resources.find(x => x.key === (keyMap[m] ?? m));
      return kv(r ? rname(r) : m, fmt(amt, 1));
    }));

  return el('section', {}, workspaceBar,
    (observedCard || regionalOperationsCard || coverageCard)
      ? el('div', { class: 'columns operational-summary' }, observedCard, regionalOperationsCard, coverageCard) : null,
    assumptions,
    city.rows.length ? el('div', { class: 'tablewrap' }, tbl) : el('p', { class: 'empty-state' }, t('emptyCityPlan')),
    addBtn,
    el('div', { class: 'columns' },
      el('div', {}, el('h3', {}, t('services')), services),
      summary, mats));
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

function renderRepublicLineChart(title, series, evidence = 'stats.ini') {
  const box = el('div', { class: 'history republic-chart' },
    el('h3', {}, title, el('span', { class: 'evidence-badge exact' }, evidence)));
  const nonEmpty = series.filter(item => item.points.length);
  if (!nonEmpty.length) return el('div', { class: 'history republic-chart' },
    el('h3', {}, title), el('p', { class: 'hint' }, t('unavailable')));
  const points = nonEmpty.flatMap(item => item.points);
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(0, ...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const W = 640, H = 190, P = 32;
  const x = value => P + (W - 2 * P) * ((value - minX) / ((maxX - minX) || 1));
  const y = value => H - P - (H - 2 * P) * ((value - minY) / ((maxY - minY) || 1));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  for (const item of nonEmpty) {
    const sampled = downsampleMinMax(item.points, 160);
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', sampled.map(point => `${x(point.x)},${y(point.y)}`).join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', item.color);
    polyline.setAttribute('stroke-width', '1.8');
    polyline.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(polyline);
    appendChartPointMarkers(svg, item, sampled, x, y, ns);
  }
  const first = points.reduce((a, b) => a.x <= b.x ? a : b);
  const last = points.reduce((a, b) => a.x >= b.x ? a : b);
  appendChartAxisLabel(svg, fmt(maxY, 2), 3, 12, ns);
  appendChartAxisLabel(svg, fmt(minY, 2), 3, H - P + 3, ns);
  appendChartAxisLabel(svg, first.label, P, H - 5, ns);
  appendChartAxisLabel(svg, last.label, W - P, H - 5, ns, 'end');
  box.append(svg, el('div', { class: 'legend' }, ...nonEmpty.map(item =>
    el('span', {}, el('i', { style: `background:${item.color}` }), item.label))));
  return box;
}

function totalMapValues(map) {
  return Object.values(map ?? {}).reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
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
      || String(marker.dataset.buildingType ?? '').toLowerCase().includes(filter);
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
      buildings: layers.buildings, selected: layers.buildings,
      construction: layers.construction, borders: layers.borders,
      scopes: layers.scopes, outliers: layers.outliers,
    };
    for (const item of legend.querySelectorAll('[data-map-legend]')) {
      item.style.display = visibility[item.dataset.mapLegend] ? '' : 'none';
    }
  }
}

function renderSchematicRepublicMap(buildings, scopes, outliers, { standalone = false } = {}) {
  const model = buildSchematicMap(buildings, scopes, outliers, {
    focusBuildingIndex: mapFocusBuildingIndex,
    roadNetwork: state.saveImport?.roadNetwork,
    railNetwork: state.saveImport?.railNetwork,
    terrainWater: state.saveImport?.terrainWater,
    pollutionLayer: state.saveImport?.pollutionLayer,
  });
  if (!model) return null;
  const layers = standalone ? {
    water: true, pollution: true, roads: true, rails: true, buildings: true,
    construction: true, scopes: true, borders: true, outliers: true,
    ...(state.mapLayers ?? {}),
  } : {
    water: true, pollution: false, roads: true, rails: true, buildings: true,
    construction: true, scopes: true, borders: true, outliers: true,
  };
  const buildingFilter = standalone ? String(state.mapBuildingFilter ?? '').trim().toLowerCase() : '';
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
  const scopeBuildings = Number.isInteger(mapFocusScopeId)
    ? model.buildings.filter(building => building.scopeId === mapFocusScopeId) : [];
  let scopeZoomScale = 1;
  const scopeViewBox = scopeBuildings.length ? (() => {
    const xs = scopeBuildings.map(building => building.mapX);
    const ys = scopeBuildings.map(building => building.mapY);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const margin = Math.max(10, Math.max(spanX, spanY) * 0.12);
    let width = Math.max(80, spanX + margin * 2);
    let height = Math.max(60, spanY + margin * 2);
    const aspect = model.width / model.height;
    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;
    width = Math.min(model.width, width);
    height = Math.min(model.height, height);
    scopeZoomScale = width / model.width;
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const x = Math.max(0, Math.min(model.width - width, centerX - width / 2));
    const y = Math.max(0, Math.min(model.height - height, centerY - height / 2));
    return `${x} ${y} ${width} ${height}`;
  })() : null;
  const mapPointScale = standalone && standaloneMapViewBox
    ? standaloneMapViewBox.width / model.width
    : focusedBuilding ? zoomWidth / model.width : scopeZoomScale;
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
  const activeStandaloneViewBox = standaloneMapViewBox
    ? clampViewBox(standaloneMapViewBox) : fullViewBox;
  const svg = node('svg', {
    viewBox: standalone
      ? `${activeStandaloneViewBox.x} ${activeStandaloneViewBox.y} ${activeStandaloneViewBox.width} ${activeStandaloneViewBox.height}`
      : focusedBuilding
      ? `${zoomX} ${zoomY} ${zoomWidth} ${zoomHeight}`
      : scopeViewBox ?? `0 0 ${model.width} ${model.height}`,
    class: `republic-map${standalone ? ' standalone' : ''}`, role: 'img', 'aria-label': t('schematicRepublicMap'),
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
    svg.addEventListener('wheel', event => {
      event.preventDefault();
      const current = currentCamera();
      const rect = mapRect();
      const anchorX = current.x + (event.clientX - rect.left) / rect.width * current.width;
      const anchorY = current.y + (event.clientY - rect.top) / rect.height * current.height;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const factor = Math.max(0.84, Math.min(1.19, Math.exp(delta * 0.0015)));
      const width = current.width * factor;
      const height = width * model.height / model.width;
      scheduleCamera({
        x: anchorX - (anchorX - current.x) * width / current.width,
        y: anchorY - (anchorY - current.y) * height / current.height,
        width, height,
      });
    }, { passive: false });
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const current = currentCamera();
      drag = { x: event.clientX, y: event.clientY, view: { ...current }, rect: mapRect() };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
      if (!drag) return;
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
    const packed = Uint8Array.from(atob(water.packed), character => character.charCodeAt(0));
    const canvas = document.createElement('canvas');
    canvas.width = water.width;
    canvas.height = water.height;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(water.width, water.height);
    const alpha = [0, 65, 115, 165];
    for (let sourceY = 0; sourceY < water.height; sourceY += 1) {
      for (let x = 0; x < water.width; x += 1) {
        const sourceIndex = sourceY * water.width + x;
        const level = (packed[sourceIndex >> 2] >> ((sourceIndex & 3) * 2)) & 3;
        const targetIndex = ((water.height - 1 - sourceY) * water.width + x) * 4;
        pixels.data[targetIndex] = 44;
        pixels.data[targetIndex + 1] = 133;
        pixels.data[targetIndex + 2] = 190;
        pixels.data[targetIndex + 3] = alpha[level];
      }
    }
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
  const normalLayer = node('g', { class: 'map-buildings' });
  const selectedLayer = node('g', { class: 'map-selected' });
  const borderLayer = node('g', { class: 'map-borders' });
  const outlierLayer = node('g', { class: 'map-outliers' });
  for (const building of model.buildings) {
    if (isExternalAirLinkType(building.type)) continue;
    const borderPost = isBorderPostType(building.type);
    const selected = building.scopeId === state.republicScope;
    const outlier = building.criminalityOutlier;
    const underConstruction = (building.constructionProgress ?? 1) < 1;
    const circle = node('circle', {
      cx: building.mapX.toFixed(2), cy: building.mapY.toFixed(2),
      'data-building-type': building.type ?? '',
      'data-map-kind': borderPost ? 'border' : underConstruction ? 'construction' : 'building',
      'data-map-outlier': outlier ? 'true' : 'false',
      'data-map-selected': selected ? 'true' : 'false',
      r: (building.focused ? 7.5 : borderPost ? 4.5 : outlier ? 5.5 : selected ? 2.4 : 1.35) * mapPointScale,
      ...((building.focused || underConstruction || borderPost) ? {
        class: [building.focused ? 'focused' : '', underConstruction ? 'under-construction' : '', borderPost ? 'border-post' : '']
          .filter(Boolean).join(' '),
      } : {}),
    });
    const title = node('title');
    const buildingTitle = outlier
      ? `${t('citizen')} #${outlier.citizenIndex} · ${fmt(outlier.criminality * 100, 2)} % · `
        + `${building.name || building.type || t('building')} #${building.index} · ${scopeNames.get(building.scopeId) ?? t('unassigned')}`
      : `${building.name || building.type || t('building')} #${building.index} · ${scopeNames.get(building.scopeId) ?? t('unassigned')}`;
    title.textContent = buildingTitle + (underConstruction
      ? ` · ${t('underConstruction')} ${fmt(building.constructionProgress * 100, 0)} %` : '');
    circle.append(title);
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
  svg.append(waterLayer, pollutionLayer, railLayer, roadLayer);
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
  const borderPosts = model.buildings.filter(building => isBorderPostType(building.type));
  const legend = el('div', { class: 'map-legend' },
    model.water ? el('span', { 'data-map-legend': 'water' }, el('i', { class: 'water' }), t('waterFootprint')) : null,
    model.pollution ? el('span', {
      'data-map-legend': 'pollution',
      title: `${fmt(model.pollution.airNonzero, 0)} ${t('pollutedCells')}`,
    }, el('i', { class: 'pollution' }), t('airPollution')) : null,
    model.roads.length ? el('span', { 'data-map-legend': 'roads' }, el('i', { class: 'road' }), t('roads')) : null,
    model.rails.length ? el('span', { 'data-map-legend': 'rails' }, el('i', { class: 'rail' }), t('rails')) : null,
    el('span', { 'data-map-legend': 'buildings' }, el('i', { class: 'building' }), t('buildings')),
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
    const buildingTypes = [...new Set(model.buildings
      .filter(building => !isBorderPostType(building.type) && !isExternalAirLinkType(building.type))
      .map(building => building.type).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
      el('div', { class: 'map-toolbar' },
        el('fieldset', {}, el('legend', {}, t('mapLayers')),
          layerToggle('water', t('waterFootprint'), !!model.water),
          layerToggle('pollution', t('airPollution'), !!model.pollution),
          layerToggle('roads', t('roads'), !!model.roads.length),
          layerToggle('rails', t('rails'), !!model.rails.length),
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
            ...buildingTypes.map(type => el('option', { value: type })))),
        el('div', { class: 'map-zoom-controls' },
          el('button', { title: t('mapZoomIn'), onclick: () => zoom(0.7) }, '+'),
          el('button', { title: t('mapZoomOut'), onclick: () => zoom(1.4) }, '−'),
          el('button', {
            onclick: () => { standaloneMapViewBox = null; applyStandaloneViewBox(fullViewBox); },
          }, t('mapReset')))),
      legend, svg);
  }
  return el('details', {
    class: 'secondary-section map-section',
    ...(focusedBuilding || scopeViewBox ? { open: '' } : {}),
  },
    el('summary', {}, `${t('schematicRepublicMap')} (${fmt(model.buildings.length, 0)})`),
    el('p', { class: 'hint' }, t(mapHintKey)),
    legend,
    focusedBuilding || scopeViewBox ? el('button', {
      onclick: () => {
        mapFocusBuildingIndex = null;
        mapFocusScopeId = null;
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
function renderRepublic() {
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

  const cityByScope = new Map(state.cities.filter(city => Number.isInteger(city.scopeId)).map(city => [city.scopeId, city]));
  const overviewCities = Array.isArray(state.saveImport?.scopes)
    ? plannerScopes().filter(scope => scope.city || scope.production).map(scope => cityByScope.get(scope.id) ?? {
      ...defaultCity(), name: scope.name, scopeId: scope.id, rows: [], syntheticArea: true,
    })
    : state.cities;
  const cityResults = overviewCities.map(city => {
    const rowsResolved = city.rows.map(r => ({
      ...r,
      building: r.importedBuilding ?? (Number.isInteger(r.buildingIndex)
        ? DATA.cityBuildings[r.buildingIndex]
        : DATA.cityBuildings.find(b => b.de === r.name)),
    }));
    const industryRows = Number.isInteger(city.scopeId)
      ? state.plan.rows.filter(row => row.scopeId === city.scopeId).map(row => ({
        ...row, building: prodBuildings().find(building => building.de === row.name),
      })) : [];
    const industry = evaluatePlan(industryRows, { small: 0, medium: 0, large: 0, hectares: 0 }, state.plan.settings, eco);
    return { city, res: evaluateCity({ ...city, rows: rowsResolved }, eco), industry };
  });
  const sumCities = fn => cityResults.reduce((a, { res }) => a + (fn(res) || 0), 0);
  const cityTotals = {
    population: sumCities(r => r.population),
    workersNeeded: sumCities(r => r.workersNeeded),
    workerSurplus: sumCities(r => r.workerSurplus),
    power: sumCities(r => r.power),
    maxKW: sumCities(r => r.maxKW),
    water: sumCities(r => r.water),
    waste: sumCities(r => r.waste),
    buildCostRUB: sumCities(r => r.buildCostRUB),
    buildCostUSD: sumCities(r => r.buildCostUSD),
  };
  const cityBuildCost = state.currency === 'USD' ? cityTotals.buildCostUSD : cityTotals.buildCostRUB;

  const planRows = state.plan.rows.map(r => ({ ...r, building: prodBuildings().find(b => b.de === r.name) }));
  const plan = evaluatePlan(planRows, state.plan.fields, state.plan.settings, eco);

  // Both sides are already per-shift figures (the sheet's workerSurplus
  // formula accounts for the city's own 3-shift service staffing), so they
  // compare directly: workers the cities can send out vs. what industry needs.
  const netWorkers = cityTotals.workerSurplus - plan.workersPerShift;
  const plannedAreas = cityResults.map(({ city, res, industry }) => {
    const workforceLinked = !city.syntheticArea;
    return {
      scopeId: Number.isInteger(city.scopeId) ? city.scopeId : null,
      name: city.name,
      population: res.population,
      configuredIndustryWorkers: industry.workersPerShift,
      netWorkers: workforceLinked ? res.workerSurplus - industry.workersPerShift : null,
      workforceLinked,
      power: res.power + industry.totalPower,
      water: res.water + industry.totalWater,
      waste: res.waste + industry.totalWaste,
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
        power: cityTotals.power + plan.totalPower,
        water: cityTotals.water + plan.totalWater,
        waste: cityTotals.waste + plan.totalWaste,
      },
      areas: plannedAreas,
    },
  });
  if (!observedImport && state.republicView !== 'plan') state.republicView = 'plan';
  const bufferAlerts = productionBufferAlerts(
    state.plan.rows, prodBuildings(), state.plan.settings, name => eco.keyForName(name),
  ).map(alert => ({ ...alert, scopeName: plannerScopeName(alert.scopeId) }));
  const severityOrder = { critical: 0, warning: 1 };
  const alerts = [...republicAlerts(republicModel), ...bufferAlerts].sort((a, b) =>
    severityOrder[a.severity] - severityOrder[b.severity]
      || (a.observed ?? Infinity) - (b.observed ?? Infinity)
      || String(a.scopeName).localeCompare(String(b.scopeName)));

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
    kv(t('maxWatt'), fmt(cityTotals.maxKW + plan.totalMaxKW, 0)),
    kv(t('powerUse'), fmt(cityTotals.power + plan.totalPower, 1)),
    kv(t('waterUse'), fmt(cityTotals.water + plan.totalWater, 1)),
    kv(t('wasteOut'), fmt(cityTotals.waste + plan.totalWaste, 1)),
    kv(`${t('buildCost')} ${cur()}`, fmt(cityBuildCost + plan.totalBuildCost, 0)));

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
      ? fmt(state.saveImport.latestProductivity * 100, 4) + ' %'
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

  const openArea = (scopeId, tab) => {
    state.republicScope = scopeId;
    if (tab === 'production') state.productionScope = String(scopeId);
    if (tab === 'city') {
      const index = state.cities.findIndex(city => city.scopeId === scopeId);
      if (index >= 0) state.activeCity = index;
    }
    state.tab = tab;
    update();
  };
  const actualArea = new Map(republicModel.actual.areas.map(area => [area.scopeId, area]));
  const planArea = new Map(republicModel.plan.areas.map(area => [area.scopeId, area]));
  const scopeInfo = new Map(plannerScopes().map(scope => [scope.id, scope]));
  const mappableScopeIds = new Set((state.saveImport?.observedBuildings ?? [])
    .map(building => building.scopeId).filter(Number.isInteger));
  const locateAreaOnMap = scopeId => {
    mapFocusBuildingIndex = null;
    mapFocusScopeId = scopeId;
    state.republicScope = scopeId;
    update();
    setTimeout(() => document.querySelector('.map-section')?.scrollIntoView({
      behavior: 'smooth', block: 'center',
    }), 0);
  };
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

  const alertItems = alerts.length ? alerts.slice(0, 8).map(alert => el('div', { class: `alert ${alert.severity}` },
      el('strong', {}, alert.scopeName || t('republicOverview')),
      el('span', {}, t(`alert.${alert.metric}`)),
      Number.isFinite(alert.observed) ? el('span', { class: 'alert-value' },
        alert.metric === 'staffing' || alert.metric === 'health' || alert.metric === 'food'
          ? fmt(alert.observed * 100, 1) + ' %'
          : alert.metric.startsWith('buffer.') ? `${fmt(alert.observed, 2)} ${t('day')}`
            : fmt(alert.observed, 1)) : null))
    : [el('p', { class: 'hint pos' }, t('noAlerts'))];
  const alertList = el('div', { class: 'alert-list' },
    el('h3', {}, t('attention')), ...alertItems);

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
  const schematicMap = renderSchematicRepublicMap(
    state.saveImport?.observedBuildings, state.saveImport?.scopes, criminalityOutliers);
  const criminalityOutlierDetails = criminalityOutliers?.residents?.length ? el('details', {
    class: 'secondary-section',
  },
    el('summary', {}, `${t('highCriminalityResidents')} (`
      + `${fmt(criminalityOutliers.residents.length, 0)} / ${fmt(criminalityOutliers.locatedOutlierCount, 0)})`),
    el('p', { class: 'hint' }, t('criminalityOutlierRule')
      .replace('{average}', fmt(criminalityOutliers.averageCriminality * 100, 2))
      .replace('{threshold}', fmt(criminalityOutliers.threshold * 100, 2))),
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
    criminalityOutlierDetails,
    el('p', { class: 'hint' }, t('crimeHistoryNote'))) : null;

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
            disabled: fleetPage.page <= 1,
            onclick: () => { state.fleetFilter.page = fleetPage.page - 1; update(); },
          }, `← ${t('fleetPreviousPage')}`),
          el('span', {}, t('fleetPageStatus')
            .replace('{page}', fmt(fleetPage.page, 0)).replace('{pages}', fmt(fleetPage.pageCount, 0))
            .replace('{from}', fmt((fleetPage.page - 1) * fleetPage.pageSize + 1, 0))
            .replace('{to}', fmt(Math.min(fleetPage.total, fleetPage.page * fleetPage.pageSize), 0))
            .replace('{total}', fmt(fleetPage.total, 0))),
          el('button', {
            disabled: fleetPage.page >= fleetPage.pageCount,
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

  const historyRecords = filterRange(state.statsRecords ?? [], state.republicRange);
  const series = (label, color, valueOf) => ({ label, color, points: seriesFromRecords(historyRecords, valueOf) });
  const resourceKeys = [...new Set((state.statsRecords ?? []).flatMap(record =>
    Object.keys(record.resourcesProduced ?? {})))];
  if (!resourceKeys.includes(state.republicResource)) {
    const latest = state.statsRecords?.at(-1);
    state.republicResource = resourceKeys.sort((a, b) =>
      (latest?.resourcesProduced?.[b] ?? 0) - (latest?.resourcesProduced?.[a] ?? 0))[0] ?? null;
  }
  const resourceOptions = resourceKeys.map(key => {
    const resource = DATA.resources.find(item => item.key === key);
    return [key, resource ? rname(resource) : key];
  });
  const charts = state.statsRecords?.length ? el('details', { class: 'history-section secondary-section' },
    el('summary', {}, `${t('republicHistory')} (${fmt(state.statsRecords.length, 0)})`),
    el('div', { class: 'chart-controls settingsbar' },
      ...['month', 'year', 'all'].map(range => el('button', {
        class: state.republicRange === range ? 'active' : '',
        onclick: () => { state.republicRange = range; update(); },
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
      renderRepublicLineChart(t('productivityHistory'), [
        series(t('productivity'), '#27ae60', record => Number.isFinite(record.averageProductivity)
          ? record.averageProductivity * 100 : null),
      ]),
      renderRepublicLineChart(t('crimeHistory'), [
        series(t('minorCrimes'), '#f1c40f', record => record.minorCrimes),
        series(t('mediumCrimes'), '#e67e22', record => record.mediumCrimes),
        series(t('seriousCrimes'), '#c0392b', record => record.seriousCrimes),
      ]),
      renderRepublicLineChart(t('tradeHistory'), [
        series(t('imports'), '#c0392b', record => totalMapValues(record.resourcesImportRUB)),
        series(t('exports'), '#27ae60', record => totalMapValues(record.resourcesExportRUB)),
      ]),
      state.republicResource ? renderRepublicLineChart(
        resourceOptions.find(([key]) => key === state.republicResource)?.[1] ?? state.republicResource, [
          series(t('produced'), '#2980b9', record => record.resourcesProduced?.[state.republicResource]),
          series(t('imports'), '#c0392b', record => record.resourcesImportRUB?.[state.republicResource]),
          series(t('exports'), '#27ae60', record => record.resourcesExportRUB?.[state.republicResource]),
        ]) : null)) : null;

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
  const comparisonMetrics = [
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
  const snapshotComparison = state.saveImport ? el('details', {
    class: 'history-section secondary-section snapshot-comparison',
    ...(comparisonSnapshotName || comparisonSnapshotError ? { open: '' } : {}),
  },
    el('summary', {}, t('compareSnapshots')),
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
          el('th', {}, t('current')), el('th', {}, t('change')))),
        el('tbody', {}, ...comparisonMetrics.map(([key, label]) => el('tr', {},
          el('td', {}, label),
          el('td', { class: 'r' }, comparisonValue(key, comparison.baseline.totals[key])),
          el('td', { class: 'r' }, comparisonValue(key, comparison.current.totals[key])),
          el('td', { class: 'r' }, comparisonDelta(key, comparison.deltas[key]))))))),
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
          : el('p', { class: 'hint' }, t('noObservedChanges'))) : null) : null;

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
      alertList,
      institutionOverview,
      fleetOpportunities,
      logisticsOperations,
      schematicMap,
      el('div', { class: 'tablewrap' }, areaTable),
      charts,
      snapshotComparison,
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
    } }, '⚙ ' + t('recommend')));

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
function renderResearch() {
  const lt = state.lowtech;
  const paidResearch = DATA.research.filter(item => item.pointCost === 1)
    .sort((a, b) => (a[state.lang] || a.en).localeCompare(b[state.lang] || b.en, state.lang));
  const checkedKeys = Array.isArray(lt.researchKeys) ? new Set(lt.researchKeys) : null;
  const researched = checkedKeys ? checkedKeys.size : lt.researched;
  const pts = lowTechPoints({ ...lt, researched });
  const setResearchChecked = (key, checked) => {
    const keys = new Set(lt.researchKeys ?? []);
    if (checked) keys.add(key); else keys.delete(key);
    lt.researchKeys = [...keys].sort();
    lt.researched = lt.researchKeys.length;
    update();
  };
  const importedPaidKeys = completedPaidResearchKeys(DATA.research, state.saveImport?.research);
  return el('section', {},
    el('p', { class: 'hint' }, t('ltHint'), ' ',
      el('a', { href: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3046902889', target: '_blank' }, 'Steam Guide')),
    el('div', { class: 'settingsbar column' },
      el('label', {}, t('ltPop') + ' ', numInput(lt.population, v => lt.population = v, { min: 0, step: 100 })),
      el('label', {}, t('ltCities') + ' ', numInput(lt.cities, v => lt.cities = v, { min: 0, step: 1 })),
      el('label', {}, t('ltStart') + ' ', numInput(lt.startYear, v => lt.startYear = v, { min: 1900, step: 1 })),
      el('label', {}, t('ltYear') + ' ', numInput(lt.currentYear, v => lt.currentYear = v, { min: 1900, step: 1 })),
      checkedKeys
        ? el('span', {}, `${t('ltDone')}: `, el('strong', {}, fmt(researched, 0)), ' / ', fmt(paidResearch.length, 0))
        : el('label', {}, t('ltDone') + ' ', numInput(lt.researched, v => lt.researched = v, { min: 0, step: 1 })),
      checkedKeys ? el('button', { onclick: () => { lt.researched = researched; lt.researchKeys = null; update(); } },
        t('ltUseManual')) : el('button', { onclick: () => { lt.researchKeys = []; update(); } }, t('ltUseChecklist')),
      importedPaidKeys.length ? el('button', { class: 'primary', onclick: () => {
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
  return stateProjection(SNAPSHOT_KEYS);
}

function replaceStateProjection(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Plan state must be an object');
  const defaults = createInitialState();
  for (const key of keys) {
    const value = obj[key] !== undefined ? obj[key] : defaults[key];
    if (value === undefined) delete state[key];
    else state[key] = cloneStateValue(value);
  }

  // Pre-multi-chain exports stored one `chain` object rather than `chains`.
  if (obj.chains === undefined && obj.chain && typeof obj.chain === 'object') {
    state.chains = [{ name: null, ...cloneStateValue(obj.chain) }];
  }
  if (!Array.isArray(state.cities)) state.cities = [];
  if (!state.cities.length) state.cities.push(defaultCity());
  if (!Array.isArray(state.chains) || !state.chains.length) state.chains = [defaultChainPlan()];
  state.activeCity = Math.max(0, Math.min(Number(state.activeCity) || 0, state.cities.length - 1));
  state.activeChain = Math.max(0, Math.min(Number(state.activeChain) || 0, state.chains.length - 1));
  if (!IS_BETA && state.tab === 'saveimport') state.tab = 'republic';
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
  if ((!state.saveImport || (state.saveImport.roadNetwork && state.saveImport.railNetwork
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
  if (!state.saveImport.terrainWater && candidate.terrainWater) state.saveImport.terrainWater = candidate.terrainWater;
  if (!state.saveImport.pollutionLayer && candidate.pollutionLayer) {
    state.saveImport.pollutionLayer = candidate.pollutionLayer;
  }
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
      // back up the local plan before overwriting it, so the shared-link
      // banner's "restore my plan" is a real, working promise
      const before = localStorage.getItem(LS_KEY);
      if (before) localStorage.setItem(LS_KEY_BACKUP, before);
      replaceSharedState(await fragmentToState(h.slice(3)));
      state.viewingSharedLink = true; // transient — not in SHARE_KEYS, not persisted
    } catch (e) { console.warn('bad share link', e); }
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
function update() {
  applyTuning(state.tuning);
  saveState();
  syncHash();
  render();
}

loadState();
if (!IS_BETA && state.tab === 'saveimport') state.tab = 'republic';
state.calcOpts = { inputPriceMode: 'sell', includeDelivery: false, ...(state.calcOpts || {}) };
loadData().then(async () => {
  await initializeNamedSnapshots();
  await restoreNamedMapLayers();
  await applyHash();
  if (!state.cities.length) state.cities.push(defaultCity());
  applyTuning(state.tuning);
  saveState();
  syncHash();
  render();
}).catch(err => {
  $('#app').textContent = 'Failed to load data files: ' + err +
    ' — if you opened index.html directly, serve the folder with a local web server (e.g. `python3 -m http.server`).';
});
