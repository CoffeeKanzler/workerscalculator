# Residence Map Details

## Goal

Make the republic map calmer while making a selected residential building
substantially more informative. Staffing remains an exact building fact, but
it is removed as a republic-wide color mode. Residential inspectors gain a
compact, save-backed census summary without listing thousands of anonymous
citizen records.

## Product intent

The player has opened a large republic to answer a concrete operational
question: who lives here, and is this residence healthy or concerning? The
inspector should feel like a municipal housing ledger laid over a technical
map—dense enough for a data-oriented player, but quiet enough to scan.

Domain vocabulary includes census, residence register, occupancy, household
composition, public health, loyalty, education, and criminality. Its physical
color world is blueprint blue, municipal green, warning amber, brick red,
graphite ink, and the existing paper/dark control-room surfaces.

The signature element is a compact residence ledger inside the existing
building inspector. Generic dashboard cards, decorative gauges, and a full
resident table are deliberately excluded.

## Map hierarchy

The standalone map keeps two metric modes:

- Category
- Construction

Staffing is removed from the metric selector and its map color key. Workplace
inspectors continue to show current workers divided by configured positions.
This keeps a useful exact fact without asking one map view to communicate both
building function and workforce utilization.

All existing map search, layers, category filters, camera controls, viewport
totals, marker selection, and compact SVG maps remain unchanged.

## Residence ledger

When the selected building has linked residents, the inspector adds:

1. Occupancy: current residents and exact catalog capacity when available.
2. Composition: adults, children, and residents with higher education.
3. Wellbeing: average health, happiness, and loyalty.
4. Criminality: average, highest individual value, and the number of
   high-risk residents.

Values are shown as compact key/value rows within the existing inspector, not
as separate cards. Percentages use the app's existing number formatting.
Unavailable capacity or citizen fields render as an em dash rather than zero.

The high-risk count uses the same republic-wide threshold as the existing
criminality-outlier diagnostics:

`max(10%, republic average criminality * 5)`

This makes the residence detail and republic diagnostic describe the same
population consistently.

## Data boundary

`workers.bin` already provides an exact residence building index plus age,
education, happiness, health, loyalty, and criminality for every citizen.
These records never leave the browser.

During save projection, a pure helper aggregates citizens by residence
building index. Each summary contains:

- resident count
- adult and child counts
- higher-education count
- average health, happiness, and loyalty
- average and maximum criminality
- high-risk resident count

Only these per-building summaries are added to imported save metadata. The
standalone map joins them to its existing building model by exact building
index. Individual citizen records are not copied into map state or rendered.
This keeps map interaction proportional to building count rather than citizen
count.

Housing capacity comes from the already-loaded game or Workshop building
catalog using the existing exact save-type resolver. If no unique catalog
match exists, capacity stays unavailable.

## Missing and degraded fields

Complete player saves in scope contain `workers.bin`, so a successful import is
expected to produce residence summaries. A residence with no linked citizen
records therefore reports zero residents rather than an ambiguous unavailable
state.

- A residence with zero linked records shows zero residents.
- Missing catalog capacity renders `—`.
- Non-finite citizen measurements are excluded from their respective averages.
- A building can receive a resident summary even if its catalog type is
  unresolved; exact residence links outrank catalog classification.

## Accessibility and presentation

The ledger remains normal selectable text inside the inspector's existing
live region. Labels and values are added in English and German. Crime severity
uses text and numbers first; semantic color may reinforce a high-risk count
but never carries the meaning alone.

No new animation, modal, chart, or disclosure is introduced.

## Verification

Unit tests cover:

- exact per-building aggregation
- adult/child and education counts
- averages that skip missing values
- maximum criminality and the shared high-risk threshold
- residences with no linked citizens
- planning/import persistence of the summary
- removal of the staffing map mode

The browser harness imports at least `bigsavegame` and the nested myCanyon
save, selects a residential marker with a real click, and verifies that the
ledger renders exact non-empty values. Screenshots are captured and inspected
in light and dark themes. Existing real map gestures, chart interactions,
table virtualization, local-request assertions, cache-marker checks, and the
full Node suite must continue to pass.
