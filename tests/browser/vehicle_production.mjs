import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(`${BASE}#/vehicleprod`, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.waitForSelector('.vehicle-recommendation-decade', { timeout: 30_000 });

  const tables = page.locator('section table.data');
  if (await tables.count() < 2) throw new Error('vehicle production did not render both tables');
  const planTable = tables.nth(1);
  const typeSelect = planTable.locator('tbody tr').first().locator('select').nth(0);
  await typeSelect.selectOption({ label: 'LKW' });
  const vehicleSelect = planTable.locator('tbody tr').first().locator('select').nth(1);
  const d24Option = vehicleSelect.locator('option').filter({ hasText: 'Russo-Balt D24/40' }).first();
  const d24Value = await d24Option.getAttribute('value');
  if (!d24Value) throw new Error('D24/40 is missing from the LKW vehicle choices');
  await vehicleSelect.selectOption(d24Value);
  await page.waitForTimeout(550);

  const planTextBeforeFilter = await planTable.innerText();
  if (!/Russo-Balt D24\/40/.test(planTextBeforeFilter)) {
    throw new Error('the selected D24/40 row did not render');
  }
  if (!/Stahl|Steel/.test(planTextBeforeFilter)) {
    throw new Error('the selected D24/40 row did not render its material line');
  }

  const recommendationTable = page.locator('.recommendations table.data');
  const recommendationNames = async () => recommendationTable.locator('tbody tr').evaluateAll(rows => rows
    .map(row => row.querySelectorAll('td')[1]?.innerText.trim())
    .filter(Boolean));
  const recommendationNamesBeforeFilter = await recommendationNames();
  if (!recommendationNamesBeforeFilter.length) {
    throw new Error('the unfiltered recommendation table did not render any vehicles');
  }
  if (!recommendationNamesBeforeFilter.includes('LH A360')
    || !recommendationNamesBeforeFilter.includes('Vet VA3')) {
    throw new Error(`unexpected unfiltered recommendations: ${recommendationNamesBeforeFilter.join(', ')}`);
  }

  const decade = page.locator('.vehicle-recommendation-decade');
  const decadeValues = await decade.locator('option').evaluateAll(options => options.map(option => option.value));
  if (!decadeValues.includes('all') || !decadeValues.includes('1900') || !decadeValues.includes('1940')) {
    throw new Error(`decade options are incomplete: ${decadeValues.join(', ')}`);
  }
  await decade.selectOption('1940');
  await page.waitForTimeout(550);
  if ((await planTable.innerText()) !== planTextBeforeFilter) {
    throw new Error('decade filtering changed the existing production-plan row');
  }

  const recommendationNamesAfterFilter = await recommendationNames();
  if (!recommendationNamesAfterFilter.length) {
    throw new Error('the 1940 recommendation table unexpectedly became empty');
  }
  if (recommendationNamesAfterFilter.includes('LH A360')
    || !recommendationNamesAfterFilter.includes('Vet VA3')) {
    throw new Error(`1940 availability filtering is incorrect: ${recommendationNamesAfterFilter.join(', ')}`);
  }
  if (recommendationNamesAfterFilter.join('\n') === recommendationNamesBeforeFilter.join('\n')) {
    throw new Error('selecting 1940 did not change recommendation content');
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.vehicle-recommendation-decade', { timeout: 30_000 });
  if (await page.locator('.vehicle-recommendation-decade').inputValue() !== '1940') {
    throw new Error('the selected 1940 decade did not persist after reload');
  }
  if ((await page.locator('.recommendations table.data tbody').innerText()).includes('LH A360')) {
    throw new Error('the persisted 1940 filter did not survive reload');
  }
  if ((await page.locator('section table.data').nth(1).innerText()) !== planTextBeforeFilter) {
    throw new Error('reloading after decade filtering changed the existing production-plan row');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: D24/40 materials, decade recommendation filtering, plan isolation, and persistence work in the browser');
} finally {
  await browser.close();
}
