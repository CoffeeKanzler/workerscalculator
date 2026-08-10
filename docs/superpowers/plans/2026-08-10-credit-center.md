# Credit Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated decision-first Credits tab with exact saved-credit costs and relevant-only 30-year electronics amortization forecasts.

**Architecture:** Keep saved contract simulation in `economic_analysis.js`, add a focused pure `credit_forecast.js` for monthly debt paths, component-driven electronics price paths, currency conversion, and relevance ranking, and let `app.js` only translate model output into the existing Command Center UI. Move the existing decision surface out of History without changing its historical charts.

**Tech Stack:** Vanilla ES modules, Node test runner, existing uPlot chart renderer, Playwright, original game INIs, private Ghidra evidence.

## Global Constraints

- The direct route is `#/credits` under Observe.
- Normal base-price inflation is the only real-rate denominator.
- Every point after today is labelled forecast.
- Year-dependent recipes are recomputed per projected year and never double-counted.
- A used ship's future resale value is zero in the conservative curve.
- Electronics appears only when Base reaches break-even within 30 years.
- Replace “Robust/Speculative” with direct profitability statements.
- Historical aggregate debt must not be presented as reconstructed individual contracts.
- Keep per-vehicle save facts out of shared plans.
- Use failing tests before each production change.

---

### Task 1: Record the electronics ResourcePrice evidence boundary

**Files:**
- Create: `/home/nexx/workers/private/ELECTRONICS_RESOURCE_PRICE_FORECAST_RE.md`
- Test: `tests/electronics_price_evidence.test.mjs`

**Interfaces:**
- Consumes: `private/SUPPLY_DEMAND_FORMULA_RE.md`, `private/resource_base_value.c`, original Vanilla and DLC3 electronics/ecomponents INIs.
- Produces: public-safe evidence assertions naming both yearly recipe curves and the save-derived fallback label.

- [ ] **Step 1: Write the failing evidence test**

```js
test('bundled electronics producers expose both yearly price-driving curves', () => {
  for (const id of ['eletronic_components_factory', 'eletronic_factory',
    'dlc3/electronic_components_factory', 'dlc3/electronics_factory']) {
    const row = raw.find(building => building.id === id);
    assert.ok(row?.consumptionIncreaseAccordingYear, id);
    assert.ok(row?.productionDecreaseAccordingYear, id);
  }
});
```

- [ ] **Step 2: Run the test and verify the DLC3 component-factory ID or evidence contract fails if unresolved**

Run: `node --test tests/electronics_price_evidence.test.mjs`

Expected: FAIL on the first missing or incorrectly named required producer.

- [ ] **Step 3: Trace and document the exact boundary**

Document the recursive input/output-vector calculation, both year directives,
the `+0x78/+0x7c` market term, and whether parity is sufficient for “game
formula” or requires “save-derived forecast.” Do not expose private offsets in
public UI copy.

- [ ] **Step 4: Adjust only public bundled facts required by the evidence test**

If an extractor field or exact ID is missing, update
`tools/extract_from_gamefiles.py`, regenerate `data/game/buildings_raw.json`,
and keep malformed directives unavailable.

- [ ] **Step 5: Run the evidence and parser tests**

Run: `node --test tests/electronics_price_evidence.test.mjs tests/building_ini.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/electronics_price_evidence.test.mjs tools/extract_from_gamefiles.py data/game/buildings_raw.json
git commit -m "test: establish electronics price forecast evidence"
```

The private evidence note remains ignored and is not added to the public commit.

---

### Task 2: Produce monthly credit balance paths

**Files:**
- Modify: `js/models/economic_analysis.js`
- Test: `tests/credit_path.test.mjs`

**Interfaces:**
- Produces: `simulateLoanPath(loan, { horizonDays, sampleEveryDays }) -> { points, simulation }`.
- Each point: `{ day, paid, currentAmount, penaltyAmount, remainingDebt, completed }`.

- [ ] **Step 1: Write failing payoff-path tests**

```js
test('loan path exposes paid cash and settlement debt before and after payoff', () => {
  const result = simulateLoanPath({ annualRate: 5, remainingDays: 365,
    currentAmount: 100000, penaltyAmount: 0 },
  { horizonDays: 365 * 30, sampleEveryDays: 30 });
  assert.equal(result.points[0].paid, 0);
  assert.ok(result.points[1].remainingDebt < 100000);
  assert.equal(result.points.at(-1).remainingDebt, 0);
  assert.equal(result.points.at(-1).paid, result.simulation.totalPaid);
});
```

