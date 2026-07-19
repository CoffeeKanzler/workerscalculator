import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBlueprintOwned, parseCityStatsIni, parseStatsIni, recordToPrices, resourceHistoryKeys,
  statsPayloadText,
} from '../js/statsini.js';

const SAMPLE = `$STAT_RECORD 0
====
$DATE_DAY 100
$DATE_YEAR 1979

$Economy_PurchaseCostUSD
-------------
   steel 400.000000 1.050000
   coal 16.900000 1.050000
$end

$Economy_SellCostRUB
-------------
   steel 1700.000000 0.950000
$end

$Economy_WorkdayCostRUB 9.000000
$Economy_DeliveryCostRUB 4.000000
$Loan_Ballance_RUB 125000.000000
$Loan_Interest_RUB 625.000000
$Vehicles_ImportRUB 35326.394531
$Vehicles_ExportRUB 8125.500000
$Citizens_AverageAge 34.25
$Citizens_AverageLifespan 76.5

$STAT_RECORD 1
====
$DATE_DAY 200
$DATE_YEAR 1979

$Economy_PurchaseCostUSD
-------------
   steel 410.000000 1.050000
$end

$Economy_WorkdayCostRUB 0.000000
$Economy_DeliveryCostRUB 0.000000

$Tourism_SpendUSD 12.5
`;

test('stats payload decoding accepts transferred buffers and legacy strings', () => {
  assert.equal(statsPayloadText(SAMPLE), SAMPLE);
  const bytes = new TextEncoder().encode(SAMPLE);
  assert.equal(statsPayloadText(bytes.buffer), SAMPLE);
});

test('parses exact owned blueprint identities before statistics records', () => {
  const text = `$BLUEPRINT_OWNED bus_cav11m3\n$BLUEPRINT_OWNED loco_t478\n`
    + `$BLUEPRINT_OWNED bus_cav11m3\n${SAMPLE}`;
  assert.deepEqual(parseBlueprintOwned(text), ['bus_cav11m3', 'loco_t478']);
});

test('parses records with prices, dates and scalars', () => {
  const recs = parseStatsIni(SAMPLE);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].year, 1979);
  assert.equal(recs[0].day, 100);
  assert.equal(recs[0].purchaseUSD.steel, 400);
  assert.equal(recs[0].purchaseUSD.coal, 16.9);
  assert.equal(recs[0].sellRUB.steel, 1700);
  assert.equal(recs[0].workdayCostRUB, 9);
  assert.equal(recs[0].loanBalanceRUB, 125000);
  assert.equal(recs[0].loanInterestRUB, 625);
  assert.equal(recs[0].vehicleImportRUB, 35326.394531);
  assert.equal(recs[0].vehicleExportRUB, 8125.5);
  assert.equal(recs[0].averageAge, 34.25);
  assert.equal(recs[0].averageLifespan, 76.5);
  assert.equal(recs[1].purchaseUSD.steel, 410);
});

test('zeroed scalars fall back to nearest earlier non-zero record', () => {
  const recs = parseStatsIni(SAMPLE);
  const p = recordToPrices(recs[1], recs);
  assert.equal(p.workdayCostRUB, 9);
  assert.equal(p.deliveryCostRUB, 4);
  assert.equal(p.purchaseUSD.steel, 410);
});

test('semantic records without price data remain available for analytics', () => {
  const recs = parseStatsIni('$STAT_RECORD 0\n$DATE_YEAR 1980\n$Citizens_Born 5\n');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].born, 5);
});

test('city statistics after global records do not overwrite global prices or date', () => {
  const text = `$STAT_RECORD 0
$DATE_DAY 113
$DATE_YEAR 2001
$Citizens_AverageProductivity 0.939362
$Economy_PurchaseCostUSD
  steel 100 1.05
$end
$Economy_SellCostUSD
  steel 90 0.95
$end
$STAT_CITY 1
$DATE_DAY 30
$DATE_YEAR 1990
$Economy_SellCostUSD
  steel 999 0.95
$end
`;
  const recs = parseStatsIni(text);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].year, 2001);
  assert.equal(recs[0].day, 113);
  assert.equal(recs[0].sellUSD.steel, 90);
});

