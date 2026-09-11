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
  await row.locator('select').nth(0).selectOption({ label: 'Polizei' });
  const building = row.locator('select').nth(1);
  const medium = building.locator('option').filter({
    hasText: 'Polizeirevier (25 Helfer + 25 Polizisten) [DLC]',
  }).first();
  const label = await medium.textContent();
  if (!label?.includes('50 Arb.') || !label.includes('25 Kap.')) {
    throw new Error(`early police label is incomplete: ${label}`);
  }
  const value = await medium.getAttribute('value');
  if (!value) throw new Error('25 plus 25 early police station has no selectable value');
  await building.selectOption(value);
  await page.waitForTimeout(300);
  if (!/50/.test(await row.innerText())) {
    throw new Error('selected early police station does not show 50 total staff');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: the 25 plus 25 early DLC police station is selectable in Stadtplanung');
} finally {
  await browser.close();
}
