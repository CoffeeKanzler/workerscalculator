# Full Save Import and Republic Command Center Design

## Goal

Turn a Workers & Resources save directory into a trustworthy, useful republic
model shared by Republic Overview, City Planner, and Production Planner. The
import must preserve observed game facts, keep planning assumptions separately
editable, and use real `stats.ini` records for historical charts.

The chosen interface direction is a command center: headline republic health,
real trends, actionable warnings, and drill-down by the game's own named city
and production scopes. The deployed experiment remains available under
`/beta/` on GitHub Pages while the root application stays stable.

## Core Distinction: Observed, Derived, and Planned

Every imported value has one of three meanings:

- **Observed:** read directly from the selected save or its game-data definition.
- **Derived:** calculated from observed records, with its inputs and limitations
  visible.
- **Planned:** an editable scenario value seeded from the imported baseline.

An imported snapshot contains a read-only observed baseline and a separate plan.
Editing the plan never rewrites what the save contained. Republic Overview can
switch between **Actual**, **Plan**, and **Difference**.

"Actual" is itself time-aware:

- historical output, economy, and population come from `stats.ini`;
- current configuration and occupancy come from the binary save files at the
  instant the game was saved;
- a current-only field is never drawn as if it had historical samples.

## Source Model

### High-value first phase

| Source | Imported facts | Meaning |
| --- | --- | --- |
| `header.bin` | save title/path, format version, building/vehicle type inventory | snapshot identity and compatibility |
| `namepoints.bin` | names, types, coordinates, member references | the game's own city and production scopes |
| `buildings_game.bin` | live building type, name, coordinates, primary scope, configured ordinary/high-education worker caps, current occupants, saved production state, exact mine quality | current republic structure and configuration |
| `workers.bin` | citizen ID, residence reference, age, education, happiness, food, health, loyalty, and other validated citizen state | current population and derived city demographics/productivity |
| `stats.ini` | dated republic economy, resource flows, population, average citizen productivity, prices, costs, and event totals | authoritative global history and latest stable productivity baseline |
| `research.bin` | research keys, completion/progress, assigned building reference | current research state |

`buildings.bin` is not the live gameplay state. Reverse engineering identifies
it as the rendering/engine building export, so it must not be described or used
as the source of staffing, inventory, or production facts.

The supplied `workers.bin` contains 20,302 records of exactly `0x728` bytes
after its count, consumes all 37,193,268 bytes, and has no invalid residence
references. Its high-value fields are fixed offsets proven against the game's
writer/reader pair and population formulas. Citizens without a residence remain
in the republic total and are explicitly unassigned rather than forced into a
city.

### Later parser modules

- `vehicles.bin` and `lines.bin`: fleet, route, and logistics diagnostics.
- inventories and connections already embedded in the variable live-building
  records: production bottlenecks after their semantics are proven.
- `resourcemap.dds` and `resourcemap2.dds`: optional spatial resource overlays.
  Planning calculations use the exact mine-quality value already stored on each
  live mine rather than estimating it from map pixels.

Each parser is optional and version-guarded. A missing optional file reduces
coverage but does not invalidate facts successfully read from other sources.

## Settlement and Area Semantics

The importer never invents geographic clusters. It uses the game's saved named
scopes and the building's primary scope reference, falling back to the
namepoint member list only when that primary reference is invalid.

Scopes are classified by their recognized contents:

- a scope containing residential or service buildings appears in City Planner;
- a scope containing production buildings appears in Production Planner;
- a mixed scope can appear in both planners while remaining one area in Republic
  Overview;
- an auto-generated scope with no buildings is omitted;
- unknown and workshop building types remain in the import audit and scope
  totals rather than disappearing.

City productivity is not treated as a saved city setting. Individual citizens
have productivity; building and city values are aggregates. When `workers.bin`
is present, current city productivity and citizen-status metrics are derived
from residents whose saved residence building belongs to that scope. The
imported republic-wide `$Citizens_AverageProductivity` remains the stable
planning default because city residency is not evidence of which factory a
citizen will reach on a particular shift.

