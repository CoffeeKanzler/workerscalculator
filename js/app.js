import { STRINGS } from './i18n.js';
import { parseStatsIni, recordToPrices } from './statsini.js';
import { Economy, evaluatePlan, evaluateCity, CABLES, QUALITY_BUILDINGS_DE, lowTechPoints, FIELD_SIZES } from './calc.js';

// ---------------------------------------------------------------- state
const LS_KEY = 'wr-planner-v1';

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
  train: { cargo: 'Kohle', length: 450, locoName: null, locoCount: 1 },
  lowtech: { population: 2500, cities: 1, currentYear: 1930, startYear: 1920, researched: 0 },
  analysisSort: { col: 'profit', dir: -1 },
  analysisSearch: '',
};

function defaultCity() {
  return {
    name: 'Nowa Huta', productivity: 0.7, cable: CABLES[2].de, exchanger: 'small',
    waterDivisor: 3, rows: [],
  };
}

function saveState() {
  const { statsRecords, ...rest } = state;
  const slim = { ...rest };
  // keep parsed records (they're small once parsed) but cap at 120 records
  slim.statsRecords = statsRecords ? statsRecords.slice(-120) : null;
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

async function loadData() {
  const [res, prod, city, veh, dec] = await Promise.all([
    fetch('data/resources.json').then(r => r.json()),
    fetch('data/production_buildings.json').then(r => r.json()),
    fetch('data/city_buildings.json').then(r => r.json()),
    fetch('data/vehicles.json').then(r => r.json()),
    fetch('data/decade_prices.json').then(r => r.json()),
  ]);
  DATA = {
    resources: res.resources, defaults: res.defaults,
    prodBuildings: prod, cityBuildings: city,
    vehicles: veh.vehicles, decades: dec,
  };
}

// ---------------------------------------------------------------- prices
function basePrices() {
  if (state.priceSource === 'stats' && state.statsRecords?.length) {
    const rec = state.statsRecords[Math.min(state.recordIndex, state.statsRecords.length - 1)];
    const p = recordToPrices(rec, state.statsRecords);
    // Older game versions don't export every resource (e.g. no "eletric" row);
    // fall back to the sample defaults for anything missing.
    for (const tbl of ['purchaseUSD', 'purchaseRUB', 'sellUSD', 'sellRUB']) {
      for (const [k, v] of Object.entries(DATA.defaults[tbl])) {
        if (p[tbl][k] === undefined) p[tbl][k] = v;
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
    onchange: e => { onchange(parseFloat(e.target.value) || 0); update(); },
  });
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
    const records = parseStatsIni(reader.result);
    if (!records.length) {
      alert('No $STAT_RECORD price data found in this file.');
      return;
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
  root.replaceChildren(renderHeader(), renderTabs(), renderCurrentTab());
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
      selectInput(state.statsRecords.map((r, i) => [i, `${r.year ?? '?'} / ${r.day ?? '?'}`]),
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
      el('div', { class: 'langswitch' },
        ...['de', 'en'].map(l => el('button', {
          class: state.lang === l ? 'active' : '',
          onclick: () => { state.lang = l; update(); },
        }, l.toUpperCase())))));
}

function renderTabs() {
  const tabs = [
    ['prices', 'tabPrices'], ['production', 'tabProduction'], ['analysis', 'tabAnalysis'],
    ['city', 'tabCity'], ['trains', 'tabTrains'], ['research', 'tabResearch'], ['help', 'tabHelp'],
  ];
  return el('nav', {}, ...tabs.map(([id, label]) => el('button', {
    class: state.tab === id ? 'active' : '',
    onclick: () => { state.tab = id; update(); },
  }, t(label))));
}

function renderCurrentTab() {
  switch (state.tab) {
    case 'prices': return renderPrices();
    case 'production': return renderProduction();
    case 'analysis': return renderAnalysis();
    case 'city': return renderCity();
    case 'trains': return renderTrains();
    case 'research': return renderResearch();
    case 'help': return renderHelp();
    default: return el('div');
  }
}

// ---------------------------------------------------------------- prices tab
function priceCell(table, key, prices) {
  const val = prices[table]?.[key];
  return el('input', {
    type: 'number', step: 'any', class: 'num price' + (state.overrides[`${table}.${key}`] !== undefined ? ' overridden' : ''),
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
  const rows = DATA.resources.filter(r => r.key !== 'workers')
    .sort((a, b) => rname(a).localeCompare(rname(b)));
  const table = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('resource')),
      el('th', {}, t('sellRUB')), el('th', {}, t('buyRUB')),
      el('th', {}, t('sellUSD')), el('th', {}, t('buyUSD')))),
    el('tbody', {}, rows.map(r => el('tr', {},
      el('td', { class: 'clickable', onclick: () => { state.historyKey = r.key; update(); } }, rname(r)),
      el('td', {}, priceCell('sellRUB', r.key, prices)),
      el('td', {}, priceCell('purchaseRUB', r.key, prices)),
      el('td', {}, priceCell('sellUSD', r.key, prices)),
      el('td', {}, priceCell('purchaseUSD', r.key, prices))))));

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
      el('div', {}, table),
      el('div', {}, renderHistory())));
}

