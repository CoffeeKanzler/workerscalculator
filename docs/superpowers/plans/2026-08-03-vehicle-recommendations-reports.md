# Vehicle recommendation report improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the unnamed Russo-Balt D24/40 variants to the public vehicle-production planner and add an availability-overlap decade filter to its best-vehicle recommendations.

**Architecture:** Keep the D24/40 identity fix in `js/train.js`, where raw game vehicles become the public merged vehicle pool. Keep decade-overlap logic in `js/calc.js`, where recommendation calculations already live, and keep state, selectors, translations, and empty-state rendering in `js/app.js`/`js/i18n.js`. The existing exact game recipe and cargo metadata paths remain the single source for D24/40 materials.

**Tech Stack:** Vanilla ES modules, static JSON data, Node's built-in `node:test`, Playwright browser checks, and the repository's cache-marker script.

## Global Constraints

- Website scope only: do not add private research files, private runtime artifacts, Workshop data, or private code.
- Add explicit aliases only for the 12 unnamed Russo-Balt D24/40 IDs; do not invent generic names for every unnamed raw vehicle.
- Preserve each D24/40 raw `id`, game-derived recipe, cargo/service type, and `Von`/`Bis` availability.
- A decade matches when `vehicle.Von <= decadeEnd && vehicle.Bis >= decadeStart`; bounds are inclusive and missing bounds are open-ended.
- The decade selector starts at 1900 and filters only the recommendation table, not existing production-plan rows.
- Keep the existing profit, sale-price, blueprint, and recycling formulas unchanged.
- Add German and English UI strings for every new visible label.
- Use `node tools/bump_cache_versions.mjs <changed-files>` after JavaScript changes so deployed module and shell markers stay current.
- Preserve the pre-existing untracked workspace files; stage only files belonging to this feature.

---

## File map

- Modify `js/train.js`: resolve explicit D24/40 display aliases before constructing game-only vehicle entries.
- Modify `tests/train.test.mjs`: verify the 12 aliases, exact IDs, recipes, and exclusion of unrelated unnamed raw entries.
- Modify `js/calc.js`: export the availability-overlap predicate and apply an optional range to recommendations.
- Modify `tests/calc.test.mjs`: verify inclusive decade boundaries, open-ended availability, and filtered ranking.
- Modify `js/app.js`: persist the selected decade, build decade options, pass the range to the calculation layer, render the selector, and render the empty state.
- Modify `js/i18n.js`: add German and English labels for the decade filter and no-results message.
- Modify `tests/release_ui_contract.test.mjs`: ensure the new visible contract has both-language strings and the vehicle UI hook.
- Create `tests/browser/vehicle_production.mjs`: exercise D24/40 selection, material display, decade filtering, and plan-row stability in a real browser.
- Modify `.github/workflows/tests.yml`: run the new browser check against the static site.
- Automatically update `index.html` and `data/VERSION.json` through `tools/bump_cache_versions.mjs` when JavaScript markers change.

## Task 1: Include the unnamed Russo-Balt D24/40 variants

**Files:**
- Modify: `tests/train.test.mjs:1-13, after the existing merge-pool tests`
- Modify: `js/train.js:116-246`

**Interfaces:**
- Consumes: raw entries from `data/game/vehicles_raw.json`, including IDs with no `de` or `en` name.
- Produces: `mergeVehiclePools()` entries with `name`, `sourceGameId`, `gameRecipe`, `gameOnly`, and existing cargo/provenance fields.

- [ ] **Step 1: Write the failing D24/40 merge test**

Add a set of the exact IDs and assert against the already-loaded `merged` fixture:

