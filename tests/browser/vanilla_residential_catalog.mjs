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

  await plan.locator('tbody tr').first().locator('select').nth(0)
    .selectOption({ label: 'Kleine Wohnhäuser' });
  await page.waitForTimeout(250);
  const smallBuilding = plan.locator('tbody tr').first().locator('select').nth(1);
  const choices = (await smallBuilding.locator('option[value]').evaluateAll(options => options.map(option => ({
    value: option.value, text: option.textContent ?? '',
  })))).filter(option => option.text.includes('20 EW') && option.text.includes('60% Wohnqualität'));
  if (choices.length !== 2) throw new Error(`expected two 60-percent DLC houses, got ${choices.length}`);
  for (const [index, choice] of choices.entries()) {
    if (!choice?.value) throw new Error(`60-percent house ${index + 1} has no selectable option`);
    await smallBuilding.selectOption(choice.value);
    await page.waitForTimeout(250);
    const selected = await row.innerText();
    if (!/20/.test(selected) || !/60\s*%/.test(selected)) {
      throw new Error(`60-percent house ${index + 1} selected the wrong residence: ${selected}`);
    }
    const summary = await page.locator('.totalsbox').filter({ hasText: 'Arbeiterüberschuss' }).first().innerText();
    if (/Einige Bau- oder Versorgungswerte sind nicht verfügbar/.test(summary)) {
      throw new Error(`60-percent house ${index + 1} still marks construction or utility facts unavailable`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: vanilla residences including the two 60-percent DLC houses expose planning facts');
} finally {
  await browser.close();
}
