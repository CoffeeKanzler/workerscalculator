# Vanilla Residential Catalog Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill every evidenced official residential-menu gap in the city planner, including `dlc3/prefab2`, without presenting unavailable construction or utility facts as zero.

**Architecture:** Extend the game-file extractor with the menu and literal-name metadata needed to identify selectable residences. Merge authoritative raw residence definitions into the measured city catalog through a pure multiset-aware model, then make city aggregation and rendering propagate unknown planning facts explicitly.

**Tech Stack:** Python 3 standard library extractor, vanilla JavaScript ES modules, Node.js test runner, Playwright browser checks.

**Spec:** `docs/superpowers/specs/2026-08-14-vanilla-residential-catalog-completeness-design.md`

## Global Constraints

- `data/game/` remains public and reproducible from `/home/nexx/soviet-game/media_soviet`.
- Official base-game and DLC records are eligible; Workshop records are never added through this merge.
- Game files are authoritative for identity, menu group, population capacity, housing quality, and literal/localized names.
- Existing measured city-catalog values remain untouched when a representation already exists.
- Missing construction and utility values remain `null` with `unavailable` provenance; never estimate `COST_RESOURCE_AUTO` output and never coerce unknowns to zero.
- Preserve all unrelated dirty-worktree files.

## File Structure

- Modify `tools/extract_from_gamefiles.py`: parse `MENU_SFX`, preserve `NAME_STR`, and support refreshing only building outputs.
- Create `tests/extract_game_buildings.test.mjs`: exercise the real Python parser and name attachment against a temporary INI.
- Modify `data/game/buildings_raw.json`: regenerate official building records containing `menuSfx` and literal-name fallbacks.
- Create `js/models/vanilla_city_catalog.js`: pure eligibility, matching, multiset, and fallback-row construction.
- Create `tests/vanilla_city_catalog.test.mjs`: focused model tests plus whole-dataset completeness checks.
- Modify `js/calc.js`: return unavailable city aggregates when a selected row contains unknown facts.
- Modify `tests/calc.test.mjs`: construction-cost and city-aggregate regressions.
- Modify `js/app.js`: load raw buildings in both runtimes, merge catalogs, and render unknown row/summary values safely.
- Modify `js/i18n.js`: German and English explanation for partial game-file rows.
- Create `tests/browser/vanilla_residential_catalog.mjs`: real planner selection of the reported building.
- Modify cache markers through `tools/bump_cache_versions.mjs`.

---

### Task 1: Preserve residential menu metadata in game extraction

**Files:**
- Modify: `tools/extract_from_gamefiles.py`
- Create: `tests/extract_game_buildings.test.mjs`
- Modify: `data/game/buildings_raw.json`

**Interfaces:**
- Consumes: game `building.ini` tokens `NAME`, `NAME_STR`, `MENU_SFX`, `TYPE_LIVING`, `QUALITY_OF_LIVING`, and passenger storage.
- Produces: `parse_building(path, ident=None, keep_all=False) -> dict` with optional `menuSfx` and `nameStr`; `attach_names(items, localization) -> None`; CLI flag `--buildings-only`.

- [ ] **Step 1: Write the failing parser behavior test**

Create `tests/extract_game_buildings.test.mjs` using a real temporary INI and the real Python module:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('game extraction preserves menu category and literal building name', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'workers-building-'));
  const fixture = path.join(dir, 'building.ini');
  writeFileSync(fixture, [
    '$NAME_STR "Wooden house"',
    '$MENU_SFX building_residential_small',
    '$TYPE_LIVING',
    '$QUALITY_OF_LIVING 0.85',
    '$STORAGE RESOURCE_TRANSPORT_PASSANGER 5',
  ].join('\n'));
  const program = [
    'import json, sys',
    'from tools.extract_from_gamefiles import parse_building, attach_names',
    'item = parse_building(sys.argv[1], ident="dlc3/residential_wood2")',
    'attach_names([item], {})',
    'print(json.dumps(item))',
  ].join('; ');
  const run = spawnSync('python3', ['-c', program, fixture], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stderr);
  const item = JSON.parse(run.stdout);
  assert.equal(item.menuSfx, 'building_residential_small');
  assert.equal(item.nameStr, 'Wooden house');
  assert.equal(item.de, 'Wooden house');
  assert.equal(item.en, 'Wooden house');
});
```

The production change that makes this test pass is parsing `MENU_SFX` and exposing the existing name attachment as a reusable function with a literal-name fallback.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/extract_game_buildings.test.mjs`

