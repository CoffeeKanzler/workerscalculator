# Scrap Profit Border Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show exact used-vehicle scrap profit for both target borders in one table, while retaining the current single-currency table behind a legacy feature flag.

**Architecture:** Keep the existing valuation primitives unchanged and add a pure route-expansion function in `js/fleet.js`. Each resolved offer is expanded into a RUB target route and a USD target route; the model currency identifies the purchase border, while the target currency identifies the sale border. The app selects a new or legacy render function from `RUNTIME_CONFIG.scrapProfitTable` and changes only the scrap-profit block.

**Tech Stack:** Browser ES modules, Node `node:test`, Playwright browser scripts, existing i18n and cache-marker pre-commit hook.

---

### Task 1: Add border-aware route valuation

**Files:**
- Modify: `js/fleet.js:1-700`
- Test: `tests/fleet.test.mjs:1-720`

- [ ] **Step 1: Write failing tests for border labels and route expansion**

Add `marketBorderForCurrency` and `rankUsedMarketBorderRoutes` to the test import list. Add a fixture that supplies two offers with complete model facts, one `originCurrency: 'RUB'` and one `originCurrency: 'USD'`, plus finite age, usage, modifier, and lifespan values. Use an economy whose `sell`, `buy`, and `workday` methods return finite values for every resource.

The tests must assert:

```js
assert.equal(marketBorderForCurrency('RUB'), 'east');
assert.equal(marketBorderForCurrency('USD'), 'west');
assert.equal(marketBorderForCurrency('CHF'), null);

const routes = rankUsedMarketBorderRoutes([eastOffer, westOffer], { economy });
assert.deepEqual(
  new Set(routes.map(route => `${route.sourceBorder}->${route.targetBorder}`)),
  new Set(['east->east', 'east->west', 'west->east', 'west->west']),
);
assert.ok(routes.every(route => ['RUB', 'USD'].includes(route.targetCurrency)));
assert.ok(routes.some(route => route.sourceCurrency === 'RUB' && route.targetCurrency === 'USD'));
assert.ok(routes.some(route => route.sourceCurrency === 'USD' && route.targetCurrency === 'RUB'));
```

Also assert that the route profit is the existing `netRecycleValue - purchaseValue`, that positive and negative routes retain their `worthBuying` status, and that an offer with no exact model currency produces no invented border route. Add a separate assertion that a route with missing target prices is retained with `available === false` and `profit === null`.

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run: `node --test tests/fleet.test.mjs`

Expected: FAIL because the new exports and route builder do not exist yet. Existing fleet tests must continue to run; do not accept a syntax or fixture error as the red result.

- [ ] **Step 3: Implement the minimal route model**

In `js/fleet.js`, add the immutable border mapping and export:

```js
const MARKET_BORDER_BY_CURRENCY = Object.freeze({ RUB: 'east', USD: 'west' });

export function marketBorderForCurrency(currency) {
  return MARKET_BORDER_BY_CURRENCY[currency] ?? null;
}
```

Add `rankUsedMarketBorderRoutes(offers, { economy })` after `rankUsedMarketArbitrage`. For each offer with `offer.modelFacts.originCurrency` equal to `RUB` or `USD`, evaluate both target currencies by calling the existing `vehicleUsedMarketQuote(offer, { currency: targetCurrency, economy })` and `usedMarketRecyclingArbitrage(quote, { currency: targetCurrency, economy })`. Return one route object per source/target pair with `sourceCurrency`, `sourceBorder`, `targetCurrency`, `targetBorder`, `routeKey`, `available`, and all exact arbitrage values. If either quote or arbitrage is unavailable, retain the route with `available: false`, `profit: null`, `worthBuying: false`, and the offer/source/target identity intact. Sort available routes by descending profit, then unavailable routes by original offer index and target currency.

Do not alter `vehicleComponentBaseValue`, `vehicleUsedMarketQuote`, `usedMarketRecyclingArbitrage`, or `rankUsedMarketArbitrage`; the legacy table depends on those existing contracts.

- [ ] **Step 4: Run the focused tests and the full unit suite**

Run: `node --test tests/fleet.test.mjs`

Expected: PASS, including the new four-route and unavailable-route assertions.

Run: `npm test`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the domain change**

```bash
git add js/fleet.js tests/fleet.test.mjs
git commit -m "feat: value used vehicle scrap routes by border"
```

### Task 2: Add the legacy-preserving feature flag

**Files:**
- Modify: `js/runtime/runtime_config.js:1-35`
- Test: `tests/runtime_bootstrap.test.mjs:1-75`

- [ ] **Step 1: Write failing runtime-config tests**

Extend the default-config test to expect `scrapProfitTable: 'v2'`. Add tests for `?scrapProfitTable=legacy`, `?scrapProfitTable=v2`, and an invalid value falling back to `v2`:

```js
const legacy = getRuntimeConfig({
  document: { documentElement: { dataset: {} } },
  location: { pathname: '/', search: '?scrapProfitTable=legacy' },
});
assert.equal(legacy.scrapProfitTable, 'legacy');

const fallback = getRuntimeConfig({
  document: { documentElement: { dataset: {} } },
  location: { pathname: '/', search: '?scrapProfitTable=broken' },
});
assert.equal(fallback.scrapProfitTable, 'v2');
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test tests/runtime_bootstrap.test.mjs`

Expected: FAIL on the missing config property/flag behavior, while the failure remains a behavioral assertion rather than a parser error.

- [ ] **Step 3: Implement the constrained flag**

In `getRuntimeConfig`, read `query.get('scrapProfitTable') ?? data.scrapProfitTable ?? 'v2'`, accept only `'legacy'` and `'v2'`, and return `'v2'` for all other values. Include the value in the frozen config object. Keep all existing mode, variant, and SDK validation unchanged.

