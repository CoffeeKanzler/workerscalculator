# Readable Charts and Scalable Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both static SVG history renderers with synchronized, zoomable, theme-aware uPlot charts and virtualize the Analysis table without changing its search, sort, selection, or keyboard behavior.

**Architecture:** A focused `js/ui/time_series_chart.js` adapter owns the vendored uPlot boundary, pure data alignment, theme resolution, lifecycle, synchronization groups, tooltip, and legend controls. A separate `js/ui/virtual_table.js` keeps semantic table markup while calculating and mounting only a visible row window; `js/app.js` remains the integration shell and is not restructured.

**Tech Stack:** Vanilla browser ES modules, vendored uPlot 1.6.32, Canvas 2D, semantic HTML tables, CSS custom properties, `ResizeObserver`, Node 22 `node:test`, Playwright Chromium.

## Global Constraints

- The save never leaves the browser; all parsing and rendering stays client-side and no code may transmit, upload, beacon, or fetch save-derived data.
- No build step, bundler, transpiler, runtime package fetch, or CDN reference.
- Keep `package-lock.json` and repository `node_modules/` absent.
- Vendor uPlot as committed browser files with its version, source, and MIT license recorded.
- Every changed module import must carry a bumped `?v=N` marker.
- Add tests first for every new behavior and watch them fail for the intended reason.
- Update every new visible string in both English and German.
- Canvas colors must be read from computed CSS custom properties.
- Comments explain the motivating problem, not the operation of the code.
- Do not restructure `js/app.js` or refactor unrelated tables.
- Verify real pointer and keyboard input; never substitute a dispatched click.
- Run against more than one real save, including the nested myCanyon path, and inspect screenshots.

---

### Task 1: Vendor uPlot and Define the Chart Data Boundary

**Files:**
- Create: `js/vendor/uPlot.esm.js`
- Create: `css/vendor/uPlot.min.css`
- Create: `js/vendor/uPlot-LICENSE.txt`
- Create: `js/ui/time_series_chart.js`
- Create: `tests/time_series_chart.test.mjs`
- Modify: `.github/workflows/tests.yml`
- Modify: `index.html`

**Interfaces:**
- Produces: `alignTimeSeries(series)` returning `{ xValues, valueColumns, labelsByX }`.
- Produces: `gameDateParts(dateKey)` returning `{ year, day }`.
- Produces: `formatGameDateKey(dateKey)` returning `"YYYY / DDD"`.
- Produces: `seriesSummary(series)` returning `{ first, last, min, max }` per non-empty series.
- Later tasks add browser mounting exports to the same module.

- [ ] **Step 1: Write failing pure-data and vendor-policy tests**

Add `tests/time_series_chart.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  alignTimeSeries, formatGameDateKey, gameDateParts, seriesSummary,
} from '../js/ui/time_series_chart.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('sparse series align to one sorted x column without inventing values', () => {
  const aligned = alignTimeSeries([
    { label: 'adults', points: [{ x: 20, y: 2 }, { x: 10, y: 1 }] },
    { label: 'children', points: [{ x: 10, y: 4 }, { x: 30, y: 6 }] },
  ]);
  assert.deepEqual(aligned.xValues, [10, 20, 30]);
  assert.deepEqual(aligned.valueColumns, [[1, 2, null], [4, null, 6]]);
});

test('game date formatting crosses a 366-day year without becoming Unix time', () => {
  assert.deepEqual(gameDateParts(1984 * 366 + 365), { year: 1984, day: 365 });
  assert.equal(formatGameDateKey(1985 * 366 + 4), '1985 / 004');
});

test('series summaries expose exact first last minimum and maximum values', () => {
  assert.deepEqual(seriesSummary([
    { label: 'population', points: [{ x: 1, y: 20 }, { x: 2, y: 5 }, { x: 3, y: 14 }] },
  ]), [{
    label: 'population', first: 20, last: 14, min: 5, max: 20,
  }]);
});

test('uPlot is pinned locally with its license and no CDN import', async () => {
  const [module, license, shell] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/vendor/uPlot.esm.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/vendor/uPlot-LICENSE.txt'), 'utf8'),
    fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
  ]);
  assert.match(module, /uPlot\.js[\s\S]*v1\.6\.32/);
  assert.match(license, /MIT License|MIT Licensed/);
  assert.match(shell, /css\/vendor\/uPlot\.min\.css\?v=\d+/);
  assert.doesNotMatch(shell, /cdn|unpkg|jsdelivr/i);
});
```

