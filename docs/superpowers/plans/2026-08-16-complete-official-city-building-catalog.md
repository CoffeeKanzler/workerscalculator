# Complete Official City Building Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every regular build-menu building from the base game and official DLC1–3 selectable exactly once in city planning without changing or losing any existing plan.

**Architecture:** Keep the current runtime city catalog as an immutable prefix, derive official candidates from the raw game catalog, and append only unmatched official rows. Store official identity in sidecar indexes plus optional `buildingGameId`, centralize row resolution, and let `officialCityCatalog` affect only new picker choices so rollback cannot invalidate saved rows.

**Tech Stack:** Browser-native ES modules, JSON game data, Node.js `node:test`, Playwright browser checks, Python extraction helpers, RTK command wrapper.

**Spec:** `docs/superpowers/specs/2026-08-16-complete-official-city-building-catalog-design.md`

## Global Constraints

- The existing runtime catalog, including `mergeVanillaCityResidences()`, remains an identical prefix with the same object references, order, indices, and values.
- Existing LocalStorage migrations, IndexedDB planning, snapshots, imports, and share links are not rewritten and must preserve identical `evaluateCity()` results.
- Official automatic scope is base game plus `dlc1/`, `dlc2/`, and `dlc3/`; exclude CWC, numeric Workshop IDs, `CIVIL_BUILDING`, unnamed definitions, `water_switch_test`, and `eletric_transformator_customout`.
- Display names are never identity. Official identity is `gameId`; legacy matching is multiset-safe and never guesses ambiguous rows.
- Unknown planner values are `null` with provenance `unavailable`, never numeric zero.
- Existing legacy rows are never overwritten with raw or production values.
- New raw rows retain `generalWorkers` and `professors`; their existing `workers` field is the derived total `generalWorkers + professors` expected by `evaluateCity()`.
- `officialCityCatalog=false` restores the exact legacy picker, while the full resolver remains active for already saved new IDs.
- Use `rtk test ...`, `rtk npm test`, `rtk git ...`, and other applicable RTK wrappers. The referenced repository `RTK.md` is absent, so the installed RTK CLI contract is the available instruction source.
- Preserve unrelated untracked files and never use broad checkout/reset/clean commands.

## File Structure

- Create `js/models/building_catalog_eligibility.js`: official-source, name, denylist, and `CIVIL_BUILDING` eligibility predicates.
- Create `js/models/official_city_catalog.js`: taxonomy, raw/production mapping, multiset matching, immutable append-only catalog construction, diagnostics, and picker indexes.
- Create `js/models/city_building_resolver.js`: one compatibility resolver for imported rows, stable IDs, legacy indices, and names.
- Modify `js/models/vanilla_city_catalog.js`: consume the shared residence eligibility predicate without changing current merge output.
- Modify `js/community_constants.js`: own the explicit city service-capacity slot contract.
- Modify `js/city_planning.js`: pure search, grouping, option visibility, and picker-label helpers.
- Modify `js/runtime/runtime_config.js`: parse the `officialCityCatalog` boolean with complete-by-default behavior.
- Modify `js/app.js`: load the canonical catalog, use the central resolver at all call sites, and wire the compatible picker.
- Modify `js/calc.js`: use explicit workforce/service helpers while preserving legacy arithmetic.
- Modify `js/i18n.js`: German and English group, search, evidence, and unavailable copy.
- Modify `data/VERSION.json` and `index.html`: truthful extraction metadata and cache markers only after implementation is final.
- Modify `tools/add_city_water_supply.py`: return the earlier special-purpose tool to its pre-WIP scope; general official rows come from the runtime catalog.
- Modify `data/city_buildings.json`: remove only the three uncommitted DLC3 rows superseded by the general runtime merge; retain all previously shipped rows byte-for-byte.
- Create or modify focused Node and Playwright tests listed below.

---

### Task 1: Central official-building eligibility

**Files:**
- Create: `js/models/building_catalog_eligibility.js`
- Modify: `js/models/vanilla_city_catalog.js`
- Create: `tests/building_catalog_eligibility.test.mjs`
- Modify: `tests/vanilla_city_catalog.test.mjs`

**Interfaces:**
- Consumes: raw rows from `data/game/buildings_raw.json` with `id`, `types`, `de`, `en`, `nameStr`, and `menuSfx`.
- Produces: `OFFICIAL_BUILDING_DENY_IDS`, `buildingSourcePrefix(id)`, `isOfficialBuildingSource(id)`, `hasResolvedBuildingName(raw)`, `isEligibleOfficialBuilding(raw)`, and `isEligibleOfficialResidence(raw)`.

- [ ] **Step 1: Write the failing eligibility tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_BUILDING_DENY_IDS,
  buildingSourcePrefix,
  isEligibleOfficialBuilding,
} from '../js/models/building_catalog_eligibility.js';

const building = (id, extra = {}) => ({
  id, de: 'Gebäude', en: 'Building', types: ['TYPE_FACTORY'], ...extra,
});

test('official eligibility accepts base and official DLC sources', () => {
  assert.equal(isEligibleOfficialBuilding(building('hospital')), true);
  assert.equal(isEligibleOfficialBuilding(building('dlc1/church')), true);
  assert.equal(isEligibleOfficialBuilding(building('dlc3/water_well')), true);
  assert.equal(buildingSourcePrefix('dlc3/water_well'), 'dlc3');
});

