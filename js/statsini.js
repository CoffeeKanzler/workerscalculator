// Parser for Workers & Resources: Soviet Republic stats.ini exports.
// The file holds $STAT_RECORD history plus a final $STAT_CURRENT snapshot.
// Later $STAT_CITY blocks are separate histories and are ignored. Price
// sections contain lines:
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
  Resources_SpendFactories: 'resourcesSpendFactories',
  Resources_SpendShops: 'resourcesSpendShops',
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
  DATE_DAY: 'day',
  DATE_YEAR: 'year',
  Citizens_Adults: 'adults',
  Citizens_Unemployed: 'unemployed',
  Citizens_Born: 'born',
  Citizens_Dead: 'dead',
  Citizens_Escaped: 'escaped',
  Citizens_ChildrenSmall: 'childrenSmall',
  Citizens_ChildrenMedium: 'childrenMedium',
  Citizens_AdultsParent: 'adultsParent',
  Citizens_EducationBasic: 'educationBasic',
  Citizens_EducationHigh: 'educationHigh',
  Citizens_AverageProductivity: 'averageProductivity',
  Citizens_AverageAge: 'averageAge',
  Citizens_AverageLifespan: 'averageLifespan',
};

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
    if (rec && section) {
      const m = line.match(/^(\S+)\s+(-?[\d.]+)/);
      if (m) rec[section][m[1]] = parseFloat(m[2]);
    }
  }
  const out = records.filter(r => r.year !== null || r.current);
  out.forEach((r, i) => { r.index = i; });
  return out;
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
