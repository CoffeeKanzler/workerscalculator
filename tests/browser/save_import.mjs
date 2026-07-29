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


const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
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

    const canvas = page.locator('svg.republic-map');
    check(await canvas.count() > 0, 'the map rendered no svg');

    // The map sits below the fold on a desktop viewport, and synthetic mouse
    // events at coordinates outside the viewport silently go nowhere — which
    // reads exactly like a broken handler.
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const painted = await page.evaluate(() =>
      document.querySelectorAll('svg.republic-map [data-map-kind]').length);
    check(painted > 500, `the map drew almost no markers (${painted})`);

    // The categories are what make the map readable rather than a field of
    // identical dots, so a map where everything is 'other' is a failure even
    // though it draws perfectly well.
    const categories = await page.evaluate(() => {
      const counts = {};
      for (const marker of document.querySelectorAll('svg.republic-map [data-map-category]')) {
        const key = marker.dataset.mapCategory;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    });
    const total = Object.values(categories).reduce((sum, n) => sum + n, 0);
    check((categories.other ?? 0) / total < 0.15,
      `${categories.other ?? 0} of ${total} markers are uncategorised: `
      + JSON.stringify(categories));

    // The filter reaches the canvas through the draw now, not by hiding
    // elements, so a filter that changes nothing means it is wired wrong.
    const filterInput = page.locator('.map-controls input[type=search], .map-controls input[type=text]').first();
    if (await filterInput.count()) {
      await filterInput.fill('zzzznotathing');
      await page.waitForTimeout(600);
      const afterFilter = await page.evaluate(() =>
        [...document.querySelectorAll('svg.republic-map [data-map-kind]')]
          .filter(marker => marker.style.display !== 'none').length);
      check(afterFilter < painted,
        `a filter matching nothing left the map unchanged (${painted} then ${afterFilter})`);
      await filterInput.fill('');
      await page.waitForTimeout(400);
    }

    // Markers must sit inside the area the map draws. This is what a canvas
    // overlay got wrong for days: it painted them 227px from their roads while
    // every count and every click still looked correct.
    const inside = await page.evaluate(() => {
      const svg = document.querySelector('svg.republic-map');
      const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      let checked = 0;
      let outside = 0;
      for (const marker of svg.querySelectorAll('.map-buildings [data-map-kind]')) {
        const points = marker.getAttribute('points');
        const [px, py] = points ? points.split(' ')[0].split(',').map(Number) : [];
        const x = points ? px : Number(marker.getAttribute('cx') ?? marker.getAttribute('x'));
        const y = points ? py : Number(marker.getAttribute('cy') ?? marker.getAttribute('y'));
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        checked += 1;
        if (x < vx - vw || x > vx + 2 * vw || y < vy - vh || y > vy + 2 * vh) outside += 1;
      }
      return { checked, outside };
    });
    check(inside.checked > 0, 'no marker geometry could be read');
    check(inside.outside === 0,
      `${inside.outside} of ${inside.checked} markers are nowhere near the mapped area`);

    // Camera controls.
    const viewBox = () => page.evaluate(() =>
      document.querySelector('svg.republic-map')?.getAttribute('viewBox') ?? null);
    const box = await canvas.boundingBox();
    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;

    const beforeZoom = await viewBox();
    await page.mouse.move(centreX, centreY);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(900);
    const afterZoom = await viewBox();
    check(afterZoom && afterZoom !== beforeZoom, 'the wheel did not zoom the map');

    await page.mouse.move(centreX, centreY);
    await page.mouse.down();
    await page.mouse.move(centreX - 220, centreY - 140, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    check(await viewBox() !== afterZoom, 'dragging did not pan the map');

    // A pan ends in a click on the canvas, which must not also select whatever
    // building the pointer happened to finish over.
    const selectedAfterDrag = await page.evaluate(() =>
      !document.querySelector('.map-building-inspector.empty'));
    check(!selectedAfterDrag, 'panning the map selected a building');

    // Clicking a marker opens the inspector. The marker element is clicked
    // rather than a guessed coordinate: markers are a few pixels across, and a
    // near miss reads identically to a broken handler.
    // A real mouse click, not a dispatched one. Dispatching bypasses pointer
    // capture, and pointer capture is precisely what broke this: the svg
    // captured the pointer on press, the browser retargeted the click to the
    // svg, and no marker ever saw it. A dispatched click passed throughout.
    const spot = await page.evaluate(() => {
      for (const marker of document.querySelectorAll(
        'svg.republic-map .map-buildings [data-map-kind="building"]')) {
        const rect = marker.getBoundingClientRect();
        if (rect.width <= 0) continue;
        if (rect.top < 60 || rect.bottom > window.innerHeight - 20) continue;
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        // Markers overlap heavily; only click one nothing else covers.
        if (document.elementFromPoint(x, y) !== marker) continue;
        return { x, y };
      }
      return null;
    });
    check(spot, 'no unobstructed building marker was visible to click');
    if (spot) {
      await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(700);
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
  } else {
    failures.push('no map tab was offered after importing a save');
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
      check(zoomed.length === fullRanges.length
        && zoomed.every((range, index) => range.max - range.min < fullRanges[index]),
      'drag zoom did not narrow every republic chart', JSON.stringify({ fullRanges, zoomed }));
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