- [ ] **Step 2: Run the new test and confirm the expected failure**

Run:

```bash
node --test tests/time_series_chart.test.mjs
```

Expected: FAIL because `js/ui/time_series_chart.js` and the vendored files do not exist.

- [ ] **Step 3: Vendor the pinned browser distribution and license**

Download exactly the 1.6.32 tag outside any package manager:

```bash
curl -fL https://raw.githubusercontent.com/leeoniya/uPlot/1.6.32/dist/uPlot.esm.js \
  -o js/vendor/uPlot.esm.js
curl -fL https://raw.githubusercontent.com/leeoniya/uPlot/1.6.32/dist/uPlot.min.css \
  -o css/vendor/uPlot.min.css
curl -fL https://raw.githubusercontent.com/leeoniya/uPlot/1.6.32/LICENSE \
  -o js/vendor/uPlot-LICENSE.txt
```

Append this provenance block to `js/vendor/uPlot-LICENSE.txt`:

```text

Vendored for workerscalculator from:
https://github.com/leeoniya/uPlot/tree/1.6.32
Files: dist/uPlot.esm.js, dist/uPlot.min.css
Version: 1.6.32
```

Add the local stylesheet before `css/style.css` in `index.html`:

```html
<link rel="stylesheet" href="css/vendor/uPlot.min.css?v=1">
<link rel="stylesheet" href="css/style.css?v=81">
```

Update the CI step's explanation, but keep its rejection logic:

```yaml
# Reviewed browser libraries may be committed under js/vendor and css/vendor.
# They are static offline assets, not install-time dependencies; a lockfile or
# node_modules would mean the no-build browser contract changed.
- name: Confirm the project has no install-time dependencies
  run: |
    if [ -f package-lock.json ] || [ -d node_modules ]; then
      echo "This project has no install-time dependencies by design."
      echo "Vendored browser assets belong under js/vendor or css/vendor."
      exit 1
    fi
```

- [ ] **Step 4: Implement the pure chart-data functions**

Create `js/ui/time_series_chart.js` beginning with:

```js
import uPlot from '../vendor/uPlot.esm.js?v=1';

export function alignTimeSeries(series) {
  const xValues = [...new Set(series.flatMap(item => item.points.map(point => point.x)))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const indexes = new Map(xValues.map((x, index) => [x, index]));
  const labelsByX = new Map();
  const valueColumns = series.map(item => {
    const values = Array(xValues.length).fill(null);
    for (const point of item.points) {
      const index = indexes.get(point.x);
      if (index === undefined || !Number.isFinite(point.y)) continue;
      values[index] = point.y;
      if (point.label) labelsByX.set(point.x, point.label);
    }
    return values;
  });
  return { xValues, valueColumns, labelsByX };
}

export function gameDateParts(dateKey) {
  const year = Math.floor(dateKey / 366);
  return { year, day: Math.max(0, Math.round(dateKey - year * 366)) };
}

export function formatGameDateKey(dateKey) {
  const { year, day } = gameDateParts(dateKey);
  return `${year} / ${String(day).padStart(3, '0')}`;
}

export function seriesSummary(series) {
  return series.filter(item => item.points.length).map(item => {
    const values = item.points.map(point => point.y).filter(Number.isFinite);
    return {
      label: item.label,
      first: values[0],
      last: values.at(-1),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
}
```

The `uPlot` import is intentionally present from the first chart module version
so the Node test also proves the vendored ES module is importable without a
browser global.

