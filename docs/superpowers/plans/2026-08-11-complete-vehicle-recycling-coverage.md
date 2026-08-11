# Complete Vehicle Recycling Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every imported owned vehicle in Logistics and calculate exact recycling/export values for complete fixed train sets, including track builders.

**Architecture:** Extend model resolution with recursively resolved fixed-component facts, then centralize economic assessment so successful and unavailable owned vehicles share one row contract. Keep the existing exact-only UI behind a runtime flag while the default complete view renders every owned record and exposes explicit unavailability reasons.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js built-in test runner, existing DOM helper renderer, Playwright browser oracle.

## Global Constraints

- Include imported road vehicles, ships, locomotives, wagons, fixed train sets, track builders, airplanes, and helicopters.
- Never silently omit an owned vehicle because exact calculation is unavailable.
- Never invent missing Workshop facts, recipes, prices, or fixed components.
- Preserve existing float32 row order, cargo exclusion, depreciation, and price formulas.
- Keep the old exact-only view available through `?fleetRecyclingCoverage=legacy`; default and invalid values select `complete`.
- Do not treat containers as additional owned-vehicle rows.

---

### Task 1: Resolve complete fixed vehicle components

**Files:**
- Modify: `js/fleet.js:683-741`
- Test: `tests/fleet.test.mjs`

**Interfaces:**
- Produces: `modelFacts.fixedComponents: ModelFacts[]` in reference order, including duplicates.
- Produces: `modelFacts.fixedComponentError: null | { code: 'missing-fixed-component' | 'cyclic-fixed-component', modelId: string }`.
- Preserves: `resolveVehicleModels(records, { game, workshop }) -> { records, summary }`.

- [ ] **Step 1: Write failing resolver tests**

Add tests which resolve `builder -> [wagon, wagon, nested]`, assert the flattened component ids are `['wagon', 'wagon', 'nested', 'nested-wagon']`, and separately assert structured errors for a missing id and `cycle-a -> cycle-b -> cycle-a`.

```js
const result = resolveVehicleModels([{ model: 'builder' }], { game });
assert.deepEqual(result.records[0].modelFacts.fixedComponents.map(item => item.id),
  ['wagon', 'wagon', 'nested', 'nested-wagon']);
assert.equal(result.records[0].modelFacts.fixedComponentError, null);
assert.deepEqual(missing.records[0].modelFacts.fixedComponentError,
  { code: 'missing-fixed-component', modelId: 'absent' });
assert.equal(cyclic.records[0].modelFacts.fixedComponentError.code, 'cyclic-fixed-component');
```

- [ ] **Step 2: Run the resolver tests and verify RED**

Run: `node --test --test-name-pattern='fixed vehicle components' tests/fleet.test.mjs`

Expected: FAIL because `fixedComponents` and `fixedComponentError` do not exist.

- [ ] **Step 3: Implement recursive component resolution**

Extract a local `factsForEntry(entry, source)` factory from the existing inline `modelFacts` construction. Resolve each `trainSet` reference from the same game-first maps, append the referenced component followed by its nested components, retain duplicate references, and stop a branch with a structured missing/cycle error.

```js
const resolveFixedComponents = (entry, ancestors = new Set([normalizeId(entry.id)])) => {
  const components = [];
  for (const referencedId of Array.isArray(entry.trainSet) ? entry.trainSet : []) {
    const key = normalizeId(referencedId);
    if (ancestors.has(key)) return { components: [], error: {
      code: 'cyclic-fixed-component', modelId: String(referencedId),
    } };
    const resolved = entryForId(key);
    if (!resolved) return { components: [], error: {
      code: 'missing-fixed-component', modelId: String(referencedId),
    } };
    const nested = resolveFixedComponents(resolved.entry, new Set([...ancestors, key]));
    if (nested.error) return { components: [], error: nested.error };
    components.push(factsForEntry(resolved.entry, resolved.source), ...nested.components);
  }
  return { components, error: null };
};
```

- [ ] **Step 4: Run focused and complete fleet tests**

Run: `node --test --test-name-pattern='fixed vehicle components' tests/fleet.test.mjs`

Expected: PASS.

Run: `node --test tests/fleet.test.mjs`

Expected: all fleet tests PASS.

- [ ] **Step 5: Commit the resolver**

```bash
git add js/fleet.js tests/fleet.test.mjs
git commit -m "feat: resolve fixed vehicle components"
```

### Task 2: Compose exact economics for fixed train sets

**Files:**
- Modify: `js/fleet.js:265-335,557-617`
- Test: `tests/fleet.test.mjs`

**Interfaces:**
- Produces: `vehicleEconomicAssessment(record, options) -> AvailableAssessment | UnavailableAssessment`.
- Available assessment preserves the existing opportunity fields and adds `available: true`, `unavailableReason: null`.
- Unavailable assessment is `{ available: false, record, unavailableReason }`.
- Preserves: `vehicleEconomicOpportunity(record, options)` as a compatibility wrapper returning an opportunity or `null`.

