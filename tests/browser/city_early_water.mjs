import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(`${BASE}#/city`, { waitUntil: 'load' });
  await page.locator('section').waitFor({ timeout: 30_000 });
  await page.locator('.langswitch button', { hasText: 'DE' }).click();
  let plan = page.locator('section table.data.wide').first();
  if (!await plan.count()) {
    await page.getByRole('button', { name: '+ Gebäude hinzufügen', exact: true }).first().click();
    plan = page.locator('section table.data.wide').first();
  }
  await plan.waitFor({ timeout: 30_000 });
  const row = plan.locator('tbody tr').first();
  await row.locator('select').nth(0).selectOption({ label: 'Sonstiges' });
  const building = row.locator('select').nth(1);
  const labels = await building.locator('option').allTextContents();
  for (const expected of [
    'Wasseraufbereitung (klein) (10 Arbeiter) [DLC]',
    'Wasserbrunnen (groß) (8 Arbeiter) [DLC]',
    'Wasserbrunnen (klein) (5 Arbeiter) [DLC]',
  ]) {
    if (!labels.some(label => label.includes(expected))) {
      throw new Error(`missing city-planner option: ${expected}`);
    }
  }
  const smallWell = building.locator('option').filter({
    hasText: 'Wasserbrunnen (klein) (5 Arbeiter) [DLC]',
  }).first();
  const value = await smallWell.getAttribute('value');
  if (!value) throw new Error('small early water well has no selectable value');
  await building.selectOption(value);
  await page.waitForTimeout(300);
  if (!/5/.test(await row.innerText())) throw new Error('selected early water well does not show five workers');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: all three early DLC water buildings are selectable in Stadtplanung');
} finally {
  await browser.close();
}
