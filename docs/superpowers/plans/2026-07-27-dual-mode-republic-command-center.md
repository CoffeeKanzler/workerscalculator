# Dual-Mode Republic Command Center Implementation Plan (Plan 17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Workers Calculator as one evidence-aware command center that
loads complete save folders on the hosted site and live SDK state as an addon,
while retaining every planning tool.

**Architecture:** Save and SDK adapters produce one normalized `RepublicModel`.
Planning state is separate and always hypothetical. Focused UI modules replace
the 5,000-line `app.js` incrementally without rewriting proven parsers/formulas.
One deterministic build emits hosted and static-addon artifacts.

**Tech Stack:** browser ES modules, Web Workers, IndexedDB, Node tests,
Playwright/axe; no server-side save processing.

---

### Task 1: Evidence-aware normalized model

**Files:**
- Create: `js/models/evidence.js`, `js/models/republic_model.js`
- Create: `tests/republic_model.test.mjs`
- Modify compatibility exports in `js/republic.js`

- [ ] Test source, observed/game date, completeness, confidence, capability and
  warning for scalar/collection values.
- [ ] Implement `createEvidence` and `createRepublicModel` with schema version,
  generation and stable IDs.
- [ ] Preserve existing `buildRepublicModel`, comparisons and alerts through a
  compatibility projection.
- [ ] Commit: `Add the normalized republic evidence model`.

### Task 2: Save-folder adapter

**Files:**
- Create: `js/adapters/save_folder_adapter.js`, `save_projection.js`
- Create adapter tests
- Modify: `js/app.js` only to delegate existing import

- [ ] Test required/optional files, progress, local-only reads and normalized
  output using existing fixtures.
- [ ] Extract `handleSaveDirectory`, worker parsing, imported planning,
  operational services and Workshop catalog orchestration.
- [ ] Continue using existing binary/stats parsers unchanged.
- [ ] Commit: `Extract the local save folder adapter`.

### Task 3: Separate planning model and storage

**Files:**
- Create: `js/models/planning_model.js`
- Create: `js/storage/planning_store.js`
- Create tests
- Modify: `js/app.js`, `js/storage.js`

- [ ] Test seeding changes evidence to `PLAN`, later observation refresh cannot
  overwrite edits, comparison and `wr-planner-v1` migration.
- [ ] Move plan/cities/chains/vehicle production/train/lowtech/options/custom
  building state out of observation state.
- [ ] Commit: `Separate planning from observed republic state`.

### Task 4: SDK client and live projection

**Files:**
- Create: `js/adapters/sdk_client.js`, `live_projection.js`,
  `live_sdk_adapter.js`
- Create tests with fake gateway fixtures

- [ ] Validate HTTP/`ok`/record size/items/cursors/capability failures.
- [ ] Project lifecycle, game/republic/city/building/storage/citizen/resource/
  flow/vehicle/research/event/transport sources.
- [ ] Keep exact missing capability as unavailable evidence.
- [ ] Use relative SDK URLs through Plan 15's addon bridge.
- [ ] Commit: `Add the live SDK republic adapter`.

### Task 5: Generation and cursor resynchronization

**Files:**
- Modify: `live_sdk_adapter.js`
- Extend tests

- [ ] Test generation change during snapshot, overflow, non-monotonic event and
  atomic replacement after resync.
- [ ] Discard stale entity state and publish visible `resynchronizing`.
- [ ] Retry incoherent multi-source snapshots until the generation/sequences
  agree; never merge generations.
- [ ] Commit: `Resynchronize live republic state safely`.

### Task 6: Hosted/addon runtime bootstrap

**Files:**
- Create: `js/bootstrap.js`
- Create: `js/runtime/runtime_config.js`, `hosted_runtime.js`,
  `addon_runtime.js`
- Create tests
- Modify: `index.html`, `beta/index.html`

- [ ] Hosted defaults to save folder and makes no non-static network request.
- [ ] Addon defaults to live SDK and may import saves for comparison.
- [ ] Remove path-derived `IS_BETA` behavior.
- [ ] Commit: `Split hosted and addon runtime adapters`.

### Task 7: Command-center information architecture

**Files:**
- Create modules under `js/ui/`: shell, navigation, evidence badge, observe,
  diagnose, plan, compare, loading, capability gap
- Incrementally reduce `js/app.js`
- Modify: `js/i18n.js`

- [ ] Add DOM tests for Observe/Diagnose/Plan/Compare and textual evidence.
- [ ] Extract current planner renderers without changing formulas.
- [ ] Implement morning brief, population, industry, logistics, transport,
  economy, cities/history, diagnostics and all existing planners.
- [ ] Commit in independent extraction slices, ending with:
  `Rebuild the Republic Command Center navigation`.

### Task 8: Visual system, responsiveness and accessibility

**Files:**
- Modify: `css/style.css`, `index.html`
- Create: `playwright.config.mjs`, `tests/browser/*.spec.mjs`
- Modify: `package.json`

- [ ] Implement planning-office palette, evidence/mode signature, bounded
  measures and responsive navigation.
- [ ] Test landmarks, tabs, focus, keyboard, no color-only state, reduced
  motion, table overflow and 1920/2560/5120 layouts.
- [ ] Run axe and fail on page/console/network errors.
- [ ] Commit: `Redesign the Republic Command Center interface`.

### Task 9: Deterministic dual packaging

**Files:**
- Create: `scripts/build-release.mjs`, `integrity-manifest.mjs`
- Create: `packaging/addon.json`
- Create: `tests/release_build.test.mjs`

- [ ] Emit `dist/hosted`, static addon folder/ZIP and integrity manifest from
  one revision/assets; only bootstrap differs.
- [ ] Build twice and compare every hash.
- [ ] Manifest uses Plan 14's static-only format and declared read capabilities.
- [ ] Commit: `Package hosted and addon command centers together`.

### Task 10: Cross-adapter acceptance

**Files:**
- Create shared synthetic save/fake-SDK fixtures
- Create: `tests/adapter_equivalence.test.mjs`
- Update README/ROADMAP/deployment docs

- [ ] Assert equivalent republic date/population, cities, buildings/staffing,
  resources, research and transport with expected provenance differences.
- [ ] Run every existing parser/planner test plus browser tests.
- [ ] Verify save-folder mode uploads nothing.
- [ ] Commit: `Verify the dual-mode Republic Command Center`.