- [ ] **Step 1: Write failing composition and assessment tests**

Create root/component model facts with distinct weights and runtime categories. Assert that the available assessment equals the material/work totals produced by processing root then component recipes, and that missing/cyclic attachment facts yield `unresolved-fixed-component`. Retain explicit regression assertions for one road vehicle, ship, standalone rail vehicle, and aircraft.

```js
const assessment = vehicleEconomicAssessment(record, options);
assert.equal(assessment.available, true);
assert.deepEqual(assessment.recycling,
  normalVehicleRecyclingTargetsForFacts(
    [record.modelFacts, ...record.modelFacts.fixedComponents], record.cargo));
assert.equal(vehicleEconomicAssessment(unresolved, options).unavailableReason,
  'unresolved-fixed-component');
```

- [ ] **Step 2: Run the economic tests and verify RED**

Run: `node --test --test-name-pattern='fixed train set economics|economic assessment' tests/fleet.test.mjs`

Expected: FAIL because the assessment and facts-list recycling APIs are not exported.

- [ ] **Step 3: Extract recipe-list recycling without changing single vehicles**

Implement `normalVehicleRecyclingTargetsForFacts(factsList, cargo = [])`. For each facts object, call the existing `normalVehicleProductionRecipe`, then apply that component's runtime-category work factor and the existing conversion loop in list order. Make `normalVehicleRecyclingTargets(args)` delegate with a one-item facts list.

```js
export function normalVehicleRecyclingTargetsForFacts(factsList, cargo = []) {
  const recipes = factsList.map(facts => ({
    facts,
    rows: normalVehicleProductionRecipe(recipeArguments(facts)),
  }));
  if (recipes.some(item => !item.rows)) return null;
  return recycleRecipeRows(recipes, cargo);
}
```

- [ ] **Step 4: Implement structured economic assessment**

Replace the blanket `hasHardAttachments` rejection with the resolved facts list. Calculate each component's base value with its own origin currency and aircraft factor, sum the results, and use the root record's saved depreciation state. Return precise reasons in this order: `unresolved-model`, `unresolved-fixed-component`, `missing-recipe`, `missing-price`, `missing-export-multiplier`, `missing-recycling-value`.

```js
export function vehicleEconomicAssessment(record, options) {
  const facts = record?.modelFacts;
  if (!facts) return unavailable(record, 'unresolved-model');
  if (facts.fixedComponentError) return unavailable(record, 'unresolved-fixed-component');
  const modelFacts = [facts, ...(facts.fixedComponents ?? [])];
  // Build every recipe, value each component, recycle all rows in order.
  return { available: true, unavailableReason: null, ...opportunity };
}

export function vehicleEconomicOpportunity(record, options) {
  const assessment = vehicleEconomicAssessment(record, options);
  return assessment.available ? assessment : null;
}
```

- [ ] **Step 5: Run focused and complete tests**

Run: `node --test --test-name-pattern='fixed train set economics|economic assessment|normal vehicle recycling' tests/fleet.test.mjs`

Expected: PASS.

Run: `node --test tests/fleet.test.mjs`

Expected: all fleet tests PASS with unchanged standalone numeric oracles.

- [ ] **Step 6: Commit composed economics**

```bash
git add js/fleet.js tests/fleet.test.mjs
git commit -m "fix: compose fixed train set recycling"
```

### Task 3: Make filtering and pagination cover every owned vehicle

**Files:**
- Modify: `js/fleet.js:520-554`
- Test: `tests/fleet.test.mjs`

**Interfaces:**
- Consumes: available and unavailable assessment rows from Task 2.
- Preserves: `filterAndSortVehicleOpportunities(rows, filters)`.
- Adds action filter value: `unavailable`.

- [ ] **Step 1: Write a failing mixed-coverage filter test**

Use four available rows and two unavailable rows. Assert `category: 'rail'`, `action: 'unavailable'`, name search, stable name sorting, and pagination totals retain unavailable rows.

```js
assert.deepEqual(filterAndSortVehicleOpportunities(rows, {
  category: 'rail', action: 'unavailable', sort: 'name',
}).map(row => row.record.modelFacts.name), ['Broken builder']);
assert.equal(paginateVehicleOpportunities(rows, { pageSize: 50 }).total, rows.length);
```

- [ ] **Step 2: Run the filter test and verify RED**

Run: `node --test --test-name-pattern='mixed recycling coverage' tests/fleet.test.mjs`

Expected: FAIL because unavailable rows do not match the new action semantics.

- [ ] **Step 3: Extend filtering and safe sorting**

Treat `action === 'unavailable'` as `row.available === false`; other action filters require available rows. Numeric sorts keep unavailable values after finite values, with vehicle name as the stable tie-breaker. Category/search read the record facts even when calculation is unavailable.

- [ ] **Step 4: Run fleet tests and commit**

Run: `node --test tests/fleet.test.mjs`

Expected: all fleet tests PASS.

