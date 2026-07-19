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
- **Output:** same JSON shape as today → app code untouched. `data/VERSION.json`
  records the extraction and bundle dates, which are shown beside the dataset
  selector and in Help. The source tree did not contain an authoritative game
  build number, so the UI now says so explicitly instead of implying an exact
  current version.
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
- **Comparison:** Republic Overview can load another named snapshot read-only and
  show current-minus-baseline population, buildings, staffing, productivity, health,
  criminality, cumulative minor/medium/serious crime counts, and exact current
  medical/criminal case queues. Area deltas use stable scope IDs only when both snapshots report
  the same saved-game path; unrelated republics retain totals without false city matches.

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
  citizen residence links; cumulative `stats.ini` failures stay labelled as history. A compact
  outlier view now flags residents at or above both 10% criminality and five times the republic
  average, resolving each displayed citizen to the exact saved area and residence building;
  residents without a resolvable home are counted but not assigned an invented location.
  - **Fleet sources:** optional `vehicles.bin` and `usedveh.bin` now traverse writer-defined
  record boundaries in the import worker and require exact EOF. The supplied save validates
  at 1,294 owned records and 75 current used-market offers. Compact model, age, saved usage,
  sale-adjustment state, fuel, positive cargo and offer facts are retained in the named snapshot; vanilla
  models resolve against current game-file data and numeric Workshop identities remain exact.
  Missing or unsupported optional files remain visibly unavailable instead of becoming zero.
  - **Map/game settings:** verified season state from `header.bin` and climate family from
  `material.mtl` now control whether heating applies. The same exact serializer/UI chain
  exposes the complete 16-row in-game map-settings group in Misc: citizen reaction,
  energy, water, waste, maintenance, day/night, seasons, fires, global events,
  vehicle availability, pollution, education, crime/justice, traffic, realistic mode,
  and research. Waste and maintenance retain their verified vehicle-economic effects;
  unknown header fields outside this proven group remain hidden from calculations.
  - **History:** Republic-wide `stats.ini` charts cover population/employment, productivity,
  cumulative minor/medium/serious crime counts, trade, and selected-resource production.
  Crime history remains explicitly separate from the live `events.bin` case queue.
  - **Vehicle economics:** the Republic overview ranks exactly resolved owned ships, rail
  vehicles, airplanes, helicopters, and road vehicles by their two cash-out routes.
  Current export payout uses live save prices, the saved sale adjustment, verified
  depreciation gates, and the aircraft-only export multiplier. Normal scrapyard targets use
  category-specific component recipes and exact float32 conversion/row rounding; loaded cargo
  is excluded because it contributes no normal vehicle-recycling output. Models with hard
  attachments remain unavailable until every attached recipe is composed. Gross recovery,
  work target, and the separately labelled labor-opportunity-cost view remain distinct, while
  keeping an operating vehicle
  is deliberately not assigned an invented cash value. The supplied save yields complete
  comparisons for 1,201 of 1,294 owned vehicles and exact current quotes for 53 of 75
  used-market offers. Capacity-safe replacement candidates require the same vehicle category
  and transport subtype, never reduce capacity, and show net cash against the closest-capacity
  owned target; speed, power, condition, schedules, and fleet count remain explicit caveats.
  The full-fleet drill-down is built only when opened, filters by ship/road/rail/air,
  cash-out action, and vehicle name, and sorts by advantage, either route value, or name.
  Its 50-row pages keep thousand-vehicle saves bounded instead of placing the entire fleet
  in the DOM while the section is collapsed. Real-browser checks exercise forward/back page
  navigation so boolean-disabled markup cannot strand the player on page 1.
  - **Live production buffers:** `buildings_game.bin` now imports exact first-pass storage
  identities, input/output roles, resources, saved amounts, and nominal capacities. The
  supplied save has live inventory rows in 1,328 of 1,812 buildings. Matching production
  rows show exact fill levels plus clearly derived days-to-empty/full at configured staffing
  and imported productivity; unlike water, waste, and production stores remain separate, and
  transient over-capacity amounts are not clamped. Sub-day input and output constraints also
  surface in the Republic attention list and link back to the affected production area.
  The Attention panel reports its complete finding count, shows a bounded first eight by
  default, and explicitly expands/collapses every remaining finding instead of silently
  dropping them; scoped findings link to their production, city, or map context.
  The complete queue can be filtered by workforce, citizen needs, production buffers, or data
  coverage while retaining the unfiltered total and the bounded eight-row collapsed view.
  An active-construction drill-down lists every exact incomplete non-temporary building by area, saved type and
  completion fraction, sorted by nearest completion and linked directly to its map marker; it does
  not invent remaining time or material requirements.
  These buffer projections remain distinct from actual throughput. A strict serialized
  `$TYPE_FACTORY` plus resolved-production gate now exposes exact rolling first-output telemetry
  for 32 supplied-save factories, including previous normalized-day quantity, current partial
  quantity, day progress, and current rate. Multi-output factories label only their first declared
  output; mines, farms, utilities, services, special lines, and unresolved factories remain hidden
  because the same offsets have incompatible meanings there.
  - **Saved logistics operations:** `lines.bin` now imports exact ordered stops, assigned vehicle
  references, neutral primary/secondary schedule blocks, and version-gated observed intervals.
  Complete observed cycles are shown only when every saved interval is positive; the raw game-time
  values are explicitly not labeled as seconds or pure travel time. Exact saved runtime types also
  gate 36 road and 3 rail distribution offices in the supplied save, exposing 337 configured target
  actions and 276 associated vehicle references. Exact target inventories and storage-allocation
  controls now evaluate 305 explicit resource thresholds: 41 pickup and 150 delivery conditions are
  currently met, while 114 are not met. Another 155 unrestricted rules and 24 ambiguous or indirect
  checks remain visibly unevaluated rather than guessed. Three configured offices have assignments
  but no associated fleet; these are distinguished from empty offices. Cached network paths are
  excluded: assignments do not claim current reachability, exclusive vehicle ownership, dispatch,
  compatible vehicles, or delivery throughput.
  - **Current beta limitations:** workshop buildings without their mod `building.ini`
  remain unmatched (their IDs/scopes/counts are still reported). The published Workshop
  catalog contains 1,909 packages with 3,307 building and 2,083 vehicle definitions as compact
  parsed INI facts under `data/workshop/`, never mod assets. Save seeding prioritizes exact
  Workshop identities found in owned and used-market vehicles as well as buildings.
  The browser resolves available packages automatically, imports exact mod housing,
  service, and production facts, hides recognized infrastructure, and falls back to
  observed occupancy without inventing capacity. For packages Steam does not expose
  anonymously, users can optionally select their installed
  `steamapps/workshop/content/784150` folder; its `building.ini` facts are read locally
  and never uploaded. The line drill-down now resolves exact route cursors, current targets,
  building relationships, and raw current line-interval accumulators for all 69 assigned vehicles;
  all 69 route vectors match their line stops. These are neutral saved facts: no universal busy/idle
  state or proven network reachability is established.
  Known utility, transport-support, and decorative save types are reported separately from
  planner-relevant unknowns, so they no longer inflate per-area incomplete-coverage warnings.
  Model-defined hard attachments are never inferred from save consist children. Workshop vehicle
  lifespans are used only when their exact
  `$LIFESPAN` fact is present; vanilla/DLC models use verified category defaults. An earlier
  10%/20%/70% assumption was found to apply to container vehicles, not ships, and was never
  shipped as a ship recommendation.
  - **Next high-value save modules:** 41 manual city-planner rows now carry stable game IDs.
  The original 20 unique exact-name matches were expanded only where normalized localized
  names, worker count, nominal service capacity, and one-to-one identity all agree; generic
  housing remains excluded because its display names were previously assigned heuristically.
  Continue careful curation of ambiguous rows, and optionally follow more live save files. A first
  schematic Republic map now plots exact saved building X/Z positions, exact `road.bin`
  and `rail.bin` centerlines when available, a compact water footprint derived from the optional saved
  `heightmap.dds` and water plane, area centers, and
  highlighted criminality-outlier residences; each outlier row can zoom directly to its
  residence and return to the full-republic view. Clicking or keyboard-activating an area
  center, or using Locate on map from the Republic area table, opens the first city-detail
  view by fitting that area's exact saved buildings
  while retaining surrounding roads and water. Its compact exact summary reports mapped
  buildings and construction count, and dashed rings identify each unfinished building at
  its saved position and progress; the same control returns to the whole map.
  Road, rail, and `pedestrianway.bin` geometry are read locally from their network files; the
  dedicated map exposes the exact pedestrian centerlines as a default-off layer (2,767 edges in
  the reference save) without claiming walking reachability or connectivity. All optional map layers
  are omitted from share links and restored from the
  local named snapshot. A dedicated Republic map tab adds wheel/drag zoom, reset controls,
  interpolates coarse desktop wheel steps across animation frames (while honoring reduced motion),
  independent water/road/rail/pedestrian/building/construction/border/area/criminality layers, and a
  saved-type filter. Physical customs posts have their own marker; artificial off-map air
  import/export targets are omitted. Exact `pollution.bin` air pollution is rendered as an
  optional compact green/yellow/red raster with adjustable opacity; clean cells stay transparent.
  The parser retains the exact float air value behind that display raster. Exact residence links
  now identify occupied buildings in nonzero cells, summarize affected areas with
  resident-weighted cell values, and locate the highest saved values directly on the pollution
  map. The UI explicitly treats these as 200 m building-center cell signals—not personal
  exposure, health effects, or danger thresholds. Radiation is a distinct saved channel and
  remains hidden when empty. Full terrain shading remains a future layer.
  Dedicated-map layer switches, opacity, and saved-type filtering update
  the existing SVG in place instead of rebuilding the complete application and map geometry;
  type filtering responds while the player types. Both compact and dedicated maps now fit the
  developed republic by default rather than spending most of the view on empty 20 km terrain;
  the dedicated map retains an explicit Full terrain view for borders and the complete raster.
  Building filtering matches the best available localized name, saved instance name, or exact
  raw type. Mouse- and keyboard-selectable markers open an in-place inspector with area,
  construction state, coordinates, and raw save identity; exact Workshop matching rules remain
  unchanged and unresolved numeric packages are never aliased by basename.
  The import audit distinguishes unresolved building instances from grouped area/type rows and
  explains that unresolved records remain in the save and map while only unsafe calculations are omitted.
  Large imports now expose staged progress without rerendering/persisting the whole application
  for every parser tick. The 50.5 MB reference `stats.ini` is transferred as a buffer and decoded
  inside the parser worker instead of being decoded and copied on the main thread. Core Republic
  data becomes usable first; roads, railways, pedestrian paths,
  water and pollution load sequentially in a second worker and enrich the same local snapshot afterward.
  If an optional local layer fails, the core Republic stays usable and the Save Import audit offers
  a bounded manual retry using the still-authorized local files; successful retries replace stale
  warnings and refresh the named snapshot without repeating the core import.