- [ ] **Step 5: Run the focused test and the dependency check**

Run:

```bash
node --test tests/time_series_chart.test.mjs
test ! -e package-lock.json
test ! -d node_modules
```

Expected: all focused tests PASS and both filesystem checks exit zero.

- [ ] **Step 6: Bump cache markers and commit**

Run:

```bash
node tools/bump_cache_versions.mjs \
  js/vendor/uPlot.esm.js css/vendor/uPlot.min.css js/ui/time_series_chart.js
node tools/bump_cache_versions.mjs --check \
  js/vendor/uPlot.esm.js css/vendor/uPlot.min.css js/ui/time_series_chart.js
git add .github/workflows/tests.yml index.html js/vendor css/vendor \
  js/ui/time_series_chart.js tests/time_series_chart.test.mjs
git commit -m "vendor: add offline uPlot chart boundary"
```

Expected: the marker check prints `cache markers are current`; the commit
contains no Workshop-catalog or handoff files.

---

### Task 2: Replace Both SVG Renderers with Focused Synchronized Charts

**Files:**
- Modify: `js/ui/time_series_chart.js`
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css`
- Modify: `tests/time_series_chart.test.mjs`
- Modify: `tests/chart_cursor.test.mjs`
- Modify: `tests/history_tab.test.mjs`
- Modify: `tests/theme.test.mjs`

**Interfaces:**
- Consumes: `alignTimeSeries`, `formatGameDateKey`, and vendored `uPlot`.
- Produces: `mountTimeSeriesChart(container, options)` returning `{ plot, destroy }`.
- Produces: `resetChartGroup(group)` and `destroyTimeSeriesCharts()`.
- `options` shape:

```js
{
  title: string,
  series: Array<{ label: string, colorSlot: number, points: Array<{x, y, label}> }>,
  group: string,
  logScale?: boolean,
  valueSuffix?: string,
  formatValue: (number) => string,
  strings: { resetZoom: string, unavailable: string, summary: string },
}
```

- [ ] **Step 1: Write failing chart-group, source-contract, and theme tests**

Extend `tests/time_series_chart.test.mjs`:

```js
import {
  alignTimeSeries, createChartGroupState, formatGameDateKey,
  gameDateParts, seriesSummary,
} from '../js/ui/time_series_chart.js';

test('a zoom range propagates to every chart in one group and reset restores all', () => {
  const calls = [];
  const group = createChartGroupState();
  group.add({ setScale: (key, range) => calls.push(['a', key, range]) });
  group.add({ setScale: (key, range) => calls.push(['b', key, range]) });
  group.setRange(10, 20);
  assert.deepEqual(calls.slice(-2), [
    ['a', 'x', { min: 10, max: 20 }],
    ['b', 'x', { min: 10, max: 20 }],
  ]);
  group.reset();
  assert.deepEqual(calls.slice(-2), [
    ['a', 'x', { min: null, max: null }],
    ['b', 'x', { min: null, max: null }],
  ]);
});
```

Add source assertions to `tests/history_tab.test.mjs`:

```js
test('both history surfaces use the shared uPlot adapter', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.match(app, /mountTimeSeriesChart/);
  assert.equal((app.match(/document\.createElementNS\(svgNS, 'svg'\)/g) ?? []).length, 0);
  assert.doesNotMatch(app, /downsampleMinMax\(item\.points, 160\)/);
});
```

Extend `tests/theme.test.mjs` to assert both root palettes define
`--chart-1` through `--chart-8`, `--chart-grid`, `--chart-cursor`, and
`--chart-selection`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test tests/time_series_chart.test.mjs tests/history_tab.test.mjs tests/theme.test.mjs
```

Expected: FAIL because chart group state, palette tokens, and uPlot integration
do not exist and the SVG/downsampling source still does.

- [ ] **Step 3: Implement chart group state and mounting**

Add these group semantics to `js/ui/time_series_chart.js`:

