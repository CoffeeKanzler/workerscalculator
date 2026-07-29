# Residence Map Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the map-wide staffing mode and add a compact, exact resident and criminality ledger to residential building inspectors.

**Architecture:** Aggregate anonymous citizen records once during save projection and persist only a per-residence summary in `saveImport` metadata. Join summaries to the standalone Leaflet building model by exact building index; keep presentation in the existing inspector and keep compact SVG maps unchanged.

**Tech Stack:** Vanilla JavaScript ES modules, Node `node:test`, Leaflet 1.9.4 already vendored locally, Playwright installed outside the repository.

## Global Constraints

- All save parsing, aggregation, persistence, and rendering stays client-side; no save fact may be transmitted.
- No package-manager dependency, bundler, transpiler, CDN, or build step may be introduced.
- Changed module imports must receive updated `?v=N` cache markers.
- English and German translation tables must remain key-identical.
- Comments explain the concrete failure or ambiguity that required the code.
- Complete player saves in scope contain `workers.bin`; a linked-resident count of zero is an exact zero.
- Unavailable capacity or individual measurements render as `—`; they do not become zero.
- Compact embedded maps remain SVG.
- Preserve unrelated `data/workshop/index.json` work and stage exact paths only.

---

### Task 1: Aggregate exact residence facts during save projection

**Files:**
- Modify: `js/save_model.js:78-131`
- Modify: `js/adapters/save_projection.js:1-25, 546-602`
- Test: `tests/save_model.test.mjs:427-499`
- Test: `tests/save_folder_adapter.test.mjs:200-235`
- Test: `tests/planning_persistence.test.mjs:83-114`

**Interfaces:**
- Produces: `criminalityThreshold(citizens, options?) -> number | null`
- Produces: `summarizeResidenceDetails(citizens, buildings, options?) -> { threshold, buildings }`
- Produces metadata: `saveImport.residenceDetails`
- Consumes later: Task 3 joins `residenceDetails.buildings` by `buildingIndex`.

- [ ] **Step 1: Write failing aggregation tests**

Add imports for `criminalityThreshold` and `summarizeResidenceDetails`, then add:

```js
test('residence details aggregate exact demographics wellbeing and crime', () => {
  const citizens = [
    {
      residenceBuildingIndex: 4, age: 35, education: 2,
      health: 0.8, happiness: 0.7, loyalty: 0.6, criminality: 0.02,
    },
    {
      residenceBuildingIndex: 4, age: 12, education: 0.5,
      health: 1, happiness: 0.9, loyalty: 0.4, criminality: 0.3,
    },
    {
      residenceBuildingIndex: 5, age: 44, education: 1,
      health: Number.NaN, happiness: 0.5, loyalty: 0.2, criminality: 0.01,
    },
  ];
  const result = summarizeResidenceDetails(citizens, [
    { index: 4, type: 'flat' }, { index: 5, type: 'flat' },
  ]);

  assert.equal(result.threshold, 0.55);
  assert.deepEqual(result.buildings[0], {
    buildingIndex: 4,
    residents: 2,
    adults: 1,
    children: 1,
    higherEducation: 1,
    health: 0.9,
    happiness: 0.8,
    loyalty: 0.5,
    criminality: 0.16,
    highestCriminality: 0.3,
    highRiskResidents: 0,
  });
  assert.equal(result.buildings[1].health, null);
});

test('residence crime uses the same threshold as republic outliers', () => {
  const citizens = [
    ...Array.from({ length: 9 }, () => ({
      residenceBuildingIndex: 4, criminality: 0,
    })),
    { residenceBuildingIndex: 4, criminality: 0.6 },
  ];
  const threshold = criminalityThreshold(citizens);
  assert.equal(summarizeCriminalityOutliers(citizens, [{ index: 4 }]).threshold, threshold);
  assert.equal(summarizeResidenceDetails(citizens, [{ index: 4 }]).threshold, threshold);
  assert.equal(summarizeResidenceDetails(citizens, [{ index: 4 }]).buildings[0]
    .highRiskResidents, 1);
});
```

