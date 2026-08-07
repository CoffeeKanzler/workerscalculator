# City Workshops Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Werkstätten section to city planning that counts exact workshop workers while leaving city population, services, utilities, costs, and production balances unchanged.

**Architecture:** Keep city building rows and workshop rows separate. Store workshop rows under `city.workshops` using the stable production `gameId`; resolve them from `prodBuildings()` at render/evaluation boundaries. Extend `evaluateCity` only with a worker-only workshop contribution, and render the new section beside the existing city-building table.

**Tech Stack:** Vanilla ES modules, Node's built-in test runner, JSON game datasets, existing DOM renderer and i18n catalog.

---

## File map

- Modify `js/city_planning.js`: define the bilingual workshop group contract and pure helpers for filtering/resolving workshop rows.
- Modify `js/calc.js`: add resolved workshop rows to city evaluation without feeding them into normal city-service calculations.
- Modify `js/app.js`: initialize/normalize workshop rows, resolve them, render the dedicated city section, include workshop rows in city summaries/overview/workforce-source calculations, and preserve legacy city rows.
- Modify `js/i18n.js`: add the German and English labels/status text for the workshop section and unavailable state.
- Modify `tests/city_planning.test.mjs`: test the workshop group filter, stable `gameId` resolution, and unresolved-row behavior.
- Modify `tests/calc.test.mjs`: test exact worker addition and neutrality of all other city metrics.
- Modify `tests/city_planning_ui.test.mjs`: assert the shipped renderer exposes the separate workshop section and state shape.
- Modify `data/VERSION.json`, `index.html`, and the relevant cache markers through `tools/bump_cache_versions.mjs` after JS changes.

### Task 1: Add pure workshop catalog/row helpers

**Files:**
- Modify: `js/city_planning.js`
- Test: `tests/city_planning.test.mjs`

- [ ] **Step 1: Write failing helper tests**

Add tests for a minimal catalog:

```js
const catalog = [
  { gameId: 'dlc3/h_repair_station', de: 'Pferdearzt und Tischlerei', group: { de: 'Werkstätten', en: 'Workshops' }, workers: 10 },
  { gameId: 'coal_mine', de: 'Kohlemine', group: { de: 'Rohstoffe', en: 'Resources' }, workers: 300 },
];

test('city workshops are selected by the bilingual workshop group', () => {
  assert.deepEqual(cityWorkshopBuildings(catalog).map(b => b.gameId), ['dlc3/h_repair_station']);
});

test('city workshop rows resolve by stable gameId and retain unknown rows', () => {
  const rows = resolveCityWorkshopRows([
    { gameId: 'dlc3/h_repair_station', count: 2 },
    { gameId: 'missing/workshop', count: 1 },
  ], catalog);
  assert.equal(rows[0].building.workers, 10);
  assert.equal(rows[1].building, null);
  assert.equal(rows[1].gameId, 'missing/workshop');
});
```

Run: `node --test tests/city_planning.test.mjs`

Expected: FAIL because the helpers are not exported yet.

- [ ] **Step 2: Implement the pure helpers**

In `js/city_planning.js`, add:

```js
export const CITY_WORKSHOP_GROUPS = Object.freeze(['Werkstätten', 'Workshops']);

export function cityWorkshopBuildings(buildings = []) {
  return buildings.filter(building => CITY_WORKSHOP_GROUPS.some(group =>
    building?.group?.de === group || building?.group?.en === group));
}

export function resolveCityWorkshopRows(rows, buildings = []) {
  const byGameId = new Map(cityWorkshopBuildings(buildings)
    .filter(building => building.gameId)
    .map(building => [building.gameId, building]));
  return (Array.isArray(rows) ? rows : []).map(row => ({
    ...row,
    count: Number.isFinite(row?.count) ? row.count : 0,
    building: byGameId.get(row?.gameId) ?? null,
  }));
}
```

The helper must not match by localized name or basename; an unknown `gameId`
must remain unresolved.

- [ ] **Step 3: Run the helper tests**

Run: `node --test tests/city_planning.test.mjs`