Expected: FAIL because `attach_names` is not importable and/or `menuSfx` is absent.

- [ ] **Step 3: Implement the minimal extractor changes**

In `tools/extract_from_gamefiles.py`:

```python
ECON_TOKENS = {
    # existing tokens...
    'MENU_SFX',
}

# inside parse_building
elif key == 'MENU_SFX' and args:
    b['menuSfx'] = args[0]

def attach_names(items, localization):
    for item in items:
        name_id = item.get('nameId')
        if name_id is not None:
            item['de'] = localization.get('de', {}).get(name_id)
            item['en'] = localization.get('en', {}).get(name_id)
        elif item.get('nameStr'):
            item['de'] = item['nameStr']
            item['en'] = item['nameStr']
```

Replace the nested `attach_names` in `main()` with this function. Immediately
after writing `buildings_raw.json`, return before vehicle extraction when
`--buildings-only` is present. Do not rewrite `names.json` in this mode because
that file also contains vehicle localization IDs. Keep normal no-flag behavior
unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/extract_game_buildings.test.mjs`

Expected: PASS.

- [ ] **Step 5: Regenerate only authoritative building outputs**

Run:

```bash
python3 tools/extract_from_gamefiles.py /home/nexx/soviet-game/media_soviet --buildings-only
```

Inspect:

```bash
jq '.[] | select(.id == "dlc3/prefab2") | {id, menuSfx, livingSpace, qualityOfLiving}' data/game/buildings_raw.json
jq '.[] | select(.id == "dlc3/residential_wood2") | {id, nameStr, de, en}' data/game/buildings_raw.json
```

Expected literals:

```json
{"id":"dlc3/prefab2","menuSfx":"building_residential_medium","livingSpace":68.0,"qualityOfLiving":0.85}
{"id":"dlc3/residential_wood2","nameStr":"Wooden house","de":"Wooden house","en":"Wooden house"}
```

- [ ] **Step 6: Verify and commit extractor delivery**

Run:

```bash
node --test tests/extract_game_buildings.test.mjs tests/data_quality.test.mjs
git diff --check
```

Commit only task files:

```bash
git add tools/extract_from_gamefiles.py tests/extract_game_buildings.test.mjs data/game/buildings_raw.json
git commit -m "feat: preserve vanilla residential menu metadata"
```

---

### Task 2: Merge every evidenced vanilla residence without replacing measured rows

**Files:**
- Create: `js/models/vanilla_city_catalog.js`
- Create: `tests/vanilla_city_catalog.test.mjs`

**Interfaces:**
- Consumes: `mergeVanillaCityResidences(cityBuildings: object[], rawBuildings: object[])` arguments.
- Produces: a new `object[]` containing original row objects plus missing official residence rows; exports `RESIDENTIAL_MENU_TYPES` for transparent category mapping.

- [ ] **Step 1: Write failing pure-model tests**

Create fixtures with complete real shapes. Name the breaks: duplicate game definitions being collapsed, input mutation, Workshop leakage, and the reported entry being absent.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeVanillaCityResidences } from '../js/models/vanilla_city_catalog.js';

const rawBuildings = JSON.parse(readFileSync(new URL('../data/game/buildings_raw.json', import.meta.url)));
const cityBuildings = JSON.parse(readFileSync(new URL('../data/city_buildings.json', import.meta.url)));

const rawResidence = id => ({
  id, de: 'Wohnungen - Plattenbau', en: 'Flats - prefab',
  types: ['TYPE_LIVING'], menuSfx: 'building_residential_medium',
  livingSpace: 68, qualityOfLiving: 0.85, workers: 0,
});

test('multiset matching consumes one existing row and appends the second identity', () => {
  const existing = [{
    de: 'Wohnungen - Plattenbau', en: 'Flats - prefab', kind: 'Vanilla',
    type: { de: 'Plattenbau', en: 'Prefab' }, inhabitants: 68, quality: 0.85,
    workdays: 400,
  }];
  const before = structuredClone(existing);
  const merged = mergeVanillaCityResidences(existing, [rawResidence('dlc3/a'), rawResidence('dlc3/b')]);
  assert.deepEqual(existing, before);
  assert.strictEqual(merged[0], existing[0]);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].gameId, 'dlc3/b');
  assert.equal(merged[1].workdays, null);
});

test('official menu residence merge excludes Workshop-shaped IDs', () => {
  const merged = mergeVanillaCityResidences([], [rawResidence('2124755644/prefab')]);
  assert.deepEqual(merged, []);
});

test('reported prefab2 is a medium 68-person 85-percent residence', () => {
  const merged = mergeVanillaCityResidences(cityBuildings, rawBuildings);
  const prefab = merged.find(row => row.gameId === 'dlc3/prefab2');
  assert.ok(prefab);
  assert.deepEqual(prefab.type, {
    de: 'Mittlere Wohnhäuser', en: 'Medium residential buildings',
  });
  assert.equal(prefab.inhabitants, 68);
  assert.equal(prefab.quality, 0.85);
  assert.equal(prefab.provenance.housing, 'game-file');
  assert.equal(prefab.provenance.workdays, 'unavailable');
});
```

