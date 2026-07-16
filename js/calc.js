// Economy formulas replicated from the community planning spreadsheet.
// Curated constants live in community_constants.js — edit values there.
import {
  SEASON_FACTOR, NO_SEASON_FACTOR, FIELD_SIZES, QUALITY_BUILDINGS_DE, TUNABLES,
  SERVICES, SECRET_POLICE_PER_BUILDINGS, HEAT_PER_SPECIAL, CABLES,
  HEAT_EXCHANGERS, NON_DELIVERABLE,
} from './community_constants.js?v=11';

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
    return this.sell(key, currency) - this.delivery(key, currency);
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
  const res = {
    population,
    workersNeeded,
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

  for (const svc of SERVICES) {
    const cap = rows.filter(r => r.building.type.de === svc.typeDe)
      .reduce((a, r) => a + (r.building[svc.src] ?? 0) * r.count, 0);
    const provided = cap * prod * svc.ratio;
    res.services.push({
      ...svc, capacity: cap, provided,
      utilization: provided > 0 ? population / provided : null,
    });
  }
  // Residential building count & secret police (1 vehicle per 7 residential buildings).
  const residential = rows.filter(r => (r.building.inhabitants ?? 0) > 0)
    .reduce((a, r) => a + r.count, 0);
  const secretCap = rows.filter(r => r.building.type.de === 'Geheimpolizei')
    .reduce((a, r) => a + (r.building.special ?? 0) * r.count, 0) * prod * TUNABLES.secretPolicePerBuildings;
  res.residentialBuildings = residential;
  res.secretPolice = {
    provided: secretCap,
    needed: residential / TUNABLES.secretPolicePerBuildings,
    utilization: secretCap > 0 ? residential / secretCap : null,
  };
  // Heating plants inside the city (special value → m³ hot water).
  const heatCap = rows.filter(r => r.building.type.de === 'Heizwerk')
    .reduce((a, r) => a + (r.building.special ?? 0) * r.count, 0) * TUNABLES.heatPerSpecial;
  res.heating = { provided: heatCap, utilization: heatCap > 0 ? res.hotwater / heatCap : null };
  // Infrastructure sizing.
  const cable = CABLES.find(c => c.de === city.cable) || CABLES[2];
  res.transformers = res.maxKW / 1000 / cable.mw;
  res.heatExchangers = res.hotwater / (city.exchanger === 'large' ? HEAT_EXCHANGERS.large : HEAT_EXCHANGERS.small);
  res.waterConnections = res.water / (city.waterDivisor || 3);
  return res;
}

// LowTech research rule (community rule by DasBreitschwert).
export function lowTechPoints({ population, cities, currentYear, startYear, researched }) {
  const decadeBonus = startYear > 1960 ? 0 : Math.floor((Math.min(currentYear, 1980) - startYear) / 10) + 1;
  return Math.floor(population / 2500) + cities + decadeBonus - researched;
}
