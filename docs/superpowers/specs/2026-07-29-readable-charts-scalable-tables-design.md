# Readable Charts and Scalable Tables Design

## Goal

Turn save history into a focused scientific charting surface that supports
close comparison across decades, and keep the Analysis table responsive by
rendering only the rows a player can see.

The result must remain a client-only, offline-capable GitHub Pages application.
No save data may leave the browser.

## Scope

This change has two independently reviewable parts:

1. Replace both hand-built SVG time-series renderers with a shared uPlot
   integration.
2. Add a reusable semantic-table virtualizer and adopt it in Analysis.

It does not restructure `js/app.js`, replace every table, or redesign the
republic map. Map improvements are being researched separately.

## Chart Direction

The visual direction is a focused scientific chart rather than a dense
analytics dashboard. The hover readout is the primary detailed surface.
Charts gain readable axes and interaction without permanent KPI tiles or
large control bars.

Each chart shows approximately five well-spaced ticks and subtle gridlines on
both axes. Compact clickable legends identify and toggle series. A Reset Zoom
button appears only while a chart group is zoomed.

## Vendored uPlot

Pin uPlot 1.6.32 and commit its browser-ready ES module, CSS, and MIT license
under repository-owned vendor paths. The application imports only those local
files. It must not contain a CDN URL, telemetry hook, remote asset, or runtime
package fetch.

uPlot earns the dependency because it directly provides:

- canvas rendering for thousands of points;
- numeric axes, ticks, and grids;
- drag-to-zoom with automatic y-axis rescaling;
- synchronized cursors and x scales across charts;
- series visibility controls;
- linear and logarithmic scales; and
- responsive redraw hooks.

The dependency-free CI check remains. Update its explanatory text to allow
reviewed, committed browser vendor files while continuing to reject
`package-lock.json` and `node_modules/`. Record the pinned version and source
in the vendor license/provenance file.

## Shared Chart Adapter

Add a focused browser module under `js/ui/` that owns the uPlot boundary. It
accepts a container, a chart title, series definitions, a synchronization
group, value/date formatters, and scale options. `js/app.js` remains
responsible for selecting save fields and translated labels.

The adapter:

- aligns sparse series onto one sorted x-value array, using `null` for a
  missing observation;
- supplies the original 3,000–8,000 records to uPlot rather than reducing the
  entire republic to 160 points;
- formats the game's `year * 366 + day` key without treating it as a Unix
  timestamp;
- builds axes, grids, cursor, legend buttons, tooltip, and reset control;
- exposes a short text summary and canvas `aria-label`;
- sizes the plot to its container with `ResizeObserver`; and
- returns a destroy function.

Before `render()` replaces the application DOM, it destroys all mounted chart
instances. This prevents uPlot's resize and window listeners from surviving a
full application re-render.

## Themes and Color

Canvas colors must come from computed CSS custom properties. Add a small
chart-palette set for both themes and resolve the following at chart creation:

- plot and panel backgrounds;
- axis text;
- grid and border lines;
- cursor and selection;
- tooltip surface; and
- series palette colors.

Series definitions use palette slots rather than hard-coded canvas colors.
Re-rendering after a theme change rebuilds each chart from the newly computed
properties.

## Republic-History Interaction

All republic-history charts use one synchronization group.

- Moving over one chart shows a vertical cursor at the same game date on all
  charts.
- The active chart shows the floating tooltip selected in the visual design.
  It lists the date and every visible series value.
- A real horizontal pointer drag zooms every republic chart to the selected
  time range.
- The shared Reset Zoom control restores the group's full range.
- Clicking or keyboard-activating a legend button hides or restores one
  series and immediately recalculates that chart's y range.
- Existing Month, Year, and All controls still define the source range. A
  range-button change clears any narrower drag zoom.

The older price-history chart uses the same adapter and interaction language,
including its existing comparison and logarithmic-scale options, but belongs
to an independent synchronization group. Its zoom never changes the republic
history.

## Chart Accessibility and Empty States

The chart canvas has an accessible name containing its title and date span. A
visually hidden summary lists each series' first, last, minimum, and maximum
values. Legend controls are real buttons with `aria-pressed`, so series
visibility does not depend on a mouse.

