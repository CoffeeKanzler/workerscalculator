# Automatic Steam Tenders Design

## Goal

Make the train planner match the game: tenders are permanently associated with
their steam locomotive and cannot be selected, added, removed, or counted as
independent vehicles.

## Data Model

The game-file extractor will parse `$TRAINSET` from vehicle `script.ini` files.
For a locomotive, the referenced vehicle id becomes `tenderId`. The generated
`data/game/rail_vehicles.json` locomotive record will carry its tender as a
nested `tender` object with the tender's name, length, empty weight, availability,
and DLC metadata. Tender records will not be emitted as top-level selectable
rail vehicles.

Three Early Start pairs are not declared with `$TRAINSET` and require explicit,
documented game-id mappings:

- `ol49` -> `25d49`
- `ty45` -> `32d43`
- `pm2` -> `34d44`

Steam tank locomotives and other steam vehicles without a paired tender remain
standalone. The extractor will fail clearly when a declared `$TRAINSET` target
cannot be found, instead of silently generating incomplete planner data.

## Planner Behavior

Only locomotives and railcars appear in the locomotive selector. Adding a
locomotive with nested tender data creates one editable locomotive segment; the
planner derives a locked tender segment immediately behind every locomotive
instance for display and calculation. Increasing the locomotive count derives
the same number of tenders.

Derived tenders contribute length, empty weight, availability, and production
cost when those values exist. They do not contribute cargo capacity because
their fuel storage is operational locomotive fuel, not train cargo. The visual
train renders each tender as a wagon-shaped segment next to its locomotive and
the consist editor labels it as included and locked; it has no count or remove
controls.

Train recommendations continue to store only locomotive and cargo-wagon
segments. Their length and loaded-weight calculations include the selected
locomotive's tender before choosing locomotive count and reporting feasibility.

## Saved-State Compatibility

Existing saved or shared consists may contain top-level tender segments from
the current implementation. On evaluation, those legacy segments are discarded
when they match a tender now derived from a selected locomotive. Unmatched
legacy tender segments are ignored because tenders are not independently valid.
The normalized consist is written back to state so subsequent exports no longer
contain manual tenders.

## Structure

Tender expansion and consist evaluation will live in a focused, testable
`js/train.js` module rather than remaining embedded in DOM rendering code. The
module will expose pure helpers for expanding locked tenders, normalizing legacy
state, and calculating physical totals used by both recommendation and UI code.
`js/app.js` remains responsible for controls and rendering.

## Testing

Node tests will verify:

- extractor output contains declared and fallback tender pairs;
- tenders are absent from the selectable top-level vehicle list;
- one locomotive derives exactly one locked tender directly behind it;
- locomotive counts derive matching tender counts;
- length and empty weight include the tender while cargo capacity does not;
- legacy manually selected tenders are removed without duplicating derived ones;
- steam tank locomotives without tender data remain standalone;
- recommendations account for tender length and weight.

The full existing `npm test` suite must remain green. Browser verification will
confirm tender selector removal, locked-segment rendering, count updates, and a
recommended steam consist on desktop and mobile widths.
