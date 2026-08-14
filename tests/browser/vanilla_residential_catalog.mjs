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
  const type = row.locator('select').nth(0);
  await type.selectOption({ label: 'Mittlere Wohnhäuser' });
  const building = row.locator('select').nth(1);
  const option = building.locator('option').filter({ hasText: '68' }).first();
  const label = await option.textContent();
  if (!label || !label.includes('85% Wohnqualität')) {
    throw new Error(`prefab2 label is incomplete: ${label}`);
  }
  const value = await option.getAttribute('value');
  if (!value) throw new Error('prefab2 has no selectable value');
  await building.selectOption(value);
  await page.waitForTimeout(300);
  const text = await row.innerText();
  if (!/68/.test(text) || !/85\s*%/.test(text)) throw new Error(`selected row is wrong: ${text}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: the 68-person 85-percent vanilla prefab is selectable under medium residences');
} finally {
  await browser.close();
}