The existing translated unavailable/no-history states remain. All new visible
copy, including Reset Zoom and the accessible summary labels, is added to both
English and German.

## Virtual Table Helper

Add a reusable helper under `js/ui/` that creates a semantic virtual table
from:

- a header renderer;
- an array of already filtered and sorted row models;
- a row renderer;
- a fixed row height;
- an overscan count; and
- table classes and an accessible label.

The helper renders a normal `<table>`, `<thead>`, `<tbody>`, `<tr>`, and
`<td>` structure inside a vertically and horizontally scrollable
`.tablewrap`. The body contains:

- a top spacer row;
- only the visible row window plus overscan; and
- a bottom spacer row.

The spacer cells span all columns. Actual data rows remain ordinary DOM nodes,
so native text selection and copying continue to work. The viewport is
keyboard-focusable. A `requestAnimationFrame`-coalesced scroll listener changes
only the body window and does not invoke the application's global `update()`.

Virtual rows use a fixed, non-wrapping height to keep scroll geometry stable.
Horizontal scrolling handles wide Analysis content. Existing sticky `<th>`
behavior remains inside the vertical viewport.

The helper's structure must remain compatible with `.area-health`: adopting
that table later must not require div-based rows or remove its sticky first
column. `.area-health` itself is not migrated in this change.

## Analysis Adoption

`renderAnalysis` continues to compute, search, and sort the same row models
with the same sorted-column marker and direction. Only the final row mounting
changes to the virtual helper.

Typing in search still updates results immediately. The application's existing
focus restoration preserves the input value, selection, and focus across its
full re-render. Sorting still changes the state-backed
`state.analysisSort`. A new search or sort starts the virtual viewport at the
first row.

## Failure Handling

There is no runtime network or package resolution to fail. If a chart has
fewer than two usable x values, it renders the existing translated empty state
instead of constructing uPlot.

Resize callbacks ignore charts already destroyed. Virtual-table calculations
clamp negative scroll offsets, empty datasets, viewports shorter than one row,
and windows beyond the final row.

## Automated Verification

Use test-driven development for all new logic.

Unit tests cover:

- sparse-series alignment and stable x ordering;
- game-date formatting at year boundaries;
- chart-group zoom propagation and reset;
- hidden-series state and y-rescale inputs;
- virtual window start/end/spacer calculations;
- empty, short, and end-of-list virtual windows; and
- source contracts for local-only uPlot imports, bilingual strings, and
  dependency policy.

Browser verification uses real input:

- move a pointer over one republic chart and verify linked cursors;
- drag a three-month selection and verify every republic chart shares it;
- click Reset Zoom;
- click a legend button and verify the series and y range change;
- keyboard-activate a legend button;
- scroll and keyboard-scroll Analysis and verify its bounded DOM row count;
- sort and search Analysis while preserving focus; and
- select visible cell text.

No interaction test may substitute `dispatchEvent('click')` for a real click.

## Real-Save Verification

Run the browser harness against:

- `/home/nexx/workers/private/saves/10253 - Real N1.75 Mellerhöffe`, whose
  history has approximately 8,000 records; and
- `/home/nexx/workers/private/saves/14674 - myCanyon-20260720T070413Z-1-001/14674 - myCanyon`,
  whose `stats.ini` is 137 MB.

Capture and inspect screenshots for:

- the full history in light and dark themes;
- a linked hover cursor and tooltip;
- the same three-month zoom across several charts;
- a chart rescaled after its dominant series is hidden;
- Analysis at its first rows and after keyboard/scroll navigation; and
- sticky headers during virtual scrolling.

Record import duration, chart errors, visible/total table row counts, and any
browser console or page errors. Run the complete `npm test` suite and cache
marker checker. Confirm the repository contains no lockfile or
`node_modules`, and inspect the final diff for any remote URL or data-transfer
code.

## Commit Boundaries

1. Design specification.
2. Vendored uPlot plus the shared chart adapter and chart replacement.
3. Reusable table virtualization plus Analysis adoption.
4. Browser-harness assertions and real-save verification fixes, if they are
   not naturally part of the preceding focused commits.

Each implementation commit bumps cache markers for every changed module.