Expected: all city-planning tests pass.

- [ ] **Step 4: Commit the helper unit**

```bash
git add js/city_planning.js tests/city_planning.test.mjs
git commit -m "feat: add stable city workshop helpers"
```

### Task 2: Extend city evaluation with worker-only workshops

**Files:**
- Modify: `js/calc.js`
- Test: `tests/calc.test.mjs`

- [ ] **Step 1: Write the failing calculation test**

Add a city with no normal buildings and two resolved horse workshops:

```js
test('city workshop workers affect workforce only', () => {
  const result = evaluateCity({
    productivity: 0.7,
    rows: [],
    workshops: [
      { count: 2, building: { workers: 10 } },
    ],
    cable: 'Hochspannungsleitung',
    exchanger: 'small',
    waterDivisor: 3,
  }, eco());

  assert.equal(result.workshopWorkers, 20);
  assert.equal(result.workersNeeded, 20);
  assert.equal(result.workerSurplus, -15);
  assert.equal(result.population, 0);
  assert.equal(result.power, 0);
  assert.equal(result.water, 0);
  assert.equal(result.waste, 0);
  assert.equal(result.buildCostRUB, 0);
  assert.deepEqual(result.services, []);
});
```

Run: `node --test tests/calc.test.mjs`

Expected: FAIL because `evaluateCity` currently only reads `city.rows`.

- [ ] **Step 2: Add the minimal worker-only evaluation path**

In `evaluateCity`, keep the existing `rows` filtering and sums unchanged. Add a
separate resolved workshop list and use it only for workers:

```js
const workshops = (city.workshops ?? []).filter(row => row.building && row.count > 0);
const workshopWorkers = workshops.reduce(
  (sum, row) => sum + (row.building.workers ?? 0) * row.count, 0,
);
const workersNeeded = sum(b => b.workers) + workshopWorkers;
```

Expose `workshopWorkers` on the result. Do not add workshops to `rows`,
`ratedRows`, service capacity, residential count, heating, utility sums,
materials, or build-cost sums.

- [ ] **Step 3: Run calculation tests**

Run: `node --test tests/calc.test.mjs`

Expected: all calculation tests pass, including the new workshop test.

- [ ] **Step 4: Commit the calculation unit**

```bash
git add js/calc.js tests/calc.test.mjs
git commit -m "feat: count city workshop workers separately"
```

### Task 3: Resolve and render the city workshop section

**Files:**
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `tests/city_planning_ui.test.mjs`

- [ ] **Step 1: Add the UI contract test first**

Extend `tests/city_planning_ui.test.mjs` to require the separate source and
state path:

```js
assert.match(app, /CITY_WORKSHOP_GROUPS/);
assert.match(app, /resolveCityWorkshopRows/);
assert.match(app, /city\.workshops/);
assert.match(app, /cityWorkshopSection/);
assert.match(app, /workshopWorkers/);
assert.equal((i18n.match(/cityWorkshopSection:/g) ?? []).length, 2);
assert.equal((i18n.match(/cityWorkshopUnavailable:/g) ?? []).length, 2);
```

Run: `node --test tests/city_planning_ui.test.mjs`

Expected: FAIL because the renderer and translations do not expose workshop
planning yet.

- [ ] **Step 2: Add bilingual UI strings**

Add one German and one English entry for each key in the existing language
objects in `js/i18n.js`:

```js
cityWorkshopSection: 'Werkstätten',
cityWorkshopUnavailable: 'Werkstattdaten nicht verfügbar',
cityWorkshopGameFact: 'Arbeiterbedarf aus Spieldaten',
```

English values:

```js
cityWorkshopSection: 'Workshops',
cityWorkshopUnavailable: 'Workshop data unavailable',
cityWorkshopGameFact: 'Workers from game data',
```

- [ ] **Step 3: Import and resolve workshop rows at city boundaries**

Extend the city-planning import in `js/app.js`:

```js
import {
  CITY_CORE_CATEGORY_TYPES,
  addMissingCityCategoryRows,
  cityWorkshopBuildings,
  resolveCityWorkshopRows,
} from './city_planning.js?v=3';
```