```js
export function createChartGroupState() {
  const plots = new Set();
  let range = null;
  return {
    get range() { return range; },
    add(plot) { plots.add(plot); return () => plots.delete(plot); },
    setRange(min, max, source = null) {
      range = { min, max };
      for (const plot of plots) {
        if (plot !== source) plot.setScale('x', range);
      }
    },
    reset() {
      range = null;
      for (const plot of plots) plot.setScale('x', { min: null, max: null });
    },
    clear() { plots.clear(); range = null; },
  };
}
```

Maintain module-owned `Map<string, groupState>` and `Set<destroyFn>`.
`mountTimeSeriesChart` must:

- align the input into `[xValues, ...valueColumns]`;
- return an unavailable node without constructing uPlot for fewer than two x
  values;
- read every canvas color with
  `getComputedStyle(document.documentElement).getPropertyValue(token).trim()`;
- configure `scales.x.time = false`;
- configure logarithmic y with `distr: 3` only when requested;
- configure approximately five axis/grid divisions;
- configure `cursor.drag = { x: true, y: false, dist: 8 }`;
- use `cursor.sync = { key: group, setSeries: false, scales: ['x', null] }`;
- use uPlot `setCursor`, `setScale`, and `setSeries` hooks to update the custom
  tooltip, group range, reset-button visibility, and `aria-pressed`;
- observe the container and call `plot.setSize()` only while mounted; and
- unregister, disconnect, and call `plot.destroy()` exactly once.

The custom legend uses:

```html
<button type="button" class="chart-legend-item" aria-pressed="true">
  <i aria-hidden="true"></i><span>Adults</span>
</button>
```

The hidden summary uses each series' first, last, min, and max values rather
than attempting to narrate the chart shape.

- [ ] **Step 4: Add theme tokens and focused chart styling**

Define all chart tokens in `:root`, `[data-theme="dark"]`, the system-dark
media palette, and `[data-theme="light"]`. Use eight distinguishable series
colors with at least 3:1 contrast against `--panel`.

Replace the old SVG cursor CSS with uPlot-scoped rules:

```css
.history-chart-host { position: relative; min-width: 0; }
.history-chart-host .uplot { width: 100% !important; }
.history-chart-host canvas { cursor: crosshair; }
.chart-reset { visibility: hidden; }
.chart-reset.active { visibility: visible; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.chart-legend-item {
  border: 0; padding: 2px 3px; background: transparent; color: var(--muted);
}
.chart-legend-item[aria-pressed="false"] { opacity: .45; text-decoration: line-through; }
.chart-tooltip {
  position: absolute; z-index: 3; pointer-events: none;
  display: flex; flex-direction: column; gap: 2px;
  padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  color: var(--text); font-size: 12px; line-height: 1.35; white-space: nowrap;
  box-shadow: 0 2px 8px rgb(0 0 0 / 22%);
}
.virtual-summary {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}
```

- [ ] **Step 5: Integrate the adapter into both app renderers**

Change chart definitions from `color` to `colorSlot`. Remove
`appendChartAxisLabel`, `appendChartPointMarkers`, the hand-written
`attachChartCursor`, and the `downsampleMinMax` import from `js/app.js`.

At the start of `render()`:

```js
destroyTimeSeriesCharts();
pendingChartMounts = [];
```

After `root.replaceChildren(...)` and `decorateResponsiveTables(root)`:

```js
for (const mount of pendingChartMounts) mount();
pendingChartMounts = [];
```

`renderRepublicLineChart` and the older `renderHistory` each create a
`.history-chart-host`, queue `mountTimeSeriesChart` until after attachment, and
pass `group: 'republic-history'` or `group: 'price-history'` respectively.
Range buttons call `resetChartGroup('republic-history')` before `update()`.

Add bilingual keys:

```js
resetChartZoom: 'Reset zoom',
chartSeriesSummary: '{series}: first {first}, last {last}, minimum {min}, maximum {max}',
```