### 4.2 Live-follow stats.ini ✅ done 2026-07-18
- **Delivered:** The Save Import page can watch a user-approved save directory through
  Chromium's File System Access API. It re-reads only `stats.ini` every 15 seconds and
  when the tab becomes visible, updates prices/history/republic productivity only when
  content changes, and refreshes the active named snapshot. Invalid or partially written
  files leave the previous good data intact and visibly retry; Stop releases the app's live
  directory reference. Firefox/Safari retain the manual file workflow.

### 4.3 Price and Republic history polish ✅ done 2026-07-18
- **Delivered:** Both price and Republic history charts show exact first/last game
  year/day labels and sampled point-value hover tooltips. Missing price observations
  are omitted instead of becoming false zeroes, while min/max-preserving sampling
  bounds each rendered series to 160 points for the supplied 3,002-record history.
  Population history recognizes the current save's exact `SmallChilds` / `MediumChilds`
  scalar names (while retaining older aliases), so missing child fields are omitted rather
  than drawn as an authoritative-looking zero. Separate exact charts now expose the saved
  births/deaths, escapes and Soviet/African immigration fields, plus no/basic/higher education
  counts and average age/lifespan in saved years. They remain labelled as per-record saved values rather than invented daily rates or
  cumulative totals. The selected-resource charts keep exact ₽-market and $-market import/export
  channels separate and add factory, shop, construction, and vehicle use; unlike resource units
  are never summed into a false republic total. The selector includes all 45 resources observed in
  any flow channel—not only the 24 produced locally—and is localized/alphabetical. Selecting a
  recorded waste/material channel also exposes exact factory, citizen, and demolition output
  separately. Separate exact charts expose currency-valued saved
  vehicle imports/exports and loan balance/interest in the selected RUB/USD view.
