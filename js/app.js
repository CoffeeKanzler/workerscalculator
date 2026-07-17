import { STRINGS } from './i18n.js?v=22';
import { parseStatsIni, recordToPrices } from './statsini.js?v=14';
import { Economy, evaluatePlan, evaluateCity, evaluateVehicleProduction, recommendVehicleProduction, vehicleProductionGroup, VEHICLE_PRODUCTION_MATERIALS, CABLES, QUALITY_BUILDINGS_DE, lowTechPoints, FIELD_SIZES } from './calc.js?v=22';
import { stateToFragment, fragmentToState, downloadJson } from './share.js?v=13';
import { solveChain, producersByResource, defaultProducer } from './chain.js?v=15';
import { TUNABLES, TUNABLE_DEFAULTS, applyTuning } from './community_constants.js?v=13';
import {
  isLocomotive, evaluateConsist, eraOk, recommendTrain, mergeVehiclePools,
} from './train.js?v=14';

const TABS = ['prices', 'production', 'chain', 'analysis', 'vehicleprod', 'city', 'republic', 'trains', 'research', 'advanced', 'help'];
// Keys worth sharing/exporting (statsRecords stay local: big + personal to the save).
const SHARE_KEYS = ['lang', 'currency', 'priceSource', 'decade', 'overrides', 'plan',
  'cities', 'activeCity', 'vanillaOnly', 'vehicleProduction', 'train', 'lowtech', 'calcOpts', 'dataset',
  'chains', 'activeChain', 'tuning', 'tab'];

// ---------------------------------------------------------------- state
const LS_KEY = 'wr-planner-v1';
const LS_KEY_BACKUP = 'wr-planner-v1-backup'; // local plan saved before a shared link overwrote it