and:

```js
resetChartZoom: 'Zoom zurücksetzen',
chartSeriesSummary: '{series}: zuerst {first}, zuletzt {last}, Minimum {min}, Maximum {max}',
```

- [ ] **Step 6: Run focused tests and the complete suite**

Run:

```bash
node --test tests/time_series_chart.test.mjs tests/chart_cursor.test.mjs \
  tests/history_tab.test.mjs tests/theme.test.mjs tests/i18n_coverage.test.mjs
npm test
```

Expected: all tests PASS. Remove or rewrite obsolete SVG cursor tests only
when the equivalent uPlot adapter behavior is covered; do not leave tests for
dead production code.

- [ ] **Step 7: Perform save-less browser smoke and inspect both themes**

Run the server and existing smoke harness:

```bash
python3 -m http.server 8765
node tests/browser/smoke.mjs http://localhost:8765/index.html
```

Expected: all tabs render without page or console errors. Populated chart
screenshots are deliberately part of Task 4 because the save-less smoke run
cannot create real history data.

- [ ] **Step 8: Bump markers and commit**

Run:

```bash
node tools/bump_cache_versions.mjs \
  js/ui/time_series_chart.js js/app.js js/i18n.js css/style.css
node tools/bump_cache_versions.mjs --check \
  js/ui/time_series_chart.js js/app.js js/i18n.js css/style.css
git add js/ui/time_series_chart.js js/app.js js/i18n.js css/style.css index.html \
  tests/time_series_chart.test.mjs tests/chart_cursor.test.mjs \
  tests/history_tab.test.mjs tests/theme.test.mjs
git commit -m "feat: make save history explorable"
```

---

### Task 3: Build a Semantic Virtual Table Helper

**Files:**
- Create: `js/ui/virtual_table.js`
- Create: `tests/virtual_table.test.mjs`
- Modify: `css/style.css`

**Interfaces:**
- Produces: `virtualWindow(options)` returning
  `{ start, end, topHeight, bottomHeight }`, where `end` is exclusive.
- Produces: `createVirtualTable(options)` returning the focusable `.tablewrap`.
- `options` shape:

```js
{
  rows: Array<unknown>,
  columnCount: number,
  renderHead: () => HTMLTableSectionElement,
  renderRow: (row: unknown, index: number) => HTMLTableRowElement,
  className?: string,
  ariaLabel: string,
  rowHeight?: number,
  overscan?: number,
}
```

- [ ] **Step 1: Write failing virtual-window tests**

Create `tests/virtual_table.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { virtualWindow } from '../js/ui/virtual_table.js';

test('the first viewport renders visible rows plus lower overscan', () => {
  assert.deepEqual(virtualWindow({
    rowCount: 1000, scrollTop: 0, viewportHeight: 180, rowHeight: 36, overscan: 2,
  }), { start: 0, end: 7, topHeight: 0, bottomHeight: 35748 });
});

test('a middle viewport keeps overscan on both sides', () => {
  assert.deepEqual(virtualWindow({
    rowCount: 1000, scrollTop: 360, viewportHeight: 180, rowHeight: 36, overscan: 2,
  }), { start: 8, end: 17, topHeight: 288, bottomHeight: 35388 });
});

test('the final viewport clamps rather than requesting rows past the end', () => {
  assert.deepEqual(virtualWindow({
    rowCount: 10, scrollTop: 9999, viewportHeight: 180, rowHeight: 36, overscan: 2,
  }), { start: 7, end: 10, topHeight: 252, bottomHeight: 0 });
});

test('an empty table has a stable empty window', () => {
  assert.deepEqual(virtualWindow({
    rowCount: 0, scrollTop: -10, viewportHeight: 0, rowHeight: 36, overscan: 2,
  }), { start: 0, end: 0, topHeight: 0, bottomHeight: 0 });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
node --test tests/virtual_table.test.mjs
```

Expected: FAIL because `js/ui/virtual_table.js` does not exist.

