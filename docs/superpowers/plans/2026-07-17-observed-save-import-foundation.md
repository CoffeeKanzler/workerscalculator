# Observed Save Import Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a save as a lossless observed republic snapshot, seed correct production and city planning defaults, and make named snapshots preserve the imported history and evidence.

**Architecture:** Binary decoding stays in `js/savegame.js`; pure aggregation and planner seeding move into `js/save_model.js`; browser orchestration remains in `js/app.js`. Large named snapshots move to IndexedDB through `js/storage.js`, while share links continue to omit personal `stats.ini` history.

**Tech Stack:** Browser ES modules, `ArrayBuffer`/`DataView`, Web Worker, IndexedDB, Node test runner, GitHub Pages.

---

### Task 1: Give named snapshots a complete, quota-safe boundary

**Files:**
- Create: `js/storage.js`
- Create: `tests/storage.test.mjs`
- Modify: `js/app.js:14-17, 427-476, 2064-2150, 2192-2209`

- [ ] **Step 1: Write the storage contract test**

Create `tests/storage.test.mjs` with an injected in-memory adapter so Node does
not need a browser IndexedDB implementation:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotStore } from '../js/storage.js';

test('named snapshots round-trip private history without object aliasing', async () => {
  const rows = new Map();
  const store = createSnapshotStore({
    get: async key => structuredClone(rows.get(key)),
    put: async (key, value) => rows.set(key, structuredClone(value)),
    delete: async key => rows.delete(key),
    entries: async () => [...rows.entries()].map(([key, value]) => [key, structuredClone(value)]),
  });
  const state = { plan: { rows: [{ count: 2 }] }, statsRecords: [{ year: 2001 }], saveImport: { version: 2 } };
  await store.save('Republic 2001', state);
  state.plan.rows[0].count = 99;
  const loaded = await store.load('Republic 2001');
  assert.equal(loaded.plan.rows[0].count, 2);
  assert.equal(loaded.statsRecords[0].year, 2001);
  assert.deepEqual(await store.names(), ['Republic 2001']);
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `rtk node --test tests/storage.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/storage.js`.

- [ ] **Step 3: Implement the snapshot store and browser adapter**

Create `js/storage.js` with the following public interface. The browser adapter
uses database `wr-planner`, version `1`, object store `snapshots`, and stores
`{ name, savedAt, state }` by name:

```js
export function createSnapshotStore(adapter) {
  return {
    async names() {
      const entries = await adapter.entries();
      return entries.map(([name]) => name).sort((a, b) => a.localeCompare(b));
    },
    async save(name, state) {
      if (!name?.trim()) throw new Error('Snapshot name is empty');
      await adapter.put(name, { name, savedAt: Date.now(), state: structuredClone(state) });
    },
    async load(name) {
      const entry = await adapter.get(name);
      return entry ? structuredClone(entry.state) : null;
    },
    async remove(name) { await adapter.delete(name); },
  };
}

export function createIndexedDbSnapshotStore(indexedDB = globalThis.indexedDB) {
  const request = indexedDB.open('wr-planner', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'name' });
  const db = new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const operation = async (mode, action) => {
    const database = await db;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('snapshots', mode);
      const store = transaction.objectStore('snapshots');
      const result = action(store);
      transaction.oncomplete = () => resolve(result.value);
      transaction.onerror = () => reject(transaction.error);
    });
  };
  return createSnapshotStore({
    get: key => operation('readonly', store => {
      const value = {}; const req = store.get(key); req.onsuccess = () => { value.value = req.result; }; return value;
    }),
    put: (_key, value) => operation('readwrite', store => { store.put(value); return {}; }),
    delete: key => operation('readwrite', store => { store.delete(key); return {}; }),
    entries: () => operation('readonly', store => {
      const value = {}; const req = store.getAll();
      req.onsuccess = () => { value.value = req.result.map(entry => [entry.name, entry]); }; return value;
    }),
  });
}
```

- [ ] **Step 4: Make `app.js` use separate shared and snapshot payloads**

Import `createIndexedDbSnapshotStore`, define `SNAPSHOT_KEYS` as
`[...SHARE_KEYS, 'statsRecords', 'statsName', 'recordIndex']`, and replace the
old localStorage named-save functions with async store calls. `sharedState()`
must continue using only `SHARE_KEYS`; `snapshotState()` must clone every
`SNAPSHOT_KEYS` value. Loading a named snapshot calls the same replacement
logic with `SNAPSHOT_KEYS`, so absent history is cleared instead of leaking from
the previously open save.

Use this exact projection helper:

```js
function stateProjection(keys) {
  return Object.fromEntries(keys.map(key => [key, cloneStateValue(state[key])]));
}
function sharedState() { return stateProjection(SHARE_KEYS); }
function snapshotState() { return stateProjection(SNAPSHOT_KEYS); }
```

Make save/load/delete button handlers `async`, refresh a transient
`namedSnapshotNames` array after each mutation, and load it once before the
first render. On first boot, read legacy `wr-planner-saves-v1`, copy every
well-formed `{ state }` entry that does not already exist into IndexedDB, verify
the copied names, and only then remove the legacy localStorage key. This keeps
all existing user plans even though old entries did not contain private history.

- [ ] **Step 5: Run storage and existing tests**

Run: `rtk node --test tests/storage.test.mjs && rtk npm test`

Expected: the focused test passes and the full suite reports zero failures.

- [ ] **Step 6: Commit the snapshot boundary**

```bash
rtk git add js/storage.js js/app.js tests/storage.test.mjs
rtk git commit -m "Preserve complete named save snapshots"
```

### Task 2: Decode exact live-building configuration

**Files:**
- Modify: `js/savegame.js:130-246`
- Create: `tests/savegame.test.mjs`

- [ ] **Step 1: Write a minimal one-building parser fixture**

Create a zero-filled `0x758` building record after the four-byte count. Set the
fixed type, scope, worker fields, and mine-quality field, then assert exact
consumption and values:

```js
test('live building exposes configured caps, current workers and mine quality', () => {
  const buffer = new ArrayBuffer(4 + 0x758);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 1, true);
  bytes.set(new TextEncoder().encode('coal_mine'), 4);
  view.setInt32(4 + 0x100, 31, true);
  view.setInt32(4 + 0x478, 95, true);
  view.setInt32(4 + 0x4a0, 120, true);
  view.setInt32(4 + 0x4a4, 0, true);
  view.setFloat32(4 + 0x4a8, 0.56467056, true);
  const [building] = parseBuildingsGame(buffer);
  assert.equal(building.currentWorkers, 95);
  assert.equal(building.configuredWorkers, 120);
  assert.equal(building.configuredWorkersHighEducation, 0);
  assert.ok(Math.abs(building.mineQuality - 0.56467056) < 1e-6);
});
```

- [ ] **Step 2: Run the fixture and verify the fields are absent**

Run: `rtk node --test tests/savegame.test.mjs`

Expected: FAIL because `configuredWorkers` is `undefined`.

- [ ] **Step 3: Read the four proven fixed fields**

Add these properties while constructing each building record:

```js
currentWorkers: c.view.getInt32(start + first(0x2b0), true),
configuredWorkers: c.view.getInt32(start + first(0x288), true),
configuredWorkersHighEducation: c.view.getInt32(start + first(0x284), true),
mineQuality: c.view.getFloat32(start + first(0x280), true),
```

Keep traversal and exact final-byte validation unchanged.

- [ ] **Step 4: Run the focused test**

Run: `rtk node --test tests/savegame.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the building fields**

```bash
rtk git add js/savegame.js tests/savegame.test.mjs
rtk git commit -m "Import exact live building configuration"
```

### Task 3: Decode current citizens, header metadata, and research

**Files:**
- Modify: `js/savegame.js`
- Modify: `tests/savegame.test.mjs`

- [ ] **Step 1: Add binary fixtures for all three optional sources**

The worker fixture contains one `0x718` fixed block plus the mandatory `0x10`
extension for save versions above `0x71`. Assert residence `7`, education `2`,
age `40`, and the four status floats. Header asserts version `124`, UTF-16 title,
and ASCII save path. Research asserts one `0x58` record with progress `0.5` and
building index `221`.

```js
assert.deepEqual(parseWorkers(workerBuffer, { saveVersion: 124 }).summary,
  { recordCount: 1, byteLength: 1836, trailingBytes: 0 });
assert.equal(parseHeader(headerBuffer).saveVersion, 124);
assert.deepEqual(parseResearch(researchBuffer)[0], {
  key: 'vaccine_development', progress: 0.5, buildingIndex: 221, flags: 3,
});
```

- [ ] **Step 2: Run tests and verify missing exports**

Run: `rtk node --test tests/savegame.test.mjs`

Expected: FAIL because `parseWorkers`, `parseHeader`, and `parseResearch` are not exported.

- [ ] **Step 3: Implement fixed worker traversal**

Export `parseWorkers(buffer, { saveVersion = 124 } = {})`. Read the top-level
count and, for each record, return only these compact fields:

```js
{
  index,
  id: view.getInt32(start, true),
  residenceBuildingIndex: view.getInt32(start + 0x10, true),
  education: view.getFloat32(start + 0x74, true),
  age: view.getFloat32(start + 0x84, true),
  happiness: view.getFloat32(start + 0x88, true),
  food: view.getFloat32(start + 0x8c, true),
  health: view.getFloat32(start + 0x90, true),
  loyalty: view.getFloat32(start + 0x94, true),
}
```

Advance `0x718`, then `0x10` when `saveVersion > 0x71`, then nine bytes when
signed byte `start + 0x700` is positive, then `0x80` when byte
`start + 0x70c` is non-zero. Require the final cursor to equal file length and
return `{ citizens, summary: { recordCount, byteLength, trailingBytes: 0 } }`.

- [ ] **Step 4: Implement header and research parsers**

`parseHeader` requires at least `0x203` bytes and returns `saveVersion` from
`+0`, UTF-16LE `title` from `+4` within `0x100` bytes, and ASCII `savePath`
from `+0x103` within `0x100` bytes. `parseResearch` requires exactly
`4 + count * 0x58` bytes and returns the key at `+0`, progress at `+0x40`,
building index at `+0x44`, and unsigned flags at `+0x48`.

- [ ] **Step 5: Run parser tests and commit**

Run: `rtk node --test tests/savegame.test.mjs`

Expected: all save parser tests pass.

```bash
rtk git add js/savegame.js tests/savegame.test.mjs
rtk git commit -m "Decode save citizens metadata and research"
```

### Task 4: Build a pure observed-republic model

**Files:**
- Create: `js/save_model.js`
- Create: `tests/save_model.test.mjs`

- [ ] **Step 1: Write citizen aggregation tests**

Test two residence-linked citizens in scope `4`, one unassigned citizen, and
the proven productivity formula:

```js
test('citizens aggregate through residence buildings without forced assignment', () => {
  const buildings = [{ index: 0, scopeId: 4, type: 'panelak' }];
  const citizens = [
    { residenceBuildingIndex: 0, age: 30, education: 2, happiness: 0.8, food: 1, health: 0.9, loyalty: 0.7 },
    { residenceBuildingIndex: 0, age: 10, education: 0.5, happiness: 0.7, food: 1, health: 0.8, loyalty: 0.6 },
    { residenceBuildingIndex: -1, age: 25, education: 1, happiness: 0.6, food: 1, health: 0.7, loyalty: 0.5 },
  ];
  const result = aggregateCitizensByScope(citizens, buildings);
  assert.equal(result.scopes.get(4).residents, 2);
  assert.equal(result.scopes.get(4).adults, 1);
  assert.equal(result.scopes.get(4).highEducation, 1);
  assert.equal(result.unassigned, 1);
});
```

- [ ] **Step 2: Run tests and verify the module is missing**

Run: `rtk node --test tests/save_model.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement productivity and scope aggregation**

Export the following exact productivity function and an aggregator that keeps
sums internally, returns averages in `[0,1+]`, counts invalid residence indices,
and never assigns an invalid/unassigned citizen to a scope:

```js
export function citizenProductivity({ happiness, food, health, loyalty }) {
  const base = 0.5 * (0.6 * food + 0.5 * health + 1.8 * happiness - 0.675);
  return Math.max(0.3, base * (0.65 + 0.7 * loyalty));
}
```

Export `aggregateCitizensByScope(citizens, buildings)` returning
`{ scopes: Map<number, CitizenAggregate>, unassigned, invalidResidenceRefs,
recordCount }`. Each aggregate contains residents, adults (`age > 21`),
highEducation (`education >= 2`), and averages for productivity, happiness,
food, health, and loyalty.

- [ ] **Step 4: Add lossless building compaction**

Export `compactObservedBuildings(buildings)` and preserve exactly:

```js
({ index, type, name, scopeId, x, y, z, currentWorkers,
   configuredWorkers, configuredWorkersHighEducation, mineQuality })
```

Do not discard unknown or `temp` records from this observed list.

- [ ] **Step 5: Run tests and commit**

Run: `rtk node --test tests/save_model.test.mjs`

Expected: PASS.

```bash
rtk git add js/save_model.js tests/save_model.test.mjs
rtk git commit -m "Build observed republic save model"
```

### Task 5: Make imported production rows retain capacity facts

**Files:**
- Modify: `js/save_model.js`
- Modify: `tests/save_model.test.mjs`
- Modify: `js/calc.js:236-289`
- Modify: `tests/calc.test.mjs`

- [ ] **Step 1: Test lossless grouping and configured capacity**

Add tests proving two otherwise identical mines with different quality remain
separate, two identical factories aggregate, and a fabric factory configured
to 60 of 100 workers produces and consumes at 60% before productivity:

```js
const result = evaluatePlan([{
  building: fabricFactory, count: 1, quality: 1,
  configuredWorkers: 60, configuredWorkersHighEducation: 0,
}], {}, { productivity: 0.9, timeUnit: 'day', calendarFlow: 1, currency: 'RUB' }, eco);
assert.equal(result.rows[0].workers, 60);
assert.equal(result.balance.get('fabric').produced, 5 * 0.6 * 0.9);
```

- [ ] **Step 2: Run focused tests and verify the old full-cap result**

Run: `rtk node --test tests/save_model.test.mjs tests/calc.test.mjs`

Expected: FAIL because `evaluatePlan` still uses `b.workers * count`.

- [ ] **Step 3: Seed production rows by exact configuration tuple**

Export `seedProductionRows(observedBuildings, productionDefinitions, match)`.
Group only when scope, matched game ID, configured ordinary cap, configured
higher-education cap, current workers, and mine quality are identical. Store
`observedBuildingIds`, both configured caps, `currentWorkers`, exact `quality`,
and `qualityEstimated: false`. Use `0.5` with `qualityEstimated: true` only when
the mine float is invalid or absent.

- [ ] **Step 4: Apply configured worker ratio in `evaluatePlan`**

For each row, calculate:

```js
const configured = row.configuredWorkers == null
  ? b.workers
  : row.configuredWorkers + (row.configuredWorkersHighEducation ?? 0);
const workerRatio = b.workers > 0 ? Math.max(0, Math.min(1, configured / b.workers)) : 1;
const operating = prod * workerRatio;
```

Use `operating` for production and factory input amounts. Set row workers and
`workersPerShift` to `configured * count`; use the same value for worker waste.
Manual rows without configured fields retain existing behavior. Fixed building
power, water, maximum connection power, and construction cost remain per
building and do not scale with worker ratio.

- [ ] **Step 5: Run focused and full tests, then commit**

Run: `rtk node --test tests/save_model.test.mjs tests/calc.test.mjs && rtk npm test`

Expected: all tests pass.

```bash
rtk git add js/save_model.js js/calc.js tests/save_model.test.mjs tests/calc.test.mjs
rtk git commit -m "Seed production from saved worker caps"
```

### Task 6: Import productivity without confusing history and staffing

**Files:**
- Modify: `js/statsini.js:12-66`
- Modify: `tests/statsini.test.mjs`
- Modify: `js/save_model.js`

- [ ] **Step 1: Test the current productivity scalar**

Add `$Citizens_AverageProductivity 0.939362` to the current-record fixture and
assert `recs.at(-1).averageProductivity === 0.939362`. Also assert a record that
contains citizen metrics but no price table remains available for analytics.
Replace the existing “records without price data are dropped” assertion with
this semantic-record retention assertion; the old behavior conflicts with the
approved historical-dashboard design.

- [ ] **Step 2: Run tests and verify the scalar is absent**

Run: `rtk node --test tests/statsini.test.mjs`

Expected: FAIL because `averageProductivity` is undefined.

- [ ] **Step 3: Track the stable baseline scalar**

Add `Citizens_AverageProductivity: 'averageProductivity'` to `SCALAR_KEYS` and
change the final filter from “has purchase USD prices” to “is a parsed global
record with a year/current marker”. Keep `$STAT_CITY` excluded from the global
array.

- [ ] **Step 4: Seed, but do not lock, planner productivity**

Export `latestProductivity(records, fallback = 1)` from `save_model.js`. It walks
backward for the newest finite positive `averageProductivity`. During import,
assign that value to `next.plan.settings.productivity` and each imported city's
planning productivity. Current building occupancy remains metadata only.

- [ ] **Step 5: Run tests and commit**

Run: `rtk node --test tests/statsini.test.mjs tests/save_model.test.mjs && rtk npm test`

Expected: all tests pass.

```bash
rtk git add js/statsini.js js/save_model.js tests/statsini.test.mjs tests/save_model.test.mjs
rtk git commit -m "Seed plans from saved republic productivity"
```

### Task 7: Parse the complete save off the UI thread and create schema v2

**Files:**
- Create: `js/savegame_worker.js`
- Modify: `js/app.js:1187-1390`
- Modify: `js/i18n.js`

- [ ] **Step 1: Create the worker protocol**

`js/savegame_worker.js` imports the five binary parsers, receives
`{ namepoints, buildings, workers, header, research }`, parses header first,
parses workers with that save version, reconciles memberships, and posts:

```js
{
  type: 'complete',
  parsed: { settlements, buildings, citizens, header, research, membershipAudit,
            sourceStatus: { namepoints: 'exact', buildings: 'exact', workers: 'exact',
                            header: 'exact', research: 'exact' } }
}
```

Missing optional buffers produce `null` data and `sourceStatus[file] = 'missing'`.
Any parser failure posts `{ type: 'error', file, message }`; required-file
failures abort, while optional failures become warnings and allow completion.

- [ ] **Step 2: Replace direct main-thread parsing in `handleSaveDirectory`**

Read `header.bin`, `workers.bin`, and `research.bin` when present. Transfer all
selected binary buffers to a module worker, update visible progress on worker
messages, then pass parsed results into pure `save_model.js` functions.

- [ ] **Step 3: Build the v2 manifest and planner seed**

Store under `saveImport`:

```js
{
  version: 2,
  sourceName, importedAt, header, sourceStatus,
  scopes, observedBuildings, citizenSummary, research,
  settlementCount, buildingCount, citizenCount,
  cityBuildingCount, productionBuildingCount,
  unmatched, warnings,
}
```

Every building is represented either in `observedBuildings` and a recognized
planner seed or in the unmatched/temporary audit. Citizen aggregates attach to
their scope. The manifest records unassigned citizens and invalid residence
references.

- [ ] **Step 4: Make import snapshot creation fully atomic**

Await saving `Before import …` with `snapshotState()`, construct `next`, attach
the parsed compact history and v2 manifest, replace state, and await saving the
new imported snapshot. On any failure, load the backup snapshot including its
history. Do not leave the user on a half-replaced plan.

- [ ] **Step 5: Add German and English audit labels**

Add strings for save title/version/date, source coverage, configured/current
workers, exact/derived/estimate badges, citizens, unassigned citizens,
research complete/partial, and optional-file failures. Update the folder hint
to list all five high-value files while stating that only the two structural
files are required.

- [ ] **Step 6: Run syntax and unit verification, then commit**

Run:

```bash
rtk node --check js/savegame_worker.js
rtk node --check js/app.js
rtk npm test
```

Expected: all syntax checks and tests pass.

```bash
rtk git add js/savegame_worker.js js/app.js js/i18n.js
rtk git commit -m "Create lossless full save snapshots"
```

### Task 8: Expose imported evidence in existing planners

**Files:**
- Modify: `js/app.js:650-735, 1352-1570, 1581-1731`
- Modify: `css/style.css`

- [ ] **Step 1: Show production configuration without changing manual rows**

For imported rows, add read-only source sublines for configured workers,
higher-education workers, current workers, exact/estimated mine quality, and
observed instance count. Retain the editable count and planning productivity.
Manual production rows keep their current compact table.

- [ ] **Step 2: Show observed city facts beside the city plan**

Add an “Observed at save time” card for imported cities using the scope's
citizen aggregate: residents, adults, higher education, happiness, food,
health, loyalty, and derived productivity. Keep existing City Planner rows and
editable city productivity under an explicitly labelled “Plan assumptions”
section.

- [ ] **Step 3: Correct Republic Overview population semantics**

For imported Actual summaries, use saved resident counts, not theoretical
housing capacity. Keep the existing evaluated City Planner population for Plan.
Display current/configured industrial staffing separately; do not call current
occupancy normal capacity.

- [ ] **Step 4: Expand the import audit**

Show source status per file, exact record counts, save identity/version,
research `complete / total`, five populated residential scopes for the supplied
save, and provenance badges. Add CSS for `.evidence-badge`, `.observed-card`,
`.coverage-grid`, and responsive stacking below 700 px.

- [ ] **Step 5: Run browser smoke checks**

Serve with `rtk python3 -m http.server 4173 --bind 0.0.0.0`, open both `/` and
`/beta/` in Chromium, import `/home/nexx/bigsavegame`, and verify:

- root has no import tab;
- beta consumes 43 namepoints, 1,812 buildings, 20,302 citizens, 107 research records;
- latest productivity is `0.939362`;
- fabric factory shows 93 current / 100 configured;
- coal mine record 1157 shows 95 current / 120 configured and quality about 56.47%;
- five scopes show resident metrics;
- console has no errors.

- [ ] **Step 6: Commit planner evidence UI**

```bash
rtk git add js/app.js css/style.css
rtk git commit -m "Show observed save evidence in planners"
```

### Task 9: Verify, document truth, and deploy the foundation

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/superpowers/plans/2026-07-17-observed-save-import-foundation.md`

- [ ] **Step 1: Correct roadmap source claims**

State that `buildings_game.bin` contains live building state and that
`buildings.bin` is an engine/render export. Mark configured caps, current
workers, exact mine quality, citizen scope aggregates, header metadata, and
research progress complete. Leave inventory/logistics semantics explicitly
pending.

- [ ] **Step 2: Run complete verification from a clean page load**

Run:

```bash
rtk npm test
rtk node --check js/savegame.js
rtk node --check js/save_model.js
rtk node --check js/savegame_worker.js
rtk node --check js/storage.js
rtk git diff --check
```

Expected: zero test failures, zero syntax errors, and no whitespace errors.

- [ ] **Step 3: Verify snapshot isolation in Chromium**

Create a manual plan, import the supplied save, switch to the backup, then back
to the imported snapshot. Confirm cities, production rows, `stats.ini` history,
record selection, observed facts, and research all replace completely in both
directions.

- [ ] **Step 4: Commit documentation and push the beta checkpoint**

```bash
rtk git add ROADMAP.md docs/superpowers/plans/2026-07-17-observed-save-import-foundation.md
rtk git commit -m "Document observed save import foundation"
rtk git push origin main
```

- [ ] **Step 5: Verify GitHub Pages**

Open `https://coffeekanzler.github.io/workerscalculator/beta/` after deployment,
confirm the current commit is served, import the save through the browser folder
picker, and repeat the record-count and console checks.
