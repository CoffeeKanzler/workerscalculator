// Parser for Workers & Resources: Soviet Republic stats.ini exports.
// The file holds $STAT_RECORD history plus a final $STAT_CURRENT snapshot.
// Later $STAT_CITY blocks are separate settlement snapshots. They are ignored
// by parseStatsIni so they cannot contaminate republic prices, and exposed by
// parseCityStatsIni for save-backed operational reporting. Price sections contain lines:
//   <resourceKey> <value> <growthFactor>

const MAP_SECTIONS = {
  Economy_PurchaseCostUSD: 'purchaseUSD',
  Economy_PurchaseCostRUB: 'purchaseRUB',
  Economy_SellCostUSD: 'sellUSD',
  Economy_SellCostRUB: 'sellRUB',
  Economy_BaseUSD: 'baseUSD',
  Economy_BaseRUB: 'baseRUB',
  Resources_Produced: 'resourcesProduced',
  Resources_ImportUSD: 'resourcesImportUSD',
  Resources_ImportRUB: 'resourcesImportRUB',
  Resources_ExportUSD: 'resourcesExportUSD',
  Resources_ExportRUB: 'resourcesExportRUB',
  Resources_SpendConstructions: 'resourcesSpendConstructions',
  Resources_SpendFactories: 'resourcesSpendFactories',
  Resources_SpendShops: 'resourcesSpendShops',
  Resources_SpendVehicles: 'resourcesSpendVehicles',
  Waste_ProductionFactories: 'wasteProductionFactories',
  Waste_ProductionPeople: 'wasteProductionPeople',
};

const SCALAR_KEYS = {
  Economy_DeliveryCostUSD: 'deliveryCostUSD',
  Economy_DeliveryCostRUB: 'deliveryCostRUB',
  Economy_WorkdayCostUSD: 'workdayCostUSD',
  Economy_WorkdayCostRUB: 'workdayCostRUB',
  Economy_ImigrantCostRUB: 'imigrantCostRUB',
  Economy_ImigrantCostUSD: 'imigrantCostUSD',
  Loan_Ballance_RUB: 'loanBalanceRUB',
  Loan_Ballance_USD: 'loanBalanceUSD',
  Loan_Interest_RUB: 'loanInterestRUB',
  Loan_Interest_USD: 'loanInterestUSD',
  Vehicles_ImportRUB: 'vehicleImportRUB',
  Vehicles_ImportUSD: 'vehicleImportUSD',
  Vehicles_ExportRUB: 'vehicleExportRUB',
  Vehicles_ExportUSD: 'vehicleExportUSD',
  DATE_DAY: 'day',
  DATE_YEAR: 'year',
  Citizens_Adults: 'adults',
  Citizens_Unemployed: 'unemployed',
  Citizens_Born: 'born',
  Citizens_Dead: 'dead',
  Citizens_Escaped: 'escaped',
  Citizens_ImigrantSoviet: 'immigrantsSoviet',
  Citizens_ImigrantAfrica: 'immigrantsAfrica',
  Citizens_ChildrenSmall: 'childrenSmall',
  Citizens_ChildrenMedium: 'childrenMedium',
  Citizens_SmallChilds: 'childrenSmall',
  Citizens_MediumChilds: 'childrenMedium',
  Citizens_AdultsParent: 'adultsParent',
  Citizens_EducationBasic: 'educationBasic',
  Citizens_EducationHigh: 'educationHigh',
  Citizens_NoEducation: 'educationNone',
  Citizens_BasicEducationNum: 'educationBasic',
  Citizens_HighEducationNum: 'educationHigh',
  Citizens_AverageProductivity: 'averageProductivity',
  Citizens_AverageAge: 'averageAge',
  Citizens_AverageLifespan: 'averageLifespan',
};

const CRIME_KEYS = {
  Executed_0: 'minorCrimes',
  Executed_1: 'mediumCrimes',
  Executed_2: 'seriousCrimes',
  Executed_3: 'executed3',
  Executed_4: 'executed4',
  Error_NoPolice: 'withoutPolice',
  Error_NotInvestigated: 'notInvestigated',
  Error_NotCourt: 'withoutCourt',
  Prisoners_Escaped: 'prisonersEscaped',
};

const RESOURCE_HISTORY_FIELDS = [
  'resourcesProduced', 'resourcesImportRUB', 'resourcesImportUSD',
  'resourcesExportRUB', 'resourcesExportUSD', 'resourcesSpendFactories',
  'resourcesSpendShops', 'resourcesSpendConstructions', 'resourcesSpendVehicles',
];

export function statsPayloadText(payload) {
  if (typeof payload === 'string') return payload;
  if (payload instanceof ArrayBuffer) return new TextDecoder().decode(payload);
  return '';
}

export function resourceHistoryKeys(records) {
  return [...new Set((records ?? []).flatMap(record =>
    RESOURCE_HISTORY_FIELDS.flatMap(field => Object.keys(record[field] ?? {}))))];
}