const state = {
  lang: 'en',
  tab: 'prices',
  currency: 'RUB',
  priceSource: 'default',      // default | stats | decade
  decade: 1980,
  recordIndex: 0,
  statsRecords: null,          // parsed stats.ini records
  statsName: null,
  overrides: {},               // {"sellRUB.steel": 123}
  historyKey: 'steel',
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
  lowtech: { population: 2500, cities: 1, currentYear: 1930, startYear: 1920, researched: 0 },
  analysisSort: { col: 'profit', dir: -1 },
  analysisSearch: '',
  priceSort: { col: 'name', dir: 1 },
};

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
  const { statsRecords, viewingSharedLink, ...rest } = state;
  const slim = { ...rest };
  slim.statsRecords = statsRecords;
  try { localStorage.setItem(LS_KEY, JSON.stringify(slim)); } catch (e) { /* quota */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(state, s);
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- data
let DATA = null; // {resources, defaults, prodBuildings, cityBuildings, vehicles, decades}

// Data version: bumped together with the ?v= in index.html on each release so
// GitHub Pages' 10-minute cache can't serve stale JSON to a fresh app.
const DATA_V = new URL(import.meta.url).searchParams.get('v') ?? '0';

async function loadData() {
  const get = path => fetch(`${path}?v=${DATA_V}`);
  const [res, prod, prodGame, city, veh, rail, dec] = await Promise.all([
    get('data/resources.json').then(r => r.json()),
    get('data/production_buildings.json').then(r => r.json()),
    get('data/game/production_buildings.json').then(r => r.ok ? r.json() : null).catch(() => null),
    get('data/city_buildings.json').then(r => r.json()),
    get('data/vehicles.json').then(r => r.json()),
    get('data/game/rail_vehicles.json').then(r => r.ok ? r.json() : []).catch(() => []),
    get('data/decade_prices.json').then(r => r.json()),
  ]);
  DATA = {
    resources: res.resources, defaults: res.defaults,
    prodSets: { sheet: prod, game: prodGame },
    cityBuildings: city,
    // Game-only rail vehicles join the pool; hard-attached tenders stay nested.
    sheetVehicles: veh.vehicles,
    vehicles: mergeVehiclePools(veh.vehicles, rail),
    decades: dec,
  };
}

// Active production-building dataset ('game' from game files, 'sheet' from the spreadsheet).
function prodBuildings() {
  return DATA.prodSets[state.dataset] || DATA.prodSets.sheet;
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

function selectInput(options, value, onchange, opts = {}) {
  const s = el('select', { class: opts.class ?? '', onchange: e => { onchange(e.target.value); update(); } });
  for (const o of options) {
    const [val, label] = Array.isArray(o) ? o : [o, o];
    s.append(el('option', { value: val, selected: String(val) === String(value) }, label));
  }
  return s;
}

// ---------------------------------------------------------------- stats.ini loading
const MAX_RECORDS = 365;

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let records = parseStatsIni(reader.result);
    if (!records.length) {
      alert('No $STAT_RECORD price data found in this file.');
      return;
    }
    // Very long games export thousands of snapshots (53 MB files exist);
    // downsample evenly, always keeping the newest record.
    if (records.length > MAX_RECORDS) {
      const step = Math.ceil(records.length / MAX_RECORDS);
      records = records.filter((r, i) => i % step === 0 || i === records.length - 1);
      records.forEach((r, i) => { r.index = i; });
    }
    state.statsRecords = records;
    state.statsName = file.name;
    state.recordIndex = records.length - 1; // newest snapshot
    state.priceSource = 'stats';
    state.overrides = {};
    update();
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------- rendering
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

  root.replaceChildren(renderHeader(), ...(state.viewingSharedLink ? [renderSharedLinkBanner()] : []), renderTabs(), renderCurrentTab());

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
    extras.push(el('label', {}, t('record') + ' ',
      selectInput(state.statsRecords.map((r, i) => [i, `${r.year ?? '?'} / ${r.day ?? '?'}${r.current ? ` (${t('current')})` : ''}`]),
        state.recordIndex, v => { state.recordIndex = parseInt(v); })));
  }
  if (state.priceSource === 'decade') {
    extras.push(el('label', {}, t('decade') + ' ',
      selectInput(Object.keys(DATA.decades), state.decade, v => { state.decade = parseInt(v); })));
  }

  return el('header', {},
    el('h1', {}, t('appTitle')),
    el('div', { class: 'controls' },
      drop,
      el('label', {}, t('priceSource') + ' ', sourceSel),
      ...extras,
      el('label', {}, t('currency') + ' ',
        selectInput([['RUB', '₽ Rubel'], ['USD', '$ Dollar']], state.currency,
          v => { state.currency = v; state.plan.settings.currency = v; })),
      DATA.prodSets.game ? el('label', {}, t('dataset') + ' ',
        selectInput([['game', t('datasetGame')], ['sheet', t('datasetSheet')]],
          state.dataset, v => { state.dataset = v; })) : null,
      el('div', { class: 'sharebtns' },
        el('button', { title: t('exportPlan'), onclick: exportPlan }, '⬇'),
        el('label', { title: t('importPlan'), class: 'iconbtn' }, '⬆',
          el('input', { type: 'file', accept: '.json', class: 'hidden',
            onchange: e => e.target.files[0] && importPlan(e.target.files[0]) })),
        el('button', { title: t('shareLink'), onclick: shareLink }, '🔗')),
      el('div', { class: 'langswitch' },
        ...['de', 'en'].map(l => el('button', {
          class: state.lang === l ? 'active' : '',
          onclick: () => { state.lang = l; update(); },
        }, l.toUpperCase())))));
}

function renderTabs() {
  const labels = { prices: 'tabPrices', production: 'tabProduction', chain: 'tabChain',
    analysis: 'tabAnalysis', vehicleprod: 'tabVehicleProd', city: 'tabCity', republic: 'tabRepublic',
    trains: 'tabTrains', research: 'tabResearch', advanced: 'tabAdvanced', help: 'tabHelp' };
  return el('nav', {}, ...TABS.map(id => el('button', {
    class: state.tab === id ? 'active' : '',
    onclick: () => { state.tab = id; update(); },
  }, t(labels[id]))));
}

