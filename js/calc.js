// Economy formulas replicated from the community planning spreadsheet.
// Curated constants live in community_constants.js — edit values there.
import {
  SEASON_FACTOR, NO_SEASON_FACTOR, FIELD_SIZES, QUALITY_BUILDINGS_DE, TUNABLES,
  SERVICES, SECRET_POLICE_PER_BUILDINGS, HEAT_PER_SPECIAL, CABLES,
  HEAT_EXCHANGERS, NON_DELIVERABLE,
} from './community_constants.js?v=13';

export {
  SEASON_FACTOR, NO_SEASON_FACTOR, FIELD_SIZES, QUALITY_BUILDINGS_DE,
  SERVICES, CABLES, NON_DELIVERABLE,
};

export class Economy {
  // opts.inputPriceMode: 'sell' (like the sheet: inputs valued at what you could
  //   have sold them for) or 'buy' (import view: inputs valued at purchase price).
  // opts.includeDelivery: apply per-ton delivery cost to border trades.
  constructor(resources, prices, opts = {}) {
    this.resources = resources;               // [{key, de, en, tid}]
    this.byDe = new Map(resources.map(r => [r.de, r]));
    this.byEn = new Map(resources.map(r => [r.en, r]));
    this.byKey = new Map(resources.map(r => [r.key, r]));
    this.prices = prices;                     // {purchaseUSD:{key:v}, ... , workdayCostRUB, ...}
    this.inputPriceMode = opts.inputPriceMode ?? 'sell';
    this.includeDelivery = opts.includeDelivery ?? false;
  }

  delivery(key, currency) {
    if (!this.includeDelivery || NON_DELIVERABLE.has(key)) return 0;
    return (currency === 'USD' ? this.prices.deliveryCostUSD : this.prices.deliveryCostRUB) ?? 0;
  }

  // Price used for produced goods (revenue side).
  outputPrice(nameOrKey, currency) {
    const key = this.byKey.has(nameOrKey) ? nameOrKey : this.keyForName(nameOrKey);
    if (!key) return 0;
    return this.sell(key, currency) - this.delivery(key, currency);
  }

  // Price used for consumed goods (cost side), per inputPriceMode.
  inputPrice(nameOrKey, currency) {
    const key = this.byKey.has(nameOrKey) ? nameOrKey : this.keyForName(nameOrKey);
    if (!key) return 0;
    if (key === 'workers') return this.workday(currency);
    if (this.inputPriceMode === 'buy') return this.buy(key, currency) + this.delivery(key, currency);
    // Consuming a locally produced input is not a border delivery. Keep its
    // opportunity value unchanged; delivery only applies to actual exports or
    // to imported inputs in buy mode.
    return this.sell(key, currency);
  }

  keyForName(name) {
    const r = this.byDe.get(name) || this.byEn.get(name);
    return r ? r.key : null;
  }

  // sell = what the state pays you at the border; buy = what you pay.
  sell(nameOrKey, currency) {
    const key = this.byKey.has(nameOrKey) ? nameOrKey : this.keyForName(nameOrKey);
    if (!key) return 0;
    if (key === 'workers') return 0;
    return (currency === 'USD' ? this.prices.sellUSD : this.prices.sellRUB)[key] ?? 0;
  }

  buy(nameOrKey, currency) {
    const key = this.byKey.has(nameOrKey) ? nameOrKey : this.keyForName(nameOrKey);
    if (!key) return 0;
    if (key === 'workers') return this.workday(currency);
    return (currency === 'USD' ? this.prices.purchaseUSD : this.prices.purchaseRUB)[key] ?? 0;
  }

  workday(currency) {
    return currency === 'USD' ? (this.prices.workdayCostUSD ?? 0) : (this.prices.workdayCostRUB ?? 0);
  }

  // Construction cost of a building from its material bill.
  // Note: the original sheet accidentally priced bricks/asphalt/panels at the
  // workday cost (copy-paste bug); we price every material at its own buy price.
  buildCost(b, currency) {
    const mats = {
      gravel: 'gravel', bricks: 'bricks', steel: 'steel', concrete: 'concrete',
      asphalt: 'asphalt', boards: 'boards', panels: 'prefabpanels',
      ecomponents: 'ecomponents', mcomponents: 'mcomponents',
    };
    let cost = (b.workdays ?? 0) * this.workday(currency);
    for (const [prop, key] of Object.entries(mats)) {
      cost += (b[prop] ?? 0) * this.buy(key, currency);
    }
    return cost;
  }

