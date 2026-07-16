# Roadmap

Planned improvements, ordered by value. Each item is independently shippable;
none are started until picked. See [CONTRIBUTING.md](CONTRIBUTING.md) for how
the code and data fit together.

## Phase 1 – Correctness & trust ✅ done 2026-07-16

### 1.1 Unit tests for the formula layer ✅
- **What:** Test harness (plain Node, no framework needed) for `js/calc.js` and
  `js/statsini.js`. Pin known-good values:
  - Brennerei (distillery) profit at sample prices ≈ 7 506 ₽/day (sheet `ProduktionProductions` row 26)
  - LowTech example: pop 4578, 1 city, start 1920, year 1940, 1 researched → 4 points
  - Worker surplus: pop 200, 94 workers → −20.5
  - stats.ini parser: record count, zeroed-scalar fallback, missing `eletric` fallback
- **Why:** the formulas are the product; right now only manual browser checks protect them.
- **Effort:** small. **Files:** `tests/calc.test.mjs`, `package.json` (test script only).

### 1.2 Delivery cost in profit calculations ✅
(Also added while implementing: input-price mode toggle — the sheet values
consumption at **sell** prices, an opportunity-cost view; the app now supports
both "sell (like the sheet)" and "buy (import view)", default sell.)
- **What:** Toggle "prices incl. delivery cost": effective sell = sell − deliveryCost/t,
  effective buy = buy + deliveryCost/t. Applies to production planner + price analysis.
- **Why:** the game charges per-ton customs/delivery at the border (sample save: ~4 ₽ / 7 $).
  Bulk goods (gravel, boards) currently look more profitable than they are. The original
  sheet also ignores this.
- **Effort:** small. **Files:** `js/calc.js` (Economy.sell/buy), `js/app.js` (toggle), i18n.

## Phase 2 – The features a spreadsheet can't do

### 2.1 Production chain solver ⭐ flagship feature
- **What:** Inverse planning. User states a goal ("20 t/day clothes"), the app walks the
  production graph backwards and proposes building counts for the whole upstream chain
  (fabric → chemicals/plants → power/water → workers), with totals: workers, build cost,
  power, and the import bill for every input the user marks as "import instead of produce".
- **Design notes:**
  - Build a resource→producers index from `production_buildings.json` at load time.
  - Where multiple buildings produce a resource, default to the best profit-per-worker
    building, let the user override per resource.
  - Fractional building counts shown as ceil() with utilization %.
  - Cycles exist (power plants consume coal, mines consume power) → resolve iteratively
    (few passes converge) or treat electricity/water as terminal "utility" inputs.
- **Effort:** medium-large. **Files:** new `js/chain.js`, new tab in `js/app.js`.

### 2.2 Republic overview (link cities ↔ industry)
- **What:** A dashboard combining all cities + the production plan: total worker surplus
  vs. workers needed, food/meat/clothes/alcohol demand of the population vs. production,
  power and heat balance republic-wide.
- **Why:** the sheet keeps city and industry planning disconnected; connecting them answers
  "can my republic actually staff and feed this?"