Add a penalty case and a term longer than 10,000 days.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/credit_path.test.mjs`

Expected: FAIL because `simulateLoanPath` is not exported.

- [ ] **Step 3: Refactor the daily step into one internal function**

Use one daily transition for both `simulateLoan` and `simulateLoanPath` so the
path cannot drift from the already tested exact formula. Sample day zero,
monthly intervals, payoff, and the horizon endpoint.

- [ ] **Step 4: Run focused and existing loan tests**

Run: `node --test tests/credit_path.test.mjs tests/economic_analysis.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add js/models/economic_analysis.js tests/credit_path.test.mjs
git commit -m "feat: expose exact monthly credit paths"
```

---

### Task 3: Build component-aware electronics future paths

**Files:**
- Create: `js/models/credit_forecast.js`
- Test: `tests/credit_forecast.test.mjs`

**Interfaces:**
- Consumes: `recipeYearFactors`, `simulateLoanPath`, saved RUB/USD price indices.
- Produces:
  - `electronicsComponentIndex({ buildings, startYear, years, priceFor, variant })`.
  - `forecastElectronicsPrices({ currentPrice, normalRates, residualRates, componentIndex, months })`.
  - `futureExchangePath({ currentRubPerUsd, rubNormalRate, usdNormalRate, months })`.
  - `amortizationCorridor({ quote, loan, cargoPurchasePrice, exitPricePaths, exchangePaths })`.

- [ ] **Step 1: Write the failing component-chain tests**

```js
test('component index recomputes ecomponents before electronics each future year', () => {
  const points = electronicsComponentIndex({ buildings: fixtureBuildings,
    startYear: 2000, years: 30, priceFor: key => fixturePrices[key], variant: 'vanilla' });
  assert.equal(points[0].index, 100);
  assert.ok(points[10].index > points[1].index);
  assert.ok(points[30].ecomponentsCost > points[10].ecomponentsCost);
});
```

Cover Vanilla/DLC3, clamped late years, missing prices, and no double-counting.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/credit_forecast.test.mjs`

Expected: module-not-found failure for `credit_forecast.js`.

- [ ] **Step 3: Implement component indices and scenario price paths**

Use constant start-date root-price weights for the recipe-change index. Apply
normal currency inflation exactly once to the resulting path. Derive residual
market rates from saved electronics export history after removing the normal
and component movement; use median/75th/25th percentiles for Base/Favorable/
Adverse.

- [ ] **Step 4: Write failing currency and amortization tests**

Assert RUB and USD same-currency exits, purchasing-power cross-currency
conversion, debt settlement before payoff, zero debt after payoff, and future
ship value fixed at zero.

- [ ] **Step 5: Run and verify RED for the new cases, then implement minimally**

Run: `node --test tests/credit_forecast.test.mjs`

Expected before implementation: assertions fail on missing paths. Expected
after implementation: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/models/credit_forecast.js tests/credit_forecast.test.mjs
git commit -m "feat: forecast electronics amortization paths"
```

---

### Task 4: Filter and rank relevant credit-financed investments

**Files:**
- Modify: `js/models/credit_forecast.js`
- Test: `tests/credit_relevance.test.mjs`

**Interfaces:**
- Produces: `rankRelevantCreditOpportunities({ quotes, loans, forecastContext, horizonYears: 30 })`.
- Opportunity fields include `shipName`, `financingCurrency`, `exitCurrency`,
  `capacity`, `capitalRequired`, `corridor`, `baseBreakEvenMonth`,
  `adverseBreakEvenMonth`, `baseValue30Years`, and `assessment`.

- [ ] **Step 1: Write failing relevance tests**

```js
test('a ship that never breaks even in Base is absent', () => {
  const rows = rankRelevantCreditOpportunities(neverProfitableFixture);
  assert.deepEqual(rows, []);
});

test('base-only and adverse-profitable opportunities use direct labels', () => {
  assert.deepEqual(rankRelevantCreditOpportunities(fixtures).map(x => x.assessment),
    ['profitable-adverse', 'profitable-base-only']);
});
```

Also assert earliest break-even sorting and one initial route per ship.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/credit_relevance.test.mjs`

Expected: FAIL because the ranking function is absent.

- [ ] **Step 3: Implement the exact relevance policy**

Filter unresolved, incompatible, missing-price, and Base-negative rows. Rank by
Base break-even month then 30-year Base value. Keep alternate exits nested.

- [ ] **Step 4: Run forecast and relevance tests**

Run: `node --test tests/credit_forecast.test.mjs tests/credit_relevance.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add js/models/credit_forecast.js tests/credit_relevance.test.mjs
git commit -m "feat: keep only relevant financed investments"
```

---

### Task 5: Add the Credits route and move credit decisions out of History

**Files:**
- Modify: `js/app.js`
- Modify: `js/ui/command_center.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css`
- Test: `tests/credit_tab_ui.test.mjs`
- Modify: `tests/inflation_loan_ui.test.mjs`
- Modify: `tests/electronics_strategy_ui.test.mjs`

**Interfaces:**
- `renderCredits()` owns saved contracts, hypothetical terms, relevant
  opportunities, amortization corridor, and historical aggregate summary.
- `renderRepublicHistory()` owns history charts only.

- [ ] **Step 1: Write failing navigation and ownership tests**