test('official eligibility excludes non-player and non-official definitions', () => {
  assert.equal(isEligibleOfficialBuilding(building('cwc/house')), false);
  assert.equal(isEligibleOfficialBuilding(building('123456789/house')), false);
  assert.equal(isEligibleOfficialBuilding(building('dlc2/house', {
    types: ['TYPE_LIVING', 'CIVIL_BUILDING'],
  })), false);
  assert.equal(isEligibleOfficialBuilding({ id: 'unnamed', types: ['TYPE_FACTORY'] }), false);
  for (const id of OFFICIAL_BUILDING_DENY_IDS) {
    assert.equal(isEligibleOfficialBuilding(building(id)), false, id);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `rtk test node --test tests/building_catalog_eligibility.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `building_catalog_eligibility.js`.

- [ ] **Step 3: Implement the pure eligibility module**

```js
export const OFFICIAL_BUILDING_DENY_IDS = Object.freeze([
  'water_switch_test',
  'eletric_transformator_customout',
]);

const OFFICIAL_DLC_PREFIXES = new Set(['dlc1', 'dlc2', 'dlc3']);
const WORKSHOP_ID = /^\d+\//;

export function buildingSourcePrefix(id = '') {
  const value = String(id);
  return value.includes('/') ? value.slice(0, value.indexOf('/')) : 'base';
}

export function isOfficialBuildingSource(id) {
  const value = String(id ?? '');
  if (!value || WORKSHOP_ID.test(value) || value.startsWith('cwc/')) return false;
  const prefix = buildingSourcePrefix(value);
  return prefix === 'base' || OFFICIAL_DLC_PREFIXES.has(prefix);
}

export function hasResolvedBuildingName(raw) {
  return [raw?.de, raw?.en, raw?.nameStr].some(value => String(value ?? '').trim());
}

export function isEligibleOfficialBuilding(raw, {
  denyIds = OFFICIAL_BUILDING_DENY_IDS,
} = {}) {
  return Boolean(raw
    && isOfficialBuildingSource(raw.id)
    && hasResolvedBuildingName(raw)
    && !raw.types?.includes('CIVIL_BUILDING')
    && !denyIds.includes(raw.id));
}

export function isEligibleOfficialResidence(raw, options) {
  return isEligibleOfficialBuilding(raw, options)
    && raw.types?.includes('TYPE_LIVING')
    && Number.isFinite(raw.livingSpace)
    && raw.livingSpace > 0;
}
```

- [ ] **Step 4: Inject `isEligibleOfficialResidence` into the old residence merge without changing its output**

In `js/models/vanilla_city_catalog.js`, import the predicate and change the public signature to:

```js
export function mergeVanillaCityResidences(cityBuildings, rawBuildings, {
  isEligible = isEligibleOfficialResidence,
} = {}) {
```

Keep the existing residential `menuSfx` allowlist as an additional condition. Add a regression asserting a denylisted row with a fabricated name and residential menu flag is still excluded.

- [ ] **Step 5: Run the eligibility and residence tests**

Run: `rtk test node --test tests/building_catalog_eligibility.test.mjs tests/vanilla_city_catalog.test.mjs`

Expected: PASS, including the existing append-only object-identity assertions.

- [ ] **Step 6: Commit the eligibility foundation**

```bash
git add js/models/building_catalog_eligibility.js js/models/vanilla_city_catalog.js tests/building_catalog_eligibility.test.mjs tests/vanilla_city_catalog.test.mjs
git commit -m "feat: define official city building eligibility"
```

### Task 2: Immutable full-catalog mapping and deduplication

**Files:**
- Create: `js/models/official_city_catalog.js`
- Modify: `js/community_constants.js`
- Create: `tests/official_city_catalog.test.mjs`
- Modify: `tests/data_quality.test.mjs`

**Interfaces:**
- Consumes: `isEligibleOfficialBuilding(raw)`, the old runtime catalog, raw game rows, and `data/game/production_buildings.json` rows.
- Produces: `CITY_CATALOG_GROUPS`, `classifyOfficialCityBuilding(raw)`, `mapOfficialCityBuilding(raw, production)`, and `mergeOfficialCityCatalog(legacyRuntime, raw, production)`.
- `mergeOfficialCityCatalog()` returns `{ buildings, legacyLength, selectableIndexes, officialIndexByGameId, gameIdByIndex, diagnostics }`.

- [ ] **Step 1: Write failing mapping tests for workforce, provenance, services, and identity**

```js
const rawFactoryWith = overrides => ({
  id: 'factory', de: 'Fabrik', en: 'Factory',
  types: ['TYPE_FACTORY'], workers: 10, professors: 0,
  citizenAbleServe: 0, livingSpace: 0, qualityOfLiving: null,
  ...overrides,
});
const rawFactory = rawFactoryWith({});
const matchingRawFactory = rawFactoryWith({ id: 'factory' });
const legacyFactory = {
  de: 'Fabrik', en: 'Factory', kind: 'Vanilla',
  type: { de: 'Industrie', en: 'Industry' },
  workers: 10, inhabitants: 0, quality: null,
};

test('new professor buildings retain both staff classes and total demand', () => {
  const row = mapOfficialCityBuilding({
    id: 'technical_university', de: 'Technische Universität', en: 'Technical university',
    types: ['TYPE_UNIVERSITY'], workers: 75, professors: 75,
    citizenAbleServe: 3, livingSpace: 0,
  }, null);
  assert.equal(row.generalWorkers, 75);
  assert.equal(row.professors, 75);
  assert.equal(row.workers, 150);
  assert.equal(row.visitors, 225);
  assert.equal(row.special, 0);
});

test('unavailable production zeros remain unknown', () => {
  const row = mapOfficialCityBuilding(rawFactory, {
    gameId: rawFactory.id,
    power: 0, wastePerWorker: 0, workdays: 0,
    provenance: { power: 'unavailable', wastePerWorker: 'unavailable', workdays: 'unavailable' },
  });
  assert.equal(row.power, null);
  assert.equal(row.waste, null);
  assert.equal(row.workdays, null);
});

test('same-name official variants remain separate identities', () => {
  const merged = mergeOfficialCityCatalog([], [
    rawFactoryWith({ id: 'a', workers: 10 }),
    rawFactoryWith({ id: 'dlc3/a', workers: 20 }),
  ], []);
  assert.equal(merged.buildings.length, 2);
  assert.deepEqual([...merged.officialIndexByGameId.keys()], ['a', 'dlc3/a']);
});

test('legacy runtime catalog is an unchanged prefix', () => {
  const legacy = [legacyFactory];
  const before = structuredClone(legacy);
  const merged = mergeOfficialCityCatalog(legacy, [matchingRawFactory], []);
  assert.deepEqual(legacy, before);
  assert.strictEqual(merged.buildings[0], legacy[0]);
  assert.deepEqual(merged.buildings.slice(0, legacy.length), legacy);
});
```

- [ ] **Step 2: Run the new test and confirm the missing-module failure**

Run: `rtk test node --test tests/official_city_catalog.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `official_city_catalog.js`.

- [ ] **Step 3: Add the explicit service-capacity contract**

In `js/community_constants.js` export:

```js
export const CITY_SERVICE_CAPACITY_SLOT = Object.freeze({
  Einkaufzentrum: 'visitors',
  Kindergarten: 'visitors',
  Schule: 'visitors',
  Universität: 'visitors',
  Attraktionen: 'visitors',
  Krankenhaus: 'visitors',
  Gerichtsgebäude: 'special',
  Polizei: 'special',
});

export const CITY_SPECIAL_FORMULA_TYPES = Object.freeze([
  'Geheimpolizei',
  'Heizwerk',
]);
```

- [ ] **Step 4: Implement deterministic taxonomy and field mapping**

In `official_city_catalog.js`, define frozen bilingual groups for `Wohnen`, `Bürgerservice`, `Industrie`, `Versorgung`, `Transport`, `Lager`, and `Sonstiges`. Use this ordered rule shape over raw `TYPE_*`/`SUBTYPE_*` flags:

```js
const SERVICE_TYPE_BY_FLAG = Object.freeze({
  TYPE_SHOP: ['Einkaufzentrum', 'Shopping centre'],
  TYPE_KINDERGARTEN: ['Kindergarten', 'Kindergarten'],
  TYPE_SCHOOL: ['Schule', 'School'],
  TYPE_UNIVERSITY: ['Universität', 'University'],
  TYPE_COURT_HOUSE: ['Gerichtsgebäude', 'Court house'],
  TYPE_POLICE_STATION: ['Polizei', 'Police'],
  TYPE_ATTRACTION: ['Attraktionen', 'Attractions'],
  TYPE_HOSPITAL: ['Krankenhaus', 'Hospital'],
  TYPE_SECRET_POLICE: ['Geheimpolizei', 'Secret police'],
  TYPE_HEATING_PLANT: ['Heizwerk', 'Heating plant'],
});

const GROUP_FLAGS = Object.freeze({
  Wohnen: ['TYPE_LIVING'],
  Bürgerservice: [
    'TYPE_SHOP', 'TYPE_KINDERGARTEN', 'TYPE_SCHOOL', 'TYPE_UNIVERSITY',
    'TYPE_COURT_HOUSE', 'TYPE_POLICE_STATION', 'TYPE_ATTRACTION',
    'TYPE_HOSPITAL', 'TYPE_SECRET_POLICE', 'TYPE_FIRESTATION', 'TYPE_CITYHALL',
    'TYPE_KINO', 'TYPE_SPORT', 'TYPE_PUB', 'TYPE_BROADCAST', 'TYPE_ORPHANAGE',
    'TYPE_PRISON', 'TYPE_MONUMENT', 'TYPE_HOTEL', 'TYPE_CHURCH',
  ],
  Industrie: [
    'TYPE_FACTORY', 'TYPE_MINE_BAUXITE', 'TYPE_MINE_COAL', 'TYPE_MINE_GRAVEL',
    'TYPE_MINE_IRON', 'TYPE_MINE_OIL', 'TYPE_MINE_URANIUM', 'TYPE_MINE_WOOD',
    'TYPE_FARM', 'TYPE_FIELD', 'TYPE_PRODUCTION_LINE', 'TYPE_SCRAPYARD',
  ],
  Versorgung: [
    'TYPE_POWERPLANT', 'TYPE_TRANSFORMATOR', 'TYPE_SUBSTATION',
    'TYPE_ELETRIC_EXPORT', 'TYPE_FOREIGN_PIPELINE_EXPORT', 'TYPE_WATER_PUMP',
    'TYPE_WATER_TREATMENT', 'TYPE_WATER_ENDSTATION', 'TYPE_MINE_WATER',
    'TYPE_MINE_WATER_SURFACE', 'TYPE_SEWAGE_PUMP', 'TYPE_SEWAGE_TREATMENT',
    'TYPE_SEWAGE_DISCHARGE', 'TYPE_SEWAGE_ENDSTATION', 'TYPE_HEATING_PLANT',
    'TYPE_HEATING_ENDSTATION', 'TYPE_HEATING_SWITCH', 'TYPE_COOLING_TOWER',
    'TYPE_GAS_STATION', 'TYPE_GAS_STATION_COAL', 'TYPE_GARBAGE_OFFICE',
    'TYPE_TRASH_CONTAINER', 'TYPE_POLLUTION_METER', 'TYPE_RAIL_TRAFO',
  ],
  Transport: [
    'TYPE_CARGO_STATION', 'TYPE_PASSANGER_STATION', 'TYPE_WAITING_STATION',
    'TYPE_ROADDEPO', 'TYPE_RAILDEPO', 'TYPE_PARKING', 'TYPE_CUSTOMHOUSE',
    'TYPE_AIRPLANE_PARKING', 'TYPE_AIRPLANE_GATE', 'TYPE_AIRPLANE_TOWER',
    'TYPE_SHIP_DOCK', 'TYPE_CONSTRUCTION_OFFICE',
    'TYPE_CONSTRUCTION_OFFICE_RAIL', 'TYPE_DEMOLITION_OFFICE',
    'TYPE_DISTRIBUTION_OFFICE', 'TYPE_DISTRIBUTION_OFFICE_RAIL',
    'TYPE_REPAIR_OFFICE', 'TYPE_CAR_DEALER', 'TYPE_FORKLIFT_GARAGE',
    'TYPE_PEDESTRIAN_BRIDGE', 'TYPE_TRAM_GATE',
  ],
  Lager: ['TYPE_STORAGE', 'TYPE_CONTAINER_FACILITY'],
  Sonstiges: ['TYPE_ENGINE'],
});
```

Any current subtype not needed to override a higher-priority `TYPE_*` group is accepted only alongside a recognized primary type. Throw `Unclassified official building <id>` when an eligible row has no matched primary rule. This makes new game types fail visibly instead of falling through silently.

Use these exact workforce and unknown-value rules:

```js
const finiteOrZero = value => Number.isFinite(value) ? value : 0;
const supplementValue = (row, field) =>
  row?.provenance?.[field] === 'unavailable' || !Number.isFinite(row?.[field])
    ? null
    : row[field];

const generalWorkers = finiteOrZero(raw.workers);
const professors = finiteOrZero(raw.professors);
const workers = generalWorkers + professors;
const serviceCapacity = Number.isFinite(raw.citizenAbleServe)
  && raw.citizenAbleServe > 0
  ? generalWorkers * raw.citizenAbleServe
  : null;
```

Map `serviceCapacity` only to the slot named by `CITY_SERVICE_CAPACITY_SLOT[type.de]`. Use `0` for the other slot; use `null` for the target slot when capacity is unavailable. Preserve Secret Police and heating as explicit special-formula types without inventing a generic capacity.

Map `wastePerWorker` only when its provenance is known:

```js
const wastePerWorker = supplementValue(production, 'wastePerWorker');
row.wastePerWorker = wastePerWorker;
row.waste = wastePerWorker == null ? null : wastePerWorker * workers;
```

All other planner fields (`power`, `maxKW`, `water`, `hotwater`, `workdays`, and nine materials) use `supplementValue()`. Derive `waterSupply` from an exact matching production row's water output when present; otherwise leave it `null`.

- [ ] **Step 5: Implement multiset-safe matching and immutable sidecar identity**

Build the result from `const buildings = [...legacyRuntime]`. Match in this order:

1. exact existing `gameId`;
2. unique normalized localized name plus semantic group/role;
3. unique strict signature of normalized name, role, inhabitants, quality, total workers, and service capacity;
4. append the mapped official row when no unique match exists.

Never add fields to a matched legacy object. Record identity in `officialIndexByGameId` and `gameIdByIndex`. When a legacy Vanilla row is ambiguous and official variants are appended, omit only that legacy index from `selectableIndexes`; leave mods and unambiguous legacy rows selectable.

- [ ] **Step 6: Add completeness and invariant tests against checked-in data**

In `tests/data_quality.test.mjs`, derive expected IDs with `isEligibleOfficialBuilding()` and assert:

```js
const expected = rawBuildings.filter(isEligibleOfficialBuilding).map(row => row.id).sort();
const actual = [...catalog.officialIndexByGameId.keys()].sort();
assert.deepEqual(actual, expected);
assert.equal(new Set(actual).size, actual.length);
assert.ok(!actual.some(id => id.startsWith('cwc/') || /^\d+\//.test(id)));
```

Also assert the current snapshot invariant that all 52 DLC2 definitions are excluded because they carry `CIVIL_BUILDING`, without treating 727 as a permanent expected total.

- [ ] **Step 7: Run mapping and data tests**

Run: `rtk test node --test tests/official_city_catalog.test.mjs tests/data_quality.test.mjs tests/vanilla_city_catalog.test.mjs`

Expected: PASS with every derived eligible ID represented once and no legacy mutations.

- [ ] **Step 8: Commit the official catalog model**

```bash
git add js/models/official_city_catalog.js js/community_constants.js tests/official_city_catalog.test.mjs tests/data_quality.test.mjs
git commit -m "feat: build complete official city catalog"
```

### Task 3: Stable row resolution and persistence compatibility

**Files:**
- Create: `js/models/city_building_resolver.js`
- Create: `tests/city_building_resolver.test.mjs`
- Modify: `tests/planning_persistence.test.mjs`
- Modify: `tests/planning_model.test.mjs`

**Interfaces:**
- Consumes: city rows and the catalog object from Task 2.
- Produces: `resolveCityBuildingIndex(row, catalog)` and `resolveCityBuildingRow(row, catalog)`.

- [ ] **Step 1: Write failing resolver-order tests**

```js
const legacyBuilding = { de: 'Legacy', en: 'Legacy', workers: 1 };
const officialWell = {
  gameId: 'dlc3/water_well', de: 'Wasserbrunnen', en: 'Water well', workers: 8,
};
const catalog = {
  buildings: [legacyBuilding, officialWell],
  officialIndexByGameId: new Map([['dlc3/water_well', 1]]),
};

test('resolver uses imported object, stable ID, index, then name', () => {
  const imported = { de: 'Importiert' };
  assert.strictEqual(resolveCityBuildingRow({ importedBuilding: imported }, catalog), imported);
  assert.strictEqual(resolveCityBuildingRow({
    buildingGameId: 'dlc3/water_well', buildingIndex: 0, name: 'Alt',
  }, catalog), officialWell);
  assert.strictEqual(resolveCityBuildingRow({ buildingIndex: 0 }, catalog), legacyBuilding);
  assert.strictEqual(resolveCityBuildingRow({ name: 'Legacy' }, catalog), legacyBuilding);
});

test('stale stable ID falls back without rewriting the row', () => {
  const row = { buildingGameId: 'removed/id', buildingIndex: 0, name: 'Legacy' };
  const before = structuredClone(row);
  assert.strictEqual(resolveCityBuildingRow(row, catalog), legacyBuilding);
  assert.deepEqual(row, before);
});
```

- [ ] **Step 2: Run the resolver test and confirm the missing-module failure**

Run: `rtk test node --test tests/city_building_resolver.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the central resolver**

```js
export function resolveCityBuildingIndex(row, catalog) {
  if (row?.buildingGameId) {
    const stable = catalog?.officialIndexByGameId?.get(row.buildingGameId);
    if (Number.isInteger(stable)) return stable;
  }
  if (Number.isInteger(row?.buildingIndex) && catalog?.buildings?.[row.buildingIndex]) {
    return row.buildingIndex;
  }
  const byName = catalog?.buildings?.findIndex(building => building.de === row?.name) ?? -1;
  return byName >= 0 ? byName : null;
}

export function resolveCityBuildingRow(row, catalog) {
  if (row?.importedBuilding) return row.importedBuilding;
  const index = resolveCityBuildingIndex(row, catalog);
  return index == null ? null : catalog.buildings[index];
}
```

- [ ] **Step 4: Prove persistence needs no migration and preserves the optional ID**

Extend planning model and persistence tests with a city row:

```js
const row = {
  type: 'Versorgung', name: 'Wasserbrunnen', count: 2,
  buildingIndex: 371, buildingGameId: 'dlc3/water_well',
};
```

Assert it survives `createPlanningModel()`, `planningProjection()`, planning-store save/load, `serializePlannerState()`, and `restorePlannerState()` byte-for-byte. Include a legacy row with only `buildingIndex` and `name` in the same round trip.

- [ ] **Step 5: Run resolver and persistence tests**

Run: `rtk test node --test tests/city_building_resolver.test.mjs tests/planning_model.test.mjs tests/planning_persistence.test.mjs`

Expected: PASS with no schema-version bump.

- [ ] **Step 6: Commit the compatibility layer**

```bash
git add js/models/city_building_resolver.js tests/city_building_resolver.test.mjs tests/planning_model.test.mjs tests/planning_persistence.test.mjs
git commit -m "feat: resolve city buildings by stable identity"
```

### Task 4: Runtime catalog flag and application integration

**Files:**
- Modify: `js/runtime/runtime_config.js`
- Modify: `tests/runtime_bootstrap.test.mjs`
- Modify: `js/app.js`
- Modify: `tests/city_planning_ui.test.mjs`

**Interfaces:**
- Consumes: `mergeOfficialCityCatalog()`, `resolveCityBuildingRow()`, and the existing `getRuntimeConfig()` result.
- Produces: `RUNTIME_CONFIG.officialCityCatalog: boolean`, `DATA.cityCatalog`, and `DATA.cityBuildings === DATA.cityCatalog.buildings`.

- [ ] **Step 1: Write failing runtime-flag tests**

```js
test('official city catalog is complete by default and accepts explicit rollback', () => {
  assert.equal(getRuntimeConfig({ location: { search: '' } }).officialCityCatalog, true);
  assert.equal(getRuntimeConfig({
    location: { search: '?officialCityCatalog=false' },
  }).officialCityCatalog, false);
  assert.equal(getRuntimeConfig({
    location: { search: '?officialCityCatalog=true' },
  }).officialCityCatalog, true);
});
```

Use the same rules for `document.documentElement.dataset.officialCityCatalog`. Unknown values fall back to `true` rather than disabling the feature accidentally.
Update the existing first `runtime_config` deep-equality expectation to include
`officialCityCatalog: true`; do not weaken it to partial matching.

- [ ] **Step 2: Run the runtime test and confirm the missing property failure**

Run: `rtk test node --test tests/runtime_bootstrap.test.mjs`

Expected: FAIL because `officialCityCatalog` is not returned yet.

- [ ] **Step 3: Parse the flag in `getRuntimeConfig()`**

```js
const officialCityCatalogCandidate = query.get('officialCityCatalog')
  ?? data.officialCityCatalog ?? 'true';
const officialCityCatalog = officialCityCatalogCandidate !== 'false';

return Object.freeze({
  mode, variant, sdkBaseUrl, scrapProfitTable, officialCityCatalog,
});
```

- [ ] **Step 4: Build both the legacy baseline and full canonical catalog in `loadData()`**

Replace the direct residence assignment with:

```js
const legacyCityBuildings = mergeVanillaCityResidences(city, rawBuildings);
const cityCatalog = mergeOfficialCityCatalog(
  legacyCityBuildings,
  rawBuildings,
  prodGame ?? [],
);

DATA = {
  // existing fields remain unchanged
  cityCatalog,
  cityBuildings: cityCatalog.buildings,
  legacyCityBuildingCount: legacyCityBuildings.length,
};
```

Do not condition catalog construction on the flag: the resolver must still find saved new IDs during rollback.

- [ ] **Step 5: Replace all three duplicated resolution call sites**

At the workforce calculation near current `js/app.js:1897`, city planner near `3143`, and Republic overview near `6385`, call:

```js
resolveCityBuildingRow(row, DATA.cityCatalog)
```

Remove the three local `importedBuilding`/index/name resolver copies. Add a source-contract assertion that `resolveCityBuildingRow(` appears at all three consumers and that the old duplicated ternary pattern is absent.

- [ ] **Step 6: Run runtime and wiring tests**

Run: `rtk test node --test tests/runtime_bootstrap.test.mjs tests/city_planning_ui.test.mjs tests/city_building_resolver.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit runtime integration**

```bash
git add js/runtime/runtime_config.js tests/runtime_bootstrap.test.mjs js/app.js tests/city_planning_ui.test.mjs
git commit -m "feat: integrate official city catalog safely"
```

### Task 5: Searchable grouped picker with stable selections

**Files:**
- Modify: `js/city_planning.js`
- Modify: `tests/city_planning.test.mjs`
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `tests/city_planning_ui.test.mjs`

**Interfaces:**
- Consumes: `cityCatalog.selectableIndexes`, `cityCatalog.gameIdByIndex`, the feature flag, current row, language, and search query.
- Produces: `cityBuildingPickerLabel()`, `cityBuildingPickerLabels()`, `filterCityBuildingIndexes()`, `groupCityBuildingIndexes()`, and compatible row mutation behavior.

- [ ] **Step 1: Write failing pure picker-helper tests**

```js
const legacy = { de: 'Altbau', en: 'Legacy building', catalogGroup: { de: 'Wohnen', en: 'Housing' } };
const smallWell = {
  gameId: 'dlc3/water_well_small', de: 'Kleiner Wasserbrunnen', en: 'Small water well',
  dlc: 'dlc3', catalogGroup: { de: 'Versorgung', en: 'Utilities' }, workers: 5,
};
const university = {
  gameId: 'dlc3/university', de: 'Technische Universität', en: 'Technical university',
  dlc: 'dlc3', catalogGroup: { de: 'Bürgerservice', en: 'Civic services' },
  workers: 150, inhabitants: 0, visitors: 225, special: 0, workdays: null,
};
const hiddenLegacyIndex = 0;
const smallWellIndex = 1;
const catalog = {
  buildings: [legacy, smallWell, university],
  legacyLength: 1,
  selectableIndexes: [1, 2],
  gameIdByIndex: new Map([[1, smallWell.gameId], [2, university.gameId]]),
};

test('picker search covers both languages and stable ID', () => {
  const indexes = filterCityBuildingIndexes(catalog, {
    query: 'water_well_small', lang: 'de', complete: true,
  });
  assert.deepEqual(indexes, [smallWellIndex]);
  assert.deepEqual(filterCityBuildingIndexes(catalog, {
    query: 'kleiner wasserbrunnen', lang: 'en', complete: true,
  }), [smallWellIndex]);
});

test('legacy rollback and selected hidden rows remain visible', () => {
  const legacy = filterCityBuildingIndexes(catalog, { complete: false });
  assert.ok(legacy.every(index => index < catalog.legacyLength));
  const withSelected = filterCityBuildingIndexes(catalog, {
    complete: true, selectedIndex: hiddenLegacyIndex,
  });
  assert.ok(withSelected.includes(hiddenLegacyIndex));
});

test('picker label distinguishes real same-name variants', () => {
  const label = cityBuildingPickerLabel(university, { lang: 'de' });
  assert.match(label, /\[DLC\]/);
  assert.match(label, /150/);
  assert.match(label, /225/);
});
```

- [ ] **Step 2: Run the city-planning tests and confirm missing exports**

Run: `rtk test node --test tests/city_planning.test.mjs`

Expected: FAIL because the new helper exports do not exist.

- [ ] **Step 3: Implement pure filtering, grouping, and unique labels**

`filterCityBuildingIndexes()` must:

1. start with `[0, legacyLength)` when `complete === false`, otherwise `selectableIndexes`;
2. inject `selectedIndex` if it is valid but hidden;
3. normalize whitespace and case;
4. search `de`, `en`, `gameId`, and the sidecar game ID;
5. never reorder the legacy prefix for resolution.

`catalogGroupForCityBuilding()` first uses `building.catalogGroup`; for legacy
rows it maps the existing `building.type.de` to the same seven groups without
modifying the row. `groupCityBuildingIndexes()` then returns groups in this
fixed order:

```js
['Wohnen', 'Bürgerservice', 'Industrie', 'Versorgung', 'Transport', 'Lager', 'Sonstiges']
```

`cityBuildingPickerLabel(building, { lang = 'de', gameId = null, collision = false } = {})`
includes localized name, `[DLC]`, total workforce, inhabitants, service
capacity, and `—` for unavailable workdays. `cityBuildingPickerLabels(catalog,
indexes, options)` first builds base labels, marks duplicate base labels, and
calls the single-label helper with `collision: true`; only then is the short
stable game ID appended.

- [ ] **Step 4: Wire search and grouped options without changing stored legacy rows**

In `renderCity()`:

- keep the existing type selector and selected legacy value;
- add `const cityCatalogSearch = new Map()` beside other module-local UI state;
- add a per-city search input above the table whose `oninput` stores
  `cityCatalogSearch.set(state.activeCity, event.target.value)` and calls
  `update()`; never put this value into `state.planning`;
- add `groupedSelectInput(groups, value, onchange)` beside `selectInput()`;
  it creates one `<optgroup>` per localized catalog group and uses the original
  absolute catalog index as every `<option value>`;
- group existing types and buildings under the seven localized headings;
- use `RUNTIME_CONFIG.officialCityCatalog` only to choose the selectable index pool;
- always inject the current resolved legacy index.

On type change or clear:

```js
row.name = null;
delete row.buildingGameId;
delete row.buildingIndex;
delete row.categoryOnly;
```

On building selection:

```js
row.buildingIndex = Number(value);
row.name = DATA.cityBuildings[row.buildingIndex].de;
const gameId = DATA.cityCatalog.gameIdByIndex.get(row.buildingIndex)
  ?? DATA.cityBuildings[row.buildingIndex].gameId;
if (gameId) row.buildingGameId = gameId;
else delete row.buildingGameId;
delete row.categoryOnly;
```

- [ ] **Step 5: Add exact bilingual UI copy**

Add German/English keys for:

```js
cityBuildingSearch: 'Gebäude suchen' / 'Search buildings'
cityCatalogIncomplete: 'Planungswerte teilweise nicht verfügbar' / 'Some planning values unavailable'
cityCatalogGroups: the seven group labels in both languages
```

- [ ] **Step 6: Run picker and source-contract tests**

Run: `rtk test node --test tests/city_planning.test.mjs tests/city_planning_ui.test.mjs tests/planning_persistence.test.mjs`

Expected: PASS; clear/change handlers manage ID, index, and name together.

- [ ] **Step 7: Commit the picker**

```bash
git add js/city_planning.js tests/city_planning.test.mjs js/app.js js/i18n.js tests/city_planning_ui.test.mjs
git commit -m "feat: add searchable official city picker"
```

### Task 6: Calculation fidelity and early-water WIP consolidation

**Files:**
- Modify: `js/calc.js`
- Modify: `tests/calc.test.mjs`
- Modify: `tests/city_utilities.test.mjs`
- Modify: `data/city_buildings.json`
- Modify: `tools/add_city_water_supply.py`
- Modify: `tests/data_quality.test.mjs`

**Interfaces:**
- Consumes: new rows whose `workers` already equals total staff, explicit `visitors`/`special`, null planner values, and exact water-output fields.
- Produces: unchanged legacy results plus correct new-building workforce, service, utility, and incomplete-state results.

- [ ] **Step 1: Write failing calculation regressions**

```js
const plannerFields = {
  power: 1, maxKW: 1, water: 1, hotwater: 1, waste: 1,
  workdays: 1, gravel: 0, bricks: 0, steel: 0, concrete: 0,
  asphalt: 0, boards: 0, panels: 0, ecomponents: 0, mcomponents: 0,
};
const completeBuilding = {
  ...plannerFields,
  type: { de: 'Sonstiges', en: 'Miscellaneous' },
  workers: 1, inhabitants: 0, visitors: 0, special: 0, quality: null,
};
const economy = {
  buildCost(building) {
    return Number.isFinite(building.workdays) ? building.workdays : null;
  },
};
const cityWith = building => ({
  productivity: 1,
  rows: [{ building, count: 1 }],
  workshops: [], heatingEnabled: true, waterDivisor: 3,
});

test('professors count as city workforce without inflating service twice', () => {
  const university = {
    ...plannerFields,
    type: { de: 'Universität', en: 'University' },
    workers: 150, generalWorkers: 75, professors: 75,
    inhabitants: 0, visitors: 225, special: 0,
  };
  const result = evaluateCity(cityWith(university), economy);
  assert.equal(result.workersNeeded, 150);
  assert.equal(result.services.find(service => service.typeDe === 'Universität').capacity, 225);
});

test('unavailable planner fields never become exact zero totals', () => {
  const result = evaluateCity(cityWith({ ...completeBuilding, power: null, workdays: null }), economy);
  assert.equal(result.power, null);
  assert.equal(result.buildCostRUB, null);
  assert.equal(result.incomplete.utilities, true);
  assert.equal(result.incomplete.construction, true);
});
```

- [ ] **Step 2: Run calculation tests and capture the current failure**

Run: `rtk test node --test tests/calc.test.mjs tests/city_utilities.test.mjs`

Expected: the professor/service fixture exposes any remaining incorrect capacity or unknown-value handling.

- [ ] **Step 3: Add small explicit helpers without changing legacy formulas**

In `js/calc.js` add:

```js
export function cityWorkforceDemand(building) {
  return Number.isFinite(building?.workers) ? building.workers : 0;
}

export function cityServiceCapacity(building, service) {
  const slot = CITY_SERVICE_CAPACITY_SLOT[service.typeDe] ?? service.src;
  return Number.isFinite(building?.[slot]) ? building[slot] : 0;
}
```

Use `cityWorkforceDemand()` in total and optimal workforce calculations, and `cityServiceCapacity()` in the service loop. Do not alter the existing Secret Police or heating branches.

- [ ] **Step 4: Remove only the superseded uncommitted direct DLC3 additions**

From `data/city_buildings.json`, remove only rows with:

```text
dlc3/water_treatment
dlc3/water_well
dlc3/water_well_small
```

Restore `tools/add_city_water_supply.py` to handling its previously shipped water entries; remove the temporary `copyPlanning` branches for those three IDs. Do not touch the three already shipped water-source rows or any unrelated catalog row. The general runtime merge must now supply all three Early buildings.

- [ ] **Step 5: Replace fixed identified-row assertions with runtime completeness assertions**

Remove the temporary `identified.length === 47` expectation and static-city checks for the three DLC3 rows. Assert them through `mergeOfficialCityCatalog()` instead, including exact IDs, workforce, DLC, and water supply, while retaining existing checks for shipped static rows.

- [ ] **Step 6: Run calculation, utility, and data tests**

Run: `rtk test node --test tests/calc.test.mjs tests/city_utilities.test.mjs tests/data_quality.test.mjs tests/official_city_catalog.test.mjs`

Expected: PASS; the three Early water buildings are runtime-derived once, and unknown fields remain incomplete.

- [ ] **Step 7: Commit calculation and WIP consolidation**

```bash
git add js/calc.js tests/calc.test.mjs tests/city_utilities.test.mjs data/city_buildings.json tools/add_city_water_supply.py tests/data_quality.test.mjs
git commit -m "fix: preserve city planning calculation fidelity"
```

### Task 7: Browser compatibility, cache metadata, and release gate

**Files:**
- Create: `tests/browser/city_official_catalog.mjs`
- Remove after replacement: `tests/browser/city_early_water.mjs`
- Modify: `data/VERSION.json`
- Modify: `index.html`
- Modify: versioned imports in `js/app.js`

**Interfaces:**
- Consumes: the complete application from Tasks 1–6.
- Produces: browser evidence for complete/legacy picker modes, stable saved selections, and final cache-consistent assets.

- [ ] **Step 1: Replace the narrow water browser check with a complete compatibility oracle**

Create `tests/browser/city_official_catalog.mjs` using Playwright. It must:

1. open `#/city` in German;
2. create a row if needed;
3. search for and select each of `dlc3/water_treatment`, `dlc3/water_well`, and `dlc3/water_well_small`;
4. verify `[DLC]`, workforce, and stable option values;
5. select a same-name official variant and verify its label is distinguishable;
6. reload and verify the selected `buildingGameId` still resolves;
7. open `?officialCityCatalog=false#/city`, verify appended buildings are absent from new choices, and verify an already stored appended selection still renders;
8. switch to English and verify English-name search;
9. fail on any page or console error.

Use a fresh browser context and seed the old plan only through the supported
legacy migration input before the first navigation:

```js
await page.addInitScript(plan => {
  localStorage.setItem('wr-planner-v1', JSON.stringify({
    schemaVersion: 1,
    planning: plan,
    observation: { tab: 'city' },
  }));
}, {
  cities: [{
    name: 'Legacy-Stadt', productivity: 1,
    rows: [{ type: 'Wohngebäude', name: 'Holzhaus', buildingIndex: 0, count: 1 }],
  }],
});
```

After migration, use only real clicks, typing, and `selectOption()`. Read the
resulting plan from IndexedDB or through the application's share/export action
only for assertions; do not patch live application state.

Once this broader oracle passes, delete the untracked narrow
`tests/browser/city_early_water.mjs` with `apply_patch`; it has been fully
superseded and must not be staged as a second source of release truth.

- [ ] **Step 2: Start a local server and run the focused browser checks**

Run server: `rtk proxy python3 -m http.server 8765 --bind 127.0.0.1`

Run checks:

```bash
rtk proxy node tests/browser/city_official_catalog.mjs http://127.0.0.1:8765/index.html
rtk proxy node tests/browser/vanilla_residential_catalog.mjs http://127.0.0.1:8765/index.html
rtk proxy node tests/browser/smoke.mjs http://127.0.0.1:8765/index.html
```

Expected: all scripts exit 0 with no console/page errors.

- [ ] **Step 3: Correct extraction metadata without inventing a game build**

In `data/VERSION.json`, set `datasetRelease` to the actual release date
`2026-08-16`, set `gameFileExtraction` to the verified raw-catalog regeneration
date `2026-08-14`, leave `verifiedSupplementsUpdated` unchanged because this
work adds no new measured supplement, and leave `gameBuild: null` plus
`gameBuildStatus: "not-recorded"`. Do not claim a newer game extraction merely
because application code changed.

- [ ] **Step 4: Bump and verify cache markers**

Run:

```bash
rtk proxy node tools/bump_cache_versions.mjs
rtk proxy node tools/bump_cache_versions.mjs --check
```

Expected: the first command updates only required version markers; the second exits 0 with no stale imports.

- [ ] **Step 5: Run syntax, focused, and full test gates**

```bash
rtk proxy node --check js/models/building_catalog_eligibility.js
rtk proxy node --check js/models/official_city_catalog.js
rtk proxy node --check js/models/city_building_resolver.js
rtk proxy node --check js/city_planning.js
rtk proxy node --check js/app.js
rtk npm test
```

Expected: every command exits 0 and the full suite reports zero failures.

- [ ] **Step 6: Compare representative legacy plan results before and after**

Use the compatibility fixture containing legacy index-only, name-only, imported, and new stable-ID rows. Record and deep-compare the `evaluateCity()` output for legacy rows with `officialCityCatalog=true` and `false`. Expected: identical population, workforce, services, utilities, materials, and construction totals for every old plan.

- [ ] **Step 7: Review the final diff and preserve unrelated files**

Run:

```bash
rtk git status --short
rtk git diff --check
rtk git diff --stat
```

Expected: only files named in this plan are changed. `.superpowers/`, `CODEX-charts-and-tables.md`, `HANDOFF-workerscalculator.md`, `access-big-light-map.png`, and `republic-panel.png` remain untouched and untracked.

- [ ] **Step 8: Commit the release gate**

```bash
git add tests/browser/city_official_catalog.mjs data/VERSION.json index.html js/app.js
git commit -m "test: verify complete city building catalog"
```

- [ ] **Step 9: Rebase, rerun the release gate, and push only after review**

Fetch `origin/main`, rebase the completed scoped commits onto it without including unrelated files, rerun cache check, full tests, and all three browser checks, then request a final code review. After that review reports no correctness issues, fast-forward local `main` and push `main` to `origin/main`. Verify the remote SHA and load `#/city` from the deployed site before reporting completion.