function renderHistory() {
  const box = el('div', { class: 'history' }, el('h3', {}, t('history')));
  if (!state.statsRecords || state.statsRecords.length < 2) {
    box.append(el('p', { class: 'hint' }, t('noHistory')));
    return box;
  }
  const r = DATA.resources.find(x => x.key === state.historyKey) || DATA.resources[0];
  box.append(el('p', {}, rname(r)));
  const series = [
    ['sellRUB', '#c0392b'], ['purchaseRUB', '#e67e22'],
    ['sellUSD', '#27ae60'], ['purchaseUSD', '#2980b9'],
  ];
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
    state.plan.rows.map(r => ({ ...r, building: DATA.prodBuildings.find(b => b.de === r.name) })),
    state.plan.fields, s, eco);

  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('productivity') + ' ', numInput(s.productivity, v => s.productivity = v, { step: 0.05, min: 0 })),
    el('label', {}, t('timeUnit') + ' ',
      selectInput([['day', t('day')], ['month', t('month')], ['year', t('year')]], s.timeUnit, v => s.timeUnit = v)),
    el('label', {}, t('seasons') + ' ', el('input', {
      type: 'checkbox', checked: s.seasons, onchange: e => { s.seasons = e.target.checked; update(); } })),
    el('label', {}, t('calendarFlow') + ' ', numInput(s.calendarFlow, v => s.calendarFlow = v || 1, { step: 0.1, min: 0 })),
    el('label', {}, t('fertilizer') + ' ', numInput(s.fertilizer, v => s.fertilizer = v || 1, { step: 0.1, min: 0 })));

  const groups = [...new Set(DATA.prodBuildings.map(b => b.group[state.lang]))];

  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('group')), el('th', {}, t('building')), el('th', {}, t('count')),
      el('th', {}, t('quality')), el('th', {}, t('workers')),
      el('th', {}, `${t('profit')} ${cur()}`), el('th', {}, t('profitPerWorker')),
      el('th', {}, t('amortDays')), el('th', {}, `${t('income')} ${cur()}`),
      el('th', {}, `${t('expenses')} ${cur()}`), el('th', {}, `${t('buildCost')} ${cur()}`), el('th', {}))),
    el('tbody', {}, state.plan.rows.map((row, idx) => {
      const b = DATA.prodBuildings.find(x => x.de === row.name);
      const res = result.rows.find(r => r.name === row.name && r.count === row.count) ?? {};
      const groupSel = selectInput([t('none'), ...groups], row.group ?? t('none'),
        v => { row.group = v; row.name = null; });
      const inGroup = DATA.prodBuildings.filter(x => x.group[state.lang] === row.group);
      const bSel = selectInput(
        [[', ', t('none')], ...inGroup.map(x => [x.de, x[state.lang]])],
        row.name ?? ', ', v => { row.name = v === ', ' ? null : v; });
      const isMine = b && QUALITY_BUILDINGS_DE.has(b.de);
      return el('tr', {},
        el('td', {}, groupSel), el('td', {}, bSel),
        el('td', {}, numInput(row.count, v => row.count = v, { min: 0, step: 1 })),
        el('td', {}, isMine ? numInput(row.quality ?? 1, v => row.quality = v, { step: 0.05, min: 0 }) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.workers * row.count, 0) : '—'),
        el('td', { class: 'r ' + ((res.profit ?? 0) < 0 ? 'neg' : 'pos') }, fmt(res.profit)),
        el('td', { class: 'r' }, fmt(res.profitPerWorker)),
        el('td', { class: 'r' }, fmt(res.amortDays, 1)),
        el('td', { class: 'r' }, fmt(res.income)), el('td', { class: 'r' }, fmt(res.expenses)),
        el('td', { class: 'r' }, fmt(res.buildCost, 0)),
        el('td', {}, el('button', { class: 'danger', onclick: () => { state.plan.rows.splice(idx, 1); update(); } }, '✕')));
    })));

  const addBtn = el('button', {
    onclick: () => { state.plan.rows.push({ group: groups[0], name: null, count: 1, quality: 1 }); update(); },
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

  return el('section', {}, settings, fieldsBox, tbl, addBtn,
    el('div', { class: 'columns' }, el('div', {}, el('h3', {}, t('balance')), balance), totals));
}

function kv(k, v, cls = '') {
  return el('div', { class: 'kv' }, el('span', {}, k), el('strong', { class: cls }, v));
}

// ---------------------------------------------------------------- analysis tab
function renderAnalysis() {
  const eco = economy();
  const rows = DATA.prodBuildings.map(b => {
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
        el('td', {}, r.b[state.lang]), el('td', {}, r.b.group[state.lang]),
        el('td', { class: 'r' }, fmt(r.b.workers, 0)),
        el('td', { class: 'r ' + (r.profit < 0 ? 'neg' : 'pos') }, fmt(r.profit)),
        el('td', { class: 'r' }, fmt(r.profitPerWorker)),
        el('td', { class: 'r' }, fmt(r.amortDays, 1)),
        el('td', { class: 'r' }, fmt(r.income)), el('td', { class: 'r' }, fmt(r.expenses)),
        el('td', { class: 'r' }, fmt(r.buildCost, 0)))))));
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
    el('label', {}, t('productivity') + ' ', numInput(city.productivity, v => city.productivity = v, { step: 0.05, min: 0 })),
    el('label', {}, t('cable') + ' ',
      selectInput(CABLES.map(c => [c.de, c[state.lang]]), city.cable, v => city.cable = v)),
    el('label', {}, t('heatExchangers') + ' ',
      selectInput([['small', t('exchangerSmall')], ['large', t('exchangerLarge')]], city.exchanger, v => city.exchanger = v)),
    el('label', {}, t('waterDivisor') + ' ', numInput(city.waterDivisor, v => city.waterDivisor = v || 3, { min: 1, step: 1 })),
    el('label', {}, t('vanillaOnly') + ' ', el('input', {
      type: 'checkbox', checked: state.vanillaOnly, onchange: e => { state.vanillaOnly = e.target.checked; update(); } })));

  const pool = DATA.cityBuildings.filter(b => !state.vanillaOnly || b.kind === 'Vanilla');
  const types = [...new Set(pool.map(b => b.type[state.lang]))].sort((a, b) => a.localeCompare(b));

  const rowsResolved = city.rows.map(r => ({ ...r, building: pool.find(b => b.de === r.name) || DATA.cityBuildings.find(b => b.de === r.name) }));
  const res = evaluateCity({ ...city, rows: rowsResolved }, eco);

  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Typ'), el('th', {}, t('building')), el('th', {}, t('count')),
      el('th', {}, t('population')), el('th', {}, t('workers')), el('th', {}, 'kW'),
      el('th', {}, t('waterUse')), el('th', {}, t('hotwater')), el('th', {}, t('wasteOut')),
      el('th', {}, `${t('buildCost')} ${cur()}`), el('th', {}))),
    el('tbody', {}, city.rows.map((row, idx) => {
      const b = pool.find(x => x.de === row.name) || DATA.cityBuildings.find(x => x.de === row.name);
      const typeSel = selectInput([t('none'), ...types], row.type ?? t('none'),
        v => { row.type = v; row.name = null; });
      const inType = pool.filter(x => x.type[state.lang] === row.type);
      const bSel = selectInput(
        [[', ', t('none')], ...inType.map(x => [x.de, x[state.lang]])],
        row.name ?? ', ', v => { row.name = v === ', ' ? null : v; });
      const n = row.count || 0;
      return el('tr', {},
        el('td', {}, typeSel), el('td', {}, bSel),
        el('td', {}, numInput(row.count, v => row.count = v, { min: 0, step: 1 })),
        el('td', { class: 'r' }, b ? fmt(b.inhabitants * n, 0) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.workers * n, 0) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.maxKW * n, 0) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.water * n, 2) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.hotwater * n, 2) : '—'),
        el('td', { class: 'r' }, b ? fmt(b.waste * n, 1) : '—'),
        el('td', { class: 'r' }, b ? fmt(eco.buildCost(b, state.currency) * n, 0) : '—'),
        el('td', {}, el('button', { class: 'danger', onclick: () => { city.rows.splice(idx, 1); update(); } }, '✕')));
    })));

  const addBtn = el('button', {
    onclick: () => { city.rows.push({ type: types[0], name: null, count: 1 }); update(); },
  }, t('addRow'));

  const services = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('services')), el('th', {}, t('provided')), el('th', {}, t('utilization')))),
    el('tbody', {},
      res.services.map(s => el('tr', {},
        el('td', {}, t(s.id)),
        el('td', { class: 'r' }, fmt(s.provided, 0)),
        utilizationCell(s.utilization))),
      el('tr', {},
        el('td', {}, t('secretPolice') + ` (${fmt(res.residentialBuildings, 0)} ${t('residential')})`),
        el('td', { class: 'r' }, fmt(res.secretPolice.provided, 1)),
        utilizationCell(res.secretPolice.utilization)),
      el('tr', {},
        el('td', {}, t('heating')),
        el('td', { class: 'r' }, fmt(res.heating.provided, 0)),
        utilizationCell(res.heating.utilization))));

  const summary = el('div', { class: 'totalsbox' },
    el('h3', {}, city.name || t('city')),
    kv(t('population'), fmt(res.population, 0)),
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

  return el('section', {}, cityTabs, settings, tbl, addBtn,
    el('div', { class: 'columns' },
      el('div', {}, el('h3', {}, t('services')), services),
      summary, mats));
}