function renderCurrentTab() {
  switch (state.tab) {
    case 'prices': return renderPrices();
    case 'production': return renderProduction();
    case 'chain': return renderChain();
    case 'analysis': return renderAnalysis();
    case 'vehicleprod': return renderVehicleProduction();
    case 'city': return renderCity();
    case 'republic': return renderRepublic();
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
      el('td', { class: 'clickable', onclick: () => { state.historyKey = r.key; update(); } }, rname(r)),
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
  const r = DATA.resources.find(x => x.key === state.historyKey) || DATA.resources[0];
  box.append(el('p', {}, rname(r)));
  // Only plot the currently selected currency's sell/buy - RUB and USD
  // values live on incomparable scales, so mixing all four on one shared
  // axis produced a meaningless min/max and a mislabeled (single-currency)
  // axis.
  const series = state.currency === 'USD'
    ? [['sellUSD', '#27ae60'], ['purchaseUSD', '#2980b9']]
    : [['sellRUB', '#c0392b'], ['purchaseRUB', '#e67e22']];
  const recs = state.statsRecords;
  const W = 460, H = 220, P = 30;
  const all = [];
  for (const [tab] of series) for (const rec of recs) {
    const v = rec[tab]?.[r.key]; if (v !== undefined) all.push(v);
  }
  if (!all.length) { box.append(el('p', {}, '—')); return box; }
  const min = Math.min(...all, 0), max = Math.max(...all);
  const x = i => P + (W - 2 * P) * (recs.length === 1 ? 0 : i / (recs.length - 1));
  const y = v => H - P - (H - 2 * P) * ((v - min) / ((max - min) || 1));
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  for (const [tab, color] of series) {
    const pts = recs.map((rec, i) => `${x(i)},${y(rec[tab]?.[r.key] ?? 0)}`).join(' ');
    const pl = document.createElementNS(svgNS, 'polyline');
    pl.setAttribute('points', pts);
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', color);
    pl.setAttribute('stroke-width', '1.6');
    svg.append(pl);
  }
  const axis = document.createElementNS(svgNS, 'text');
  axis.setAttribute('x', 4); axis.setAttribute('y', 12); axis.setAttribute('class', 'axislabel');
  axis.textContent = `${fmt(max)} ${cur()}`;
  const axis2 = document.createElementNS(svgNS, 'text');
  axis2.setAttribute('x', 4); axis2.setAttribute('y', H - 4); axis2.setAttribute('class', 'axislabel');
  axis2.textContent = fmt(min);
  svg.append(axis, axis2);
  box.append(svg,
    el('div', { class: 'legend' }, ...series.map(([tab, color]) =>
      el('span', {}, el('i', { style: `background:${color}` }), t(
        tab === 'sellRUB' ? 'sellRUB' : tab === 'purchaseRUB' ? 'buyRUB' : tab === 'sellUSD' ? 'sellUSD' : 'buyUSD')))),
    el('p', { class: 'hint' }, `${recs[0].year ?? '?'} → ${recs[recs.length - 1].year ?? '?'}`));
  return box;
}

// ---------------------------------------------------------------- production tab
function renderProduction() {
  const eco = economy();
  const s = state.plan.settings;
  s.currency = state.currency;
  const result = evaluatePlan(
    state.plan.rows.map(r => ({ ...r, building: prodBuildings().find(b => b.de === r.name) })),
    state.plan.fields, s, eco);

  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('productivity') + ' ', pctInput(s.productivity, v => s.productivity = v)),
    el('label', {}, t('timeUnit') + ' ',
      selectInput([['day', t('day')], ['month', t('month')], ['year', t('year')]], s.timeUnit, v => s.timeUnit = v)),
    el('label', {}, t('seasons') + ' ', el('input', {
      type: 'checkbox', checked: s.seasons, onchange: e => { s.seasons = e.target.checked; update(); } })),
    el('label', {}, t('calendarFlow') + ' ', numInput(s.calendarFlow, v => s.calendarFlow = v || 1, { step: 0.1, min: 0 })),
    el('label', {}, t('fertilizer') + ' ', numInput(s.fertilizer, v => s.fertilizer = v || 1, { step: 0.1, min: 0 })));

  const groups = [...new Set(prodBuildings().map(b => b.group[state.lang]))];

  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('group')), el('th', {}, t('building')), el('th', {}, t('count')),
      el('th', {}, t('quality')), el('th', {}, t('workers')),
      el('th', {}, `${t('profit')} ${cur()}`), el('th', {}, t('profitPerWorker')),
      el('th', {}, t('amortDays')), el('th', {}, `${t('income')} ${cur()}`),
      el('th', {}, `${t('expenses')} ${cur()}`), el('th', {}, `${t('buildCost')} ${cur()}`), el('th', {}))),
    el('tbody', {}, state.plan.rows.map((row, idx) => {
      const b = prodBuildings().find(x => x.de === row.name);
      const res = result.rows[idx] ?? {};
      const groupSel = selectInput([t('none'), ...groups], row.group ?? t('none'),
        v => { row.group = v; row.name = null; });
      const inGroup = prodBuildings().filter(x => x.group[state.lang] === row.group);
      const bSel = selectInput(
        [[', ', t('none')], ...inGroup.map(x => [x.de, bname(x)])],
        row.name ?? ', ', v => { row.name = v === ', ' ? null : v; });
      const isMine = b && QUALITY_BUILDINGS_DE.has(b.de);
      return el('tr', {},
        el('td', {}, groupSel), el('td', {}, bSel),
        el('td', {}, numInput(row.count, v => row.count = v, { min: 0, step: 1 })),
        el('td', {}, isMine ? pctInput(row.quality ?? 0.5, v => row.quality = v) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.workers * row.count, 0) : '—'),
        el('td', { class: 'r ' + ((res.profit ?? 0) < 0 ? 'neg' : 'pos') }, fmt(res.profit)),
        el('td', { class: 'r ' + ((res.profitPerWorker ?? 0) < 0 ? 'neg' : 'pos') }, fmt(res.profitPerWorker)),
        el('td', { class: 'r' }, fmt(res.amortDays, 1)),
        el('td', { class: 'r' }, fmt(res.income)), el('td', { class: 'r' }, fmt(res.expenses)),
        el('td', { class: 'r' }, fmt(res.buildCost, 0)),
        el('td', {}, el('button', { class: 'danger', onclick: () => { state.plan.rows.splice(idx, 1); update(); } }, '✕')));
    })));

  const addBtn = el('button', {
    onclick: () => { state.plan.rows.push({ group: groups[0], name: null, count: 1, quality: 0.5 }); update(); },
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

  return el('section', {}, settings, renderCalcOpts(), fieldsBox, tbl, addBtn,
    el('div', { class: 'columns' }, el('div', {}, el('h3', {}, t('balance')), balance), totals));
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
        el('td', {}, producerSel),
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
        el('td', {}, bname(r.b)), el('td', {}, r.b.group[state.lang]),
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
  const available = DATA.sheetVehicles
    .map((vehicle, index) => ({ vehicle, index }))
    .filter(({ vehicle }) => (vehicle.attrs.Arbeitstage ?? 0) > 0);
  const types = [...new Set(available.map(({ vehicle }) => vehicle.attrs.Typ))]
    .sort((a, b) => a.localeCompare(b));
  if (!plan.rows.length && available.length) {
    const initial = available.find(({ vehicle }) => vehicle.attrs.Typ === 'Bus') ?? available[0];
    plan.rows.push({ type: initial.vehicle.attrs.Typ, vehicleIndex: initial.index, workers: 100 });
  }

  const vehicleLabel = vehicle => {
    const attrs = vehicle.attrs;
    const era = `${attrs.Von ?? '?'}–${typeof attrs.Bis === 'number' ? attrs.Bis : '∞'}`;
    return `${vehicle.name} — ${era} · ${fmt(attrs.Arbeitstage, 0)} ${t('workdaysShort')}`;
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
  const recommendationTable = el('div', { class: 'tablewrap recommendations' },
    el('table', { class: 'data wide' },
      el('thead', {}, el('tr', {},
        el('th', {}, '#'), el('th', {}, t('vehicle')), el('th', {}, t('vehicleType')),
        el('th', {}, t('origin')), el('th', {}, `${t('saleValue')} ${cur()}`),
        el('th', {}, `${t('materialPerUnit')} ${cur()}`),
        el('th', {}, `${t('profitPerWorker')} / ${t(plan.timeUnit)}`), el('th', {}))),
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
      const materialLine = vehicle
        ? VEHICLE_PRODUCTION_MATERIALS.filter(name => (vehicle.attrs[name] ?? 0) > 0)
          .map(name => `${name}: ${fmt(vehicle.attrs[name], 2)} t`).join(' · ')
        : '';
      return el('tr', {},
        el('td', {}, selectInput(types.map(type => [type, type]), row.type, v => {
          row.type = v;
          row.vehicleIndex = available.find(({ vehicle: item }) => item.attrs.Typ === v)?.index ?? null;
        })),
        el('td', {}, selectInput(
          inType.map(({ vehicle: item, index }) => [String(index), vehicleLabel(item)]),
          String(selected?.index ?? ''), v => { row.vehicleIndex = Number(v); }),
          materialLine ? el('div', { class: 'subline' }, materialLine) : null),
        el('td', {}, numInput(row.workers, v => row.workers = v, { min: 0, step: 10 })),
        el('td', { class: 'r' }, fmt(result.salePrice, 0)),
        el('td', { class: 'r' }, vehicle ? fmt(vehicle.attrs.Arbeitstage, 0) : '—'),
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
    el('div', { class: 'settingsbar' },
      el('label', {}, t('vehicleGroup') + ' ', selectInput(
        [['road', t('roadVehicles')], ['trains', t('trains')], ['boats', t('boats')], ['aircraft', t('aircraft')]],
        plan.recommendationGroup, value => { plan.recommendationGroup = value; }))),
    recommendationTable,
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

// ---------------------------------------------------------------- city tab
function renderCity() {
  if (!state.cities.length) state.cities.push(defaultCity());
  if (state.activeCity >= state.cities.length) state.activeCity = 0;
  const city = state.cities[state.activeCity];
  const eco = economy();

  const cityTabs = el('div', { class: 'citytabs' },
    ...state.cities.map((c, i) => el('button', {
      class: i === state.activeCity ? 'active' : '',
      onclick: () => { state.activeCity = i; update(); },
    }, c.name || `${t('city')} ${i + 1}`)),
    el('button', { onclick: () => { state.cities.push(defaultCity()); state.activeCity = state.cities.length - 1; update(); } }, t('addCity')),
    state.cities.length > 1 ? el('button', {
      class: 'danger',
      onclick: () => { state.cities.splice(state.activeCity, 1); state.activeCity = 0; update(); },
    }, t('removeCity')) : null);

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
      type: 'checkbox', checked: state.vanillaOnly, onchange: e => { state.vanillaOnly = e.target.checked; update(); } })));

  const allIndexed = DATA.cityBuildings.map((building, index) => ({ building, index }));
  const pool = allIndexed.filter(({ building }) => !state.vanillaOnly || building.kind === 'Vanilla');
  const typeMap = new Map(pool.map(({ building }) => [building.type.de, building.type]));
  const types = [...typeMap.entries()].sort((a, b) => a[1][state.lang].localeCompare(b[1][state.lang]));
  const resolveRow = row => {
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
    return `${building[state.lang]} — ${details.join(' · ')}`;
  };

  const rowsResolved = city.rows.map(r => ({ ...r, building: resolveRow(r) }));
  const res = evaluateCity({ ...city, rows: rowsResolved }, eco);

  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Typ'), el('th', {}, t('building')), el('th', {}, t('count')),
      el('th', {}, t('population')), el('th', {}, t('housingQuality')), el('th', {}, t('workers')),
      el('th', {}, t('workersNeeded')), el('th', {}, 'kW'),
      el('th', {}, t('waterUse')), el('th', {}, t('hotwater')), el('th', {}, t('wasteOut')),
      el('th', {}, `${t('buildCost')} ${cur()}`), el('th', {}))),
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
      return el('tr', {},
        el('td', {}, typeSel), el('td', {}, bSel),
        el('td', {}, numInput(row.count, v => row.count = v, { min: 0, step: 1 })),
        el('td', { class: 'r' }, b ? fmt(b.inhabitants * n, 0) : '—'),
        el('td', { class: 'r' }, b?.inhabitants > 0 && b.quality != null ? fmt(b.quality * 100, 0) + ' %' : '—'),
        el('td', { class: 'r' }, b ? fmt(b.workers * n, 0) : '—'),
        workersNeededCell(rowWorkersNeeded),
        el('td', { class: 'r' }, b ? fmt(b.maxKW * n, 0) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.water * n, 2) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.hotwater * n, 2) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.waste * n, 1) : '—'),
        el('td', { class: 'r' }, b ? fmt(eco.buildCost(b, state.currency) * n, 0) : '—'),
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

  return el('section', {}, cityTabs, settings, el('div', { class: 'tablewrap' }, tbl), addBtn,
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

// ---------------------------------------------------------------- republic overview tab
// Combines the City tab's plan(s) and the Production tab's plan - both are
// the app's own hypothetical-plan state already, so no save-file parsing is
// needed. Food/clothes/alcohol demand vs. production is NOT shown: no
// per-citizen consumption rate was found in the game files, our datasets,
// or the accessible spreadsheet (see ROADMAP.md 2.2).
function renderRepublic() {
  const eco = economy();
  if (!state.cities.length) state.cities.push(defaultCity());
  const chains = chainPlans();
  const buildings = prodBuildings();
  const chainLabel = c => {
    if (c.name) return c.name;
    const r = DATA.resources.find(x => x.key === c.goal);
    return r ? rname(r) : c.goal;
  };

  const cityResults = state.cities.map(city => {
    const rowsResolved = city.rows.map(r => ({
      ...r,
      building: Number.isInteger(r.buildingIndex)
        ? DATA.cityBuildings[r.buildingIndex]
        : DATA.cityBuildings.find(b => b.de === r.name),
    }));
    return { city, res: evaluateCity({ ...city, rows: rowsResolved }, eco) };
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

  state.plan.settings.currency = state.currency;
  const planRows = state.plan.rows.map(r => ({ ...r, building: prodBuildings().find(b => b.de === r.name) }));
  const plan = evaluatePlan(planRows, state.plan.fields, state.plan.settings, eco);

  // Both sides are already per-shift figures (the sheet's workerSurplus
  // formula accounts for the city's own 3-shift service staffing), so they
  // compare directly: workers the cities can send out vs. what industry needs.
  const netWorkers = cityTotals.workerSurplus - plan.workersPerShift;

  const cityRows = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('city')), el('th', {}, t('population')), el('th', {}, t('workerSurplus')),
      el('th', {}, t('maxWatt')), el('th', {}, t('waterUse')), el('th', {}, t('wasteOut')),
      el('th', {}, t('assignedChain')))),
    el('tbody', {}, cityResults.map(({ city, res }, i) => el('tr', {},
      el('td', {}, city.name || `${t('city')} ${i + 1}`),
      el('td', { class: 'r' }, fmt(res.population, 0)),
      el('td', { class: 'r ' + (res.workerSurplus < 0 ? 'neg' : 'pos') }, fmt(res.workerSurplus, 1)),
      el('td', { class: 'r' }, fmt(res.maxKW, 0)),
      el('td', { class: 'r' }, fmt(res.water, 1)),
      el('td', { class: 'r' }, fmt(res.waste, 1)),
      el('td', {}, selectInput(
        [['', t('unassigned')], ...chains.map((c, ci) => [String(ci), chainLabel(c)])],
        Number.isInteger(city.assignedChain) ? String(city.assignedChain) : '',
        v => { city.assignedChain = v === '' ? null : Number(v); }))))));

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
  const unassignedCities = cityResults.filter(({ city }) => !Number.isInteger(city.assignedChain));

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

  return el('section', {},
    el('p', { class: 'hint' }, t('republicHint')),
    el('p', { class: 'hint warn' }, t('republicConsumptionBlocked')),
    el('div', { class: 'tablewrap' }, cityRows),
    el('h3', {}, t('republicPairings')),
    el('div', { class: 'tablewrap' }, pairingRows),
    el('div', { class: 'columns' }, totals, utilities));
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

