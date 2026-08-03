# Vehicle recommendation report improvements

## Context

Two website reports identify gaps in the vehicle-production planner:

1. The Russo-Balt D24/40 family has several game-defined variants, but the
   variants are unnamed in the extracted game data and therefore are omitted
   from the website's vehicle pool. The report specifically needs the variants
   visible so their production materials can be inspected.
2. The “best vehicles by profit per worker” table needs a decade selector so
   users can compare the best vehicles available in periods such as
   1940–1950 and 1950–1960.

This is a public-website change. Private research files and private runtime
artifacts are out of scope.

## Goals

- Make all 12 extracted Russo-Balt D24/40 variants selectable in the vehicle
  production planner.
- Preserve each variant's exact game ID, cargo/service type, availability
  years, and derived game recipe.
- Add an “All decades” option and ten-year availability filters beginning at
  1900.
- Keep recommendation ranking based on the existing profit-per-worker result.
- Keep the decade choice limited to the recommendation table; it must not
  alter vehicle rows already added to the production plan.
- Keep the existing website-only data boundary and support the current German
  and English UI without adding private data.

## Non-goals

- Do not expose every unnamed raw game entry with a guessed name.
- Do not change the vehicle-profit formula, sale-price formula, or recycling
  formula.
- Do not change the train planner's era selector.
- Do not add Workshop data or private research artifacts.
- Do not redesign the vehicle-production tab beyond the two reported gaps.

## Recommended approach

Use two targeted changes:

1. Add an explicit display-name map for the 12 D24/40 raw IDs in the vehicle
   pool merge layer. This is safer than a generic fallback because unnamed raw
   entries can be internal or unusable. The labels should remain stable and
   descriptive, using the Russo-Balt D24/40 base name plus the game ID's
   service/cargo suffix:

   - `cement_russo_balt_d24_40` — cement
   - `covered_russo_balt_d24_40` — covered cargo
   - `firetruck_russo_balt_d24_40` — fire truck
   - `garbage_russo_balt_d24_40` — garbage
   - `gravel_russo_balt_d24_40` — gravel/dumper
   - `oil_russo_balt_d24_40` — cistern/oil
   - `oil_russo_balt_d24_40_sewage` — sewage cistern
   - `oil_russo_balt_d24_40_water` — water cistern
   - `open_russo_balt_d24_40` — open cargo
   - `refrigerator_russo_balt_d24_40` — refrigerated cargo
   - `service_mixer_russo_balt_d24_40` — concrete mixer
   - `snowplow_russo_balt_d24_40` — snowplow

   The resulting entries continue through the normal game-only path, so the
   existing recipe derivation and cargo metadata are reused rather than
   duplicated.

2. Add an optional availability range to vehicle recommendations. A vehicle
   belongs to a selected decade when its production window overlaps that
   decade, using inclusive bounds:

   ```text
   vehicle.Von <= decadeEnd && vehicle.Bis >= decadeStart
   ```

   Missing bounds are treated as open-ended. The existing `Bis = 3000`
   convention is treated as open-ended for decade-option generation and as
   active in all normal displayed decades.

## UI and state behavior

- The recommendation controls retain the existing vehicle-group selector.
- Add a second selector labelled as an era/decade filter with:
  - `All decades` as the default;
  - `1900–1910`, `1910–1920`, and subsequent ten-year ranges;
  - ranges through the decade containing the greatest finite vehicle end
    year in the current public dataset.
- The selector filters only the “Best vehicles by profit per worker” table.
- The current group, productivity, time unit, currency, and blueprint display
  behavior remain unchanged.
- Selecting a recommendation still adds the exact selected vehicle to the
  production-plan rows.
- If a group and decade have no profitable recommendations, show the existing
  table structure with a concise empty-state hint rather than a misleading
  blank result.
- The decade choice is persisted with the existing vehicle-production planner
  state, consistent with the other recommendation controls.

## Data flow and boundaries

```text
raw game vehicle IDs
        │
        ├─ explicit D24/40 display aliases
        ▼
merged public vehicle pool ── exact recipe/cargo/availability ── production planner
                                                                      │
vehicle group + decade overlap ──────────────────────────────────────┘
                                                                      ▼
                                                     ranked recommendation table
```

The alias map is the only new identity knowledge. The calculation layer owns
the decade-overlap predicate and recommendation filtering; the UI only stores
the selected range and renders the result.

## Testing and verification

- Unit-test the merge layer with the extracted raw vehicle data:
  - all 12 D24/40 IDs produce named entries;
  - each entry retains its source game ID and has a usable game recipe;
  - unrelated unnamed raw entries remain excluded.
- Unit-test decade overlap at both boundaries and with open-ended `Bis` values.
- Unit-test recommendation ranking with and without a decade range, including
  a no-results range.
- Run the complete Node test suite.
- Run a real-browser check of the vehicle-production tab to verify that:
  - D24/40 variants are selectable;
  - their material line is displayed;
  - changing the decade selector changes only the recommendation table;
  - adding a recommendation still creates the correct plan row.

## Acceptance criteria

The change is ready when the public vehicle-production tab lists all 12
Russo-Balt D24/40 variants with their derived materials, the decade selector
starts at 1900 and uses inclusive availability overlap, existing plan rows are
unaffected, the automated tests pass, and the behavior is confirmed in the
browser.