- **Depends on:** consumption-per-citizen constants (in game files; approximations exist in
  the sheet's city tabs).
- **Effort:** medium. **Files:** `js/calc.js`, new tab.

## Phase 3 – Data quality & freshness

### 3.1 Extract data from game files instead of the spreadsheet ⭐ (in progress)
Status 2026-07-16: `tools/extract_from_gamefiles.py` parses buildings
(238 with economic data), vehicles (531 incl. trains/planes/helicopters/ships)
and the localization string tables (`soviet<Language>.btf`, 20 languages,
format reverse-engineered: big-endian id/offset/len directory + UTF-16-BE blob).
Verified unit rule: ini production/consumption values are t per worker per day
(t/day = value × workers) for factories AND mines. Validation against the sheet
found real version drift (e.g. nuclear plant 40 workers in game vs 60 in sheet).
Still open: merge step into app data (game rates + sheet-measured power/water/
waste/construction), `data/community/` split, app integration.
Not in game inis (stay sheet/community-sourced): per-building power/water/waste,
full construction bills (partly `$COST_RESOURCE_AUTO` from 3D geometry), wagon
lengths, heating-plant output semantics.
- **What:** New extractor `tools/extract_from_gamefiles.py` parsing the game install:
  - `media_soviet/buildings_types/*.ini` → production/consumption, workers, power, water,
    construction bill (complete + always current with game patches)
  - `media_soviet/vehicles_types/*.ini` → vehicles/wagons
  - game localization files → names in all supported languages
- **Why:** ends version drift (sheet snapshot vs. game version vs. player's save) and covers
  ALL buildings. The spreadsheet remains the source for *derived planning constants*
  (service ratios, field yields) unless those are also found in game files.
- **Output:** same JSON shape as today → app code untouched. Add `data/VERSION.json`
  (game version + extraction date, shown in the app footer).
- **Effort:** medium (ini dialect is simple, volume is large). **Blocked on:** game files
  on the dev machine.

### 3.2 Versioned data sets
- **What:** `data/` becomes selectable: ship 2–3 snapshots (e.g. "sheet 2026-07",
  "game 1.0.x") and let the user pick, mirroring how their save may lag behind patches.
- **Effort:** small once 3.1 exists.

## Phase 4 – Usability & reach

### 4.1 Plan export / import / share links
- **What:** Export current state (plan, cities, price overrides) as JSON download; import
  the same; share-URL with state LZ-compressed into the fragment (`#plan=...`).
- **Why:** localStorage is fragile; share links spread the tool (Reddit/Steam forums).
- **Effort:** small-medium. **Files:** `js/app.js`, small `js/share.js`.

### 4.2 Live-follow stats.ini
- **What:** "Watch file" button using the File System Access API (Chromium): re-read the
  stats.ini on a timer/visibility change so prices stay current while the game runs.
  Firefox/Safari keep manual drop.
- **Effort:** small-medium.

### 4.3 Price history polish
- **What:** Hover tooltips with values, x-axis year/day labels, multi-resource compare,
  optional log scale (nuclear fuel dwarfs everything).
- **Effort:** small-medium.

### 4.4 Mobile layout
- **What:** Wide tables collapse to cards below ~700 px; sticky first column as
  intermediate step.
- **Effort:** medium (pure CSS/HTML, no logic).

### 4.5 Per-tab URLs
- **What:** Hash routing (`#/city`, `#/prices`) so links land on the right view;
  back button works.
- **Effort:** small.

## Phase 5 – Feature completeness vs. the sheet

### 5.1 Vehicle production tab
- **What:** Port the sheet's `Fahrzeugproduktion`: pick producible vehicles, material cost
  (steel, plastics, fabric, m/e-components, electronics) vs. sale value, profit per year.
  Data already in `data/vehicles.json` (Arbeitstage, material columns).
- **Effort:** medium.

### 5.2 More languages
- **What:** The sheet's translation table has 27 languages (machine-translated beyond de/en);
  game localization files (3.1) would provide proper ones. UI strings in `js/i18n.js`
  would need per-language additions — community-contributable.
- **Effort:** small per language once data exists.

### 5.3 LowTech research list
- **What:** Replace the "number of researched techs" input with the actual checklist of
  game-effect researches from DasBreitschwert's guide.
- **Effort:** small (needs the list transcribed).

## Suggested order

1. 1.1 tests → 1.2 delivery cost (quick wins, protect everything after)
2. 2.1 chain solver (flagship)
3. 4.1 share links → 4.2 watch file
4. 3.1 game-file extractor (once files are available) → 3.2 versioned data
5. 2.2 republic overview
6. Phase 4 polish + Phase 5 as demand dictates
