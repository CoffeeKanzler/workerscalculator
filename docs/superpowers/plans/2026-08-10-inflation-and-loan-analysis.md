# Inflation and Loan Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive RUB/USD purchasing-power indices from save price history and evaluate saved loans with the executable's daily formula.

**Architecture:** Keep mathematics in a dependency-free pure module, parse loan blocks separately from historical records, and surface results in the existing History tab. Save import and manual/live `stats.ini` paths carry the same active-loan slice.

**Tech Stack:** Vanilla ES modules, Node test runner, existing uPlot chart wrapper, save Web Worker.

## Global Constraints

- Inflation is an equal-weight geometric index over positive common prices.
- Purchase and sell indices and RUB/USD remain separate.
- Loan simulation uses `annualRate / 100 / 365` and the proven daily order.
- Missing history or loan fields stay unavailable; no invented values.
- All calculations stay local and dependency-free.

---

### Task 1: Pure price-index mathematics

**Files:**
- Create: `tests/economic_analysis.test.mjs`
- Create: `js/models/economic_analysis.js`

**Interfaces:**
- Produces: `buildPriceIndex(records, { currency, basis })`
- Produces: `summarizeInflation(indexPoints)`
- Produces: `rollingAnnualRates(indexPoints)` and `quantile(values, q)`

- [ ] **Step 1: Write failing literal tests** for a two-resource geometric step, chained index, missing-resource intersection, irregular-date annualization, and quartiles.
- [ ] **Step 2: Run** `node --test tests/economic_analysis.test.mjs` and confirm module-not-found/exports are the only failures.
- [ ] **Step 3: Implement** date ordinal, positive common-price filtering, log-mean factor, chained points with coverage, annualized endpoint summaries, rolling annual rates, and interpolated quantiles.
- [ ] **Step 4: Run** the focused test and refactor only after green.
- [ ] **Step 5: Commit** as `feat: derive save price inflation indices`.

### Task 2: Loan block parser

**Files:**
- Modify: `tests/statsini.test.mjs`
- Modify: `js/statsini.js`
- Modify: `js/live_stats.js`

**Interfaces:**
- Produces: `parseLoans(text): Loan[]`
- Extends: `parseLiveStatsFile(...).loans`

- [ ] **Step 1: Write failing tests** with two complete `$LoanStart` blocks and one incomplete block; assert exact numeric fields and currency mapping (`LoanType 1` RUB, `2` USD).
- [ ] **Step 2: Run** `node --test tests/statsini.test.mjs tests/live_stats.test.mjs` and verify parser absence is the cause.
- [ ] **Step 3: Implement** a block state machine independent of `parseStatsIni`; accept the ten proven labels and exclude incomplete/non-finite records.
- [ ] **Step 4: Return loans** from the live stats boundary and update its complete fixture.
- [ ] **Step 5: Run** focused tests and commit as `feat: parse active loans from stats ini`.

### Task 3: Exact loan simulator and scenarios

**Files:**
- Modify: `tests/economic_analysis.test.mjs`
- Modify: `js/models/economic_analysis.js`

**Interfaces:**
- Produces: `simulateLoan(loan, { availableCash, maxDays })`
- Produces: `effectiveAnnualRate(annualRate)` and `realAnnualRate(effective, inflation)`
- Produces: `evaluateLoanScenarios(loan, indexPoints)`

- [ ] **Step 1: Add failing hand-calculated tests** for one daily accrual/payment, full repayment, zero cash transferring shortfall to penalty, effective rate, and base/best/worst ordering.
- [ ] **Step 2: Run** the focused suite and verify RED.
- [ ] **Step 3: Implement** the daily loop with bounded horizon, payment cap, penalty-first allocation, scheduled-principal shortfall transfer, accumulated totals, and scenario reason codes.
- [ ] **Step 4: Run** focused tests and refactor after green.
- [ ] **Step 5: Commit** as `feat: simulate save loans and real cost scenarios`.

### Task 4: Carry loans through every stats import path

**Files:**
- Modify: `tests/import_stats_reset.test.mjs`
- Modify: `tests/save_folder_adapter.test.mjs`
- Modify: `js/models/import_stats.js`
- Modify: `js/savegame_worker.js`
- Modify: `js/adapters/save_folder_adapter.js`
- Modify: `js/app.js`

**Interfaces:**
- Extends: `statsStateForImport({ statsRecords, activeLoans, ... })`
- Produces: `state.activeLoans`, reset when the next save has no stats.

- [ ] **Step 1: Write failing tests** proving active loans are carried with stats and cleared on a stats-less import.
- [ ] **Step 2: Run** both focused suites and verify RED.
- [ ] **Step 3: Parse loans in the worker**, return them from the adapter, include them in import stats state, and update manual/live refresh assignment.
- [ ] **Step 4: Run** focused tests and commit as `feat: carry active loans through save import`.

### Task 5: History decision surface

**Files:**
- Create: `tests/inflation_loan_ui.test.mjs`
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css`
- Modify: `index.html` and transitive cache markers

**Interfaces:**
- Consumes: all `economic_analysis.js` exports and `state.activeLoans`.
- Produces: an economic section inside `renderRepublicHistory()`.

- [ ] **Step 1: Write a failing UI contract test** for translated title/copy, currency and basis controls, index chart, scenario labels, evidence copy, and distinct empty states.
- [ ] **Step 2: Run** the focused test and verify RED.
- [ ] **Step 3: Add** a decision strip with latest/5-year/all rates, common-resource coverage, effective/real loan rate, recommendation and reasons; mount the index series using the existing history chart group.
- [ ] **Step 4: Add** compact contract rows for each active loan and a purchase/sell control; preserve existing generic charts below.
- [ ] **Step 5: Style** with existing surfaces, semantic colors, tabular numerals, responsive single-column fallback, and dark-mode-safe borders.
- [ ] **Step 6: Bump cache markers**, run the focused test and `node --check js/app.js`.
- [ ] **Step 7: Commit** as `feat: show inflation and loan decisions in history`.

### Task 6: Integrated verification

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] **Step 1: Run** `npm test` and require zero failures.
- [ ] **Step 2: Start/reuse the verified worktree server** and run the save-import browser oracle against a complete save directory when available.
- [ ] **Step 3: Interact with** History currency/basis controls, inspect loan scenarios, and verify both light and dark modes at desktop and narrow width.
- [ ] **Step 4: Run** cache-contract checks and `git diff --check`.
- [ ] **Step 5: Record** exact runtime evidence and any unavailable real-save boundary before claiming completion.