```bash
git add js/fleet.js tests/fleet.test.mjs
git commit -m "feat: retain unavailable fleet rows"
```

### Task 4: Render complete coverage with a legacy flag

**Files:**
- Modify: `js/runtime/runtime_config.js:1-21`
- Modify: `js/app.js:100-120,5830-6030`
- Modify: `js/i18n.js:119-163,771-815`
- Test: `tests/runtime_bootstrap.test.mjs`
- Create: `tests/fleet_recycling_coverage_ui.test.mjs`

**Interfaces:**
- Consumes: `vehicleEconomicAssessment` and mixed assessment rows.
- Produces: `RUNTIME_CONFIG.fleetRecyclingCoverage: 'complete' | 'legacy'`.
- Adds German and English keys for total/calculable/unavailable counts, unavailable reasons, and the unavailable action filter.

- [ ] **Step 1: Write failing runtime-config tests**

```js
assert.equal(getRuntimeConfig({ ...base, location: {
  ...base.location, search: '?fleetRecyclingCoverage=legacy',
} }).fleetRecyclingCoverage, 'legacy');
assert.equal(getRuntimeConfig({ ...base, location: {
  ...base.location, search: '?fleetRecyclingCoverage=broken',
} }).fleetRecyclingCoverage, 'complete');
```

- [ ] **Step 2: Write a failing UI source-contract test**

Read `js/app.js`, `js/i18n.js`, and runtime config. Assert the default complete path maps every `fleetRecords` entry through `vehicleEconomicAssessment`, the legacy branch still filters exact opportunities, unavailable rows render a status reason, the action select contains `unavailable`, and both languages expose the new count/status labels.

- [ ] **Step 3: Run UI/config tests and verify RED**

Run: `node --test tests/runtime_bootstrap.test.mjs tests/fleet_recycling_coverage_ui.test.mjs`

Expected: FAIL because the config field, complete assessment path, and copy are absent.

- [ ] **Step 4: Add the validated runtime flag**

Parse query/data candidates exactly like `scrapProfitTable`, accepting only `legacy`; otherwise return `complete`, and add the frozen value to the runtime config object.

- [ ] **Step 5: Render complete assessment rows**

Build all assessments when settings and prices exist; otherwise build an unavailable row for every owned record with the matching reason. In complete mode feed every row into cards, filters, counts, details, and pagination. In legacy mode retain the current successful-opportunity-only arrays and markup behavior. Render unavailable table cells as `—` plus a localized reason label.

- [ ] **Step 6: Add exact bilingual copy**

Add German labels such as `Gesamtbestand`, `Berechenbar`, `Nicht berechenbar`, `Modell nicht aufgelöst`, and `Fester Zugverband unvollständig`; add direct English equivalents. Update the hint so it names all road, ship, rail, airplane, and helicopter coverage.

- [ ] **Step 7: Run checks and commit**

Run: `node --check js/app.js`

Expected: no output and exit 0.

Run: `node --test tests/runtime_bootstrap.test.mjs tests/fleet_recycling_coverage_ui.test.mjs tests/fleet.test.mjs`

Expected: all selected tests PASS.

```bash
git add js/runtime/runtime_config.js js/app.js js/i18n.js tests/runtime_bootstrap.test.mjs tests/fleet_recycling_coverage_ui.test.mjs
git commit -m "feat: show complete vehicle recycling coverage"
```

### Task 5: Full regression and browser verification

**Files:**
- Modify if cache references changed: `index.html`, `sw.js`
- Use without modifying: `private/browser_fleet_check.mjs` or a focused temporary Playwright script outside the repository

**Interfaces:**
- Verifies the complete feature; produces no new application API.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with 0 failures.

- [ ] **Step 2: Bump and verify cache references**

Run: `node tools/bump_cache_versions.mjs --print-changed`

Expected: list only cache-bearing files whose referenced JS changed, or no files if the hook already updated them.

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 3: Verify in a real browser**

Reuse the existing server only if it serves `/home/nexx/workers`; otherwise start this checkout on a free explicit port. Import the complete save directory, open the rendered `Logistik` section, expand `Alle Fahrzeuge`, and verify visible rows/search results for a road vehicle, ship, standalone rail vehicle, track builder, and aircraft/helicopter. Confirm `Gesamtbestand = Berechenbar + Nicht berechenbar` and that the details total equals the imported owned-vehicle count.

- [ ] **Step 4: Run legacy-mode browser smoke check**

Open the same route with `?fleetRecyclingCoverage=legacy`, import the same save, and confirm the previous exact-only count/list still renders without unavailable rows.

- [ ] **Step 5: Commit cache markers only if changed**

```bash
git add index.html sw.js
git commit -m "chore: refresh recycling coverage cache markers"
```

- [ ] **Step 6: Record final evidence**

Report exact automated-test totals, browser-visible German labels, imported/complete/unavailable counts, the verified Trackbuilder name, legacy smoke result, and any remaining unavailable reason without claiming inferred values.
