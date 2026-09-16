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
  const assumptions = page.locator('details.planner-assumptions');
  if (!await assumptions.getAttribute('open')) await assumptions.locator('summary').click();
  await page.getByRole('button', { name: 'Versorgungsdetails anzeigen', exact: true }).click();
  await page.waitForTimeout(300);
  const details = await plan.locator('tbody tr').first().locator('td').allTextContents();
  for (const [column, cell] of [['kW', details[7]], ['Wasser', details[8]],
    ['Warmwasser', details[9]], ['Abfall', details[10]], ['Baukosten', details[11]]]) {
    if (!cell || cell.trim() === '—') throw new Error(`${column} is unavailable for the early police station`);
  }
  const summary = await page.locator('.totalsbox').filter({ hasText: 'Arbeiterüberschuss' }).first().innerText();
  if (/Einige Bau- oder Versorgungswerte sind nicht verfügbar/.test(summary)) {
    throw new Error('the early police station still marks construction or utility facts unavailable');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: the 25 plus 25 early DLC police station shows construction and utility facts');
} finally {
  await browser.close();
}
