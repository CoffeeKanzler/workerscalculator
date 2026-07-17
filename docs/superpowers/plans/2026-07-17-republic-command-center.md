# Republic Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic Republic Overview with the approved Actual/Plan/Difference command center, real historical charts, actionable area diagnostics, and planner drill-down.

**Architecture:** Pure republic projections live in `js/republic.js`, historical parsing/series preparation in `js/statsini.js` and `js/timeseries.js`, and DOM rendering in `js/app.js`. The dashboard reads the schema-v2 observed snapshot produced by the preceding foundation plan and never treats current-only save facts as history.

**Tech Stack:** Browser ES modules, SVG, existing calculation modules, Node test runner, responsive CSS, GitHub Pages.

---

### Task 1: Parse semantic republic history

**Files:**
- Modify: `js/statsini.js`
- Modify: `tests/statsini.test.mjs`

- [ ] **Step 1: Add a representative semantic-history fixture**

Extend the fixture with produced/imported/exported resources and citizen fields:

```js
const SEMANTIC = `$STAT_RECORD 0
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

const [record] = parseStatsIni(SEMANTIC);
assert.equal(record.resourcesProduced.steel, 12.5);
assert.equal(record.resourcesImportRUB.fuel, 8);
assert.equal(record.resourcesExportRUB.clothes, 3);
assert.equal(record.adults, 1200);
assert.equal(record.unemployed, 40);
assert.equal(record.averageProductivity, 0.91);
```

- [ ] **Step 2: Run the parser tests and verify missing semantic maps**

Run: `rtk node --test tests/statsini.test.mjs`

Expected: FAIL because `resourcesProduced` is undefined.

- [ ] **Step 3: Generalize tracked map sections**

Replace `PRICE_SECTIONS` with a `MAP_SECTIONS` table that preserves the existing
price keys and adds:

```js
Resources_Produced: 'resourcesProduced',
Resources_ImportUSD: 'resourcesImportUSD',
Resources_ImportRUB: 'resourcesImportRUB',
Resources_ExportUSD: 'resourcesExportUSD',
Resources_ExportRUB: 'resourcesExportRUB',
Resources_SpendFactories: 'resourcesSpendFactories',
Resources_SpendShops: 'resourcesSpendShops',
Waste_ProductionFactories: 'wasteProductionFactories',
Waste_ProductionPeople: 'wasteProductionPeople',
```

Initialize every map on every global record. Add scalar mappings for adults,
unemployed, births, deaths, escapes, small/medium children, adult parents,
education counts, average productivity, average age, and average lifespan.
Continue terminating global parsing at `$STAT_CITY`; city blocks must never
overwrite global series.

- [ ] **Step 4: Preserve price compatibility and run tests**

Keep `recordToPrices` reading the same six price maps and fallback scalars.

Run: `rtk node --test tests/statsini.test.mjs && rtk npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit semantic history**

```bash
rtk git add js/statsini.js tests/statsini.test.mjs
rtk git commit -m "Parse republic history metrics"
```

### Task 2: Downsample charts without losing endpoints or spikes

**Files:**
- Create: `js/timeseries.js`
- Create: `tests/timeseries.test.mjs`

- [ ] **Step 1: Test range filtering and min/max bucket retention**

```js
test('downsampling preserves first last minimum and maximum', () => {
  const points = Array.from({ length: 1000 }, (_, x) => ({ x, y: x === 501 ? 9000 : Math.sin(x) }));
  const sampled = downsampleMinMax(points, 80);
  assert.deepEqual(sampled[0], points[0]);
  assert.deepEqual(sampled.at(-1), points.at(-1));
  assert.ok(sampled.some(point => point.x === 501));
  assert.ok(sampled.length <= 80);
});
```

Also test `recordDateKey({year: 2001, day: 116}) === 2001 * 366 + 116`
and `filterRange(records, 'year')` keeps the latest 366-day window.

- [ ] **Step 2: Run tests and verify the module is missing**