function utilizationCell(u) {
  if (u === null) return el('td', { class: 'r' }, '—');
  const cls = u > 1 ? 'neg' : u > 0.85 ? 'warn' : 'pos';
  return el('td', { class: 'r ' + cls }, fmt(u * 100, 0) + ' %');
}

// ---------------------------------------------------------------- trains tab
function renderTrains() {
  const locos = DATA.vehicles.filter(v => v.attrs['Typ'] === 'Lokomotive' || v.attrs['Typ'] === 'Triebwagen');
  const wagons = DATA.vehicles.filter(v => ['Güterwagon', 'Passagierwagen'].includes(v.attrs['Typ']));
  // cargo options: resource names (German) that appear as capacity attrs on wagons
  const resDeNames = new Set(DATA.resources.map(r => r.de));
  resDeNames.add('Passagiere');
  const cargoSet = new Set();
  for (const w of wagons) for (const k of Object.keys(w.attrs)) {
    if (resDeNames.has(k) && typeof w.attrs[k] === 'number' && w.attrs[k] > 0) cargoSet.add(k);
  }
  const cargos = [...cargoSet].sort((a, b) => a.localeCompare(b));
  const tr = state.train;
  if (!cargos.includes(tr.cargo)) tr.cargo = cargos[0];

  const loco = locos.find(l => l.name === tr.locoName) || locos[0];
  const locoLen = loco?.attrs['Länge'] ?? 0;
  const usable = Math.max(0, tr.length - locoLen * tr.locoCount);

  const cargoRes = DATA.resources.find(r => r.de === tr.cargo);
  const cargoLabel = c => {
    const r = DATA.resources.find(x => x.de === c);
    return r ? rname(r) : (c === 'Passagiere' ? (state.lang === 'de' ? 'Passagiere' : 'Passengers') : c);
  };

  const settings = el('div', { class: 'settingsbar' },
    el('label', {}, t('cargo') + ' ', selectInput(cargos.map(c => [c, cargoLabel(c)]), tr.cargo, v => tr.cargo = v)),
    el('label', {}, t('loco') + ' ',
      selectInput(locos.map(l => [l.name, `${l.name} (${l.attrs['Länge'] ?? '?'} m, ${l.attrs['Max. Geschwindigkeit'] ?? '?'} km/h)`]),
        loco?.name, v => tr.locoName = v)),
    el('label', {}, t('locoCount') + ' ', numInput(tr.locoCount, v => tr.locoCount = Math.max(1, v), { min: 1, step: 1 })),
    el('label', {}, t('trainLength') + ' ', numInput(tr.length, v => tr.length = v, { min: 0, step: 10 })));

  const rows = wagons
    .filter(w => (w.attrs[tr.cargo] ?? 0) > 0)
    .map(w => {
      const len = w.attrs['Länge'] ?? 0;
      const cap = w.attrs[tr.cargo] ?? 0;
      const n = len > 0 ? Math.floor(usable / len) : 0;
      return { w, len, cap, n, total: n * cap, speed: w.attrs['Max. Geschwindigkeit'], from: w.attrs['Von'] };
    })
    .sort((a, b) => b.total - a.total);

  const tbl = el('table', { class: 'data wide' },
    el('thead', {}, el('tr', {},
      el('th', {}, t('wagon')), el('th', {}, t('length')), el('th', {}, `t / ${t('wagon')}`),
      el('th', {}, t('speed')), el('th', {}, t('from')),
      el('th', {}, t('wagonCount')), el('th', {}, t('totalCapacity')))),
    el('tbody', {}, rows.map(r => el('tr', {},
      el('td', {}, r.w.name), el('td', { class: 'r' }, fmt(r.len, 1)),
      el('td', { class: 'r' }, fmt(r.cap, 1)), el('td', { class: 'r' }, fmt(r.speed, 0)),
      el('td', { class: 'r' }, r.from ?? '—'),
      el('td', { class: 'r' }, fmt(r.n, 0)),
      el('td', { class: 'r pos' }, fmt(r.total, 1) + (tr.cargo === 'Passagiere' ? '' : ' t'))))));

  return el('section', {}, settings,
    el('p', { class: 'hint' },
      `${t('loco')}: ${loco?.name ?? '—'} × ${tr.locoCount} = ${fmt(locoLen * tr.locoCount, 1)} m → ` +
      `${fmt(usable, 1)} m ${state.lang === 'de' ? 'für Wagons' : 'for wagons'}`),
    tbl);
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

// ---------------------------------------------------------------- boot
function update() {
  saveState();
  render();
}

loadState();
loadData().then(() => {
  if (!state.cities.length) state.cities.push(defaultCity());
  render();
}).catch(err => {
  $('#app').textContent = 'Failed to load data files: ' + err +
    ' — if you opened index.html directly, serve the folder with a local web server (e.g. `python3 -m http.server`).';
});
