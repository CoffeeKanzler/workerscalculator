# Credit UX Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Credits tab around normal credit cost and cash burden, with electronics clearly separated as an optional collapsed experiment.

**Architecture:** Keep all existing economic and forecast math. Add a small pure credit-presentation model for plain-language verdicts and nominal additional cost, then reshape `renderCredits()` into ordered section renderers with native disclosures. Reuse the existing Command Center design system and desktop chart/table infrastructure.

**Tech Stack:** Vanilla JavaScript ES modules, DOM builder in `js/app.js`, project i18n tables, CSS, Node test runner, Playwright browser checks.

## Global Constraints

- Mobile layout work, responsive-table rewrites, breakpoint changes, and mobile acceptance are out of scope.
- The game-derived loan formula and electronics forecast mathematics do not change.
- No visible imperative credit recommendation is allowed.
- The normal credit calculation and optional electronics required principal remain separate.
- Losing electronics strategies remain hidden by the existing 30-year relevance gate.
- Preserve the existing Command Center palette, typography, navigation, and desktop density.

---

### Task 1: Add a pure credit summary model

**Files:**
- Create: `js/models/credit_summary.js`
- Create: `tests/credit_summary.test.mjs`

**Interfaces:**
- Consumes: `evaluateLoanScenarios(loan, normalIndex)` output and a loan object.
- Produces: `summarizeCreditTerms({ loan, normalIndex })` returning `totalPaid`, `additionalCost`, `maxDailyPayment`, `effectiveRate`, `expectedRealRate`, `recommendation`, and `hasInflationEvidence`.
- Produces: `creditVerdictKey(summary)` returning `creditInflationExceeds`, `creditCostsSimilar`, `creditCostsExceed`, or `creditInflationUnavailable`.

- [ ] **Step 1: Write failing model tests**

Assert that a 100,000-unit loan reports additional cost as total paid minus exactly 100,000, negative expected real rate maps to `creditInflationExceeds`, risky positive real rate maps to `creditCostsExceed`, and absent normal history maps to `creditInflationUnavailable` without hiding nominal results.

- [ ] **Step 2: Run RED**

Run: `node --test tests/credit_summary.test.mjs`

Expected: FAIL because `js/models/credit_summary.js` does not exist.

- [ ] **Step 3: Implement the minimal pure adapter**

Call the existing scenario evaluator once, preserve its exact simulation, and derive only presentation-facing fields. Do not duplicate the loan formula.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/credit_summary.test.mjs tests/economic_analysis.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/models/credit_summary.js tests/credit_summary.test.mjs
git commit -m "feat: summarize credit cost and inflation burden"
```

---

### Task 2: Lock the new page hierarchy and content contract

**Files:**
- Modify: `tests/credit_tab_ui.test.mjs`
- Modify: `tests/inflation_loan_ui.test.mjs`
- Modify: `tests/electronics_strategy_ui.test.mjs`
- Modify: `tests/i18n_coverage.test.mjs` only if placeholder parity requires it

**Interfaces:**
- Produces the source/UI contract that Task 3 must satisfy.

- [ ] **Step 1: Write failing hierarchy assertions**

Assert the render order `renderCreditDataStatus`, `renderActiveCreditPosition`, `renderNewCreditCalculator`, `renderOptionalElectronicsStrategy`, `renderCreditHistoryEvidence`. Assert the electronics and history sections use closed `details` elements, while current credit facts are not hidden.

- [ ] **Step 2: Write failing copy assertions**

Require bilingual keys for the approved plain-language labels, conditional electronics copy, caveat, missing-history message, scenario names, and production-chain labels. Assert the renderer contains no `creditTakeLoanAction` call and does not use `electronicsRecipeVanilla` as the production selector label.

- [ ] **Step 3: Run RED**

Run: `node --test tests/credit_tab_ui.test.mjs tests/inflation_loan_ui.test.mjs tests/electronics_strategy_ui.test.mjs`

Expected: FAIL on old hierarchy, imperative copy, and always-open sections.

- [ ] **Step 4: Commit the red tests**

```bash
git add tests/credit_tab_ui.test.mjs tests/inflation_loan_ui.test.mjs tests/electronics_strategy_ui.test.mjs
git commit -m "test: define simplified credit experience"
```

---

### Task 3: Rebuild the Credits renderer around credit burden

**Files:**
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css`
- Test: files changed in Task 2

**Interfaces:**
- Consumes: `summarizeCreditTerms` and `creditVerdictKey` from Task 1.
- Produces: `renderCreditDataStatus(context)`, `renderActiveCreditPosition(context)`, `renderNewCreditCalculator(context)`, `renderOptionalElectronicsStrategy(context)`, `renderCreditHistoryEvidence(context)`, and the coordinating `renderCredits()`.