function parseCrimeLine(line, target) {
  const match = line.match(/^Crime_(\S+)\s+(-?[\d.]+)/);
  if (!match || !(match[1] in CRIME_KEYS)) return false;
  target[CRIME_KEYS[match[1]]] = parseFloat(match[2]);
  return true;
}

export function parseBlueprintOwned(text) {
  const ids = [];
  const seen = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^\$BLUEPRINT_OWNED\s+(\S+)/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    ids.push(match[1]);
  }
  return ids;
}

export function parseStatsIni(text) {
  const records = [];
  let rec = null;
  let section = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('---') || line.startsWith('===') || line.startsWith('//')) continue;
    if (line.startsWith('$')) {
      const parts = line.split(/\s+/);
      const name = parts[0].slice(1);
      if (name === 'STAT_RECORD' || name === 'STAT_CURRENT') {
        rec = { index: records.length, day: null, year: null, current: name === 'STAT_CURRENT' };
        for (const s of Object.values(MAP_SECTIONS)) rec[s] = {};
        records.push(rec);
        section = null;
      } else if (name === 'STAT_CITY') {
        // City histories follow the global records and repeat the same economy
        // section names. They are not valid price snapshots for the planner.
        rec = null;
        section = null;
      } else if (name === 'end') {
        section = null;
      } else if (rec && name in SCALAR_KEYS && parts.length > 1) {
        rec[SCALAR_KEYS[name]] = parseFloat(parts[1]);
        section = null;
      } else if (rec && name in MAP_SECTIONS) {
        section = MAP_SECTIONS[name];
      } else {
        section = null; // section we don't track (tourism, citizens, ...)
      }
      continue;
    }
    if (rec && parseCrimeLine(line, rec)) continue;
    if (rec && section) {
      const m = line.match(/^(\S+)\s+(-?[\d.]+)/);
      if (m) rec[section][m[1]] = parseFloat(m[2]);
    }
  }
  const out = records.filter(r => r.year !== null || r.current);
  out.forEach((r, i) => { r.index = i; });
  return out;
}

export function parseCityStatsIni(text) {
  const records = [];
  let rec = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const city = line.match(/^\$STAT_CITY\s+(\d+)/);
    if (city) {
      rec = { scopeId: Number(city[1]), day: null, year: null };
      records.push(rec);
      continue;
    }
    if (!rec) continue;
    if (line.startsWith('$STAT_')) {
      rec = null;
      continue;
    }
    const scalar = line.match(/^\$(DATE_DAY|DATE_YEAR|Citizens_Born|Citizens_Dead|Citizens_Escaped)\s+(-?[\d.]+)/);
    if (scalar) {
      const key = SCALAR_KEYS[scalar[1]];
      if (key) rec[key] = parseFloat(scalar[2]);
      continue;
    }
    parseCrimeLine(line, rec);
  }
  for (const record of records) {
    record.recordedCrimes = (record.minorCrimes ?? 0) + (record.mediumCrimes ?? 0)
      + (record.seriousCrimes ?? 0) + (record.executed3 ?? 0) + (record.executed4 ?? 0);
    record.unresolvedCrimes = (record.withoutPolice ?? 0) + (record.notInvestigated ?? 0)
      + (record.withoutCourt ?? 0);
  }
  return records;
}

// Some snapshots contain 0.000000 for the scalar costs (game quirk); fall back
// to the nearest earlier record with a real value.
function scalarWithFallback(records, index, field, dflt = 0) {
  for (let i = index; i >= 0; i--) {
    const v = records[i]?.[field];
    if (v) return v;
  }
  for (let i = index + 1; i < records.length; i++) {
    const v = records[i]?.[field];
    if (v) return v;
  }
  return dflt;
}

// Convert one parsed record into the app's price-set shape.
export function recordToPrices(rec, allRecords) {
  const recs = allRecords ?? [rec];
  const idx = allRecords ? rec.index : 0;
  return {
    purchaseUSD: { ...rec.purchaseUSD },
    purchaseRUB: { ...rec.purchaseRUB },
    sellUSD: { ...rec.sellUSD },
    sellRUB: { ...rec.sellRUB },
    workdayCostUSD: scalarWithFallback(recs, idx, 'workdayCostUSD'),
    workdayCostRUB: scalarWithFallback(recs, idx, 'workdayCostRUB'),
    deliveryCostUSD: scalarWithFallback(recs, idx, 'deliveryCostUSD'),
    deliveryCostRUB: scalarWithFallback(recs, idx, 'deliveryCostRUB'),
    imigrantCostUSD: scalarWithFallback(recs, idx, 'imigrantCostUSD'),
    imigrantCostRUB: scalarWithFallback(recs, idx, 'imigrantCostRUB'),
    label: rec.year !== null ? `${rec.year} / day ${rec.day}` : `record ${rec.index}`,
  };
}