- **Comparison:** Up to three resources can share the selected-currency chart,
  with separately labelled buy/sell series. An optional logarithmic scale keeps
  commodities with very different price magnitudes readable and excludes
  non-positive observations because they have no logarithmic value.

### 4.4 Mobile layout ✅ done 2026-07-18
- **Delivered:** Simple read-only tables collapse into labelled row cards below
  700 px, keeping each value visibly paired with its column heading. Editable and
  structurally complex planner tables remain horizontally scrollable so their
  controls and grouped headings retain their intended layout.

### 4.5 Per-tab URLs ✅ done
(Hash routing is implemented - `location.hash`/`history.replaceState` in
`js/app.js` keep the URL and the active tab in sync both ways.)
- **What:** Hash routing (`#/city`, `#/prices`) so links land on the right view;
  back button works.
- **Effort:** small.

## Phase 5 – Feature completeness vs. the sheet

### 5.1 Vehicle production tab ✅ done 2026-07-16
(Implemented: uniquely matched vehicles now use the executable-derived ordered
production recipe for workdays, every material, sale value, throughput, and
profit. This includes horse recipes with boards or plants. Unmatched or ambiguous
models retain a visibly labelled spreadsheet fallback. Values use the selected
save's live RUB/USD resource prices.)
- **What:** Port the sheet's `Fahrzeugproduktion`: pick producible vehicles, material cost
  (steel, plastics, fabric, m/e-components, electronics) vs. sale value, profit per year.
  Data already in `data/vehicles.json` (Arbeitstage, material columns).
- **Effort:** medium.

### 5.1a Save-based vehicle profit recommendations ✅
- `stats.ini` upload selects the live `$STAT_CURRENT` global economy snapshot while
  excluding `$STAT_CITY` histories.
- Vehicle sale values use current save prices, recovered component order, native
  east/west currency behavior, cross-market multipliers, and aircraft doubling.
- Production rows and recommendations use exact game recipes for 543 uniquely
  matched models; 297 remaining sheet models are explicitly labelled fallbacks.
- Recommendations rank profit per worker within road vehicles, trains, boats, or
  aircraft and can be added directly to the production plan.
- `stats.ini` `$BLUEPRINT_OWNED` identities now supply exact save ownership. The
  recommendation table shows the verified standard 1× blueprint quote in its native
  currency and vehicles-to-payback using same-currency unit profit. The reference save
  owns zero blueprints, so its full-price branch is unambiguous. If another save owns a
  different blueprint, the related-family 1.75× discount remains unavailable until the
  executable's family relation is mapped; scenario permission multipliers are likewise
  kept as an explicit 1× assumption rather than invented from the save.

### 5.1b Train planner on game vehicle data ✅
(Implemented 2026-07-18: game-only locomotives and DLC vehicles are merged into
the planner; steam tenders are read from `$TRAINSET` and attached automatically,
matching the game. Exact game-file capacity and transport class now drive 70 of
98 train wagons. The 28 unmatched spreadsheet vehicles remain visibly labelled
fallbacks, and ambiguous construction-material columns are not presented as
cargo.)
- **What:** Move the train planner from the sheet's 95 rail vehicles to the game
  files. Vehicle lengths come from `bbox.bin` next to each model (24 bytes,
  6 little-endian floats = min/max XYZ; z-extent = length — validated:
  box270 → 15.04 m vs sheet 15 m). Also scan DLC vehicle dirs
  (`cwc/vehicles`, `dlc1/vehicles`, …).
- **Why:** covers game-only vehicles (CWC electrics; steam locos for owners of
  Early Start — their files only ship when the DLC is owned) and stays current
  with patches. Per-cargo compatibility is resolved from the game's single
  `RESOURCE_CAPACITY` and transport type rather than stale sheet columns.
- **Effort:** medium.

### 5.4 Full advanced mode (edit all data) 🟡 partially done 2026-07-18
- **Delivered:** Advanced mode can override each game, spreadsheet, or loaded
  Workshop production building's workers, input/output rates, utility use, waste,
  construction workdays, and material bill. Overrides are dataset-scoped, feed
  both production and chain calculations, retain user-override provenance, and
  travel with saved/exported/shared plans. Any existing recipe can also be
  duplicated as a renamed custom building, then tuned independently without
  changing its authoritative source row.
- **What:** Extend the Advanced tab (community constants are editable since
  2026-07-16, session-scoped + in share links) with, potentially, user-defined
  formulas for profit metrics.
- **Effort:** medium-large. Data overrides are straightforward (same pattern as
  `state.tuning`); formula editing needs a safe expression evaluator.

### 5.2 More languages
- **What:** The sheet's translation table has 27 languages (machine-translated beyond de/en);
  game localization files (3.1) would provide proper ones. UI strings in `js/i18n.js`
  would need per-language additions — community-contributable.
- **Effort:** small per language once data exists.

### 5.3 LowTech research list ✅ done 2026-07-18
- **Delivered:** The checklist is generated from the current game's 117
  `research.ini` entries and localized game strings instead of being transcribed.
  It charges one point for 84 gameplay/terminal-effect researches and omits 33
  prerequisite-only entries under DasBreitschwert's published rule. Existing
  manual counts remain backward compatible, while imported saves can populate
  the checklist from exact completed research keys without charging partial or
  free prerequisite research.

## Suggested next order

1. Vehicles, lines, schedules, and distribution-office coverage.
2. Append comparable named-snapshot changes over time beyond the live `stats.ini` history.
3. Complete game-version datasets and remaining train capacities.
4. Mobile card views and chart interaction polish.