- [ ] **Step 4: Run runtime and full tests**

Run: `node --test tests/runtime_bootstrap.test.mjs && npm test`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the flag**

```bash
git add js/runtime/runtime_config.js tests/runtime_bootstrap.test.mjs
git commit -m "feat: gate scrap profit table versions"
```

### Task 3: Render the combined border-route table and preserve the old table

**Files:**
- Modify: `js/app.js:80-110, 4970-5110`
- Modify: `js/i18n.js:110-145, 645-690`
- Modify: `css/style.css:1350-1358`
- Test: `tests/scrap_profit_table.test.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Create `tests/scrap_profit_table.test.mjs`. Read `js/app.js`, `js/i18n.js`, and `js/runtime/runtime_config.js` as text and assert:

```js
assert.match(app, /rankUsedMarketBorderRoutes/);
assert.match(app, /function renderLegacyScrapProfitTable/);
assert.match(app, /RUNTIME_CONFIG\.scrapProfitTable === 'legacy'/);
assert.match(app, /targetBorder/);
assert.match(app, /fleetScrap.*Profit/);
assert.equal((i18n.match(/fleetScrapBorderHeading:/g) ?? []).length, 2);
assert.equal((i18n.match(/fleetScrapWorthBuying:/g) ?? []).length, 2);
assert.match(runtimeConfig, /scrapProfitTable/);
```

Add an assertion that the new table uses both `RUB` and `USD` route targets and that the old single-currency markup remains in the legacy function.

- [ ] **Step 2: Run the contract test and verify the intended failure**

Run: `node --test tests/scrap_profit_table.test.mjs`

Expected: FAIL because the new renderer, route import, and translations do not exist yet.

- [ ] **Step 3: Add bilingual strings and focused styles**

Add German and English strings for the new heading, route explanation, source border, route, target border, exact/unavailable status, profitable/not-profitable status, and profitable-route count. Keep the existing `fleetScrap*` keys used by the legacy table unchanged.

Add styles scoped to the new panel, using the existing positive/negative/warning tokens. Positive profits and the profitable status must be visually distinct; unavailable routes must not look like a loss. Keep the table horizontally scrollable through the existing `.tablewrap` behavior.

- [ ] **Step 4: Extract the old block without changing its behavior**

In `renderLogistics`, move the current scrap panel markup into `renderLegacyScrapProfitTable(scrapArbitrage, scrapTrades, scrapArbitrageTotal)`. Preserve its current `state.currency` formatting, heading, columns, sorting order, and explanatory strings byte-for-byte where practical. This function is the code path selected by `RUNTIME_CONFIG.scrapProfitTable === 'legacy'`.

- [ ] **Step 5: Add the new renderer and connect the feature flag**

Import `rankUsedMarketBorderRoutes`. Compute `scrapBorderRoutes = rankUsedMarketBorderRoutes(usedFleetRecords, { economy: eco })` independently of `state.currency`. Render one row per source-to-target route with vehicle name plus offer index, source border/currency, route label, converted purchase price, recovered material value, labor cost, net value, profit, and status. Use `targetCurrency` for every amount and make `worthBuying` positive only when `profit > 0`.

Use the new renderer by default and the legacy renderer when the flag is `'legacy'`. Keep every exact route, including negative rows and unavailable rows. Place the scrap panel independently of `fleetRecords.length` so a save with used offers but no owned vehicles still exposes the market table; do not move or change the owned-fleet, used-replacement, or logistics operation calculations.

- [ ] **Step 6: Run the UI contract and full tests**

Run: `node --test tests/scrap_profit_table.test.mjs && npm test`

Expected: PASS with zero failures.

- [ ] **Step 7: Commit the UI change**

```bash
git add js/app.js js/i18n.js css/style.css tests/scrap_profit_table.test.mjs
git commit -m "feat: show scrap profit across both borders"
```

### Task 4: Verify shipped cache markers and browser behavior

**Files:**
- Create: `tests/browser/scrap_profit_borders.mjs`
- Modify: `index.html`, `data/VERSION.json`, and any transitive cache markers staged by `.githooks/pre-commit`

- [ ] **Step 1: Add the browser probe**

Create a Playwright script accepting an optional save directory and base URL. Load the app with a real imported save when a directory is supplied, open Logistics, and assert the new scrap panel contains both `₽` and `$`, source labels for East/West where present, route arrows, at least one profit/status cell, and no page errors. With no save argument, the probe should exit with a concise usage message rather than claiming a browser validation.

- [ ] **Step 2: Run the local server and browser probe**

Run the project’s static server on an unused port, then run:

```bash
node tests/browser/scrap_profit_borders.mjs /absolute/path/to/save http://localhost:<port>/index.html
```

Expected: the imported Logistics page visibly shows the combined border table and no page/console errors. If no local save with `usedveh.bin` is available, record that the real-save probe is unavailable and still run the browser smoke check against the shipped shell.

- [ ] **Step 3: Verify cache/version contracts**

Run: `npm test`

Expected: the release/cache tests pass and the shell’s app/data/style markers are advanced consistently with the changed modules.

- [ ] **Step 4: Review the complete diff**

Run:

```bash
git diff --check
git diff HEAD~4..HEAD --stat
git status --short --branch
```

Review specifically for deleted legacy code, any use of `state.currency` in the new route renderer, invented seller identity, double-counted summary totals, and unrelated file changes. Fix findings, rerun tests, and commit any corrections.

- [ ] **Step 5: Push the feature branch**

After fresh verification and review:

```bash
git push -u origin feature/scrap-profit-borders
```

Report the pushed branch, commits, test results, and whether the real-save browser probe had an available save directory.
