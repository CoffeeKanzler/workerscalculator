import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatsIni, recordToPrices } from '../js/statsini.js';

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

test('parses records with prices, dates and scalars', () => {
  const recs = parseStatsIni(SAMPLE);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].year, 1979);
  assert.equal(recs[0].day, 100);
  assert.equal(recs[0].purchaseUSD.steel, 400);
  assert.equal(recs[0].purchaseUSD.coal, 16.9);
  assert.equal(recs[0].sellRUB.steel, 1700);
  assert.equal(recs[0].workdayCostRUB, 9);
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
$Citizens_Adults 1200
$Citizens_Unemployed 40
$Citizens_Born 8
$Citizens_Dead 2
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
  assert.equal(record.adults, 1200);
  assert.equal(record.unemployed, 40);
  assert.equal(record.born, 8);
  assert.equal(record.dead, 2);
  assert.equal(record.averageProductivity, 0.91);
  assert.equal(record.year, 2000);
});
