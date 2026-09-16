// Imports a real local save and proves that airplane.bin reaches the visible
// Leaflet taxiway/runway layer. This is intentionally local-only because real
// saves are large, private and gitignored.

import { chromium } from 'playwright';

const SAVE = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:8765/index.html';
if (!SAVE) {
  console.error('usage: node tests/browser/save_runways.mjs <save-dir> [baseUrl]');
  process.exit(2);
}

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
  await page.setInputFiles('.importpicker input[type=file]', [SAVE]);
  await page.waitForFunction(() => document.body.innerText.length > 2000
    && !document.querySelector('.start-hero')
    && !document.querySelector('.import-spinner'), null, { timeout: 600_000 });

  await page.locator('.section-tabs button', { hasText: /Observe|Beobachten/i }).first().click();
  await page.locator('.context-tabs button', { hasText: /Karte|Map/i }).first().click();
  const map = page.locator('.leaflet-republic-map.leaflet-container');
  await map.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  const runwayCount = Number(await map.getAttribute('data-map-runway-count'));
  if (!(runwayCount > 0)) throw new Error(`airplane.bin produced ${runwayCount} runway lines`);

  await page.locator('.map-layer-menu > summary').click();
  const toggle = page.locator('[data-map-layer="runways"]');
  if (!await toggle.isChecked()) throw new Error('the runway layer is not visible by default');
  await toggle.uncheck();
  if (await toggle.isChecked()) throw new Error('the runway layer did not switch off');
  await toggle.check();
  if (!await toggle.isChecked()) throw new Error('the runway layer did not switch back on');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`ok: airplane.bin renders ${runwayCount} taxiway/runway lines and the layer toggle works`);
} finally {
  await browser.close();
}
