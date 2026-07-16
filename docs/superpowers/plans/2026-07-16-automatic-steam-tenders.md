# Automatic Steam Tenders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make steam tenders automatic, locked locomotive components throughout extraction, train calculations, recommendations, and the UI.

**Architecture:** The extractor nests a resolved tender record on each applicable locomotive and stops publishing tenders as independent choices. A new pure `js/train.js` module owns consist normalization, physical expansion, evaluation, and recommendations; `js/app.js` only maps those results into controls and DOM.

**Tech Stack:** Python 3 game-data extractor, vanilla JavaScript ES modules, Node built-in test runner, static HTML/CSS.

---

### Task 1: Generate Paired Tender Data

**Files:**
- Modify: `tools/extract_from_gamefiles.py:184-260`
- Modify: `tools/extract_from_gamefiles.py:458-494`
- Modify: `data/game/vehicles_raw.json`
- Modify: `data/game/rail_vehicles.json`
- Create: `tests/train.test.mjs`

- [ ] **Step 1: Write the failing generated-data test**

Create `tests/train.test.mjs` with assertions that top-level tenders are absent,
`FD-Serie`, `Ol49`, `Ty45`, and `Pm2` have the expected nested tender, and
`Br80` has none:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rail = JSON.parse(readFileSync(new URL('../data/game/rail_vehicles.json', import.meta.url)));
const byName = new Map(rail.map(v => [v.name, v]));