Add a real-data coverage test that independently builds literal signatures from eligible raw rows and asserts that consuming merged rows leaves no eligible raw instance unmatched. Do not call a production signature helper from the assertion.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/vanilla_city_catalog.test.mjs`

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Implement the pure multiset merge**

Create `js/models/vanilla_city_catalog.js` with these public constants and behavior:

```js
export const RESIDENTIAL_MENU_TYPES = Object.freeze({
  building_residential_small: Object.freeze({ de: 'Kleine Wohnhäuser', en: 'Small residential buildings' }),
  building_residential_medium: Object.freeze({ de: 'Mittlere Wohnhäuser', en: 'Medium residential buildings' }),
  building_residential_big: Object.freeze({ de: 'Große Wohnhäuser', en: 'Large residential buildings' }),
  building_internat1: Object.freeze({ de: 'Studentenwohnheim', en: 'University halls of residence' }),
});

const UNKNOWN_FIELDS = Object.freeze([
  'power', 'maxKW', 'water', 'hotwater', 'waste', 'workdays',
  'gravel', 'bricks', 'steel', 'concrete', 'asphalt', 'boards', 'panels',
  'ecomponents', 'mcomponents',
]);
```

Eligibility must require a mapped `menuSfx`, `TYPE_LIVING`, positive finite `livingSpace`, and an ID that does not begin with a numeric Workshop prefix. Match stable IDs first. Then consume unmatched city rows without `gameId` from signature buckets containing normalized display name, numeric inhabitants, and nullable quality. Append one fallback row per unconsumed source, preserving source order.

Every fallback row must carry exact identity/housing provenance and explicit `null` plus `unavailable` provenance for every `UNKNOWN_FIELDS` entry. Use `raw.de ?? raw.nameStr ?? raw.id` and the equivalent English fallback; do not invent a generic display name.

- [ ] **Step 4: Run model and dataset tests and verify GREEN**

Run: `node --test tests/vanilla_city_catalog.test.mjs tests/data_quality.test.mjs`

Expected: PASS, including `dlc3/prefab2` and multiset completeness.

- [ ] **Step 5: Commit the isolated catalog model**

```bash
git add js/models/vanilla_city_catalog.js tests/vanilla_city_catalog.test.mjs
git commit -m "feat: complete vanilla residential catalog"
```

---

### Task 3: Propagate unavailable city planning facts instead of zero

**Files:**
- Modify: `js/calc.js`
- Modify: `tests/calc.test.mjs`

**Interfaces:**
- Consumes: building numeric fields where `null` means unavailable and numeric zero means known zero.
- Produces: `Economy.buildCost(building, currency) -> number | null`; `evaluateCity(...).incomplete: Record<string, boolean>` and nullable utility/construction aggregates.

- [ ] **Step 1: Write failing construction and city aggregate tests**

Add to `tests/calc.test.mjs`:

```js
test('build cost is unavailable when any required construction fact is unavailable', () => {
  const incomplete = {
    workdays: null, gravel: 0, bricks: 0, steel: 0, concrete: 0,
    asphalt: 0, boards: 0, panels: 0, ecomponents: 0, mcomponents: 0,
  };
  assert.equal(eco().buildCost(incomplete, 'RUB'), null);
});