  // Profit of one production building instance per day (sheet: Einnahmen - Ausgaben).
  buildingProfit(b, currency, productivity = 1, count = 1, quality = 1) {
    const mult = QUALITY_BUILDINGS_DE.has(b.de) ? count * quality : count;
    let income = 0, expenses = 0;
    for (const p of b.production) income += this.outputPrice(p.de, currency) * p.rate * mult * productivity;
    for (const c of b.consumption) expenses += this.inputPrice(c.de, currency) * c.rate * count * productivity;
    return { income, expenses, profit: income - expenses };
  }
}

export const VEHICLE_PRODUCTION_MATERIALS = [
  'Stahl', 'Aluminium', 'Kunststoffe', 'Stoff',
  'Mechanik-Bauteile', 'Elektronik-Bauteile', 'Elektronik',
];

const VEHICLE_COMPONENT_KEYS = {
  Stahl: 'steel', Aluminium: 'aluminium', Kunststoffe: 'plastics', Stoff: 'fabric',
  'Mechanik-Bauteile': 'mcomponents', 'Elektronik-Bauteile': 'ecomponents',
  Elektronik: 'eletronics',
};

const WESTERN_VEHICLE_ORIGINS = new Set([
  'Deutschland', 'France', 'Frankreich', 'Germany', 'Italy', 'Japan', 'Kanada',
  'Schweden', 'South Korea', 'Sweden', 'USA', 'Usa', 'Vereinigtes Königreich',
  'West Deutschland', 'West Germany',
]);

const SHIP_TYPES = new Set(['Frachtschiff', 'Passagierschiff']);
const RAIL_TYPES = new Set([
  'Gleisbau', 'Güterwagon', 'Lokomotive', 'Passagierwagen', 'Straßenbahn',
  'Triebwagen', 'U-Bahn', 'Zugverband',
]);

export function vehicleProductionGroup(vehicle) {
  const type = vehicle?.attrs?.Typ;
  if (SHIP_TYPES.has(type)) return 'boats';
  if (RAIL_TYPES.has(type)) return 'trains';
  if (type === 'Flugzeug' || type === 'Hubschrauber') return 'aircraft';
  return 'road';
}

function splitComponent(total, bodyWeight, engineWeight) {
  if (!(total > 0)) return [0, 0];
  const weight = bodyWeight + engineWeight;
  if (!(weight > 0)) return [total, 0];
  return [total * bodyWeight / weight, total * engineWeight / weight];
}

function orderedVehicleComponents(attrs) {
  const total = key => key === 'workers'
    ? (attrs.Arbeitstage ?? 0)
    : (attrs[Object.keys(VEHICLE_COMPONENT_KEYS).find(name => VEHICLE_COMPONENT_KEYS[name] === key)] ?? 0);
  const w = attrs.Leergewicht ?? 0;
  const power = attrs.Motorleistung ?? 0;
  const type = attrs.Typ;
  let body;
  let engine;

  if (type === 'Flugzeug' || type === 'Hubschrauber') {
    const p = power / 1000;
    body = { workers: 175 * w, steel: .05 * w, aluminium: .75 * w, plastics: .015 * w,
      fabric: .0035, mcomponents: .17 * w, ecomponents: .035 * w, eletronics: .015 * w };
    engine = { workers: 150 * p, mcomponents: .7 * p, ecomponents: .08 * p, eletronics: .02 * p };
  } else if (SHIP_TYPES.has(type)) {
    const p = power / 100;
    const electric = attrs.Antriebsart === 'E';
    body = { workers: 25 * w, steel: .5 * w, plastics: .01 * w, fabric: .002,
      mcomponents: .06 * w, ecomponents: .005 * w };
    engine = { workers: 10 * p, steel: (electric ? .5 : .6) * p,
      mcomponents: (electric ? .35 : .65) * p, ecomponents: (electric ? .25 : .01) * p };
  } else if (RAIL_TYPES.has(type)) {
    const p = power / 100;
    const electric = attrs.Antriebsart === 'E';
    body = { workers: 45 * w, steel: .85 * w, plastics: .04 * w, fabric: .005,
      mcomponents: .06 * w, ecomponents: .01 * w };
    engine = ['Güterwagon', 'Passagierwagen'].includes(type) ? {}
      : { workers: 25 * p, steel: (electric ? .5 : .6) * p,
        mcomponents: (electric ? .35 : .65) * p, ecomponents: (electric ? .25 : .06) * p };
  } else {
    const p = power / 100;
    body = { workers: 55 * w, steel: .85 * w, plastics: .04 * w, fabric: .005,
      mcomponents: .06 * w, ecomponents: .01 * w };
    engine = { workers: 65 * p, steel: .5 * p, mcomponents: .45 * p, ecomponents: .05 * p };
  }

  const keys = ['workers', 'steel', 'aluminium', 'plastics', 'fabric', 'mcomponents', 'ecomponents', 'eletronics'];
  const split = Object.fromEntries(keys.map(key => [key, splitComponent(total(key), body[key] ?? 0, engine[key] ?? 0)]));
  return [
    ...keys.map(key => [key, split[key][0]]),
    ...keys.map(key => [key, split[key][1]]),
  ].filter(([, amount]) => amount > 0);
}