test('current snapshot is a separate newest global price record', () => {
  const text = `$STAT_RECORD 0
$DATE_DAY 100
$DATE_YEAR 2001
$Economy_PurchaseCostUSD
  steel 100 1.05
$end
$STAT_CURRENT
$DATE_DAY 103
$DATE_YEAR 2001
$Citizens_AverageProductivity 0.939362
$Economy_PurchaseCostUSD
  steel 110 1.05
$end
`;
  const recs = parseStatsIni(text);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].purchaseUSD.steel, 100);
  assert.equal(recs[1].purchaseUSD.steel, 110);
  assert.equal(recs[1].day, 103);
  assert.equal(recs[1].current, true);
  assert.equal(recs[1].averageProductivity, 0.939362);
});

test('parses republic resource and citizen history but excludes city blocks', () => {
  const text = `$STAT_RECORD 0
$DATE_DAY 100
$DATE_YEAR 2000
$Resources_Produced
  steel 12.5 0
$end
$Resources_ImportRUB
  fuel 8 0
$end
$Resources_ExportRUB
  clothes 3 0
$end
$Resources_SpendConstructions
  steel 4.5 0
$end
$Resources_SpendVehicles
  fuel 6.25 0
$end
$Waste_ProductionDemolition
  waste_mixed 7.75 0
  waste_mixed -1 -12.5
$end
$Citizens_Adults 1200
$Citizens_Unemployed 40
$Citizens_Born 8
$Citizens_Dead 2
$Citizens_Escaped 3
$Citizens_ImigrantSoviet 12
$Citizens_ImigrantAfrica 7
$Citizens_SmallChilds 2144
$Citizens_MediumChilds 3374
$Citizens_NoEducation 3079
$Citizens_BasicEducationNum 12338
$Citizens_HighEducationNum 4393
$Citizens_AverageProductivity 0.91
$STAT_CITY 4
$DATE_YEAR 1965
$Resources_Produced
  steel 999 0
$end`;
  const [record] = parseStatsIni(text);
  assert.equal(record.resourcesProduced.steel, 12.5);
  assert.equal(record.resourcesImportRUB.fuel, 8);
  assert.equal(record.resourcesExportRUB.clothes, 3);
  assert.equal(record.resourcesSpendConstructions.steel, 4.5);
  assert.equal(record.resourcesSpendVehicles.fuel, 6.25);
  assert.equal(record.wasteProductionDemolition.waste_mixed, 7.75);
  assert.equal(record.adults, 1200);
  assert.equal(record.unemployed, 40);
  assert.equal(record.born, 8);
  assert.equal(record.dead, 2);
  assert.equal(record.escaped, 3);
  assert.equal(record.immigrantsSoviet, 12);
  assert.equal(record.immigrantsAfrica, 7);
  assert.equal(record.childrenSmall, 2144);
  assert.equal(record.childrenMedium, 3374);
  assert.equal(record.educationNone, 3079);
  assert.equal(record.educationBasic, 12338);
  assert.equal(record.educationHigh, 4393);
  assert.deepEqual(resourceHistoryKeys([record]).sort(), ['clothes', 'fuel', 'steel', 'waste_mixed']);
  assert.equal(record.averageProductivity, 0.91);
  assert.equal(record.year, 2000);
});

test('parses settlement crime counters without treating them as republic prices', () => {
  const records = parseCityStatsIni(`$STAT_CITY 24
$DATE_DAY 53
$DATE_YEAR 1960
$Citizens_Born 12
Crime_Executed_0 18
Crime_Executed_1 4
Crime_Executed_2 2
Crime_Error_NoPolice 3
Crime_Error_NotInvestigated 1
Crime_Error_NotCourt 5
Crime_Prisoners_Escaped 2
$STAT_CITY 25
$DATE_YEAR 1960
Crime_Executed_0 1
`);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    scopeId: 24, day: 53, year: 1960, born: 12,
    minorCrimes: 18, mediumCrimes: 4, seriousCrimes: 2,
    withoutPolice: 3, notInvestigated: 1, withoutCourt: 5, prisonersEscaped: 2,
    recordedCrimes: 24, unresolvedCrimes: 9,
  });
  assert.equal(records[1].scopeId, 25);
  assert.equal(records[1].recordedCrimes, 1);
});