```js
const D24_40_IDS = new Set([
  'cement_russo_balt_d24_40',
  'covered_russo_balt_d24_40',
  'firetruck_russo_balt_d24_40',
  'garbage_russo_balt_d24_40',
  'gravel_russo_balt_d24_40',
  'oil_russo_balt_d24_40',
  'oil_russo_balt_d24_40_sewage',
  'oil_russo_balt_d24_40_water',
  'open_russo_balt_d24_40',
  'refrigerator_russo_balt_d24_40',
  'service_mixer_russo_balt_d24_40',
  'snowplow_russo_balt_d24_40',
]);

test('unnamed Russo-Balt D24/40 variants enter the public vehicle pool', () => {
  const variants = merged.filter(vehicle => D24_40_IDS.has(vehicle.sourceGameId));
  assert.equal(variants.length, D24_40_IDS.size);
  assert.equal(new Set(variants.map(vehicle => vehicle.name)).size, D24_40_IDS.size);
  for (const vehicle of variants) {
    assert.match(vehicle.name, /Russo-Balt D24\/40/);
    assert.equal(vehicle.gameOnly, true);
    assert.ok(Array.isArray(vehicle.gameRecipe));
    assert.equal(vehicle.provenance.productionCost, 'game-file');
    assert.equal(vehicle.attrs.Von, 1912);
    assert.equal(vehicle.attrs.Bis, 1924);
  }
});
```

Add a narrow regression test with one unrelated unnamed raw entry and assert
that it remains excluded:

```js
test('unrelated unnamed raw vehicles remain excluded', () => {
  const result = mergeVehiclePools([], [], [{
    id: 'internal_unnamed_vehicle', type: 'VEHICLETYPE_ROAD',
    emptyWeight: 2, powerKW: 20, from: 1900, to: 1910,
    roadRecipeBranch: 'ordinary',
  }]);
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test tests/train.test.mjs
```

Expected: the existing suite fails because the unnamed D24/40 raw entries are
currently skipped by the `!name` guard, while the unrelated unnamed-entry test
continues to describe the intended exclusion boundary.

- [ ] **Step 3: Add the explicit alias resolver**

In `js/train.js`, add a frozen ID-to-label map containing exactly these labels:

```js
const D24_40_DISPLAY_NAMES = Object.freeze({
  cement_russo_balt_d24_40: 'Russo-Balt D24/40 (cement)',
  covered_russo_balt_d24_40: 'Russo-Balt D24/40 (covered cargo)',
  firetruck_russo_balt_d24_40: 'Russo-Balt D24/40 (fire truck)',
  garbage_russo_balt_d24_40: 'Russo-Balt D24/40 (garbage)',
  gravel_russo_balt_d24_40: 'Russo-Balt D24/40 (gravel)',
  oil_russo_balt_d24_40: 'Russo-Balt D24/40 (cistern)',
  oil_russo_balt_d24_40_sewage: 'Russo-Balt D24/40 (sewage cistern)',
  oil_russo_balt_d24_40_water: 'Russo-Balt D24/40 (water cistern)',
  open_russo_balt_d24_40: 'Russo-Balt D24/40 (open cargo)',
  refrigerator_russo_balt_d24_40: 'Russo-Balt D24/40 (refrigerated)',
  service_mixer_russo_balt_d24_40: 'Russo-Balt D24/40 (concrete mixer)',
  snowplow_russo_balt_d24_40: 'Russo-Balt D24/40 (snowplow)',
});

function rawVehicleDisplayName(raw) {
  return raw.de || raw.en || D24_40_DISPLAY_NAMES[raw.id] || null;
}
```

Use `rawVehicleDisplayName(raw)` in the game-only loop and in
`gameOnlyVehicle()`. Keep the existing `raw.de`/`raw.en` lookup behavior for
matching sheet rows; the alias is only a fallback for the named game-only
entry path. The loop must continue to skip raw entries for which the resolver
returns `null`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
node --test tests/train.test.mjs
```

Expected: all train tests pass, including 12 named D24/40 entries with exact
game recipes and zero unrelated unnamed entries.

- [ ] **Step 5: Commit the vehicle-pool change**

Run:

```bash
node tools/bump_cache_versions.mjs js/train.js tests/train.test.mjs
git add js/train.js tests/train.test.mjs index.html data/VERSION.json
node tools/bump_cache_versions.mjs --check
git diff --cached --check
git commit -m "feat: include Russo-Balt D24/40 vehicle variants"
```

The cache script may update the app's import markers and `data/VERSION.json`;
include only those generated marker changes with this task.

## Task 2: Add tested decade-overlap filtering to recommendations

**Files:**
- Modify: `tests/calc.test.mjs:1-12, around the recommendation tests at 389-403`
- Modify: `js/calc.js:290-297`

**Interfaces:**
- Consumes: a vehicle with `attrs.Von` and `attrs.Bis`, plus an optional
  `{ start, end }` range.
- Produces: exported `vehicleAvailableInRange(vehicle, start, end)` and the
  backward-compatible signature
  `recommendVehicleProduction(vehicles, settings, eco, limit = 5, availabilityRange = null)`.

- [ ] **Step 1: Write failing predicate and recommendation tests**

Import `vehicleAvailableInRange` alongside the existing calculation exports and
add these cases:

```js
test('vehicle availability overlaps decade boundaries inclusively', () => {
  const vehicle = attrs => ({ attrs });
  assert.equal(vehicleAvailableInRange(vehicle({ Von: 1947, Bis: 1965 }), 1940, 1950), true);
  assert.equal(vehicleAvailableInRange(vehicle({ Von: 1947, Bis: 1965 }), 1950, 1960), true);
  assert.equal(vehicleAvailableInRange(vehicle({ Von: 1951, Bis: 1965 }), 1940, 1950), false);
  assert.equal(vehicleAvailableInRange(vehicle({ Von: 1947, Bis: 3000 }), 1990, 2000), true);
  assert.equal(vehicleAvailableInRange(vehicle({ Von: 1947 }), 1900, 1910), true);
});

