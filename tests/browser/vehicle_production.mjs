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
  await page.waitForTimeout(150);

  const planTextBeforeFilter = await planTable.innerText();
  if (!/Russo-Balt D24\/40/.test(planTextBeforeFilter)) {
    throw new Error('the selected D24/40 row did not render');
  }
  if (!/Stahl|Steel/.test(planTextBeforeFilter)) {
    throw new Error('the selected D24/40 row did not render its material line');
  }

  const decade = page.locator('.vehicle-recommendation-decade');
  const decadeValues = await decade.locator('option').evaluateAll(options => options.map(option => option.value));
  if (!decadeValues.includes('all') || !decadeValues.includes('1900') || !decadeValues.includes('1940')) {
    throw new Error(`decade options are incomplete: ${decadeValues.join(', ')}`);
  }
  await decade.selectOption('1940');
  await page.waitForTimeout(150);
  if ((await planTable.innerText()) !== planTextBeforeFilter) {
    throw new Error('decade filtering changed the existing production-plan row');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: D24/40 material row and decade recommendation filter work in the browser');
} finally {
  await browser.close();
}