test('city keeps known housing facts but does not zero unknown utilities or cost', () => {
  const residence = {
    de: 'Unknown planning facts', type: { de: 'Mittlere Wohnhäuser', en: 'Medium residential buildings' },
    inhabitants: 68, quality: 0.85, workers: 0, visitors: 0, special: 0,
    power: null, maxKW: null, water: null, hotwater: null, waste: null,
    workdays: null, gravel: null, bricks: null, steel: null, concrete: null,
    asphalt: null, boards: null, panels: null, ecomponents: null, mcomponents: null,
  };
  const result = evaluateCity({
    productivity: 1, cable: 'Untergrund Kabel 1,85 MW', exchanger: 'small', waterDivisor: 3,
    rows: [{ building: residence, count: 1 }],
  }, eco());
  assert.equal(result.population, 68);
  assert.equal(result.avgHousingQuality, 0.85);
  assert.equal(result.power, null);
  assert.equal(result.water, null);
  assert.equal(result.buildCostRUB, null);
  assert.equal(result.transformers, null);
  assert.equal(result.incomplete.utilities, true);
  assert.equal(result.incomplete.construction, true);
});
```

The production mutations caught are `?? 0` being reintroduced in construction pricing and nullable city fields being multiplied into numeric zero.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/calc.test.mjs`

Expected: FAIL because the current calculator prices/sums missing fields as zero.

- [ ] **Step 3: Implement nullable construction cost and known-field aggregation**

In `Economy.buildCost`, define the complete required field list (`workdays` plus all nine material fields). Return `null` if any value is not finite; otherwise calculate exactly as today.

In `evaluateCity`, keep the existing numeric `sum` for facts that are always known (`inhabitants`, `workers`, service capacities). Add:

```js
const sumKnown = field => rows.some(row => !Number.isFinite(row.building[field]))
  ? null
  : rows.reduce((total, row) => total + row.building[field] * row.count, 0);
```

Use it for `power`, `maxKW`, `water`, `hotwater`, `waste`, `workdays`, and each material. Treat absent `waterSupply` as the existing known zero because most buildings do not supply water. Calculate `buildCostRUB` and `buildCostUSD` from per-row `Economy.buildCost`, returning `null` if any selected row is unavailable.

Set derived `transformers`, `heatExchangers`, and `waterConnections` to `null` when their inputs are unavailable. Expose:

```js
incomplete: {
  utilities: [power, maxKW, water, hotwater, waste].some(value => value == null),
  construction: buildCostRUB == null || buildCostUSD == null,
}
```

Keep empty cities at known numeric zero because `rows.some(...)` is false for an empty row set.

- [ ] **Step 4: Run calculator tests and verify GREEN**

Run: `node --test tests/calc.test.mjs tests/city_utilities.test.mjs`

Expected: PASS, including existing empty-city and service calculations.

- [ ] **Step 5: Commit calculator semantics**

```bash
git add js/calc.js tests/calc.test.mjs
git commit -m "fix: preserve unavailable city planning facts"
```

---

### Task 4: Integrate the complete catalog and verify the visible planner

**Files:**
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Create: `tests/browser/vanilla_residential_catalog.mjs`
- Modify: transitive cache markers in `index.html`, `beta/index.html`, and imported modules reported by the cache tool

**Interfaces:**
- Consumes: `mergeVanillaCityResidences(city, raw)` and nullable `evaluateCity` aggregates.
- Produces: visible type option `Mittlere Wohnhäuser`, selectable `dlc3/prefab2`, and `—`/unavailable UI for unknown planning facts in hosted and addon runtimes.

- [ ] **Step 1: Write the failing browser regression**

Create `tests/browser/vanilla_residential_catalog.mjs` following the existing Playwright error-capture pattern:

```js
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(`${BASE}#/city`, { waitUntil: 'load' });
  const plan = page.locator('section table.data.wide').first();
  await plan.waitFor({ timeout: 30_000 });
  const row = plan.locator('tbody tr').first();
  const type = row.locator('select').nth(0);
  await type.selectOption({ label: 'Mittlere Wohnhäuser' });
  const building = row.locator('select').nth(1);
  const option = building.locator('option').filter({ hasText: '68 Einwohner' }).first();
  const label = await option.textContent();
  if (!label || !label.includes('85% Wohnqualität')) throw new Error(`prefab2 label is incomplete: ${label}`);
  const value = await option.getAttribute('value');
  if (!value) throw new Error('prefab2 has no selectable value');
  await building.selectOption(value);
  await page.waitForTimeout(300);
  const text = await row.innerText();
  if (!/68/.test(text) || !/85\s*%/.test(text)) throw new Error(`selected row is wrong: ${text}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: the 68-person 85-percent vanilla prefab is selectable under medium residences');
} finally {
  await browser.close();
}
```

- [ ] **Step 2: Start the real checkout and verify browser RED**

Inspect port ownership with `ss -ltnp 'sport = :8765'`. Reuse it only if it serves `/home/nexx/workers`; otherwise run `python3 -m http.server 8765` from this checkout. Then run:

```bash
node tests/browser/vanilla_residential_catalog.mjs http://localhost:8765/index.html
```

Expected: FAIL because `Mittlere Wohnhäuser` and `prefab2` are absent.

- [ ] **Step 3: Integrate catalog merging during data load**

Import the new model in `js/app.js`. Fetch `data/game/buildings_raw.json` unconditionally, because the city planner exists in standard addon mode even when the save workspace does not. Construct data in this order:

```js
const mergedCityBuildings = mergeVanillaCityResidences(city, rawBuildings);
DATA = {
  // existing fields...
  cityBuildings: mergedCityBuildings,
  rawBuildings,
};
```

Do not change Workshop orchestration or `state.vanillaOnly` behavior.

- [ ] **Step 4: Render nullable row and summary values safely**

In the city table, add:

```js
const scaledFact = (value, count, digits) => Number.isFinite(value)
  ? fmt(value * count, digits)
  : '—';
```

Use it for `maxKW`, `water`, `hotwater`, and `waste`. Compute row construction cost first and render `—` when `Economy.buildCost` returns `null`.

In the summary, guard every `Math.ceil` derived from a nullable aggregate. When water or hot-water demand is unavailable, do not call `cityUtilityPlan` with a coerced zero; show `t('cityPlanningFactsUnavailable')` instead. Add exact translations:

```js
cityPlanningFactsUnavailable: 'Für dieses Spielgebäude sind Bau- oder Versorgungswerte nicht verfügbar.',
cityPlanningFactsUnavailable: 'Construction or utility facts are unavailable for this game building.',
```

The existing `fmt(null) -> '—'` handles direct summary values.

- [ ] **Step 5: Bump transitive cache markers**

```bash
node tools/bump_cache_versions.mjs js/models/vanilla_city_catalog.js js/calc.js js/app.js js/i18n.js data/game/buildings_raw.json
node tools/bump_cache_versions.mjs --check js/models/vanilla_city_catalog.js js/calc.js js/app.js js/i18n.js data/game/buildings_raw.json
```

Stage only files actually changed by the tool.

- [ ] **Step 6: Run focused syntax, unit, and browser verification**

```bash
node --check js/app.js
node --test tests/extract_game_buildings.test.mjs tests/vanilla_city_catalog.test.mjs tests/calc.test.mjs tests/data_quality.test.mjs tests/bump_cache_versions.test.mjs
node tests/browser/vanilla_residential_catalog.mjs http://localhost:8765/index.html
node tests/browser/smoke.mjs http://localhost:8765/index.html
```

Expected: all commands pass with no page or console errors. Store any optional review screenshot under ignored `private/`, never in git.

- [ ] **Step 7: Run the full suite**

```bash
npm test
git diff --check
git status --short
```

Expected: `npm test` exits 0; only scoped task files plus the user's pre-existing untracked files appear.

- [ ] **Step 8: Commit the integrated visible delivery**

```bash
git add js/app.js js/i18n.js tests/browser/vanilla_residential_catalog.mjs index.html beta/index.html
git add js/models/vanilla_city_catalog.js js/calc.js data/game/buildings_raw.json
git commit -m "feat: expose complete vanilla residential catalog"
```

Before committing, remove already committed paths from the command if they have no new cache-marker change.

---

### Task 5: Completion review

**Files:**
- Review only: all scoped files and commits from Tasks 1-4

**Interfaces:**
- Consumes: committed implementation and verification output.
- Produces: evidence-backed completion report; no new feature behavior.

- [ ] **Step 1: Compare implementation against every spec success criterion**

Confirm explicitly:

```text
prefab2 visible/selectable: yes/no
all eligible raw menu residences represented: yes/no
Workshop IDs excluded: yes/no
existing measured rows preserved: yes/no
unknown planning values remain unavailable: yes/no
data/game remains public and reproducible: yes/no
```

- [ ] **Step 2: Inspect final diff and commits**

```bash
git diff --check
git log -6 --oneline --decorate
git status --short
```

Verify no pre-existing untracked file entered a commit.

- [ ] **Step 3: Invoke verification-before-completion and report only fresh evidence**

Re-run any command required by that skill if its evidence is no longer fresh. Do not claim deployment, push, or Windows validation unless separately performed.