// The executable settles exports from the production-component bill. Its
// origin adjustment is inside the loop, so component order is significant.
export function vehicleSaleValue(vehicle, currency, eco) {
  const attrs = vehicle?.attrs ?? {};
  const western = WESTERN_VEHICLE_ORIGINS.has(attrs.Bauland);
  const crossMarketFactor = currency === 'USD'
    ? (western ? 1 : 0.65)
    : (western ? 1.27 : 1);
  const components = orderedVehicleComponents(attrs);

  let value = 0;
  for (const [key, amount] of components) {
    if (!(amount > 0)) continue;
    let price = key === 'workers' ? eco.workday(currency) : eco.sell(key, currency);
    if (currency === 'RUB' && key === 'workers') price *= 0.45;
    value = (value + amount * price) * crossMarketFactor;
  }
  if (attrs.Typ === 'Flugzeug' || attrs.Typ === 'Hubschrauber') value *= 2;
  return value;
}

// Fahrzeugproduktion sheet: material expense per vehicle, then scale output by
// assigned workers, productivity, required workdays, and the selected period.
export function evaluateVehicleProduction(vehicle, settings, eco) {
  const attrs = vehicle?.attrs ?? {};
  const days = settings.timeUnit === 'year' ? 365 : settings.timeUnit === 'month' ? 30 : 1;
  const workdays = attrs.Arbeitstage ?? 0;
  const workers = settings.workers ?? 0;
  const productivity = settings.productivity ?? 1;
  const materialCostPerUnit = VEHICLE_PRODUCTION_MATERIALS.reduce((sum, material) =>
    sum + (attrs[material] ?? 0) * eco.inputPrice(material, settings.currency), 0);
  const units = workdays > 0 ? workers * productivity * days / workdays : 0;
  const salePrice = settings.salePrice ?? vehicleSaleValue(vehicle, settings.currency, eco);
  const income = units * salePrice;
  const expenses = units * materialCostPerUnit;
  const profit = income - expenses;
  return {
    salePrice, materialCostPerUnit, units, income, expenses, profit,
    profitPerWorker: workers > 0 ? profit / workers : 0,
  };
}

export function recommendVehicleProduction(vehicles, settings, eco, limit = 5) {
  return vehicles
    .filter(vehicle => (vehicle?.attrs?.Arbeitstage ?? 0) > 0)
    .map((vehicle, index) => ({ vehicle, index, result: evaluateVehicleProduction(vehicle, settings, eco) }))
    .filter(row => Number.isFinite(row.result.profitPerWorker) && row.result.profit > 0)
    .sort((a, b) => b.result.profitPerWorker - a.result.profitPerWorker)
    .slice(0, limit);
}

