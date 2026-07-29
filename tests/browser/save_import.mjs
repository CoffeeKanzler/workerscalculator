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

const SAVE = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:8765/index.html';

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


const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });

  // A webkitdirectory input takes the directory itself, not a file list.
  await page.setInputFiles('.importpicker input[type=file]', [SAVE]);
  // A large save takes a while to parse; the republic name appearing is the
  // signal that the projection landed.
  await page.waitForSelector('.savebadge, .republic-name, [data-save-loaded]', { timeout: 180_000 })
    .catch(() => {});
  await page.waitForTimeout(4000);

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

    const canvas = page.locator('.map-marker-canvas');
    check(await canvas.count() > 0, 'the map rendered no marker canvas');

    // The map sits below the fold on a desktop viewport, and synthetic mouse
    // events at coordinates outside the viewport silently go nowhere — which
    // reads exactly like a broken handler.
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // A canvas that is present but blank is the failure this is really for:
    // it happened once already, when the first draw ran before layout.
    const painted = await page.evaluate(() => {
      const element = document.querySelector('canvas');
      if (!element) return -1;
      const context = element.getContext('2d');
      const { data } = context.getImageData(0, 0, element.width, element.height);
      let count = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count += 1;
      return count;
    });
    check(painted > 500, `the map canvas is blank (${painted} painted pixels)`);

    // The filter reaches the canvas through the draw now, not by hiding
    // elements, so a filter that changes nothing means it is wired wrong.
    const filterInput = page.locator('.map-controls input[type=search], .map-controls input[type=text]').first();
    if (await filterInput.count()) {
      await filterInput.fill('zzzznotathing');
      await page.waitForTimeout(600);
      const afterFilter = await page.evaluate(() => {
        const element = document.querySelector('canvas');
        const { data } = element.getContext('2d').getImageData(0, 0, element.width, element.height);
        let count = 0;
        for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count += 1;
        return count;
      });
      check(afterFilter < painted,
        `a filter matching nothing left the map unchanged (${painted} then ${afterFilter} pixels)`);
      await filterInput.fill('');
      await page.waitForTimeout(400);
    }

    // Camera controls. The canvas covers the svg the handlers used to live on,
    // so moving markers onto it silently took away wheel zoom and drag panning
    // while leaving the map looking perfectly normal.
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

    // Clicking a marker opens the inspector. Several points are tried because
    // markers are sparse and a given spot may hit empty ground.
    for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.52], [0.55, 0.48], [0.5, 0.45], [0.42, 0.58]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(500);
      const hit = await page.evaluate(() =>
        !document.querySelector('.map-building-inspector.empty'));
      if (hit) break;
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

    const charts = page.locator('.republic-chart .chart');
    const chartCount = await charts.count();
    check(chartCount > 0, 'the history tab drew no charts');

    if (chartCount) {
      const chart = charts.first();
      const box = await chart.boundingBox();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
      await page.waitForTimeout(300);

      const readout = await page.evaluate(() => {
        const tooltip = document.querySelector('.chart-tooltip');
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

      // Moving elsewhere must report something different, or the readout is
      // static decoration rather than a reading of the point under the cursor.
      const firstText = readout?.text;
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
      await page.waitForTimeout(300);
      const secondText = await page.evaluate(() =>
        document.querySelector('.chart-tooltip')?.innerText.trim());
      check(secondText && secondText !== firstText,
        'the tooltip reported the same values at two different points');

      await page.mouse.move(box.x - 40, box.y - 40);
      await page.waitForTimeout(300);
      const hidden = await page.evaluate(() =>
        getComputedStyle(document.querySelector('.chart-tooltip')).opacity === '0');
      check(hidden, 'the tooltip stayed on screen after the pointer left the chart');
    }
  } else {
    failures.push('no history tab was offered after importing a save');
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
