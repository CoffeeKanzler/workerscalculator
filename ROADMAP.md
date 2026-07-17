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

### 2.1 Production chain solver ⭐ flagship feature ✅ done 2026-07-16
(Implemented in `js/chain.js` + "Production chain" tab: fixpoint solver,
per-resource import toggle & producer choice, power/water expansion,
byproduct surplus report, 5 tests. Extended 2026-07-17: mine deposits are no
longer one blended quality per resource — `qualityTiers` lets you specify
several deposits at different qualities, with a trailing auto-fill sentinel
so the simple case still needs no input. Mine quality inputs across the app
now default to 50%, shown as a percentage instead of a raw multiplier.)
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

### 2.2 Republic command center (Actual ↔ Plan) ✅ beta 2026-07-17
- **Delivered:** The Republic Overview now combines an imported observed republic and
  editable planning projections through explicit **Actual / Plan / Difference** views.
  It uses saved residents rather than theoretical housing capacity, separates current
  staffing from configured worker caps, preserves production-only areas, reports source
  evidence, surfaces area alerts, and drills into the existing City and Production planners.
- **History:** Full republic-wide `stats.ini` history remains available (3,002 records in
  the supplied save). Charts cover population/employment, productivity, RUB trade, and a
  selected resource. `$STAT_CITY` blocks are deliberately not presented as republic history.
- **Why:** the sheet keeps city and industry planning disconnected; connecting them answers
  "can my republic actually staff and feed this?"
- **Still blocked:** the food/meat/clothes/alcohol demand-vs-production comparison needs
  per-citizen consumption rates, which are **not available anywhere checked** - not in
  the game's `.ini` files (grepped `media_soviet` for citizen/consumption tokens, none),
  not in any `data/*.json`, and not in the accessible spreadsheet tabs either (fetched
  "Gesamtübersicht"/"Städte/Citys" directly, no per-capita figures present). Shipping
  worker-surplus + power/water/heat now; the demand panel stays out until this constant
  turns up (in-game observation, or worth another binary-RE pass if someone wants to
  spend the effort).
- **Effort:** medium. **Files:** `js/calc.js`, new tab.

## Phase 3 – Data quality & freshness

### 3.1 Extract data from game files instead of the spreadsheet ⭐ ✅ done 2026-07-16
(Full pipeline: buildings + vehicles + 20-language localization; merged app
dataset `data/game/production_buildings.json`; dataset switch in the header
= 3.2 for the production planner. Community constants split into
`js/community_constants.js`. Still sheet-sourced: city buildings, vehicle
lengths, per-building power/water/waste, decade prices.)
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

### 3.2 Versioned data sets 🟡 partially done
(The "Building data" toggle in the header already switches the whole app
between game-file-derived and spreadsheet-derived buildings - the main
case this item cared about. Not done: multiple dated game-version snapshots
side by side.)
- **What:** `data/` becomes selectable: ship 2–3 snapshots (e.g. "sheet 2026-07",
  "game 1.0.x") and let the user pick, mirroring how their save may lag behind patches.
- **Effort:** small once 3.1 exists.

## Phase 4 – Usability & reach

### 4.0 Save-first workspace UX 🧪 beta 2026-07-17
- **Start:** Continue/open/manual-plan are the only primary choices; installed-Workshop
  setup and older snapshots are collapsed secondary actions.
- **Republic:** Operational metrics, alerts, and actionable areas come first. History,
  research, and planning internals remain available through progressive disclosure.
- **City / Production:** Imported areas use one contextual workspace selector instead
  of horizontal button strips. Assumptions are collapsed, while building rows,
  consequences, totals, and incomplete-data warnings stay primary.
- **Responsive:** workspace controls stack without document-level horizontal overflow;
  dense planner tables remain horizontally scrollable inside their own containers.