Use a separate low-average fixture to assert the 10% absolute floor and a
fixture with missing health/loyalty values to assert that averages use only
finite measurements.

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
node --test tests/save_model.test.mjs
```

Expected: FAIL because `criminalityThreshold` and
`summarizeResidenceDetails` are not exported.

- [ ] **Step 3: Implement the shared threshold and residence aggregation**

In `js/save_model.js`, extract the existing threshold calculation:

```js
export function criminalityThreshold(citizens, {
  multiplier = 5, minAbsolute = 0.1,
} = {}) {
  const measured = (citizens ?? [])
    .map(citizen => citizen.criminality)
    .filter(Number.isFinite);
  if (!measured.length) return null;
  const averageCriminality = measured.reduce((sum, value) => sum + value, 0)
    / measured.length;
  return Math.max(minAbsolute, averageCriminality * multiplier);
}
```

Make `summarizeCriminalityOutliers` consume this function while retaining its
existing `averageCriminality`, counts, sort, and limit.

Add `summarizeResidenceDetails`. Group only valid exact residence references.
For each measurement field, track a sum and finite-value count separately.
Return `null` when a field has no finite values. Count adults with `age > 21`,
children with finite `age <= 21`, and higher education with `education >= 2`.
Count criminality values greater than or equal to the shared threshold.

The public return shape is:

```js
{
  threshold: number | null,
  buildings: [{
    buildingIndex: number,
    residents: number,
    adults: number,
    children: number,
    higherEducation: number,
    health: number | null,
    happiness: number | null,
    loyalty: number | null,
    criminality: number | null,
    highestCriminality: number | null,
    highRiskResidents: number,
  }],
}
```

Sort `buildings` by `buildingIndex` for deterministic snapshots.

- [ ] **Step 4: Integrate the aggregate into save metadata**

Import `summarizeResidenceDetails` in
`js/adapters/save_projection.js`. Beside `criminalityOutliers`, compute:

```js
const residenceDetails = citizens
  ? summarizeResidenceDetails(citizens, buildings)
  : null;