Run: `rtk node --test tests/timeseries.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement deterministic min/max bucketing**

Export `recordDateKey`, `filterRange`, `seriesFromRecords`, and
`downsampleMinMax`. `downsampleMinMax` reserves first/last, divides the interior
into `floor((limit - 2) / 2)` buckets, retains each bucket's minimum and maximum
in original order, and trims only duplicate points.

- [ ] **Step 4: Run tests and commit**

Run: `rtk node --test tests/timeseries.test.mjs`

Expected: PASS.

```bash
rtk git add js/timeseries.js tests/timeseries.test.mjs
rtk git commit -m "Prepare truthful historical chart series"
```

### Task 3: Project Actual, Plan, and Difference through one model

**Files:**
- Create: `js/republic.js`
- Create: `tests/republic.test.mjs`

- [ ] **Step 1: Write projection tests**

Use one observed scope with 1,000 residents, 100 configured factory workers,
70 current workers, health `0.82`, and a plan with 120 workers. Assert Actual
uses saved residents/configuration, Plan uses evaluated plan values, and
Difference is `plan - actual` with `null` for incomparable historical output:

```js
const model = buildRepublicModel({ observed, planned });
assert.equal(model.actual.totals.population, 1000);
assert.equal(model.actual.totals.configuredIndustryWorkers, 100);
assert.equal(model.actual.totals.currentIndustryWorkers, 70);
assert.equal(model.plan.totals.configuredIndustryWorkers, 120);
assert.equal(model.difference.totals.configuredIndustryWorkers, 20);
assert.equal(model.difference.totals.realizedProduction, null);
```

- [ ] **Step 2: Run tests and verify the missing module failure**

Run: `rtk node --test tests/republic.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement evidence-aware projections**

Export `buildRepublicModel({ observed, planned })`. Return:

```js
{
  actual: { totals, areas, evidence },
  plan: { totals, areas, evidence },
  difference: { totals, areas, evidence },
}
```

Area identity is always saved `scopeId`. Actual population/status comes from
citizen aggregates; actual configured/current workers and mine quality come
from observed buildings; plan production/utilities/workers come from existing
`evaluateCity`/`evaluatePlan` results supplied by the caller. Difference is
defined only for like-for-like configured/planned quantities. Realized history
and current-only status fields return `null` differences rather than a fake zero.

- [ ] **Step 4: Add deterministic attention rules**

Export `republicAlerts(model)` with these initial rules:

- current/configured staffing below 70%: warning, below 40%: critical;
- health below 0.75: warning, below 0.60: critical;
- food below 0.90: warning;
- plan net workers below zero: critical;
- missing required source: coverage warning, not an operational failure.

Sort critical before warning, then by scope name. Every alert includes
`{ severity, scopeId, metric, observed, threshold, evidence }`.

- [ ] **Step 5: Run tests and commit**

Run: `rtk node --test tests/republic.test.mjs && rtk npm test`

Expected: all tests pass.

```bash
rtk git add js/republic.js tests/republic.test.mjs
rtk git commit -m "Model republic actual plan and difference"
```

### Task 4: Build the command-center shell

**Files:**
- Modify: `js/app.js:1575-1732`
- Modify: `js/i18n.js`
- Modify: `css/style.css`

- [ ] **Step 1: Add persistent dashboard controls**

Add `republicView: 'actual'` and `republicRange: 'all'` to initial/shared state.
At the top of Republic Overview render save identity/date, Actual/Plan/Difference
segmented buttons, Month/Year/All range buttons, and coverage badges. Manual
plans without an observed import default to Plan and disable Actual/Difference.

- [ ] **Step 2: Render headline cards**

Render cards for population, occupied named areas, live buildings, configured
industry workers, current staffing ratio, average productivity, and research
completion. Each card receives an evidence badge: exact save field,
stats history, derived calculation, editable plan, or unavailable.

- [ ] **Step 3: Render actionable alerts and area table**

Show the first eight sorted `republicAlerts`. Area rows contain area type,
residents, productivity, health, configured/current industry workers, planned
workers, production-building count, and severity. Production-only scopes remain
visible; empty generated scopes remain absent.

- [ ] **Step 4: Preserve the existing chain and utility information**

Move existing city/chain pairing and utility totals into collapsible “Planning
details” panels under the command-center cards. Do not remove existing planning
capability while changing the overview hierarchy.

- [ ] **Step 5: Add bilingual labels and responsive styling**

Add German/English strings for all controls, cards, alerts, evidence labels,
range labels, and unavailable states. Add `.command-center`, `.metric-grid`,
`.metric-card`, `.view-toggle`, `.alert-list`, and `.area-health` styles. Below
700 px, metric cards use one column and the area table remains horizontally
scrollable with a sticky first column.

- [ ] **Step 6: Run syntax/tests and commit**

Run: `rtk node --check js/app.js && rtk npm test`

Expected: syntax succeeds and all tests pass.

```bash
rtk git add js/app.js js/i18n.js css/style.css
rtk git commit -m "Build republic command center shell"
```