- [ ] **Step 1: Import the summary adapter and create one shared context**

Build normal inflation, active contracts, hypothetical terms, save evidence, forecasts, quotes, opportunities, and formatting helpers once in `renderCredits()`. Pass that context to section renderers.

- [ ] **Step 2: Render compact data status and active-credit cards**

Place active contracts first. Show principal, nonzero penalty, remaining payments, maximum daily rate, effective rate, expected real rate, and the direct verdict. Put best/base/worst and formulas in a closed `How was this assessed?` disclosure.

- [ ] **Step 3: Render the self-contained new-credit calculator**

Show amount, APR, term, currency and outputs that all refer to that amount: total repayment, additional nominal cost, maximum daily rate, effective rate, expected real rate, and verdict. Move general-inflation comparison into a disclosure. Remove import/export series controls from the primary calculator surface.

- [ ] **Step 4: Render electronics as a closed optional disclosure**

Start with the explicit experimental warning and missing-cost list. Use conditional break-even copy, required investment principal, expected/cautious holding time, exit currency, and the production-chain label `Electronics production chain`. Nest alternate exits, chart, and milestones inside a second assumptions disclosure. Do not render an imperative action.

- [ ] **Step 5: Render history and evidence as a closed disclosure**

Move normal/import/export index controls, charts, saved aggregate credit values, and reconstruction boundary into this section. Show one provenance badge. When history is insufficient, render the actionable `stats.ini` message instead of dash metric cards.

- [ ] **Step 6: Apply the restrained desktop visual hierarchy**

Add desktop classes for verdict strips, active-credit ledger cards, disclosures, compact evidence status, and section spacing. Remove prominent long-horizon milestone cards and repeated per-metric evidence badges from the Credits renderer. Do not add or edit mobile media queries.

- [ ] **Step 7: Run GREEN and syntax checks**

Run:

```bash
node --test tests/credit_summary.test.mjs tests/credit_tab_ui.test.mjs tests/inflation_loan_ui.test.mjs tests/electronics_strategy_ui.test.mjs tests/i18n_coverage.test.mjs
node --check js/app.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/app.js js/i18n.js css/style.css tests
git commit -m "feat: separate credit burden from optional electronics"
```

---

### Task 4: Verify the desktop experience in the browser

**Files:**
- Modify: `tests/browser/inflation_loan.mjs`
- Modify: `tests/browser/electronics_loan_hedge.mjs`

**Interfaces:**
- Uses the complete `/home/nexx/bigsavegame` import and controlled multi-year `stats.ini` fixture.

- [ ] **Step 1: Change browser assertions before production integration fixes**

Assert current credit precedes calculator, calculator totals use the entered amount, no visible `Take the loan`/`Kredit aufnehmen` exists, optional electronics is initially closed, and history/evidence is initially closed.

- [ ] **Step 2: Assert expanded electronics behavior**

After a real pointer click, verify the warning, conditional break-even sentence, required principal, expected/cautious labels, both exit currencies, chart hover, and absence of `Assembly hall`/`Montagehalle`.

- [ ] **Step 3: Assert empty-history behavior**

Load a one-record or missing-history fixture and verify the actionable `stats.ini` message and absence of inflation dash cards.

- [ ] **Step 4: Run browser validation**

Run the two browser scripts against a server rooted at the feature worktree. Capture light and dark desktop screenshots. Expect no console or page errors.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/inflation_loan.mjs tests/browser/electronics_loan_hedge.mjs js/app.js js/i18n.js css/style.css
git commit -m "test: verify simplified credit workflow"
```

---

### Task 5: Review, cache, merge, and push

**Files:**
- Modify mechanically: `index.html`, `data/VERSION.json`, and transitive JS import markers.

**Interfaces:**
- Produces a cache-coherent build on `main` matching `origin/main`.

- [ ] **Step 1: Request an independent correctness and UX review**

Review the feature diff against the approved design. Fix all Critical and Important findings before integration.

- [ ] **Step 2: Advance and verify cache markers**

Run the project cache bumper on every changed JS/CSS file, then run its `--check` mode over the full feature diff.

- [ ] **Step 3: Run complete verification**

```bash
npm test
node --check js/app.js
node --check js/models/credit_summary.js
node --check js/models/credit_forecast.js
node --check js/savegame_worker.js
git diff --check
```

Expected: zero failures.

- [ ] **Step 4: Merge into main and reverify**

Preserve unrelated untracked files, merge with a merge commit, rerun full tests, syntax checks, cache checks, and both browser scenarios from the main checkout.

- [ ] **Step 5: Push and prove equality**

```bash
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote --heads origin main | awk '{print $1}')"
```

Expected: equality test exits zero.