// Production cost of a vehicle from its material bill (the game computes real
// purchase prices the same way; the ini COST_RUB fields are placeholders).
const VEHICLE_MATERIALS = ['Stahl', 'Aluminium', 'Kunststoffe', 'Stoff', 'Mechanik-Bauteile', 'Elektronik-Bauteile', 'Elektronik'];
function vehicleCost(v, eco, currency) {
  let cost = (v.attrs['Arbeitstage'] ?? 0) * eco.workday(currency);
  for (const m of VEHICLE_MATERIALS) cost += (v.attrs[m] ?? 0) * eco.buy(m, currency);
  return cost;
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
  for (const w of wagons) for (const k of Object.keys(w.attrs)) {
    if (resDeNames.has(k) && typeof w.attrs[k] === 'number' && w.attrs[k] > 0) cargoSet.add(k);
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
      + `${a['Länge'] ?? '?'} m, ${a['Antriebsart'] ?? '?'} (${a['Von'] ?? '?'}–${a['Bis'] ?? '?'})`;
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
    .filter(w => (w.attrs[tr.cargo] ?? 0) > 0 && eraOk(w, tr.year))
    .map(w => ({
      w, len: w.attrs['Länge'] ?? 0, cap: w.attrs[tr.cargo] ?? 0,
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
      el('td', {}, r.w.name), el('td', { class: 'r' }, fmt(r.len, 1)),
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
      s.cargo = Object.keys(s.v.attrs).find(k => resDeNames.has(k) && s.v.attrs[k] > 0) ?? null;
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
  const pts = lowTechPoints(lt);
  return el('section', {},
    el('p', { class: 'hint' }, t('ltHint'), ' ',
      el('a', { href: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3046902889', target: '_blank' }, 'Steam Guide')),
    el('div', { class: 'settingsbar column' },
      el('label', {}, t('ltPop') + ' ', numInput(lt.population, v => lt.population = v, { min: 0, step: 100 })),
      el('label', {}, t('ltCities') + ' ', numInput(lt.cities, v => lt.cities = v, { min: 0, step: 1 })),
      el('label', {}, t('ltStart') + ' ', numInput(lt.startYear, v => lt.startYear = v, { min: 1900, step: 1 })),
      el('label', {}, t('ltYear') + ' ', numInput(lt.currentYear, v => lt.currentYear = v, { min: 1900, step: 1 })),
      el('label', {}, t('ltDone') + ' ', numInput(lt.researched, v => lt.researched = v, { min: 0, step: 1 }))),
    el('div', { class: 'totalsbox big' },
      kv(t('ltAvail'), fmt(pts, 0), pts < 0 ? 'neg' : 'pos')));
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
    el('p', { class: 'hint' }, t('advShareHint')));
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
    el('p', {}, de
      ? 'Basiert auf dem Community-Spreadsheet (Formeln & Spieldaten daraus extrahiert). Hinweis: Die Baukosten-Formel des Sheets bepreiste Ziegel/Asphalt/Plattenbauteile versehentlich mit Arbeitstagskosten; hier werden alle Materialien korrekt bepreist.'
      : 'Based on the community spreadsheet (formulas & game data extracted from it). Note: the sheet\'s construction cost formula accidentally priced bricks/asphalt/prefab panels at workday cost; here every material uses its own price.'),
    el('p', {}, el('a', { href: 'https://docs.google.com/spreadsheets/d/1rq76hTLnW1C5QbiQynHSbIJwOgg-wfOgSfZmsfm9kh0/edit', target: '_blank' },
      de ? 'Original-Spreadsheet' : 'Original spreadsheet')));
}

// ---------------------------------------------------------------- share / routing
function sharedState() {
  return Object.fromEntries(SHARE_KEYS.map(k => [k, state[k]]));
}

function applySharedState(obj) {
  for (const k of SHARE_KEYS) if (obj[k] !== undefined) state[k] = obj[k];
}

function exportPlan() {
  downloadJson(sharedState(), 'wr-plan.json');
}

function importPlan(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applySharedState(JSON.parse(reader.result));
      update();
    } catch (e) { alert('Invalid plan file: ' + e.message); }
  };
  reader.readAsText(file);
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
      applySharedState(await fragmentToState(h.slice(3)));
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
state.calcOpts = { inputPriceMode: 'sell', includeDelivery: false, ...(state.calcOpts || {}) };
loadData().then(async () => {
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
