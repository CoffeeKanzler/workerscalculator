# Production Input Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make border purchase prices the default production-input cost while preserving the prior sell-price opportunity-cost view.

**Architecture:** Add one explicit `costBasis` argument at the economy boundary and pass it only from Price Analysis. Keep every other calculator call on the legacy default until separately opted in. Store the Analysis choice in compatible UI state.

**Tech Stack:** Vanilla ES modules, Node test runner, DOM renderer in `js/app.js`.

## Global Constraints

- Do not change production recipes; the slaughterhouse remains 150 livestock to 60 meat.
- Preserve legacy opportunity-cost behavior as an explicit selectable mode.
- Default Price Analysis to purchase/cash cost.
- No new dependency.

---

### Task 1: Explicit economy cost basis

**Files:**
- Modify: `tests/calc.test.mjs`
- Modify: `js/calc.js`

**Interfaces:**
- Produces: `Economy.inputPrice(nameOrKey, currency, costBasis = 'opportunity')`
- Produces: `Economy.buildingProfit(b, currency, productivity, count, quality, costBasis)`

- [ ] **Step 1: Write failing tests** proving `purchase` uses `buy`, `opportunity` retains `sell`, and the slaughterhouse cash result uses 2.5 tonnes livestock per tonne meat.
- [ ] **Step 2: Run** `node --test tests/calc.test.mjs` and confirm failures arise from the missing cost-basis behavior.
- [ ] **Step 3: Implement** the two signatures above; workers continue to use workday cost and outputs continue to use sell prices.
- [ ] **Step 4: Run** `node --test tests/calc.test.mjs` and confirm green.
- [ ] **Step 5: Commit** `tests/calc.test.mjs js/calc.js` as `fix: price production inputs at purchase cost`.

### Task 2: Analysis cost-basis control

**Files:**
- Modify: `tests/analysis_cost_basis.test.mjs`
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css`
- Modify: `index.html` and transitive cache markers

**Interfaces:**
- Consumes: `Economy.buildingProfit(..., costBasis)`
- Produces: `state.analysisCostBasis` with `purchase` default and `opportunity` alternative.

- [ ] **Step 1: Write a failing UI contract test** that checks both translated labels, compatible state default, explicit pass-through to `buildingProfit`, and retained legacy option.
- [ ] **Step 2: Run** `node --test tests/analysis_cost_basis.test.mjs` and confirm the new contract is absent.
- [ ] **Step 3: Add** the control beside worker type, its plain-language hint, state normalization, and restrained border-led styling consistent with `.analysis-worker-mode`.
- [ ] **Step 4: Bump** all cache markers using the repository cache-bump workflow.
- [ ] **Step 5: Run** the focused test plus `node --check js/app.js`.
- [ ] **Step 6: Commit** the UI and test as `feat: select production input cost basis`.