test('vehicle recommendations apply an optional availability range before ranking', () => {
  const vehicles = [
    { name: '1947 model', attrs: { Von: 1947, Bis: 1965, Typ: 'Bus', Arbeitstage: 10, Stahl: 1 } },
    { name: '1951 model', attrs: { Von: 1951, Bis: 1965, Typ: 'Bus', Arbeitstage: 10, Stahl: 1 } },
  ];
  const fakeEco = { inputPrice: () => 1 };
  const rows = recommendVehicleProduction(
    vehicles,
    { workers: 100, productivity: 1, timeUnit: 'day', currency: 'RUB', salePrice: 100 },
    fakeEco,
    5,
    { start: 1940, end: 1950 },
  );
  assert.deepEqual(rows.map(row => row.vehicle.name), ['1947 model']);
});
```

- [ ] **Step 2: Run the focused calculation tests and confirm they fail**

Run:

```bash
node --test tests/calc.test.mjs
```

Expected: Node reports the missing `vehicleAvailableInRange` export and the
recommendation call does not yet apply the range.

- [ ] **Step 3: Implement the predicate and optional recommendation range**

Add this calculation-layer contract before `recommendVehicleProduction()`:

```js
export function vehicleAvailableInRange(vehicle, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  const from = Number.isFinite(vehicle?.attrs?.Von) ? vehicle.attrs.Von : -Infinity;
  const to = Number.isFinite(vehicle?.attrs?.Bis) && vehicle.attrs.Bis < 3000
    ? vehicle.attrs.Bis : Infinity;
  return from <= end && to >= start;
}
```

Extend `recommendVehicleProduction()` with the fifth parameter and filter the
mapped rows by `vehicleAvailableInRange()` before the existing profitable-row
filter, sort, and limit. Preserve the current four-argument behavior by
treating a missing or invalid range as no filter.

- [ ] **Step 4: Run all calculation tests and confirm they pass**

Run:

```bash
node --test tests/calc.test.mjs
```

Expected: the existing recommendation ranking remains unchanged and the new
inclusive overlap tests pass.

- [ ] **Step 5: Commit the calculation change**

Run:

```bash
node tools/bump_cache_versions.mjs js/calc.js tests/calc.test.mjs
git add js/calc.js tests/calc.test.mjs index.html data/VERSION.json
node tools/bump_cache_versions.mjs --check
git diff --cached --check
git commit -m "feat: filter vehicle recommendations by availability decade"
```

## Task 3: Add the public UI selector, translations, and empty state

**Files:**
- Modify: `js/app.js:1826-1987`
- Modify: `js/i18n.js:392-401, 923-932`
- Modify: `tests/release_ui_contract.test.mjs` in the existing shipped-UI contract tests

**Interfaces:**
- Consumes: `vehicleAvailableInRange()` behavior through
  `recommendVehicleProduction(..., availabilityRange)`.
- Produces: persisted `state.vehicleProduction.recommendationDecade`, a
  `.vehicle-recommendation-decade` selector, bilingual copy, and a visible
  no-results row.

- [ ] **Step 1: Add the failing UI-contract assertions**

Extend the existing `release_ui_contract.test.mjs` with a test that reads
`js/app.js` and `js/i18n.js` and asserts the new UI hook and both translations:

```js
test('vehicle recommendations expose a bilingual decade filter contract', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  assert.match(app, /vehicle-recommendation-decade/);
  assert.match(app, /recommendationDecade/);
  assert.match(app, /noVehicleRecommendations/);
  assert.equal((i18n.match(/recommendationDecade:/g) ?? []).length, 2);
  assert.equal((i18n.match(/allDecades:/g) ?? []).length, 2);
  assert.equal((i18n.match(/noVehicleRecommendations:/g) ?? []).length, 2);
});
```

- [ ] **Step 2: Run the contract test and confirm it fails**

Run:

```bash
node --test tests/release_ui_contract.test.mjs
```

Expected: the new test fails because the selector class and translation keys
do not yet exist.

- [ ] **Step 3: Add German and English translation keys**

Add the same three keys to both language objects near the existing vehicle
recommendation labels:

```js
// German
recommendationDecade: 'Verfügbare Jahrzehnte',
allDecades: 'Alle Jahrzehnte',
noVehicleRecommendations: 'Keine profitablen Fahrzeuge in diesem Zeitraum.',

