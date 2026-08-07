# LowTech Start Year from History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the LowTech start year from the earliest exact `stats.ini` history record while preserving the existing manual override and fallback behavior.

**Architecture:** Extend the pure `lowTechSaveValues()` projection in `js/research.js` with an optional `startYear` derived from the minimum valid history year. Keep `renderResearch()` as the existing display/override boundary, adding only source copy that distinguishes a history-derived start year from the manual fallback.

**Tech Stack:** Vanilla ES modules, Node `node:test`, existing cache-version bump script, German/English string table.

## Global Constraints

- Only an exact `stats.ini` source may provide an automatic start year.
- An empty, malformed, missing, or non-exact history must never invent a start year.
- Manual LowTech edits continue to override every automatic save value.
- Do not stage or alter unrelated untracked reports, images, or workspace files.

---

### Task 1: Add failing history-derived start-year tests

**Files:**
- Modify: `tests/research.test.mjs` near the existing LowTech save-value tests

**Interfaces:**
- Consumes: `lowTechSaveValues(saveImport, { definitions, gameDate, statsRecords })`
- Produces: executable regression cases for `startYear`

- [ ] **Step 1: Write the failing test**

Add a test with deliberately unsorted records and invalid entries:

```js
test('LowTech uses the earliest valid imported history year as start year', () => {
  assert.equal(lowTechSaveValues({ sourceStatus: { stats: 'exact' } }, {
    definitions,
    gameDate: { year: 2001 },
    statsRecords: [{ year: 2001 }, { year: 1932 }, { year: 'bad' }, {}, { year: 1950 }],
  }).startYear, 1932);
});
```

Add a separate fallback guard:

```js
test('LowTech leaves start year unavailable without exact usable history', () => {
  assert.equal(lowTechSaveValues({ sourceStatus: { stats: 'missing' } }, {
    definitions,
    gameDate: { year: 2001 },
    statsRecords: [{ year: 1932 }],
  }).startYear, undefined);
  assert.equal(lowTechSaveValues({ sourceStatus: { stats: 'exact' } }, {
    definitions,
    gameDate: { year: 2001 },
    statsRecords: [{ year: 'bad' }],
  }).startYear, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/research.test.mjs`

Expected: the two new assertions fail because `lowTechSaveValues()` does not yet return `startYear`.

### Task 2: Implement the pure start-year projection

**Files:**
- Modify: `js/research.js` inside `lowTechSaveValues()`

**Interfaces:**
- Consumes: exact stats provenance and `statsRecords`
- Produces: optional numeric `values.startYear`

- [ ] **Step 1: Write minimal implementation**

After the existing current-year calculation, collect only integer years when the stats source is exact and use the minimum:

```js
if (exact('stats') && Array.isArray(statsRecords)) {
  const historyYears = statsRecords
    .map(record => record?.year)
    .filter(Number.isInteger);
  if (historyYears.length) values.startYear = Math.min(...historyYears);
}
```

Keep the existing current-year logic and research logic unchanged.

- [ ] **Step 2: Run the focused tests**

Run: `node --test tests/research.test.mjs`

Expected: all research tests pass, including both new start-year cases.

### Task 3: Expose history provenance in the LowTech UI

**Files:**
- Modify: `js/app.js` in `renderResearch()`
- Modify: `js/i18n.js` in both German and English LowTech strings
- Modify: `tests/lowtech_ui.test.mjs`

**Interfaces:**
- Consumes: `saveValues.startYear` from `importedLowTechValues()`
- Produces: localized source hint that explains whether the start year came from history

- [ ] **Step 1: Write the failing UI contract assertion**

Extend the existing UI source checks so the renderer contains a conditional history hint and both language tables define it:

```js
assert.match(app, /saveValues\.startYear/);
assert.match(app, /ltHistoryStart/);
assert.equal((i18n.match(/ltHistoryStart:/g) ?? []).length, 2);
```

Run: `node --test tests/lowtech_ui.test.mjs`

Expected: the new assertions fail because the source hint does not yet distinguish history-derived start years.

- [ ] **Step 2: Implement the UI copy and conditional hint**

Keep the existing save/manual source paragraph and append `t('ltHistoryStart')` only when `saveValues.startYear` is an integer; otherwise retain `t('ltStartManual')`:

```js
const startSource = Number.isInteger(saveValues.startYear)
  ? t('ltHistoryStart') : t('ltStartManual');
const saveSource = saveValuesAvailable
  ? el('p', { class: 'hint' }, lt.inputSource === 'manual' ? t('ltManualSource') : t('ltSaveSource'), ' ', startSource)
  : null;
```

Add these translations:

```js
ltHistoryStart: 'Das Startjahr stammt aus dem frühesten Historienjahr.',
ltHistoryStart: 'The start year comes from the earliest history year.',
```

- [ ] **Step 3: Run the focused UI tests**

Run: `node --test tests/lowtech_ui.test.mjs tests/research.test.mjs`

Expected: all focused LowTech tests pass.

### Task 4: Refresh release markers and verify the merged feature

**Files:**
- Modify: `index.html`, `data/VERSION.json`, and any transitive cache markers changed by `node tools/bump_cache_versions.mjs js/research.js`

**Interfaces:**
- Consumes: the completed LowTech helper and renderer
- Produces: a cache-safe browser release with focused regression evidence

- [ ] **Step 1: Bump the cache version**

Run: `node tools/bump_cache_versions.mjs js/research.js`

Expected: the release markers reference the next app build and `research.js` cache token.

- [ ] **Step 2: Run syntax and focused tests**

Run: `node --check js/research.js && node --test tests/research.test.mjs tests/lowtech_ui.test.mjs`

Expected: syntax check succeeds and every focused test passes.

- [ ] **Step 3: Review the diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: only the LowTech implementation, tests, translations, release markers, and this plan/spec history are tracked; unrelated untracked workspace files remain untouched.

- [ ] **Step 4: Commit the implementation**

```bash
git add js/research.js js/app.js js/i18n.js tests/research.test.mjs tests/lowtech_ui.test.mjs index.html data/VERSION.json
git commit -m "feat: derive LowTech start year from history"
```

