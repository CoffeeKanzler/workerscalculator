import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

async function expectAssumptionsOpen(context) {
  const details = page.locator('details.planner-assumptions');
  await details.waitFor({ timeout: 30_000 });
  if (!await details.evaluate(node => node.open)) {
    throw new Error(`Plan assumptions closed after ${context}`);
  }
}

try {
  await page.goto(`${BASE}#/production`, { waitUntil: 'load' });
  const productionAssumptions = page.locator('details.planner-assumptions');
  await productionAssumptions.locator(':scope > summary').click();
  await expectAssumptionsOpen('opening the production disclosure');

  await productionAssumptions.locator('input[type="checkbox"]').click();
  await expectAssumptionsOpen('clicking a production assumption');

  await productionAssumptions.locator('input[type="number"]').last().fill('2');
  await page.waitForTimeout(50);
  await expectAssumptionsOpen('editing a production assumption');

  await page.goto(`${BASE}#/city`, { waitUntil: 'load' });
  const cityAssumptions = page.locator('details.planner-assumptions');
  if (!await cityAssumptions.evaluate(node => node.open)) {
    await cityAssumptions.locator(':scope > summary').click();
  }
  await cityAssumptions.locator('input[type="checkbox"]').click();
  await expectAssumptionsOpen('clicking a city assumption');

  await cityAssumptions.locator('input[type="number"]').first().fill('90');
  await page.keyboard.press('Tab');
  await expectAssumptionsOpen('editing a city assumption');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: Plan assumptions stay open after clicks and edits in both planners');
} finally {
  await browser.close();
}
