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

test('records without price data are dropped', () => {
  const recs = parseStatsIni('$STAT_RECORD 0\n$DATE_YEAR 1980\n$Citizens_Born 5\n');
  assert.equal(recs.length, 0);
});

test('city statistics after global records do not overwrite global prices or date', () => {
  const text = `$STAT_RECORD 0
$DATE_DAY 113
$DATE_YEAR 2001
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
});