// English
recommendationDecade: 'Available decades',
allDecades: 'All decades',
noVehicleRecommendations: 'No profitable vehicles are available in this period.',
```

- [ ] **Step 4: Add persisted decade state and dynamic decade options**

In `renderVehicleProduction()`, initialize:

```js
plan.recommendationDecade ??= 'all';
```

Build options from the `available` vehicles after recipe filtering. Ignore
finite `Bis` values at or above `3000` when choosing the final option; use the
decade containing the greatest remaining finite end year, with at least the
`1900–1910` option:

```js
const finiteEnds = available
  .map(({ vehicle }) => vehicle.attrs.Bis)
  .filter(year => Number.isFinite(year) && year < 3000);
const lastDecadeStart = Math.max(
  1900,
  finiteEnds.length ? Math.floor(Math.max(...finiteEnds) / 10) * 10 : 1900,
);
const recommendationDecades = [
  ['all', t('allDecades')],
  ...Array.from(
    { length: Math.floor((lastDecadeStart - 1900) / 10) + 1 },
    (_, index) => {
      const start = 1900 + index * 10;
      return [String(start), `${start}–${start + 10}`];
    },
  ),
];
const selectedDecade = plan.recommendationDecade === 'all'
  ? null
  : Number(plan.recommendationDecade);
const recommendationRange = Number.isFinite(selectedDecade)
  ? { start: selectedDecade, end: selectedDecade + 10 }
  : null;
```

Pass `recommendationRange` as the fifth argument to
`recommendVehicleProduction()`.

- [ ] **Step 5: Render the decade selector and recommendation empty state**

Place the new selector next to the existing vehicle-group selector and give it
the class required by the browser test:

```js
el('label', {}, t('recommendationDecade') + ' ', selectInput(
  recommendationDecades,
  plan.recommendationDecade,
  value => { plan.recommendationDecade = value; },
  { class: 'vehicle-recommendation-decade' },
))
```

When `recommendations` is empty, render one `<tr>` with `colSpan: 9` and the
`noVehicleRecommendations` hint. Otherwise retain the current recommendation
rows and `+` behavior exactly. Do not pass the range into the plan-row
calculation or change the plan-row vehicle selectors.

- [ ] **Step 6: Run the UI contract and calculation tests**

Run:

```bash
node --test tests/release_ui_contract.test.mjs tests/calc.test.mjs
```

Expected: all tests pass, including both-language coverage, the selector hook,
and the previously added recommendation-range tests.

- [ ] **Step 7: Refresh cache markers and commit the UI change**

Run:

```bash
node tools/bump_cache_versions.mjs js/app.js js/i18n.js tests/release_ui_contract.test.mjs
git add js/app.js js/i18n.js tests/release_ui_contract.test.mjs index.html data/VERSION.json
node tools/bump_cache_versions.mjs --check
git diff --cached --check
git commit -m "feat: add vehicle recommendation decade selector"
```

## Task 4: Verify the behavior in a real browser and CI smoke path

**Files:**
- Create: `tests/browser/vehicle_production.mjs`
- Modify: `.github/workflows/tests.yml` after the existing static-site browser checks

**Interfaces:**
- Consumes: the public static site at `BASE`, hash route `#/vehicleprod`, and
  the `.vehicle-recommendation-decade` hook from Task 3.