Assert `credits` exists in `TABS`, belongs to Observe, maps to `tabCredits`,
routes through `renderCredits`, and `renderRepublicHistory` no longer calls the
economic decision or electronics strategy surfaces.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/credit_tab_ui.test.mjs tests/inflation_loan_ui.test.mjs tests/electronics_strategy_ui.test.mjs`

Expected: FAIL on the absent Credits tab and History still owning the surfaces.

- [ ] **Step 3: Implement navigation and state**

Add `credits` beside History and Prices. Add local state defaults for
hypothetical currency, amount, APR, term, and selected opportunity. Preserve
legacy share/privacy keys by keeping these inputs out of shared save state.

- [ ] **Step 4: Move and reshape the renderer**

Render the action summary, active contract table, new-credit controls, only
ranked relevant opportunities, and aggregate historical boundary. Replace
“Robust/Speculative” copy with the direct assessment strings. When none qualify,
render only the specified 30-year empty state.

- [ ] **Step 5: Add the amortization corridor**

Use the existing local uPlot renderer with Base/Favorable/Adverse and zero-line
series, shared hover inspection, textual first-break-even summary, currency
labels, and the existing light/dark tokens.

- [ ] **Step 6: Run focused UI tests and syntax checks**

Run:

```bash
node --test tests/credit_tab_ui.test.mjs tests/inflation_loan_ui.test.mjs tests/electronics_strategy_ui.test.mjs
node --check js/app.js
```

Expected: all tests PASS and syntax exit 0.

- [ ] **Step 7: Commit**

```bash
git add js/app.js js/ui/command_center.js js/i18n.js css/style.css tests/credit_tab_ui.test.mjs tests/inflation_loan_ui.test.mjs tests/electronics_strategy_ui.test.mjs
git commit -m "feat: add decision-first credits tab"
```

---

### Task 6: Verify relevant-only behavior in a real save browser run

**Files:**
- Create: `tests/browser/credit_center.mjs`
- Modify: `tests/browser/electronics_loan_hedge.mjs`

**Interfaces:**
- Uses a complete real save directory for `usedveh.bin` and controlled
  multi-year `stats.ini` for deterministic loan and price scenarios.

- [ ] **Step 1: Write the failing browser scenario**

The scenario must import `/home/nexx/bigsavegame`, load controlled RUB/USD
history and credit terms, open `#/credits` through pointer clicks, and assert:

- the route and selected tab are Credits;
- active and hypothetical credit sections render;
- River cargo ship appears when Base crosses zero;
- its break-even marker and RUB/USD exits are inspectable;
- a controlled never-profitable candidate is absent;
- no “Robust” or “Speculative” copy exists;
- History contains no credit decision surface;
- hover inspection works in light and dark themes.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/browser/credit_center.mjs /home/nexx/bigsavegame http://127.0.0.1:8878/index.html`

Expected: FAIL before the new route/selector behavior exists.

- [ ] **Step 3: Make only integration fixes required by the browser evidence**

Do not weaken assertions or introduce synthetic UI-only data paths.

- [ ] **Step 4: Run browser validation and capture both themes**

Expected screenshots:

- `/tmp/workers-credit-center-light.png`
- `/tmp/workers-credit-center-dark.png`

Expected command exit: 0 with no page or console errors.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/credit_center.mjs tests/browser/electronics_loan_hedge.mjs js/app.js css/style.css js/i18n.js
git commit -m "test: verify credit center with a real save"
```

---

### Task 7: Cache, regression, merge, and deployment verification

**Files:**
- Modify mechanically: `index.html`, `data/VERSION.json`, transitive JS import markers.

**Interfaces:**
- Produces a cache-coherent build on `main` and matching `origin/main`.

- [ ] **Step 1: Advance cache markers**

Run:

```bash
node tools/bump_cache_versions.mjs css/style.css data/game/buildings_raw.json js/app.js js/i18n.js js/models/economic_analysis.js js/models/credit_forecast.js js/ui/command_center.js
node tools/bump_cache_versions.mjs --check css/style.css data/game/buildings_raw.json js/app.js js/i18n.js js/models/economic_analysis.js js/models/credit_forecast.js js/ui/command_center.js
```

Expected: markers current and `data/VERSION.json` matches `index.html`.

- [ ] **Step 2: Run complete verification**

Run:

```bash
npm test
node --check js/app.js
node --check js/models/economic_analysis.js
node --check js/models/credit_forecast.js
node --check js/savegame_worker.js
git diff --check
```

Expected: zero failures and zero syntax/diff errors.

- [ ] **Step 3: Commit cache changes**

```bash
git add index.html data/VERSION.json js css data tests docs tools
git commit -m "chore: publish credit center build"
```

- [ ] **Step 4: Merge and re-verify on main**

Fetch `origin`, preserve unrelated untracked files, merge
`feature/credit-center` with a merge commit, and rerun the complete test and
syntax commands from Step 2 in `/home/nexx/workers`.

- [ ] **Step 5: Push and prove remote equality**

```bash
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote --heads origin main | awk '{print $1}')"
```

Expected: equality test exit 0.