## Production and Staffing Model

Three different staffing values must remain separate:

1. **Configured worker cap:** the persistent ordinary and higher-education
   limits set on the building. These exact values are serialized in
   `buildings_game.bin` and constrain planned capacity.
2. **Current occupants:** workers present at the save instant. This is useful for
   diagnostics but volatile because shifts, travel time, and transport can
   change it moment to moment.
3. **Average productivity:** the republic-wide historical/current statistic in
   `stats.ini`, used as the imported planning default. It is not evidence that a
   particular building was staffed at that level at the save instant.

Production definitions are per-worker rates from the selected game-data set.
For each building, planned output and consumption therefore use:

```
configured output = per-worker recipe
                  × configured worker slots
                  × average productivity
                  × mine quality (mines only)
```

This is equivalent to applying a configured-worker ratio to the building's
full-staff production definition. Ordinary and higher-education slot types stay
separate in the imported record and are combined only according to the
building definition.

Current occupants are displayed beside configured slots as a momentary staffing
diagnostic. They do not replace configured slots in the stable plan baseline.
Realized historical production comes directly from `$Resources_Produced` in
`stats.ini`, not from reconstructing history from the current building list.

Per-instance mine quality is an exact saved float and directly participates in
the game's production calculation. Imported mines therefore stop using the
old editable 50% estimate when that field is valid. An estimate remains only as
an explicit fallback for unsupported save versions or manually added mines.

## Snapshot Data Architecture

An imported named snapshot stores these logical sections:

```
snapshot
├── importManifest
│   ├── schema and parser versions
│   ├── save identity and game/save format version
│   ├── selected source files and per-file parse status
│   └── warnings, unsupported fields, and coverage
├── observed
│   ├── areas
│   ├── buildings
│   ├── citizens and city demographic aggregates
│   ├── research
│   ├── latest republic metrics
│   └── exact/derived provenance metadata
├── history
│   └── dated global stats.ini series
└── plan
    ├── cities seeded from observed city buildings
    ├── production rows seeded from observed factories and configured caps
    ├── chains and scenario settings
    └── explicit user overrides
```

The logical separation matters more than the precise JavaScript object layout;
existing state fields can be migrated incrementally as long as observed values
cannot silently become user-authored assumptions.

Import is atomic. Before switching, the current open planning state is saved
under a unique backup name. The imported save becomes a new unique named
snapshot; re-importing does not merge stale rows from the previously active
snapshot. Every live building record, including unmatched types, remains
accounted for in the manifest.

## Republic Command Center

### Shared header

The dashboard shows save title/date/version, selected snapshot, last import
time, and data coverage. The Actual/Plan/Difference control applies consistently
to all cards and tables where comparison is meaningful.

### Actual view

- headline counts for occupied named areas, live buildings, research progress,
  population, and data coverage;
- real economy, resource, population, and average-productivity charts from
  `stats.ini`, with month/year/all ranges;
- area health table combining city services, configured industrial workforce,
  current staffing diagnostics, resident demographics/status, and recognized
  production;
- production/resource mix and import-dependency warnings;
- research progress and import audit warnings;
- drill-down from an area into the existing City and Production planners.

### Plan view

The same structure evaluates editable planner rows seeded from the observed
snapshot. Imported configured caps and latest average productivity are defaults,
not locked values. Users can model changed caps, building counts, mine quality,
and productivity without losing the factual baseline.

### Difference view

Difference reports changes in building count, configured workers, expected
production/consumption, utilities, worker balance, and unresolved dependencies.
It does not compare a calculated plan with a fabricated "current capacity";
historical realized output remains visibly distinct.

### Evidence presentation

Cards and detail rows expose compact provenance labels:

- **Exact save field**
- **Game-data definition**
- **Derived calculation**
- **Editable estimate**
- **Unavailable**

Unavailable data stays unavailable. Coverage measures which supported facts were
successfully parsed, not a guessed percentage of the entire game simulation.

## Planner Integration

City Planner and Production Planner consume the same imported snapshot rather
than copying unrelated interpretations of it.