// Full production-plan evaluation (ProduktionProductions sheet).
// rows: [{building, count, quality}], settings: {productivity, timeUnit, seasons, fertilizer, calendarFlow, currency}
export function evaluatePlan(rows, fields, settings, eco) {
  const tf = settings.timeUnit === 'year' ? 365 : settings.timeUnit === 'month' ? 30 : 1;
  const prod = settings.productivity;
  const flow = settings.calendarFlow || 1;
  const out = {
    rows: [], balance: new Map(), workersPerShift: 0, totalPower: 0, totalMaxKW: 0,
    totalWater: 0, totalWaste: 0, totalBuildCost: 0, totalProfit: 0, timeFactor: tf,
  };
  const addBal = (name, produced, consumed) => {
    const key = eco.keyForName(name) || name;
    if (!out.balance.has(key)) out.balance.set(key, { name, produced: 0, consumed: 0 });
    const e = out.balance.get(key);
    e.produced += produced;
    e.consumed += consumed;
  };

  for (const row of rows) {
    const b = row.building;
    if (!b) continue;
    const count = row.count || 0;
    const quality = row.quality ?? 1;
    if (!count) continue;
    const mult = QUALITY_BUILDINGS_DE.has(b.de) ? count * quality : count;
    let income = 0, expenses = 0;
    for (const p of b.production) {
      const amt = p.rate * mult * tf * prod * flow;
      income += eco.outputPrice(p.de, settings.currency) * amt;
      addBal(p.de, amt, 0);
    }
    for (const c of b.consumption) {
      const amt = c.rate * count * tf * prod * flow;
      expenses += eco.inputPrice(c.de, settings.currency) * amt;
      addBal(c.de, 0, amt);
    }
    const workers = b.workers * count;
    const buildCost = eco.buildCost(b, settings.currency) * count;
    const profit = income - expenses;
    const profitPerWorker = workers ? profit / (workers / 2) : 0; // sheet formula
    const amortDays = profit > 0 ? buildCost / (profit / tf) : Infinity;
    out.rows.push({ ...row, workers, income, expenses, profit, profitPerWorker, amortDays, buildCost });
    out.workersPerShift += workers;
    out.totalPower += b.power * count * tf;
    out.totalMaxKW += b.maxKW * count;
    out.totalWater += b.water * count * tf;
    out.totalWaste += b.wastePerWorker * b.workers * count * tf;
    out.totalBuildCost += buildCost;
    out.totalProfit += profit;
  }

  // Fields: plants production from hectares.
  const hectares = fields.hectares ??
    (fields.small * FIELD_SIZES.small + fields.medium * FIELD_SIZES.medium + fields.large * FIELD_SIZES.large);
  const factor = settings.seasons ? TUNABLES.seasonFactor : TUNABLES.noSeasonFactor;
  const plants = hectares * factor * (settings.fertilizer || 1) * tf;
  if (plants > 0) {
    addBal('Pflanzen', plants, 0);
    out.fieldPlants = plants;
    out.hectares = hectares;
  }
  return out;
}