test('game rail data nests hard-attached tenders instead of publishing choices', () => {
  assert.equal(rail.filter(v => v.attrs.Typ === 'Tender').length, 0);
  assert.equal(byName.get('FD-Serie').tender.name, 'FD Tender');
  assert.equal(byName.get('Ol49').tender.name, '25D49 (Ol49) Tender');
  assert.equal(byName.get('Ty45').tender.name, '32D43 (Ty45) Tender');
  assert.equal(byName.get('Pm2').tender.name, '34D44 (Pm2) Tender');
  assert.equal(byName.get('Br80').tender, undefined);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/train.test.mjs`

Expected: FAIL because current data has nine top-level `Tender` records and no
locomotive has a nested `tender` object.

- [ ] **Step 3: Parse `$TRAINSET` references**

Extend `parse_vehicle()` so it preserves ordered train-set ids:

```python
def parse_vehicle(path, category):
    v = {'id': os.path.basename(os.path.dirname(path)), 'category': category,
         'trainSet': []}
    # existing parsing remains
    # ...
            elif key == 'TRAINSET' and args:
                v['trainSet'].append(args[0])
```

Keep only the field when populated before returning so generated raw JSON does
not gain empty arrays on every vehicle:

```python
    if not v['trainSet']:
        del v['trainSet']
    return v if 'type' in v else None
```

- [ ] **Step 4: Nest resolved tender records**

Replace top-level tender emission in `build_rail_vehicles()` with a
case-insensitive vehicle-id index. Normalize the game namespace prefix such as
`DLC3_FDtender` to `FDtender`, and only interpret `$TRAINSET` as a tender for
steam locomotives:

```python
    by_id = {v['id'].lower(): v for v in vehicles}

    def resolve(ref):
        direct = by_id.get(ref.lower())
        if direct:
            return direct
        local = ref.split('_', 1)[1] if '_' in ref else ref
        return by_id.get(local.lower())

    def tender_entry(v):
        attrs = {
            'Typ': 'Tender', 'Länge': v.get('length'),
            'Leergewicht': v.get('emptyWeight'),
            'Von': v.get('from'), 'Bis': v.get('to'),
        }
        result = {'name': v.get('de') or v.get('en') or v['id'],
                  'attrs': {k: x for k, x in attrs.items() if x is not None}}
        if v.get('dlc'):
            result['dlc'] = v['dlc']
        return result
```

For each emitted locomotive, resolve the first `$TRAINSET` item whose target is
a `VEHICLETYPE_RAIL_VAGON`. Raise `ValueError` if a steam locomotive declares
train-set items but none can be resolved. Attach `entry['tender']` when found.
Do not emit `RAIL_VAGON` locomotive-group entries at top level.

- [ ] **Step 5: Regenerate game data**

Run: `python3 tools/extract_from_gamefiles.py /home/nexx/media_soviet`

Expected summary includes `game-only rail vehicles: 46 (18 steam, 11 paired)`
or the exact paired count derived from current files, and produces no top-level
tender records.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/train.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit paired data extraction**

```bash
git add tools/extract_from_gamefiles.py data/game/vehicles_raw.json data/game/rail_vehicles.json tests/train.test.mjs docs/superpowers/specs/2026-07-16-automatic-steam-tenders-design.md
git commit -m "fix: derive steam tenders from game trainsets"
```

### Task 2: Add Pure Train-Domain Helpers

**Files:**
- Create: `js/train.js`
- Modify: `tests/train.test.mjs`

- [ ] **Step 1: Write failing normalization and expansion tests**

Append tests using small synthetic vehicles:

```js
import {
  expandConsist, normalizeConsist, evaluateConsist, recommendTrain,
} from '../js/train.js';

const tender = { name: 'FD Tender', attrs: { Typ: 'Tender', Länge: 12, Leergewicht: 34 } };
const steam = {
  name: 'FD', tender,
  attrs: { Typ: 'Lokomotive', Länge: 17, Leergewicht: 135,
    Motorleistung: 2205, 'Max. Geschwindigkeit': 85, Antriebsart: 'S', Von: 1931, Bis: 1978 },
};
const wagon = {
  name: 'Coal wagon',
  attrs: { Typ: 'Güterwagon', Länge: 10, Leergewicht: 10, Kohle: 40, Von: 1900, Bis: 2000 },
};
const vehicles = [steam, wagon, tender];

test('legacy manual tenders are removed from persisted consist', () => {
  assert.deepEqual(normalizeConsist([
    { name: 'FD', count: 1 }, { name: 'FD Tender', count: 1 },
  ], vehicles), [{ name: 'FD', count: 1 }]);
});

test('each locomotive instance expands to an adjacent locked tender', () => {
  const expanded = expandConsist([{ name: 'FD', count: 2 }], vehicles);
  assert.deepEqual(expanded.map(s => [s.name, s.locked]), [
    ['FD', false], ['FD Tender', true], ['FD', false], ['FD Tender', true],
  ]);
});

test('tender affects dimensions but not cargo capacity', () => {
  const result = evaluateConsist([
    { name: 'FD', count: 1 }, { name: 'Coal wagon', count: 1, cargo: 'Kohle' },
  ], vehicles, new Set(['Kohle']));
  assert.equal(result.totalLength, 39);
  assert.equal(result.emptyWeight, 179);
  assert.equal(result.capacities.get('Kohle'), 40);
  assert.equal(result.loadedWeight, 219);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/train.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/train.js`.

- [ ] **Step 3: Implement normalization and physical expansion**

Create `js/train.js` with pure helpers. `normalizeConsist()` removes vehicles
whose type is `Tender`; `expandConsist()` emits individual locomotive/tender
pairs so physical order remains correct, while wagon segments retain their
count. Each returned segment contains `vehicle`, `sourceIndex`, and `locked`.

```js
export const isLocomotive = v =>
  ['Lokomotive', 'Triebwagen'].includes(v?.attrs?.Typ);

const vehicleMap = vehicles => vehicles instanceof Map
  ? vehicles : new Map(vehicles.map(v => [v.name, v]));

export function normalizeConsist(consist, vehicles) {
  const byName = vehicleMap(vehicles);
  return consist.filter(s => byName.get(s.name)?.attrs?.Typ !== 'Tender');
}

export function expandConsist(consist, vehicles) {
  const byName = vehicleMap(vehicles);
  const out = [];
  consist.forEach((segment, sourceIndex) => {
    const vehicle = byName.get(segment.name);
    if (!vehicle || vehicle.attrs.Typ === 'Tender') return;
    if (isLocomotive(vehicle) && vehicle.tender) {
      for (let i = 0; i < segment.count; i++) {
        out.push({ ...segment, count: 1, vehicle, sourceIndex, locked: false });
        out.push({ name: vehicle.tender.name, count: 1, cargo: null,
          vehicle: vehicle.tender, sourceIndex, locked: true });
      }
      return;
    }
    out.push({ ...segment, vehicle, sourceIndex, locked: false });
  });
  return out;
}
```

- [ ] **Step 4: Implement physical evaluation**

Add `evaluateConsist(consist, vehicles, cargoNames)` using expanded segments.
Return `segments`, `totalLength`, `powerKW`, `emptyWeight`, `capacities`,
`cargoWeight`, `loadedWeight`, `kwPerT`, `maxSpeed`, `availableFrom`, and
`isElectric`. Count cargo only on non-locomotive, non-locked segments.

- [ ] **Step 5: Verify helper tests are GREEN**

Run: `node --test tests/train.test.mjs`

Expected: PASS.

- [ ] **Step 6: Write a failing tender-aware recommendation test**

```js
test('recommendation includes tender mass when choosing locomotive count', () => {
  const tr = { year: 1940, reco: { rows: [{ cargo: 'Kohle', tons: 400 }], kwt: 2, drive: 'S' } };
  const result = recommendTrain(tr, [steam], [wagon]);
  assert.deepEqual(result[0], { name: 'FD', count: 1, cargo: null });
  const evaluated = evaluateConsist(result, [steam, wagon], new Set(['Kohle']));
  assert.ok(evaluated.kwPerT >= 2);
});
```

Use fixture values that require a different locomotive count if tender mass is
omitted, and assert the exact corrected count after calculating the boundary.

- [ ] **Step 7: Move and correct recommendation logic**

Export `eraOk()` and `recommendTrain()` from `js/train.js`. For locomotive
selection use combined locomotive-plus-tender empty weight and length:

```js
const attachedWeight = l.tender?.attrs?.Leergewicht ?? 0;
const attachedLength = l.tender?.attrs?.Länge ?? 0;
const lw = (l.attrs.Leergewicht ?? 0) + attachedWeight;
const llen = (l.attrs.Länge ?? 0) + attachedLength;
```

Keep recommendation output logical: one locomotive segment plus wagon segments;
never persist a tender segment.

- [ ] **Step 8: Run all train tests**

Run: `node --test tests/train.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit train-domain logic**

```bash
git add js/train.js tests/train.test.mjs
git commit -m "feat: calculate locked locomotive tenders"
```

### Task 3: Integrate Locked Tenders in the UI

**Files:**
- Modify: `js/app.js:1-7`
- Modify: `js/app.js:810-1131`
- Modify: `js/i18n.js:64-68`
- Modify: `js/i18n.js:150-154`
- Modify: `css/style.css:153-161`

- [ ] **Step 1: Import train-domain helpers**

Add the versioned module import:

```js
import {
  isLocomotive, normalizeConsist, expandConsist, evaluateConsist,
  eraOk, recommendTrain,
} from './train.js?v=12';
```

Remove the local `eraOk()`, `recommendTrain()`, and `isLoco` implementations.

- [ ] **Step 2: Normalize saved state and remove selectable tenders**

At the start of `renderTrains()`, normalize `state.train.consist` and write it
back only when changed. Define locomotives strictly with `isLocomotive`; delete
the tender label branch and tender-specific add logic.

```js
const normalized = normalizeConsist(trainConsist(), DATA.vehicles);
if (normalized.length !== state.train.consist.length) state.train.consist = normalized;
const consist = state.train.consist;
const locos = DATA.vehicles.filter(isLocomotive)
  .sort((a, b) => (b.attrs.Motorleistung ?? 0) - (a.attrs.Motorleistung ?? 0));
```

- [ ] **Step 3: Use tender-aware evaluation everywhere**

Replace the local totals block with `evaluateConsist()`. Use its total length
for remaining-wagon fit, its physical segments for the SVG, and its totals for
the summary. Calculate cost from physical segments so nested tenders are
included when material data exists.

- [ ] **Step 4: Render locked tender rows**

Keep editable rows based on logical `consist`. Immediately after every
tender-equipped locomotive row render a `.consistseg.locked` row showing the
tender name, translated `included` label, and no input/remove controls. For
locomotive count greater than one show the same count as plain text.

Add translations:

```js
included: 'enthalten',
included: 'included',
```

Add restrained locked-row styling:

```css
.consistseg.locked { color: var(--muted); padding-left: 22px; }
.consistseg.locked .locklabel { font-size: 12px; }
```

- [ ] **Step 5: Remove obsolete warnings and strings**

Delete the `hasSteam && !hasTender` warning branch and remove
`steamTenderNote` from both locales. A missing declared tender is now an
extraction error, while legitimate tank locomotives need no warning.

- [ ] **Step 6: Run automated verification**

Run: `npm test`

Expected: all tests PASS with no warnings.

- [ ] **Step 7: Commit UI integration**

```bash
git add js/app.js js/i18n.js css/style.css
git commit -m "fix: lock automatic tenders to steam locomotives"
```

### Task 4: Release Verification and Roadmap Update

**Files:**
- Modify: `index.html:8-13`
- Modify: `js/app.js:1-7`
- Modify: `ROADMAP.md:130-145`

- [ ] **Step 1: Bump static asset/data version**

Change every current `?v=11` module/style reference to `?v=12`, including the
new `train.js` import, and update `index.html` CSS/app references.

- [ ] **Step 2: Update roadmap train-planner status**

Under 5.1b, record that the game-data train planner now models hard-attached
steam tenders from `$TRAINSET`, while keeping the per-cargo tonnage limitation
as the remaining open issue.

- [ ] **Step 3: Run final automated checks**

Run:

```bash
npm test
git diff --check
git status --short
```

Expected: all tests PASS; no whitespace errors; only intentional release and
roadmap files remain uncommitted.

- [ ] **Step 4: Start the static app**

Run: `python3 -m http.server 8000`

Expected: server listens on `http://localhost:8000/`. If port 8000 is occupied,
use the next free port.

- [ ] **Step 5: Verify browser behavior**

At desktop 1440x900 and mobile 390x844:

1. Open the Trains tab.
2. Set year 1935 and Steam drive.
3. Confirm no tender appears in the locomotive selector.
4. Add `FD-Serie`; confirm `FD Tender` appears immediately as a locked row and
   adjacent visual segment.
5. Change locomotive count to 2; confirm two physical tender segments and
   doubled locomotive-plus-tender length/weight.
6. Run a steam recommendation; confirm it includes tender length/weight and no
   missing-tender warning appears.
7. Confirm the layout has no overlap or clipped controls at either viewport.

- [ ] **Step 6: Commit release metadata**

```bash
git add index.html js/app.js ROADMAP.md docs/superpowers/plans/2026-07-16-automatic-steam-tenders.md
git commit -m "docs: record automatic steam tender support"
```

- [ ] **Step 7: Review final history**

Run: `git log --oneline -5 && git status --short`

Expected: four focused implementation commits after the design commit and a
clean working tree.