- [ ] **Step 3: Implement the pure window calculation**

Create `js/ui/virtual_table.js`:

```js
export function virtualWindow({
  rowCount, scrollTop, viewportHeight, rowHeight = 36, overscan = 6,
}) {
  const count = Math.max(0, Math.floor(rowCount || 0));
  if (!count) return { start: 0, end: 0, topHeight: 0, bottomHeight: 0 };
  const height = Math.max(1, rowHeight);
  const first = Math.min(count - 1, Math.floor(Math.max(0, scrollTop) / height));
  const visibleEnd = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewportHeight)) / height);
  const start = Math.max(0, first - Math.max(0, overscan));
  const end = Math.min(count, Math.max(first + 1, visibleEnd + Math.max(0, overscan)));
  return {
    start,
    end,
    topHeight: start * height,
    bottomHeight: (count - end) * height,
  };
}
```

- [ ] **Step 4: Run the pure tests and adjust only for arithmetic errors**

Run:

```bash
node --test tests/virtual_table.test.mjs
```

Expected: all four tests PASS. If an expected spacer height is arithmetically
wrong, correct the literal only after independently calculating
`(rowCount - end) * rowHeight`.

- [ ] **Step 5: Implement semantic DOM virtualization**

Implement `createVirtualTable` with browser globals referenced only inside the
function so `virtualWindow` remains Node-importable.

It must:

- create a `.tablewrap.virtual-tablewrap` with `tabIndex = 0`;
- append a semantic table and caller-provided `<thead>`;
- generate top and bottom spacer `<tr aria-hidden="true">` nodes whose single
  cells use `colSpan = columnCount`;
- mount `rows.slice(start, end).map(renderRow)` between the spacers;
- store `data-virtual-start`, `data-virtual-end`, and
  `data-virtual-total` on the wrapper for browser assertions;
- coalesce scroll renders through one `requestAnimationFrame`; and
- skip `replaceChildren` when `start` and `end` have not changed.

Add CSS:

```css
.virtual-tablewrap {
  max-height: min(68vh, 680px);
  overflow: auto;
  position: relative;
}
.virtual-tablewrap table.data { margin: 0; }
.virtual-tablewrap tbody tr:not(.virtual-spacer) { height: 36px; }
.virtual-tablewrap tbody tr:not(.virtual-spacer) td { white-space: nowrap; }
.virtual-spacer td { padding: 0; border: 0; height: var(--virtual-spacer-height); }
.virtual-tablewrap:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
```

- [ ] **Step 6: Run tests, bump markers, and commit**

Run:

```bash
node --test tests/virtual_table.test.mjs tests/theme.test.mjs
node tools/bump_cache_versions.mjs js/ui/virtual_table.js css/style.css
node tools/bump_cache_versions.mjs --check js/ui/virtual_table.js css/style.css
git add js/ui/virtual_table.js css/style.css index.html tests/virtual_table.test.mjs
git commit -m "feat: add semantic table virtualization"
```

---

### Task 4: Adopt Virtualization in Analysis and Verify Real Saves

**Files:**
- Modify: `js/app.js`
- Modify: `tests/release_ui_contract.test.mjs`
- Modify: `tests/browser/save_import.mjs`
- Create: `.playwright-mcp/shots/charts-tables/` screenshots at verification time (gitignored; do not commit)

**Interfaces:**
- Consumes: `createVirtualTable` from `js/ui/virtual_table.js`.
- Preserves: `state.analysisSort`, `state.analysisSearch`, sorted-column marker,
  immediate search, sticky headers, native visible-text selection, and keyboard
  scrolling.

- [ ] **Step 1: Write failing Analysis source and browser-contract tests**

Add to `tests/release_ui_contract.test.mjs`:

```js
test('Analysis virtualizes semantic rows without replacing sort or search', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const start = app.indexOf('function renderAnalysis()');
  const body = app.slice(start, app.indexOf('\nfunction ', start + 10));
  assert.match(body, /createVirtualTable\(/);
  assert.match(body, /state\.analysisSearch/);
  assert.match(body, /state\.analysisSort/);
  assert.match(body, /class: 'clickable' \+ \(col === id \? ' sorted'/);
  assert.doesNotMatch(body, /el\('tbody', \{\}, rows\.map/);
});
```

Extend `tests/browser/save_import.mjs` after the history checks to:

- click Diagnose then Analysis with real `.click()`;
- assert `.virtual-tablewrap[data-virtual-total]` exists;
- assert rendered non-spacer body rows are less than total rows;
- focus the viewport and press `PageDown`;
- assert `data-virtual-start` increases;
- click a sortable header and assert `.sorted` moves or changes direction;
- fill the search input and assert it retains focus;
- drag across visible cell text and assert `window.getSelection().toString()`
  is non-empty.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test tests/release_ui_contract.test.mjs tests/virtual_table.test.mjs
```

Expected: FAIL because Analysis still maps every row into one `<tbody>`.

- [ ] **Step 3: Integrate the helper in `renderAnalysis`**

Import with a cache marker:

```js
import { createVirtualTable } from './ui/virtual_table.js?v=1';
```

Keep row computation, filtering, sorting, header callbacks, and cell content
unchanged. Replace only the final table construction:

```js
const table = createVirtualTable({
  rows,
  columnCount: 9,
  className: 'data wide analysis-table',
  ariaLabel: t('tabAnalysis'),
  renderHead: () => el('thead', {}, el('tr', {},
    th('name', t('building')), el('th', {}, t('group')), el('th', {}, t('workers')),
    th('profit', `${t('profit')} ${cur()}`), th('profitPerWorker', t('profitPerWorker')),
    th('amortDays', t('amortDays')), th('income', `${t('income')} ${cur()}`),
    th('expenses', `${t('expenses')} ${cur()}`), th('buildCost', `${t('buildCost')} ${cur()}`))),
  renderRow: r => el('tr', {},
    el('td', {}, bname(r.b), planningAuthorityBadge(r.b, ['economy', 'construction'])),
    el('td', {}, r.b.group[state.lang]),
    el('td', { class: 'r' }, fmt(r.b.workers, 0)),
    el('td', { class: 'r ' + (r.profit < 0 ? 'neg' : 'pos') }, fmt(r.profit)),
    el('td', { class: 'r ' + (r.profitPerWorker < 0 ? 'neg' : 'pos') },
      fmt(r.profitPerWorker)),
    el('td', { class: 'r' }, fmt(r.amortDays, 1)),
    el('td', { class: 'r' }, fmt(r.income)),
    el('td', { class: 'r' }, fmt(r.expenses)),
    el('td', { class: 'r' }, fmt(r.buildCost, 0))),
});
```

Return `table` after the existing hint and search input. Do not migrate
`.area-health` or any other table.

- [ ] **Step 4: Run focused and full automated tests**

Run:

```bash
node --test tests/release_ui_contract.test.mjs tests/virtual_table.test.mjs \
  tests/time_series_chart.test.mjs tests/history_tab.test.mjs
npm test
```

Expected: all tests PASS with no warnings or page-global errors.

- [ ] **Step 5: Update and run the real-save browser harness**

Use Playwright only from the existing external installation. Start the server
from `/home/nexx/workers`, then run:

```bash
node /home/nexx/.local/share/codex-playwright/save_import.mjs \
  "/home/nexx/workers/private/saves/10253 - Real N1.75 Mellerhöffe" \
  http://localhost:8765/index.html
node /home/nexx/.local/share/codex-playwright/save_import.mjs \
  "/home/nexx/workers/private/saves/14674 - myCanyon-20260720T070413Z-1-001/14674 - myCanyon" \
  http://localhost:8765/index.html
