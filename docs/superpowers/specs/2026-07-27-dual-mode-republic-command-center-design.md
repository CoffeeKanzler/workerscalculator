# Dual-Mode Republic Command Center Design

**Date:** 2026-07-27  
**Status:** approved design

## Objective

Rework Workers Calculator into one coherent Republic Command Center that can be
used either as a hosted, browser-local save-folder application or as a live
MpEconomy mod addon without forking UI, planners or domain logic.

## Distribution modes

### Hosted

The GitHub Pages release opens a complete save folder using browser file APIs.
All parsing and storage remain local to the browser; no save file or derived
record is uploaded. Existing manual folder input remains available where the
File System Access API is unavailable.

### Addon

The mod bundle opens inside the MpEconomy launcher and reads public live SDK
snapshots/events. It does not parse process memory or call legacy Companion
routes. Missing data identifies the exact absent SDK capability.

Both releases are generated from the same static source tree and differ only
in bootstrap/default adapter and packaging metadata.

## Information architecture

The breadth of the current planner remains, but its intent is explicit:

1. **Observe:** republic brief, population, industry, logistics, transport,
   economy, cities and history.
2. **Diagnose:** bottlenecks, imbalances, service failures, route/fleet issues
   and evidence-backed explanations.
3. **Plan:** production chains, buildings, cities, trains, research and editable
   scenarios.
4. **Compare:** live state, imported saves, named snapshots and plan variants.

Observed and hypothetical values never share an unlabeled visual treatment.

## Visual direction

The product world is a planning office: dispatch boards, statistical ledgers,
route sheets, blueprint desks and warning lamps. The palette comes from paper,
graphite, faded institutional green, signal amber and controlled red.

The signature is an always-visible mode/evidence system. Every important value
can carry `LIVE SDK`, `SAVE`, `STATS HISTORY`, `DERIVED` or `PLAN`. The design
rejects a generic card dashboard, a planner hidden beneath live metrics and
color used without semantic meaning.

## Data architecture

### Adapters

- `SaveFolderAdapter` reuses the existing binary and `stats.ini` parsers.
- `LiveSdkAdapter` consumes gateway snapshots and ordered event cursors.
- Both produce a versioned `RepublicModel`.

### Normalized model

Values include source, observed time/game date, completeness and confidence.
Collections have stable IDs where supported. Missingness is explicit and never
filled from stale samples without a visible provenance change.

### Planning state

`PlanningModel` remains separate from observed data and persists locally in
IndexedDB. A plan may seed from an observation, but subsequent edits are marked
hypothetical. Planning calculations remain deterministic and shared between
both modes.

## Live update behavior

The live adapter obtains an initial coherent snapshot, records its generation,
then follows events. Generation changes invalidate prior entity state and force
a fresh snapshot. Cursor overflow is visible and also forces resynchronization.
UI updates are batched to avoid flicker and expensive complete rerenders.

## Save-folder behavior

The hosted adapter reports file-level progress, support and parse failures.
Known optional files degrade individual sections. Required-file failure does
not produce a partial model that looks complete. Save contents never enter
telemetry, support bundles or network requests.

## Actions

The command center is read-only by default. Any future game-changing controls
live in a separate Actions area using MpEconomy's dry-run, enforced-scope,
preview, confirmation, idempotency and audit path. Planning edits never submit
commands implicitly.

## Shared release pipeline

The Workers Calculator repository remains the authoritative frontend source.
It publishes:

- the hosted static site;
- a static-only MpEconomy addon ZIP with `addon.json`;
- deterministic asset and integrity manifests.

The SDK release may pin or bundle the produced addon artifact, but it does not
maintain a copied frontend source tree.

## Review scope

The current application receives a full information-architecture, accessibility
and responsive-design review. Existing parsers, calculators and tested formulas
are preserved unless evidence shows a defect. Navigation, hierarchy, evidence,
loading/error states and component boundaries may be rebuilt.

## Acceptance

- One fixture produces equivalent shared fields through save and fake-live
  adapters.
- All current planning test suites remain green.
- Browser tests cover folder import, capability gaps, generation resync,
  planning separation and local-only network behavior.
- The application is usable at 1920×1080, 2560×1440 and 5120×1440.
- The same source revision produces both hosted and addon artifacts.