### Task 5: Add real historical charts

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`

- [ ] **Step 1: Add a reusable SVG line-chart renderer**

Implement `renderLineChart({ title, series, valueFormatter, evidence })` in
`app.js`. It uses `filterRange`, `seriesFromRecords`, and `downsampleMinMax`,
scales finite values into a `viewBox="0 0 640 180"`, renders axes and one path
per series, and shows first/last values plus an SVG `<title>` for each sampled
point. Empty series render the translated unavailable state.

- [ ] **Step 2: Render the first four useful chart groups**

Add:

1. adults, children, and unemployment;
2. average productivity;
3. total RUB imports versus exports;
4. selected resource produced/imported/exported.

The resource selector uses known resources found in history and defaults to the
largest latest produced resource. Labels say “Republic-wide stats.ini history”.

- [ ] **Step 3: Keep price history independent**

Do not modify the existing Prices tab chart or current price-record selector.
The command center reads semantic maps from the same compact global records but
owns its range/resource controls.

- [ ] **Step 4: Verify known sample endpoints**

With `/home/nexx/bigsavegame/stats.ini`, verify the newest chart label is
`2001 / day 116`, newest average productivity is `93.9362%`, and no `$STAT_CITY`
date appears as the republic endpoint.

- [ ] **Step 5: Commit charts**

```bash
rtk git add js/app.js css/style.css
rtk git commit -m "Add real republic history charts"
```

### Task 6: Connect area drill-down to existing planners

**Files:**
- Modify: `js/app.js:650-735, 1393-1570, 1635-1657`

- [ ] **Step 1: Add explicit drill-down actions**

Area name and production metrics receive buttons:

```js
function openArea(scopeId, tab) {
  if (tab === 'production') state.productionScope = String(scopeId);
  if (tab === 'city') {
    const index = state.cities.findIndex(city => city.scopeId === scopeId);
    if (index >= 0) state.activeCity = index;
  }
  state.tab = tab;
  update();
}
```

Show City only when `scope.city` is true and Production only when
`scope.production` is true.

- [ ] **Step 2: Keep Actual and Plan visually distinct in planners**

City Planner shows its observed citizen card above editable plan rows.
Production Planner shows observed instance/configuration sublines but calculates
from editable plan rows. Add a “Return to Republic Overview” button preserving
the selected scope.

- [ ] **Step 3: Verify mixed and production-only scopes**

On the supplied save, open one of the five residential scopes into City Planner,
open scope 19 into Production Planner, and confirm back navigation returns to
the same area without changing plan data.

- [ ] **Step 4: Commit drill-down**

```bash
rtk git add js/app.js
rtk git commit -m "Connect republic areas to planners"
```

### Task 7: Surface research and source coverage

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`

- [ ] **Step 1: Render current research progress**

Add a Research card showing `86 / 107` complete for the supplied save and a
details table for incomplete entries sorted with partial progress first. Display
key, percent, and assigned building index when present. This augments rather
than replaces the existing LowTech planning calculator.

- [ ] **Step 2: Render source coverage honestly**

Coverage lists each supported file as exact, partial, missing, or failed. It
does not claim a percentage of the whole simulation. Missing `workers.bin`
removes city status metrics but leaves building/planning facts usable; missing
research/header only removes their respective cards.

- [ ] **Step 3: Commit research and coverage UI**

Run: `rtk node --check js/app.js && rtk npm test`

Expected: syntax and all tests pass.

```bash
rtk git add js/app.js css/style.css
rtk git commit -m "Show research and save source coverage"
```

### Task 8: Verify and deploy the command center

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/superpowers/plans/2026-07-17-republic-command-center.md`

- [ ] **Step 1: Run complete automated verification**

```bash
rtk npm test
rtk node --check js/republic.js
rtk node --check js/timeseries.js
rtk node --check js/statsini.js
rtk node --check js/app.js
rtk git diff --check
```

Expected: zero failures and zero whitespace errors.

- [ ] **Step 2: Run desktop and mobile browser verification**

Serve on `0.0.0.0:4173`. In Chromium at desktop width and 390 px width, verify
root remains stable, `/beta/` imports the supplied folder, all three Republic
views render, range controls update charts, alerts link to the correct planners,
and the console contains no errors.

- [ ] **Step 3: Verify evidence invariants**

Confirm:

- current staffing changes only Actual diagnostics;
- configured-cap edits change Plan and Difference;
- stats history remains identical when plan assumptions change;
- city productivity is labelled derived;
- no per-city historical chart is present;
- unmatched buildings remain in coverage/audit totals.

- [ ] **Step 4: Update the roadmap and commit**

Mark the command-center foundation and real history charts complete. List
inventory bottlenecks, vehicles/lines, and logistics as the next independent
full-save modules.

```bash
rtk git add ROADMAP.md docs/superpowers/plans/2026-07-17-republic-command-center.md
rtk git commit -m "Document republic command center delivery"
rtk git push origin main
```

- [ ] **Step 5: Verify deployed `/beta/`**

Open `https://coffeekanzler.github.io/workerscalculator/beta/`, confirm the
deployed commit, import the save, exercise Actual/Plan/Difference and a planner
drill-down, and record the successful browser/console result in the plan.
