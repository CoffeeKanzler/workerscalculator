// Boots the app against a real save and exercises what only real data reaches.
//
// The save-less smoke run catches a page that fails to boot, but every surface
// worth looking at — the map's markers, the twelve history charts, the area
// tables — renders nothing at all without a republic loaded. That gap is how a
// dead building filter and a chart with no readable values both shipped.
//
// Saves are 150 MB to 1 GB and gitignored, so this cannot run in CI. It is a
// local check, pointed at a save directory:
//
//   node tests/browser/save_import.mjs ~/bigsavegame [baseUrl]
//
// Exits non-zero on the first failed expectation.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const SAVE = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:8765/index.html';
const SHOT_DIR = process.env.WORKERS_SCREENSHOT_DIR;
const SAVE_SLUG = path.basename(SAVE ?? '').normalize('NFKD')
  .replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

if (!SAVE) {
  console.error('usage: node tests/browser/save_import.mjs <save-dir> [baseUrl]');
  process.exit(2);
}

const failures = [];
const check = (condition, message, detail) => {
  if (condition) return true;
  failures.push(detail ? `${message}\n  ${detail}` : message);
  return false;
};
const screenshot = async (page, name) => {
  if (!SHOT_DIR) return;
  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${SAVE_SLUG}-${name}.png`),
    fullPage: true,
  });
};

const paintedMarkerSpot = page => page.evaluate(() => {
  const layer = document.querySelector('.leaflet-mapVector-pane canvas');
  if (!layer) return null;
  const context = layer.getContext('2d', { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, layer.width, layer.height).data;
  const rect = layer.getBoundingClientRect();
  for (let y = 20; y < layer.height - 60; y += 2) {
    for (let x = 20; x < layer.width - 20; x += 2) {
      let solid = true;
      for (let dy = -1; dy <= 1 && solid; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (pixels[((y + dy) * layer.width + x + dx) * 4 + 3] < 220) {
            solid = false;
            break;
          }
        }
      }
      if (!solid) continue;
      const clientX = rect.left + x / layer.width * rect.width;
      const clientY = rect.top + y / layer.height * rect.height;
      if (document.elementFromPoint(clientX, clientY) === layer) {
        return { x: clientX, y: clientY };
      }
    }
  }
  return null;
});


const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
const unexpectedRequests = [];
const allowedOrigin = new URL(BASE).origin;
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('request', request => {
  const url = new URL(request.url());
  if (url.protocol !== 'data:' && url.origin !== allowedOrigin) {
    unexpectedRequests.push(request.url());
  }
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.clear();
    const databases = typeof indexedDB.databases === 'function'
      ? await indexedDB.databases() : [];
    await Promise.all(databases.map(database => new Promise(resolve => {
      const request = indexedDB.deleteDatabase(database.name);
      request.onsuccess = request.onerror = request.onblocked = resolve;
    })));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });

  // A webkitdirectory input takes the directory itself, not a file list.
  await page.setInputFiles('.importpicker input[type=file]', [SAVE]);
  // Waiting on selectors that never rendered hid every successful import
  // behind a 180-second timeout, while advancing at core completion races the
  // deferred map update that replaces myCanyon's live tab tree.
  await page.waitForFunction(() =>
    document.body.innerText.length > 2000
      && !document.querySelector('.start-hero')
      && !document.querySelector('.import-spinner'),
  null, { timeout: 600_000 });
  await page.waitForTimeout(500);

  const loaded = await page.evaluate(() =>
    document.body.innerText.length > 2000 && !document.querySelector('.start-hero'));
  check(loaded, 'the save did not import: the start page is still showing');

  // --- the map -----------------------------------------------------------
  await page.locator('.section-tabs button', { hasText: 'Observe' }).first().click();
  await page.waitForTimeout(300);
  const mapTab = page.locator('.context-tabs button', { hasText: /karte|map/i }).first();
  if (await mapTab.count()) {
    await mapTab.click();
    await page.waitForTimeout(1500);

    const canvas = page.locator('.leaflet-republic-map.leaflet-container');
    check(await canvas.count() > 0, 'the map rendered no Leaflet viewport');

    // The map sits below the fold on a desktop viewport, and synthetic mouse
    // events at coordinates outside the viewport silently go nowhere — which
    // reads exactly like a broken handler.
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const painted = Number(await canvas.getAttribute('data-map-marker-count'));
    check(painted > 500, `the map drew almost no markers (${painted})`);

    // The categories are what make the map readable rather than a field of
    // identical dots, so a map where everything is 'other' is a failure even
    // though it draws perfectly well.
    const categories = JSON.parse(
      await canvas.getAttribute('data-map-category-counts') ?? '{}');
    const total = Object.values(categories).reduce((sum, n) => sum + n, 0);
    check((categories.other ?? 0) / total < 0.15,
      `${categories.other ?? 0} of ${total} markers are uncategorised: `
      + JSON.stringify(categories));

    const filterInput = page.locator('.map-data-toolbar input[type=search]').first();
    if (await filterInput.count()) {
      await filterInput.fill('zzzznotathing');
      await page.waitForTimeout(300);
      const afterFilter = Number(await canvas.getAttribute('data-map-marker-count'));
      check(afterFilter < painted,
        `a filter matching nothing left the map unchanged (${painted} then ${afterFilter})`);
      await filterInput.fill('');
      await page.waitForTimeout(300);
    }

    const box = await canvas.boundingBox();
    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;

    const beforeZoom = await canvas.getAttribute('data-map-zoom');
    await page.mouse.move(centreX, centreY);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(600);
    const afterZoom = await canvas.getAttribute('data-map-zoom');
    check(afterZoom && afterZoom !== beforeZoom, 'the wheel did not zoom the map');

    const beforePan = await canvas.getAttribute('data-map-center');
    await page.mouse.move(centreX, centreY);
    await page.mouse.down();
    await page.mouse.move(centreX - 220, centreY - 140, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    check(await canvas.getAttribute('data-map-center') !== beforePan, 'dragging did not pan the map');

    // A pan ends in a click on the canvas, which must not also select whatever
    // building the pointer happened to finish over.
    const selectedAfterDrag = await page.evaluate(() =>
      !document.querySelector('.map-building-inspector.empty'));
    check(!selectedAfterDrag, 'panning the map selected a building');
    await page.locator('.map-zoom-controls button', {
      hasText: /Fit developed area|Bebautes Gebiet/i,
    }).click();
    await page.waitForTimeout(500);
    await page.locator('.map-layer-menu > summary').click();
    await page.locator('[data-map-layer="scopes"]').uncheck();
    await page.locator('.map-layer-menu > summary').click();

    // The building pane is its own canvas. Read an actually painted pixel and
    // drive the real mouse there: dispatching an event would bypass the map's
    // gesture and hit-testing stack.
    const spot = await paintedMarkerSpot(page);
    check(spot, 'no painted building marker was visible to click');
    if (spot) {
      await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(400);
    }

    const inspector = await page.evaluate(() => {
      const panel = document.querySelector('.map-building-inspector');
      if (!panel || panel.classList.contains('empty')) return null;
      const style = getComputedStyle(panel);
      return { text: panel.innerText.trim(), position: style.position };
    });
    check(inspector, 'clicking a building opened no inspector');
    check(inspector?.text?.length > 0, 'the building inspector was empty');
    // It is styled as an overlay on the map. When the selector missed, it
    // rendered far below the fold and clicking a building appeared to do
    // nothing at all.
    check(inspector?.position === 'absolute',
      `the inspector is not overlaying the map (position: ${inspector?.position})`);

    const beforeLegend = Number(await canvas.getAttribute('data-map-marker-count'));
    const categoryButton = page.locator('.map-data-legend button.active').first();
    const beforePressed = await categoryButton.getAttribute('aria-pressed');
    await categoryButton.click();
    await page.waitForTimeout(250);
    const afterLegend = Number(await canvas.getAttribute('data-map-marker-count'));
    const afterPressed = await categoryButton.getAttribute('aria-pressed');
    check(afterLegend < beforeLegend,
      'clicking a category legend item hid no buildings',
      JSON.stringify({ beforeLegend, afterLegend, beforePressed, afterPressed }));
    const metricLabels = await page.locator('.map-metric-toggle button').allTextContents();
    check(!metricLabels.some(label => /Staffing|Besetzung/i.test(label)),
      'the removed staffing map mode is still visible', JSON.stringify(metricLabels));

    const transportSelect = page.locator('.map-transport-select select');
    if (await transportSelect.count()) {
      const mappedLines = Number(await canvas.getAttribute('data-map-transport-line-count'));
      check(mappedLines > 0, 'saved transport lines produced no exact stop-to-stop links');
      await transportSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
      check(await page.locator('[data-map-layer="transport"]').isChecked(),
        'choosing a saved line did not enable its optional map layer');
      const lineInspector = page.locator('[data-map-transport-inspector]');
      check(await lineInspector.count() === 1, 'choosing a saved line opened no line inspector');
      const lineText = await lineInspector.count() ? (await lineInspector.innerText()).trim() : '';
      check(/\d/.test(lineText) && /stop|halte|vehicle|fahrzeug/i.test(lineText),
        'the line inspector contains no exact route facts', lineText);
      await screenshot(page, 'map-light-transport-line');
      const transportThemeButton = page.locator('.themeswitch').first();
      for (let step = 0; step < 3; step += 1) {
        if (await page.evaluate(() => document.documentElement.dataset.theme === 'dark')) break;
        await transportThemeButton.click();
        await page.waitForTimeout(150);
      }
      await screenshot(page, 'map-dark-transport-line');
      for (let step = 0; step < 3; step += 1) {
        if (await page.evaluate(() => document.documentElement.dataset.theme === 'light')) break;
        await transportThemeButton.click();
        await page.waitForTimeout(150);
      }
      await page.locator('.map-layer-menu > summary').click();
      await page.locator('[data-map-layer="transport"]').uncheck();
      await page.locator('.map-layer-menu > summary').click();
    } else {
      failures.push('the imported save offered no mapped transport-line selector');
    }

    const categoryButtons = page.locator('.map-data-legend button');
    for (let index = 0; index < await categoryButtons.count(); index += 1) {
      const button = categoryButtons.nth(index);
      const category = await button.getAttribute('data-map-category');
      const pressed = await button.getAttribute('aria-pressed');
      if ((category === 'living') !== (pressed === 'true')) await button.click();
    }
    await page.locator('.map-layer-menu > summary').click();
    for (const layer of ['borders', 'outliers']) {
      const toggle = page.locator(`[data-map-layer="${layer}"]`);
      if (await toggle.count() && await toggle.isChecked()) await toggle.uncheck();
    }
    await page.locator('.map-layer-menu > summary').click();
    await page.locator('.map-zoom-controls button', {
      hasText: /Fit developed area|Bebautes Gebiet/i,
    }).click();
    await page.waitForTimeout(500);

    const residenceSpot = await paintedMarkerSpot(page);
    check(residenceSpot, 'no residential marker was visible to click');
    if (residenceSpot) {
      await page.mouse.click(residenceSpot.x, residenceSpot.y);
      await page.waitForTimeout(400);
    }
    const ledger = page.locator('.map-building-inspector [data-residence-ledger]');
    check(await ledger.count() === 1, 'a residential marker opened no residence ledger');
    const ledgerText = await ledger.count() ? (await ledger.innerText()).trim() : '';
    check(/\d/.test(ledgerText) && /Residence|Wohnregister|Occupancy|Belegung/i.test(ledgerText),
      'the residence ledger contains no exact occupancy', ledgerText);
    await screenshot(page, 'map-light-residence');

    await page.locator('.map-layer-menu > summary').click();
    const radiationToggle = page.locator('[data-map-layer="radiation"]');
    check(await radiationToggle.count() === 1,
      'the exact radiation field has no independent map toggle');
    check(!await radiationToggle.isChecked(), 'radiation should be off by default');
    const pollutionToggle = page.locator('[data-map-layer="pollution"]');
    if (await pollutionToggle.isChecked()) await pollutionToggle.uncheck();
    await radiationToggle.check();
    await page.locator('.map-layer-menu > summary').click();
    await page.waitForTimeout(250);
    const radiationKey = page.locator('[data-map-radiation-key]');
    check(await radiationKey.isVisible(), 'enabling radiation showed no readable scale');
    check(/0[\s\S]*3/.test(await radiationKey.innerText()),
      'the radiation scale does not expose its saved 0–3 range');
    check(await page.locator('.map-radiation-overlay').count() === 1,
      'enabling radiation mounted no independent raster');
    await screenshot(page, 'map-light-radiation');

    const themeButton = page.locator('.themeswitch').first();
    for (let step = 0; step < 3; step += 1) {
      if (await page.evaluate(() => document.documentElement.dataset.theme === 'dark')) break;
      await themeButton.click();
      await page.waitForTimeout(250);
    }
    await page.waitForSelector('.leaflet-republic-map.leaflet-container');
    await screenshot(page, 'map-dark-residence');
    await screenshot(page, 'map-dark-radiation');
  } else {
    failures.push('no map tab was offered after importing a save');
  }

  // --- citizen diagnostics ----------------------------------------------
  const citiesTab = page.locator('.context-tabs button', { hasText: /städte|cities/i }).first();
  if (await citiesTab.count()) {
    await citiesTab.click();
    await page.waitForTimeout(500);
    const diagnostics = page.locator('[data-citizen-diagnostics]');
    check(await diagnostics.count() === 1, 'the Cities tab rendered no citizen diagnostics');
    const rows = diagnostics.locator('tbody tr');
    check(await rows.count() > 0, 'citizen diagnostics rendered no city rows');
    const text = await diagnostics.innerText();
    check(/Adult capacity margin|Erwachsenen-Kapazitätsreserve/i.test(text),
      'citizen diagnostics omitted housing pressure', text.slice(0, 800));
    check(/Age 18.?21|18.?21 Jahre/i.test(text),
      'citizen diagnostics omitted the approaching-adulthood window', text.slice(0, 800));
    await screenshot(page, 'citizen-diagnostics-dark');

    const themeButton = page.locator('.themeswitch').first();
    for (let step = 0; step < 3; step += 1) {
      if (await page.evaluate(() => document.documentElement.dataset.theme === 'light')) break;
      await themeButton.click();
      await page.waitForTimeout(250);
    }
    await screenshot(page, 'citizen-diagnostics-light');
  } else {
    failures.push('no Cities tab was offered after importing a save');
  }

  // --- the history charts ------------------------------------------------
  const historyTab = page.locator('.context-tabs button', { hasText: /verlauf|history/i }).first();
  if (await historyTab.count()) {
    await historyTab.click();
    await page.waitForTimeout(1200);

    const charts = page.locator('.republic-chart .uplot');
    const chartCount = await charts.count();
    check(chartCount > 0, 'the history tab drew no charts');

    if (chartCount) {
      const chart = charts.first();
      const over = chart.locator('.u-over');
      const box = await over.boundingBox();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
      await page.waitForTimeout(300);

      const readout = await page.evaluate(() => {
        const tooltip = document.querySelector('.republic-chart .chart-tooltip');
        if (!tooltip) return null;
        return {
          visible: getComputedStyle(tooltip).opacity !== '0',
          text: tooltip.innerText.trim(),
          rows: tooltip.querySelectorAll('.chart-tooltip-row').length,
        };
      });
      check(readout, 'hovering a chart produced no tooltip element');
      check(readout?.visible, 'the chart tooltip stayed hidden while hovering');
      check(readout?.rows > 0, 'the chart tooltip named no series');
      check(readout?.text?.length > 0, 'the chart tooltip was empty');
      const linked = await page.evaluate(() => {
        const cursors = [...document.querySelectorAll('.republic-chart .u-cursor-x')];
        return cursors.length > 1 && cursors.slice(0, 2)
          .every(cursor => !cursor.classList.contains('u-off'));
      });
      check(linked, 'hovering one chart did not reveal the linked cursor on another');
      await screenshot(page, 'history-light-hover');

      // Moving elsewhere must report something different, or the readout is
      // static decoration rather than a reading of the point under the cursor.
      const firstText = readout?.text;
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
      await page.waitForTimeout(300);
      const secondText = await page.evaluate(() =>
        document.querySelector('.republic-chart .chart-tooltip')?.innerText.trim());
      check(secondText && secondText !== firstText,
        'the tooltip reported the same values at two different points');

      const fullRanges = await page.locator(
        '.history-chart-host[data-chart-group="republic-history"]').evaluateAll(nodes =>
        nodes.map(node => Number(node.dataset.chartMax) - Number(node.dataset.chartMin)));
      await page.mouse.move(box.x + box.width * .25, box.y + box.height * .5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const zoomed = await page.locator(
        '.history-chart-host[data-chart-group="republic-history"]').evaluateAll(nodes =>
        nodes.map(node => ({
          min: Number(node.dataset.chartMin),
          max: Number(node.dataset.chartMax),
        })));
      // Bigsave has late-game statistics with only 354 days of data. Linked
      // zoom still gives them the shared selected dates; comparing that span
      // with their intrinsic history incorrectly reports a failed gesture.
      check(zoomed.length === fullRanges.length
        && zoomed[0].max - zoomed[0].min < fullRanges[0],
      'drag zoom did not narrow the republic history range',
      JSON.stringify({ fullRanges, zoomed }));
      check(new Set(zoomed.map(range => `${range.min.toFixed(3)}:${range.max.toFixed(3)}`)).size === 1,
        'republic charts did not share one zoom range', JSON.stringify(zoomed.slice(0, 4)));
      await page.mouse.move(box.x + box.width * .45, box.y + box.height * .45);
      await screenshot(page, 'history-zoom-hover');

      const reset = page.locator('.republic-chart .chart-reset.active').first();
      check(await reset.count() > 0, 'zooming revealed no Reset zoom control');
      if (await reset.count()) {
        await reset.click();
        await page.waitForTimeout(300);
      }
      const restored = await page.locator(
        '.history-chart-host[data-chart-group="republic-history"]').evaluateAll(nodes =>
        nodes.map(node => Number(node.dataset.chartMax) - Number(node.dataset.chartMin)));
      check(restored.every((span, index) => span >= fullRanges[index] - 1),
        'Reset zoom did not restore every chart', JSON.stringify({ fullRanges, restored }));

      const firstHost = page.locator(
        '.history-chart-host[data-chart-group="republic-history"]').first();
      const beforeY = await firstHost.evaluate(node =>
        Number(node.dataset.chartYMax) - Number(node.dataset.chartYMin));
      const legend = firstHost.locator('.chart-legend-item').first();
      const beforeVisible = Number(await firstHost.getAttribute('data-visible-series'));
      await legend.click();
      await page.waitForTimeout(300);
      const toggled = await firstHost.evaluate(node => ({
        visible: Number(node.dataset.visibleSeries),
        ySpan: Number(node.dataset.chartYMax) - Number(node.dataset.chartYMin),
      }));
      check(toggled.visible === beforeVisible - 1,
        'a real legend click did not hide its series', JSON.stringify(toggled));
      check(Math.abs(toggled.ySpan - beforeY) > Math.max(1e-9, beforeY * .001),
        'hiding the dominant series did not rescale the chart',
        JSON.stringify({ beforeY, afterY: toggled.ySpan }));
      await screenshot(page, 'history-series-hidden');

      const themeButton = page.locator('.themeswitch').first();
      for (let step = 0; step < 3; step += 1) {
        if (await page.evaluate(() => document.documentElement.dataset.theme === 'dark')) break;
        await themeButton.click();
        await page.waitForTimeout(150);
      }
      await screenshot(page, 'history-dark');
    }
  } else {
    failures.push('no history tab was offered after importing a save');
  }

  await page.locator('.section-tabs button', { hasText: /Diagnose|Diagnose/i }).first().click();
  await page.locator('.context-tabs button', { hasText: /Analysis|Analyse/i }).first().click();
  const virtualTable = page.locator('.virtual-tablewrap').first();
  if (await virtualTable.count()) {
    const tableState = await virtualTable.evaluate(node => ({
      total: Number(node.dataset.virtualTotal),
      mounted: node.querySelectorAll('tbody tr:not(.virtual-spacer)').length,
    }));
    check(tableState.total > tableState.mounted,
      'Analysis mounted every row instead of a visible window', JSON.stringify(tableState));
    await screenshot(page, 'analysis-top');
    await virtualTable.focus();
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(200);
    await screenshot(page, 'analysis-scrolled');
  } else {
    failures.push('Analysis rendered no virtual table');
  }

  if (errors.length) failures.push(`page errors:\n  ${errors.join('\n  ')}`);
  if (unexpectedRequests.length) {
    failures.push(`save page requested a non-local URL:\n  ${[...new Set(unexpectedRequests)].join('\n  ')}`);
  }
} catch (error) {
  failures.push(`the run could not complete: ${error?.stack ?? error}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`FAIL (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('ok: save imported, map painted, charts readable');