```

Before each import, the harness must clear localStorage and IndexedDB. Increase
the import timeout only when the progress UI is still advancing; do not hide a
real stall.

Expected for both saves:

- no console or page errors;
- at least one populated `.uplot` republic chart;
- hover tooltip changes between two real pointer positions;
- a cursor appears at the same x value on at least two charts;
- a horizontal real drag narrows all republic x-scale ranges;
- Reset Zoom restores them;
- a real legend click hides a series and changes its y scale when it was the
  dominant series;
- Analysis renders fewer DOM rows than `data-virtual-total`;
- PageDown advances `data-virtual-start`;
- search retains focus and sort markers still work; and
- visible text can be selected.

- [ ] **Step 6: Capture and inspect screenshots**

Write screenshots to the gitignored
`.playwright-mcp/shots/charts-tables/` directory:

```text
mellerhoeffe-history-light.png
mellerhoeffe-history-zoom-hover.png
mycanyon-history-dark.png
mycanyon-history-series-hidden.png
mycanyon-analysis-top.png
mycanyon-analysis-scrolled.png
```

Open every screenshot with the image viewer. Confirm:

- tick labels do not collide or clip;
- gridlines remain subordinate to data in both themes;
- the hover card is legible and stays inside its chart;
- linked cursor lines describe the same date;
- zoom reveals a short event rather than stretching a 160-point approximation;
- hidden legends look interactive but not visually loud;
- sticky headers remain visible after table scrolling; and
- virtual scrolling has no blank gap, overlap, or column-width jump.

If a screenshot exposes a defect, add a failing automated assertion where
possible, fix it, and repeat both saves affected by the change.

- [ ] **Step 7: Run final integrity checks**

Run:

```bash
npm test
node tools/bump_cache_versions.mjs --check \
  js/app.js js/ui/time_series_chart.js js/ui/virtual_table.js js/i18n.js css/style.css
test ! -e package-lock.json
test ! -d node_modules
rg -n \"https?://|fetch\\(|sendBeacon|XMLHttpRequest|WebSocket\" \
  js/ui/time_series_chart.js js/ui/virtual_table.js js/app.js
git diff --check
git status --short
```

Review every `rg` hit. The vendored provenance URL is allowed; runtime network
code added by this feature is not.

- [ ] **Step 8: Bump cache markers and commit the Analysis adoption**

Run:

```bash
node tools/bump_cache_versions.mjs js/app.js tests/browser/save_import.mjs
node tools/bump_cache_versions.mjs --check js/app.js tests/browser/save_import.mjs
git add js/app.js index.html tests/release_ui_contract.test.mjs \
  tests/browser/save_import.mjs
git commit -m "feat: keep large analysis tables responsive"
```

Do not stage `.playwright-mcp/`, Workshop catalogue changes, private saves, or
the user's handoff files.

---

### Task 5: Completion Review and Evidence Handoff

**Files:**
- Review only: all files changed since the design commit.

**Interfaces:**
- Consumes: the four preceding tasks and both real-save harness reports.
- Produces: an evidence-backed branch handoff with commit-by-commit verification.

- [ ] **Step 1: Review the branch diff by commit**

Run:

```bash
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
git diff --check main...HEAD
git status --short
```

Expected: focused design, vendor/chart, virtual-helper, and Analysis commits;
unrelated dirty files remain unstaged and absent from `main...HEAD`.

- [ ] **Step 2: Re-run the final suite from the exact committed state**

Run:

```bash
npm test
node tools/bump_cache_versions.mjs --check $(git diff --name-only main...HEAD)
```

Expected: PASS and `cache markers are current`.

- [ ] **Step 3: Prepare the final handoff**

Report:

- the branch name and every focused commit;
- why uPlot was chosen and exactly how it remains offline;
- automated test totals and final commands;
- each real save used, import duration, and harness result;
- what was visibly confirmed in each inspected screenshot;
- DOM row totals versus mounted Analysis rows;
- confirmation that no lockfile, repository `node_modules`, CDN, or data
  transmission was introduced; and
- any unverified behavior, with the precise blocker rather than a completion
  claim.