// City evaluation (StädteCitys Neu sheet).
export function evaluateCity(city, eco) {
  const prod = city.productivity;
  const rows = city.rows.filter(r => r.building && r.count > 0);
  const sum = fn => rows.reduce((a, r) => a + fn(r.building) * r.count, 0);

  const population = sum(b => b.inhabitants);
  const workersNeeded = sum(b => b.workers);
  // Population-weighted average, over only the residents whose building has a
  // known housing quality (unrated mod buildings are excluded, not zeroed).
  const ratedRows = rows.filter(r => r.building.quality != null);
  const ratedPopulation = ratedRows.reduce((a, r) => a + r.building.inhabitants * r.count, 0);
  const qualityWeighted = ratedRows.reduce((a, r) => a + r.building.quality * r.building.inhabitants * r.count, 0);
  const res = {
    population,
    workersNeeded,
    avgHousingQuality: ratedPopulation > 0 ? qualityWeighted / ratedPopulation : null,
    workerSurplus: (population - workersNeeded * 3) / 4, // sheet formula
    power: sum(b => b.power),
    maxKW: sum(b => b.maxKW),
    water: sum(b => b.water),
    hotwater: sum(b => b.hotwater),
    waste: sum(b => b.waste),
    workdays: sum(b => b.workdays),
    materials: {},
    services: [],
  };
  for (const m of ['gravel', 'bricks', 'steel', 'concrete', 'asphalt', 'boards', 'panels', 'ecomponents', 'mcomponents']) {
    res.materials[m] = sum(b => b[m] ?? 0);
  }
  const matKeys = { gravel: 'gravel', bricks: 'bricks', steel: 'steel', concrete: 'concrete', asphalt: 'asphalt', boards: 'boards', panels: 'prefabpanels', ecomponents: 'ecomponents', mcomponents: 'mcomponents' };
  res.buildCostRUB = Object.entries(res.materials).reduce((a, [m, amt]) => a + amt * eco.buy(matKeys[m], 'RUB'), 0);
  res.buildCostUSD = Object.entries(res.materials).reduce((a, [m, amt]) => a + amt * eco.buy(matKeys[m], 'USD'), 0);
  res.buildCostRUB += res.workdays * eco.workday('RUB');
  res.buildCostUSD += res.workdays * eco.workday('USD');

  // Workers of a given building type for 100% utilization, assuming the same
  // worker/capacity mix as what's already built: optimal = current * utilization,
  // below current staffing if under-utilized. A building's worker count can't
  // be scaled past its own max slots (`max`, its current total) — you can only
  // staff down, never up, so over-utilization needs more buildings, not more
  // workers per building; `optimal` is capped at `max` to reflect that ceiling.
  const optimalWorkers = (typeDe, utilization) => {
    if (utilization == null) return null;
    const max = rows.filter(r => r.building.type.de === typeDe)
      .reduce((a, r) => a + (r.building.workers ?? 0) * r.count, 0);
    return { optimal: Math.min(max, max * utilization), max };
  };

  for (const svc of SERVICES) {
    const cap = rows.filter(r => r.building.type.de === svc.typeDe)
      .reduce((a, r) => a + (r.building[svc.src] ?? 0) * r.count, 0);
    const provided = cap * prod * svc.ratio;
    const utilization = provided > 0 ? population / provided : null;
    res.services.push({
      ...svc, capacity: cap, provided, utilization,
      workersNeeded: optimalWorkers(svc.typeDe, utilization),
    });
  }
  // Residential building count & secret police (1 vehicle per 7 residential buildings).
  const residential = rows.filter(r => (r.building.inhabitants ?? 0) > 0)
    .reduce((a, r) => a + r.count, 0);
  const secretCap = rows.filter(r => r.building.type.de === 'Geheimpolizei')
    .reduce((a, r) => a + (r.building.special ?? 0) * r.count, 0) * prod * TUNABLES.secretPolicePerBuildings;
  res.residentialBuildings = residential;
  const secretUtilization = secretCap > 0 ? residential / secretCap : null;
  res.secretPolice = {
    provided: secretCap,
    needed: residential / TUNABLES.secretPolicePerBuildings,
    utilization: secretUtilization,
    workersNeeded: optimalWorkers('Geheimpolizei', secretUtilization),
  };
  // Heating plants inside the city (special value → m³ hot water).
  const heatCap = rows.filter(r => r.building.type.de === 'Heizwerk')
    .reduce((a, r) => a + (r.building.special ?? 0) * r.count, 0) * TUNABLES.heatPerSpecial;
  const heatUtilization = heatCap > 0 ? res.hotwater / heatCap : null;
  res.heating = {
    provided: heatCap, utilization: heatUtilization,
    workersNeeded: optimalWorkers('Heizwerk', heatUtilization),
  };
  // Infrastructure sizing.
  const cable = CABLES.find(c => c.de === city.cable) || CABLES[2];
  res.transformers = res.maxKW / 1000 / cable.mw;
  res.heatExchangers = res.hotwater / (city.exchanger === 'large' ? HEAT_EXCHANGERS.large : HEAT_EXCHANGERS.small);
  res.waterConnections = res.water / (city.waterDivisor || 3);

  // Utilization by building type.de, for per-row optimal-staffing breakdowns
  // in the UI (only types with a demand model — services, secret police,
  // heating — have one; other amenity types are absent from this map).
  res.utilizationByType = new Map([
    ...res.services.map(svc => [svc.typeDe, svc.utilization]),
    ['Geheimpolizei', secretUtilization],
    ['Heizwerk', heatUtilization],
  ]);
  return res;
}

// LowTech research rule (community rule by DasBreitschwert).
export function lowTechPoints({ population, cities, currentYear, startYear, researched }) {
  const decadeBonus = startYear > 1960 ? 0 : Math.floor((Math.min(currentYear, 1980) - startYear) / 10) + 1;
  return Math.floor(population / 2500) + cities + decadeBonus - researched;
}