- Produces: a deterministic browser regression check that fails on render,
  selection, material-display, or state-isolation regressions.

- [ ] **Step 1: Write the browser regression script**

Create a Playwright script following the existing `tests/browser/*.mjs` style:

```js
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(`${BASE}#/vehicleprod`, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.waitForSelector('.vehicle-recommendation-decade', { timeout: 30_000 });

  const tables = page.locator('section table.data');
  if (await tables.count() < 2) throw new Error('vehicle production did not render both tables');
  const planTable = tables.nth(1);
  const typeSelect = planTable.locator('tbody tr').first().locator('select').nth(0);
  await typeSelect.selectOption({ label: 'LKW' });
  const vehicleSelect = planTable.locator('tbody tr').first().locator('select').nth(1);
  const d24Option = vehicleSelect.locator('option').filter({ hasText: 'Russo-Balt D24/40' }).first();
  const d24Value = await d24Option.getAttribute('value');
  if (!d24Value) throw new Error('D24/40 is missing from the LKW vehicle choices');
  await vehicleSelect.selectOption(d24Value);
  await page.waitForTimeout(150);

  const planTextBeforeFilter = await planTable.innerText();
  if (!/Russo-Balt D24\/40/.test(planTextBeforeFilter)) {
    throw new Error('the selected D24/40 row did not render');
  }
  if (!/Stahl|Steel/.test(planTextBeforeFilter)) {
    throw new Error('the selected D24/40 row did not render its material line');
  }

  const decade = page.locator('.vehicle-recommendation-decade');
  const decadeValues = await decade.locator('option').evaluateAll(options => options.map(option => option.value));
  if (!decadeValues.includes('all') || !decadeValues.includes('1900') || !decadeValues.includes('1940')) {
    throw new Error(`decade options are incomplete: ${decadeValues.join(', ')}`);
  }
  await decade.selectOption('1940');
  await page.waitForTimeout(150);
  if ((await planTable.innerText()) !== planTextBeforeFilter) {
    throw new Error('decade filtering changed the existing production-plan row');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: D24/40 material row and decade recommendation filter work in the browser');
} finally {
  await browser.close();
}
```

If the browser exposes the option text with a locale-specific material name,
retain the same assertion using the existing German/English resource labels;
do not weaken the check to only verify a non-empty row.

- [ ] **Step 2: Run the browser check locally**

Start the static server and run the new script:

```bash
python3 -m http.server 8765 >/tmp/workerscalculator-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
node tests/browser/vehicle_production.mjs http://localhost:8765/index.html
```

Expected: the script prints the `ok:` line and exits zero with no page or
console errors.

- [ ] **Step 3: Add the browser check to CI**

In `.github/workflows/tests.yml`, add this command after the existing
`analysis_virtualization.mjs` command in the same server-backed browser step:

```yaml
          node tests/browser/vehicle_production.mjs \
            http://localhost:8765/index.html
```

- [ ] **Step 4: Run the complete automated verification**

Run:

```bash
npm test
git diff --check
```

Expected: all Node tests pass and `git diff --check` reports no whitespace
errors. Cache markers were checked against the staged JavaScript changes before
each of the three code commits above.

- [ ] **Step 5: Run the existing full browser smoke check**

With the static server still running, run:

```bash
node tests/browser/smoke.mjs http://localhost:8765/index.html
```

Expected: every existing public tab renders without page or console errors.

- [ ] **Step 6: Commit the browser coverage and workflow change**

Run:

```bash
git add tests/browser/vehicle_production.mjs .github/workflows/tests.yml
git commit -m "test: cover vehicle recommendation reports in browser"
```

## Final handoff checks

- Confirm `git status --short` lists only the feature's intended changes plus
  the pre-existing untracked files.
- Confirm no path under `private/` was added or modified.
- Report the exact test commands and browser results, distinguishing automated
  checks from the real-browser check.
- If the browser check cannot run because Chromium is unavailable, report that
  limitation explicitly rather than treating Node tests as browser evidence.