### 4.1 Plan export / import / share links ✅ done
(Export/import as JSON and gzip-compressed share links are implemented -
the header's ⬇/⬆/🔗 buttons in `js/app.js`, `js/share.js`.)
- **What:** Export current state (plan, cities, price overrides) as JSON download; import
  the same; share-URL with state LZ-compressed into the fragment (`#plan=...`).
- **Why:** localStorage is fragile; share links spread the tool (Reddit/Steam forums).
- **Effort:** small-medium. **Files:** `js/app.js`, small `js/share.js`.

### 4.1a Reliable named planning snapshots ✅ done 2026-07-17
- **What:** Several named plans can live in one browser. Loading a snapshot is a
  complete state replacement with schema defaults, not a partial overlay, so
  cities/chains created in another plan cannot leak into it. Save/load/delete
  actions now show feedback and browser storage failures are reported.
- **Why:** game-save import needs a safe isolation boundary: every imported save
  will create a new snapshot rather than overwrite the currently open plan.

### 4.1b Full observed game-save snapshots 🧪 beta 2026-07-17
- **What:** A local-only `/beta/` importer for a W&R save directory. The beta now starts
  with two explicit workflows: open a real republic or start a manual plan. It preserves the
  game's own named settlements and building membership, aggregate recognized
  city/service buildings into City Planner rows, tag recognized factories by
  settlement in Production Planner, and combine both in Republic Overview.
- **Known format status:** both `namepoints.bin` and variable-length
  `buildings_game.bin` are decoded. The supplied 160,226,939-byte sample walks all
  1,812 declared building records and lands on the exact final byte; all 43 named
  scopes and every primary building→scope assignment validate.
  `workers.bin`, `header.bin`, and `research.bin` are also decoded, while `stats.ini`
  supplies complete semantic history and live economy values. Parsing runs off the UI
  thread. The supplied save validates at 20,302 citizens, 107 research records, and zero
  invalid residence references.
  - **Safety:** imported saves become complete IndexedDB-backed named snapshots; unknown building
    types stay visible in an unmatched report instead of being silently discarded.
  Empty auto-generated named areas with no building records are omitted. Occupied
  scopes are kept independently: only scopes with recognized residential/service
  buildings become City Planner cities, while recognized industrial scopes remain
  available in Production Planner and Republic Overview under their game names.
  `stats.ini` remains complete in named snapshots and makes the latest real prices/costs
  the active economics source. Share links still omit private history.
  - **Exact operating facts:** `buildings_game.bin` (not `buildings.bin`) supplies live
  current staffing, configured ordinary/higher-education caps, and per-instance mine
  quality. Its exact construction-completion field keeps unfinished factories and services
  visible as future plan capacity without producing false live-staffing alerts. Production rows aggregate only identical saved configurations, so the sample's
  fabric factory remains visible as 93 current / 100 configured and coal mine 1157 as
  95 / 120 at about 56.47% quality.
  - **Public services:** citizen criminality and settlement crime histories are imported.
  Police and clinic staffing/capacity remain regional; courts, prisons, and orphanages are
  summarized republic-wide. `events.bin` supplies exact current medical emergencies and
  crime stages (awaiting police, investigation, or court), while clinic records expose
  current patients and effective treatment capacity. Prison/orphan occupancy follows live
  citizen residence links; cumulative `stats.ini` failures stay labelled as history.
  - **Fleet sources:** optional `vehicles.bin` and `usedveh.bin` now traverse writer-defined
  record boundaries in the import worker and require exact EOF. The supplied save validates
  at 1,294 owned records and 75 current used-market offers. Compact model, age, saved usage,
  state, fuel, positive cargo and offer facts are retained in the named snapshot; vanilla
  models resolve against current game-file data and numeric Workshop identities remain exact.
  Missing or unsupported optional files remain visibly unavailable instead of becoming zero.
  - **Map/game settings:** verified season state from `header.bin` and climate family from
  `material.mtl` now control whether heating applies. A Misc section exposes verified
  settings. Continue mapping the remaining header settings with controlled save diffs;
  unknown values must not enter calculations.
  - **Current beta limitations:** workshop buildings without their mod `building.ini`
  remain unmatched (their IDs/scopes/counts are still reported). The published Workshop
  catalog contains only compact parsed INI facts under `data/workshop/`, never mod assets.
  The browser resolves available packages automatically, imports exact mod housing,
  service, and production facts, hides recognized infrastructure, and falls back to
  observed occupancy without inventing capacity. For packages Steam does not expose
  anonymously, users can optionally select their installed
  `steamapps/workshop/content/784150` folder; its `building.ini` facts are read locally
  and never uploaded. Inventory buffers, vehicle lines/schedules and logistics topology are
  not decoded yet. Fleet economic ranking remains deliberately unavailable until the corrected
  normal-vehicle recycling formula and every export-setting gate are verified; an earlier
  10%/20%/70% assumption was found to apply to container vehicles, not ships, and was not
  shipped as a recommendation.
  - **Next high-value save modules:** finish verified owned-fleet export/recycling opportunities;
  building inventories and production buffers; vehicle lines and schedules; distribution/logistics
  bottlenecks; and optional live
  follow of a save directory. Cosmetic map/network geometry stays out of scope until a
  planner feature needs it.

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

### 4.5 Per-tab URLs ✅ done
(Hash routing is implemented - `location.hash`/`history.replaceState` in
`js/app.js` keep the URL and the active tab in sync both ways.)
- **What:** Hash routing (`#/city`, `#/prices`) so links land on the right view;
  back button works.
- **Effort:** small.

## Phase 5 – Feature completeness vs. the sheet

### 5.1 Vehicle production tab ✅ done 2026-07-16
(Implemented from the original sheet: exact vehicle selection, material cost,
workday throughput, period totals, and profit per worker. Vehicle export values
are now reconstructed from the executable's ordered component formula and the
selected save's live RUB/USD resource prices.)
- **What:** Port the sheet's `Fahrzeugproduktion`: pick producible vehicles, material cost
  (steel, plastics, fabric, m/e-components, electronics) vs. sale value, profit per year.
  Data already in `data/vehicles.json` (Arbeitstage, material columns).
- **Effort:** medium.

### 5.1a Save-based vehicle profit recommendations ✅
- `stats.ini` upload selects the live `$STAT_CURRENT` global economy snapshot while
  excluding `$STAT_CITY` histories.
- Vehicle sale values use current save prices, recovered component order, native
  east/west currency behavior, cross-market multipliers, and aircraft doubling.
- Recommendations rank profit per worker within road vehicles, trains, boats, or
  aircraft and can be added directly to the production plan.
- **Next:** map blueprint purchase cost and owned `$BLUEPRINT_OWNED` entries so the
  ranking can show license payback time.

### 5.1b Train planner on game vehicle data
(Partially implemented 2026-07-16: game-only locomotives and DLC vehicles are
merged into the planner; steam tenders are read from `$TRAINSET` and attached
automatically, matching the game. Still open: replace sheet wagons and their
per-cargo capacities with game data.)
- **What:** Move the train planner from the sheet's 95 rail vehicles to the game
  files. Vehicle lengths come from `bbox.bin` next to each model (24 bytes,
  6 little-endian floats = min/max XYZ; z-extent = length — validated:
  box270 → 15.04 m vs sheet 15 m). Also scan DLC vehicle dirs
  (`cwc/vehicles`, `dlc1/vehicles`, …).
- **Why:** covers game-only vehicles (CWC electrics; steam locos for owners of
  Early Start — their files only ship when the DLC is owned) and stays current
  with patches. Open question: per-cargo tonnage (sheet has per-resource
  capacities; game files have one `RESOURCE_CAPACITY` + transport type).
- **Effort:** medium.

### 5.4 Full advanced mode (edit all data)
- **What:** Extend the Advanced tab (community constants are editable since
  2026-07-16, session-scoped + in share links) to building data: override
  production rates, workers, extras per building; a "custom building" row;
  possibly user-defined formulas for profit metrics.
- **Effort:** medium-large. Data overrides are straightforward (same pattern as
  `state.tuning`); formula editing needs a safe expression evaluator.

### 5.2 More languages
- **What:** The sheet's translation table has 27 languages (machine-translated beyond de/en);
  game localization files (3.1) would provide proper ones. UI strings in `js/i18n.js`
  would need per-language additions — community-contributable.
- **Effort:** small per language once data exists.

### 5.3 LowTech research list
- **What:** Replace the "number of researched techs" input with the actual checklist of
  game-effect researches from DasBreitschwert's guide.
- **Effort:** small (needs the list transcribed).

## Suggested next order

1. Building inventories, storage fill levels, and production-buffer bottlenecks.
2. Vehicles, lines, schedules, and distribution-office coverage.
3. Live-follow a selected save directory and append comparable snapshots over time.
4. Complete game-version datasets and remaining train capacities.
5. Mobile card views and chart interaction polish.