- City Planner lists only meaningful city/mixed scopes and their recognized
  residential/service buildings.
- Production Planner keeps every recognized production building scoped to its
  saved area, including production-only areas.
- Republic Overview aggregates both sides by the same stable scope ID.
- Selecting an area in Republic Overview opens the corresponding filtered
  planner view.
- Manually added rows are planned values and never masquerade as imported
  observed buildings.

The Production Planner shows configured slots, current occupants, imported
productivity baseline, and exact mine quality where relevant. Aggregated rows
must preserve enough per-instance data for mines with different quality or
buildings with different configured caps; unlike the earlier beta, they cannot
be collapsed into a count that loses those differences.

## Historical Charts

The raw `stats.ini` parser retains semantic fields and original record dates.
Rendering may downsample large series for responsiveness, but derived summaries
and time-range selection operate on the correct records and preserve first,
last, minimum, maximum, and major discontinuities.

Initial useful charts are:

- imports versus exports by currency;
- produced, imported, exported, and factory-consumed amount per resource;
- population, unemployment, births, deaths, and escapes;
- average citizen productivity;
- resource prices and delivery/workday costs;
- tourism and waste when present.

Charts state that they are republic-wide. Per-city historical graphs are not
shown unless a future source proves per-city history.

## Parsing, Performance, and Privacy

Save files are read locally in the browser and are never uploaded. Large binary
parsers run in a Web Worker so the interface can report progress and remain
responsive. The parser enforces count bounds, byte bounds, exact final cursor
consumption where the format is known, and a maximum retained history size.

Format dispatch uses the version in `header.bin` when available. Unknown
versions can attempt a guarded parse, but the result must be rejected or marked
partial when structural invariants fail. A failure in one optional parser is
reported beside that file and does not erase successfully parsed facts.

The `/beta/` route carries the experimental importer and command center until
the workflow is proven against the supplied save and in browser use. It shares
versioned modules with the root app to avoid a divergent beta codebase.

## Delivery Order

1. Correct the existing importer and roadmap truth: live state comes from
   `buildings_game.bin`; import exact configured caps and mine quality; use latest
   `stats.ini` average productivity as the plan default.
2. Import fixed `workers.bin` records, resolve residence buildings to saved
   scopes, and derive current city population, education, status, and
   productivity diagnostics.
3. Preserve per-instance observed buildings and seed lossless scoped planner
   rows; add source/confidence metadata.
4. Implement the command-center Actual/Plan/Difference shell and area drill-down.
5. Expand `stats.ini` parsing and add the first real historical charts.
6. Import `header.bin` and `research.bin`, expose identity/version and research
   progress.
7. Move large parsing to a worker, harden partial/version handling, verify the
   complete supplied save in a real browser, and deploy `/beta/`.
8. Add inventory, vehicle, route, and logistics modules only as their
   exact semantics are validated, keeping each independently useful.

## Acceptance Criteria

- Selecting the supplied save directory creates a new isolated snapshot and a
  backup of the previously open state.
- All 1,812 live building records and all occupied named scopes are accounted
  for with exact file consumption; empty generated scopes do not become cities.
- Recognized production buildings retain scope, per-instance configured worker
  caps, current occupant count, and exact mine quality.
- All 20,302 supplied citizen records consume the exact `workers.bin` length;
  residence-linked citizens produce current per-city population, education,
  status, and derived productivity metrics, while unassigned citizens remain
  accounted for republic-wide.
- Latest republic average productivity seeds imported planning calculations;
  temporary current staffing does not silently become the plan baseline.
- Actual historical production and economic charts use real dated `stats.ini`
  values and are labelled republic-wide.
- Actual, Plan, and Difference never mutate or confuse one another.
- City Planner, Production Planner, and Republic Overview resolve the same area
  and building facts.
- Missing or unsupported files produce a visible partial-import report without
  losing successfully imported facts.
- Root and `/beta/` routes load without console errors; `/beta/` remains fully
  local-only and usable on GitHub Pages.