Use a local resolver in `renderCity` and in every non-render evaluation path:

```js
const workshopRows = resolveCityWorkshopRows(city.workshops, prodBuildings());
const cityForEvaluation = { ...city, workshops: workshopRows };
const productivityScenarios = evaluateCityProductivityScenarios(
  { ...cityForEvaluation, rows: rowsResolved }, eco, worstCaseProductivity,
);
```

Apply the same `resolveCityWorkshopRows` call in the workforce-source helper
around line 1716 and in `republicSnapshot` around line 5671, so area surplus,
overview totals, and net-worker comparisons include the same exact workshop
workers. Add `workshops: []` to `defaultCity()` and normalize missing
`city.workshops` arrays while restoring shared state, so old plans remain
backward-compatible. Leave imported save `city.rows` handling unchanged.

- [ ] **Step 4: Render a separate editable workshop table**

In `renderCity`, derive `workshopCatalogue = cityWorkshopBuildings(prodBuildings())`
and render a separate table after the normal city-building controls. Each row
must store only `{ gameId, count }` in `city.workshops` and render:

- a select of workshop `gameId` values and bilingual names;
- a count input;
- exact worker count when resolved;
- `cityWorkshopUnavailable` when the saved `gameId` cannot be resolved;
- a delete button.

Add an `addWorkshop` button that pushes the first catalogue `gameId` with
`count: 1`; if the catalogue is empty, render the existing unavailable state
and do not create a guessed row. Give the section a distinct `data-city-workshops`
attribute for browser verification.

Add `workshopWorkers` to the city summary so the user can see the worker-only
impact explicitly, while the existing `workerSurplus` continues to reflect the
total `workersNeeded` returned by `evaluateCity`.

- [ ] **Step 5: Run the UI contract tests**

Run: `node --test tests/city_planning_ui.test.mjs`

Expected: all UI contract tests pass.

- [ ] **Step 6: Commit the city UI unit**

```bash
git add js/app.js js/i18n.js tests/city_planning_ui.test.mjs
git commit -m "feat: add workshops to city planning"
```

### Task 4: Cache markers and browser verification

**Files:**
- Modify: `index.html`
- Modify: `data/VERSION.json`

- [ ] **Step 1: Advance referenced module markers**

Run:

```bash
node tools/bump_cache_versions.mjs js/app.js js/city_planning.js js/calc.js
node tools/bump_cache_versions.mjs --check js/app.js js/city_planning.js js/calc.js data/game/production_buildings.json
```

Expected: the first command advances every changed module reference once; the
second prints `cache markers are current`.

- [ ] **Step 2: Run syntax and focused tests**

```bash
node --check js/app.js
node --test tests/city_planning.test.mjs tests/calc.test.mjs tests/city_planning_ui.test.mjs
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 3: Verify the visible browser behavior**

With the existing local server on port 8765, open `http://127.0.0.1:8765/index.html#/city`.
In the German UI verify:

1. The city planner shows a distinct `Werkstätten` section.
2. `Pferdearzt und Tischlerei` is selectable.
3. One row shows 10 workers; changing count to 2 shows 20 workers.
4. City population, utilities, materials and costs stay unchanged while the
   worker surplus reflects the additional 20 workers.
5. An unknown workshop id, if loaded through an imported plan, shows the
   unavailable label and does not crash the table.

- [ ] **Step 4: Run the complete test suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit cache and verified release state**

```bash
git add index.html data/VERSION.json
git commit -m "chore: advance city workshop cache markers"
```

### Task 5: Final review and handoff

- [ ] **Step 1: Review the complete diff**

Run:

```bash
git status -sb
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
```

Confirm that only the city workshop feature, its tests, the design/plan docs,
and cache metadata are included. Existing untracked files remain unstaged.

- [ ] **Step 2: Record the evidence**

Report the final commit(s), exact test count, browser route, visible
`Werkstätten` label, and whether the branch was pushed. Do not claim save-file
runtime validation; this feature is planner state only.
