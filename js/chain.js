// Production chain solver: state a goal ("N t/day of X") and compute the whole
// upstream chain — which buildings, how many, workers, power, construction cost,
// and the import bill for everything you choose not to produce.
import { QUALITY_BUILDINGS_DE } from './community_constants.js?v=7';

// Build an index: resource key -> [{building, rate}] of producers.
export function producersByResource(buildings, eco) {
  const idx = new Map();
  for (const b of buildings) {
    for (const p of b.production) {
      const key = eco.keyForName(p.de);
      if (!key || !p.rate) continue;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key).push({ building: b, rate: p.rate });
    }
  }
  return idx;
}

// Default producer choice: best profit per worker at current prices.
// Waste-processing buildings are deprioritized — their inputs (scrap etc.)
// are byproducts with limited supply, not something you can scale up.
export function defaultProducer(producers, eco, currency) {
  const usesWaste = b => b.consumption.some(c => {
    const key = eco.keyForName(c.de);
    return key && (key.startsWith('waste') || key === 'nuclearfuelburned');
  });
  let best = null, bestScore = -Infinity;
  for (const { building } of producers) {
    const { profit } = eco.buildingProfit(building, currency);
    let score = building.workers ? profit / building.workers : profit;
    if (usesWaste(building)) score -= 1e9;
    if (score > bestScore) { bestScore = score; best = building; }
  }
  return best;
}

/**
 * Solve the chain via fixpoint iteration (handles cycles like
 * power plants consuming coal from mines that consume power).
 *
 * @param goalKey   resource key to produce
 * @param amount    tons (or MWh/m³) per day
 * @param buildings dataset (rates in t/day at productivity 1)
 * @param eco       Economy (prices + name→key mapping)
 * @param opts      { productivity, currency, imports:Set<key>,
 *                    producerChoice: Map<key, buildingDe>, includeUtilities }
 */
export function solveChain(goalKey, amount, buildings, eco, opts = {}) {
  const productivity = opts.productivity ?? 1;
  const currency = opts.currency ?? 'RUB';
  const imports = opts.imports ?? new Set();
  const choice = opts.producerChoice ?? new Map();
  const includeUtilities = opts.includeUtilities ?? true;
  const index = producersByResource(buildings, eco);

  const producerFor = key => {
    const producers = index.get(key);
    if (!producers) return null;
    const chosen = choice.get(key);
    if (chosen) {
      const hit = producers.find(p => p.building.de === chosen);
      if (hit) return hit.building;
    }
    return defaultProducer(producers, eco, currency);
  };

  const outputOf = (b, key) => {
    for (const p of b.production) {
      if (eco.keyForName(p.de) === key) {
        const qual = QUALITY_BUILDINGS_DE.has(b.de) ? (opts.quality ?? 1) : 1;
        return p.rate * productivity * qual;
      }
    }
    return 0;
  };

  // fixpoint: demands -> building counts -> induced demands
  let demands = new Map([[goalKey, amount]]);
  let counts = new Map();
  for (let pass = 0; pass < 60; pass++) {
    const next = new Map([[goalKey, amount]]);
    const add = (key, amt) => next.set(key, (next.get(key) ?? 0) + amt);
    counts = new Map();
    for (const [key, dem] of demands) {
      if (imports.has(key)) continue;
      const b = producerFor(key);
      if (!b) continue;
      const out = outputOf(b, key);
      if (!out) continue;
      const n = dem / out;
      counts.set(key, { building: b, count: Math.max(n, counts.get(key)?.count ?? 0) });
    }
    // one building may satisfy several demands; use the max count per building
    const perBuilding = new Map();
    for (const { building, count } of counts.values()) {
      perBuilding.set(building, Math.max(count, perBuilding.get(building) ?? 0));
    }
    for (const [b, n] of perBuilding) {
      for (const c of b.consumption) {
        const key = eco.keyForName(c.de);
        if (key) add(key, c.rate * productivity * n);
      }
      if (includeUtilities) {
        if (b.power) add('eletric', b.power * n);
        if (b.water) add('water', b.water * n);
      }
    }
    // converged?
    let stable = true;
    for (const [k, v] of next) {
      if (Math.abs((demands.get(k) ?? 0) - v) > Math.max(1e-6, v * 1e-6)) { stable = false; break; }
    }
    const prevTotal = [...demands.values()].reduce((a, b) => a + b, 0);
    const nextTotal = [...next.values()].reduce((a, b) => a + b, 0);
    demands = next;
    if (stable && pass > 0) break;
    // runaway cycle (a chain that consumes more of a resource than it makes)
    if (pass > 20 && nextTotal > prevTotal * 1.05) {
      return { rows: [], totals: {}, byproducts: new Map(), demands, diverged: true };
    }
  }

  // assemble result rows
  const rows = [];
  const totals = { workers: 0, power: 0, maxKW: 0, water: 0, buildCost: 0, importCost: 0 };
  const perBuilding = new Map();
  for (const [key, { building, count }] of counts) {
    perBuilding.set(building, Math.max(count, perBuilding.get(building) ?? 0));
  }
  for (const [key, dem] of demands) {
    if (dem < 1e-9) continue;
    const entry = counts.get(key);
    if (!entry || imports.has(key)) {
      const price = eco.buy(key, currency) + eco.delivery(key, currency);
      const cost = dem * price;
      rows.push({ key, demand: dem, imported: true, importCost: cost,
                  importable: !!index.get(key) });
      totals.importCost += cost;
      continue;
    }
    const b = entry.building;
    const n = perBuilding.get(b);
    rows.push({
      key, demand: dem, imported: false, building: b,
      count: n, countCeil: Math.ceil(n - 1e-9),
      producers: index.get(key).map(p => p.building.de),
    });
  }
  // totals over unique buildings (ceiled counts = what you actually build)
  const seen = new Set();
  const byproducts = new Map();
  for (const row of rows) {
    if (row.imported || seen.has(row.building)) continue;
    seen.add(row.building);
    const b = row.building, n = row.countCeil;
    totals.workers += b.workers * n;
    totals.power += (b.power ?? 0) * n;
    totals.maxKW += (b.maxKW ?? 0) * n;
    totals.water += (b.water ?? 0) * n;
    totals.buildCost += eco.buildCost(b, currency) * n;
    // surplus: ceiled capacity minus demand, plus secondary products
    for (const p of b.production) {
      const key = eco.keyForName(p.de);
      if (!key) continue;
      const cap = outputOf(b, key) * n;
      const dem = demands.get(key) ?? 0;
      const surplus = cap - Math.min(dem, cap);
      if (surplus > 1e-6) byproducts.set(key, (byproducts.get(key) ?? 0) + surplus);
    }
  }
  totals.revenue = amount * eco.outputPrice(goalKey, currency);
  return { rows, totals, byproducts, demands };
}