```

Add `residenceDetails` next to `residenceOccupancy` in returned metadata.
Do not add raw citizens to metadata.

Extend the save-folder adapter test fixture with two citizens sharing building
`41` and assert:

```js
assert.equal(result.planning.metadata.residenceDetails.buildings[0].buildingIndex, 41);
assert.equal(result.planning.metadata.residenceDetails.buildings[0].residents, 2);
assert.equal('citizens' in result.planning.metadata, false);
```

Extend the existing “reload restores the imported save” persistence fixture
with:

```js
residenceDetails: {
  threshold: 0.1,
  buildings: [{ buildingIndex: 7, residents: 12 }],
},
```

After reload, assert:

```js
assert.deepEqual(reloaded.state.saveImport.residenceDetails, {
  threshold: 0.1,
  buildings: [{ buildingIndex: 7, residents: 12 }],
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/save_model.test.mjs tests/save_folder_adapter.test.mjs \
  tests/planning_persistence.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the projection boundary**

```bash
git add js/save_model.js js/adapters/save_projection.js \
  tests/save_model.test.mjs tests/save_folder_adapter.test.mjs \
  tests/planning_persistence.test.mjs
git commit -m "feat: aggregate residence facts from saves"
```

---

### Task 2: Remove staffing as a map-wide metric

**Files:**
- Modify: `js/ui/republic_map.js:1-30`
- Modify: `js/ui/leaflet_republic_map.js:32-52`
- Modify: `js/app.js:2877-2927`
- Modify: `js/i18n.js`
- Test: `tests/republic_map.test.mjs`
- Test: `tests/planning_model.test.mjs`

**Interfaces:**
- Produces: `normalizeMapMetric(mode) -> 'category' | 'construction'`
- Preserves: workplace inspector staffing from `buildingEstablishment`.
- Consumes: existing persisted `state.mapMetric`, including legacy
  `'staffing'` values.

- [ ] **Step 1: Write failing normalization and supported-mode tests**

In `tests/republic_map.test.mjs`:

```js
test('the focused map supports category and construction only', () => {
  assert.equal(normalizeMapMetric('category'), 'category');
  assert.equal(normalizeMapMetric('construction'), 'construction');
  assert.equal(normalizeMapMetric('staffing'), 'category');
  assert.equal(normalizeMapMetric('anything-else'), 'category');
});
```

Replace the staffing-band test with assertions that category and construction
metrics still produce their existing exact bands.

In `tests/planning_model.test.mjs`, create a model with
`mapMetric: 'staffing'` and assert that the UI boundary normalization result is
`category`; do not rewrite persisted state in storage migrations.

- [ ] **Step 2: Run the focused tests and verify the red state**

Run:

```bash
node --test tests/republic_map.test.mjs tests/planning_model.test.mjs
```

Expected: FAIL because `normalizeMapMetric` does not exist.

- [ ] **Step 3: Implement the two-mode boundary**

In `js/ui/republic_map.js`:

```js
export function normalizeMapMetric(mode) {
  return mode === 'construction' ? 'construction' : 'category';
}
```

Remove the staffing branch from `buildingMapMetric`. In
`leaflet_republic_map.js`, remove the staffing colors from `metricStyle`.

In `app.js`, normalize once before creating buttons or mounting Leaflet:

```js
const mapMetric = normalizeMapMetric(state.mapMetric);
if (state.mapMetric !== mapMetric) state.mapMetric = mapMetric;
```

Build mode buttons from only:

```js
[
  ['category', 'mapMetricCategory'],
  ['construction', 'mapMetricConstruction'],
]
```

Remove staffing entries from `renderMetricKey`. Keep the workplace inspector's
`staffing` key/value row unchanged.

- [ ] **Step 4: Remove map-only staffing translations**

Delete the now-unused English/German keys:

- `mapMetricStaffing`
- `mapScaleNoWorkers`
- `mapScaleStaffingLow`
- `mapScaleStaffingMedium`
- `mapScaleStaffingFull`
- `mapScaleNoPositions`

Do not delete the general `staffing` translation used in inspector facts and
viewport totals.

- [ ] **Step 5: Run focused tests and translation coverage**

Run:

```bash
node --test tests/republic_map.test.mjs tests/planning_model.test.mjs tests/i18n.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the calmer map hierarchy**

```bash
git add js/ui/republic_map.js js/ui/leaflet_republic_map.js js/app.js \
  js/i18n.js tests/republic_map.test.mjs tests/planning_model.test.mjs
git commit -m "feat: focus the map on category and construction"
```

---

### Task 3: Render the compact residence ledger

**Files:**
- Modify: `js/ui/republic_map.js`
- Modify: `js/app.js:2729-2825`
- Modify: `js/i18n.js`
- Modify: `css/style.css`
- Test: `tests/republic_map.test.mjs`

**Interfaces:**
- Consumes: `state.saveImport.residenceDetails.buildings` from Task 1.
- Produces: `residenceDetailForBuilding(building, summaries, options)`.
- Produces DOM contract: `[data-residence-ledger]` in residential inspectors.

- [ ] **Step 1: Write failing join tests**

Add to `tests/republic_map.test.mjs`:

```js
test('residence details join by exact building index and retain exact zero', () => {
  const summaries = [{
    buildingIndex: 7, residents: 12, adults: 8, children: 4,
    higherEducation: 3, health: 0.8, happiness: 0.7, loyalty: 0.6,
    criminality: 0.02, highestCriminality: 0.12, highRiskResidents: 1,
  }];
  assert.deepEqual(residenceDetailForBuilding(
    { index: 7 }, summaries, { residential: true, capacity: 20 },
  ), { ...summaries[0], capacity: 20 });
  assert.deepEqual(residenceDetailForBuilding(
    { index: 8 }, summaries, { residential: true, capacity: 40 },
  ), {
    buildingIndex: 8, residents: 0, adults: 0, children: 0,
    higherEducation: 0, health: null, happiness: null, loyalty: null,
    criminality: null, highestCriminality: null, highRiskResidents: 0,
    capacity: 40,
  });
  assert.equal(residenceDetailForBuilding(
    { index: 9 }, summaries, { residential: false, capacity: null },
  ), null);
});
```

- [ ] **Step 2: Run the join test and verify the red state**

Run:

```bash
node --test tests/republic_map.test.mjs
```

Expected: FAIL because `residenceDetailForBuilding` is not exported.

- [ ] **Step 3: Implement the pure join**

Add the function to `js/ui/republic_map.js`. An exact summary wins even when
catalog classification is unresolved. A catalog-classified residence without
a summary receives the zero object above. All other buildings return `null`.
Capacity is finite and non-negative or `null`.

- [ ] **Step 4: Join catalog capacity and summaries in the standalone map**

In `app.js`, build:

```js
const residenceDetails = new Map(
  (state.saveImport?.residenceDetails?.buildings ?? [])
    .map(detail => [detail.buildingIndex, detail]),
);
```

Resolve each building's catalog entry once using the existing
`matchSaveBuilding` call. Pass to `residenceDetailForBuilding`:

```js
{
  residential: category === 'living',
  capacity: Number.isFinite(catalog?.livingSpace) ? catalog.livingSpace : null,
}
```

Attach the result as `building.residenceDetail`. Reuse the catalog object for
the localized display name rather than performing a second match.

- [ ] **Step 5: Render the residence ledger**

Extend `renderMapBuildingInspector` after status/staffing and before
coordinates. When `building.residenceDetail` exists, append:

```js
el('section', { class: 'map-residence-ledger', 'data-residence-ledger': '' },
  el('h4', {}, t('residenceLedger')),
  kv(t('occupancy'), capacity == null
    ? fmt(residents, 0)
    : `${fmt(residents, 0)} / ${fmt(capacity, 0)}`),
  kv(t('residentComposition'),
    `${fmt(adults, 0)} ${t('adults')} · ${fmt(children, 0)} ${t('children')} · `
      + `${fmt(higherEducation, 0)} ${t('higherEducationShort')}`),
  kv(t('residentWellbeing'),
    `${percentOrDash(health)} ${t('health')} · `
      + `${percentOrDash(happiness)} ${t('happiness')} · `
      + `${percentOrDash(loyalty)} ${t('loyalty')}`),
  kv(t('residentCriminality'),
    `${t('averageShort')} ${percentOrDash(criminality)} · `
      + `${t('highest')} ${percentOrDash(highestCriminality)} · `
      + `${fmt(highRiskResidents, 0)} ${t('highRiskResidents')}`));
```

Implement `percentOrDash` locally so non-finite values render `—`.
Use existing `fmt`; do not add bars or gauges.

Add concise English/German translations for:

- `residenceLedger`
- `occupancy`
- `residentComposition`
- `residentWellbeing`
- `residentCriminality`
- `higherEducationShort`
- `averageShort`
- `highest`
- `highRiskResidents`

Reuse existing translations for adults, children, health, happiness, and
loyalty where present.

- [ ] **Step 6: Add restrained ledger styling**

In `css/style.css`, use the inspector's existing borders-only depth:

```css
.map-residence-ledger {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.map-residence-ledger h4 {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: .72rem;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.map-residence-ledger .kv {
  gap: 12px;
}
```

Adjust selectors to the actual `kv()` DOM classes after inspection; do not
introduce new surface colors, shadows, or radii.

- [ ] **Step 7: Run focused tests and the save-less browser smoke**

Run:

```bash
node --test tests/republic_map.test.mjs tests/i18n.test.mjs tests/theme.test.mjs
```

Then copy `tests/browser/smoke.mjs` to the external Playwright directory and
run:

```bash
node smoke.mjs http://localhost:8765/index.html
```

Expected: all tests pass and every tab renders.

- [ ] **Step 8: Bump cache markers and commit**

Run:

```bash
node tools/bump_cache_versions.mjs \
  js/ui/republic_map.js js/ui/leaflet_republic_map.js js/app.js js/i18n.js css/style.css
```

Stage every marker file reported by the tool plus the exact Task 3 files:

```bash
git add index.html js/app.js js/i18n.js css/style.css \
  js/ui/republic_map.js js/ui/leaflet_republic_map.js
git commit -m "feat: add residence ledgers to the republic map"
```

---

### Task 4: Exercise real residential inspectors and finish the branch

**Files:**
- Modify: `tests/browser/save_import.mjs:92-245`

**Interfaces:**
- Consumes DOM contract: `.map-data-legend [data-map-category="living"]`.
- Consumes DOM contract: `.map-building-inspector [data-residence-ledger]`.
- Preserves existing local-request, pan, zoom, layer, chart, and table checks.

- [ ] **Step 1: Add a deterministic residential-marker browser check**

Give each category legend button `data-map-category` in Task 3. In the real-save
harness, replace the staffing-mode block with:

```js
const metricLabels = await page.locator('.map-metric-toggle button').allTextContents();
check(!metricLabels.some(label => /Staffing|Besetzung/i.test(label)),
  'the removed staffing map mode is still visible', JSON.stringify(metricLabels));

for (const button of await page.locator('.map-data-legend button').all()) {
  const category = await button.getAttribute('data-map-category');
  const pressed = await button.getAttribute('aria-pressed');
  if (category !== 'living' && pressed === 'true') await button.click();
}
```

Disable border and outlier layers, fit the developed area, scan the painted
canvas, and use a real mouse click exactly as the existing harness does. Assert:

```js
const ledger = page.locator('.map-building-inspector [data-residence-ledger]');
check(await ledger.count() === 1, 'a residential marker opened no residence ledger');
const ledgerText = (await ledger.innerText()).trim();
check(/\d/.test(ledgerText) && /Residents|Bewohner/i.test(ledgerText),
  'the residence ledger contains no exact occupancy', ledgerText);
```

Capture `map-light-residence.png` and `map-dark-residence.png`.

- [ ] **Step 2: Run the harness against bigsavegame**

From the external Playwright directory:

```bash
cp /home/nexx/workers/tests/browser/save_import.mjs .
WORKERS_SCREENSHOT_DIR=/home/nexx/workers/private/residence-map-screenshots \
  node save_import.mjs "/home/nexx/workers/private/saves/bigsavegame" \
  http://localhost:8765/index.html
```

Expected: PASS. Inspect both residence screenshots for ledger clipping,
alignment, readable wrapping, exact occupancy, and retained workplace staffing.

- [ ] **Step 3: Run the harness against myCanyon**

```bash
WORKERS_SCREENSHOT_DIR=/home/nexx/workers/private/residence-map-screenshots \
  node save_import.mjs \
  "/home/nexx/workers/private/saves/14674 - myCanyon-20260720T070413Z-1-001/14674 - myCanyon" \
  http://localhost:8765/index.html
```

Expected: PASS. Inspect both screenshots; the 1.3 GB save must not add a
per-interaction citizen scan or visibly delay the inspector.

- [ ] **Step 4: Run the complete verification gate**

Run:

```bash
npm test
```

Expected: all tests pass with zero failures.

From the external Playwright directory run:

```bash
node chart_interactions.mjs http://localhost:8765/tests/time_series_chart.html
node analysis_virtualization.mjs http://localhost:8765/index.html
```

Expected: both browser contracts pass.

Verify the offline/dependency boundary:

```bash
test ! -f package-lock.json
test ! -d node_modules
git diff --check
```

- [ ] **Step 5: Commit real-save verification**

```bash
git add tests/browser/save_import.mjs
git commit -m "test: verify residence details against real saves"
```

- [ ] **Step 6: Confirm branch scope**

Run:

```bash
git status --short
git log --oneline main..HEAD
```

Expected: only the unrelated pre-existing `data/workshop/index.json` change
remains unstaged; the branch contains the design, projection, map hierarchy,
residence ledger, and real-save verification commits.
