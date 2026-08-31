import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

try {
  await page.goto(`${BASE}#/city`, { waitUntil: 'load' });
  const assumptions = page.locator('details.planner-assumptions');
  await assumptions.waitFor({ timeout: 30_000 });
  await assumptions.locator(':scope > summary').click();
  const name = page.locator('details.planner-assumptions input[type="text"]').first();
  await name.fill('Refresh-safe city');
  await page.keyboard.press('Tab');

  // Reload immediately: this deliberately lands inside the heavier 400ms
  // observation debounce that used to take the city plan down with it.
  await page.reload({ waitUntil: 'load' });
  await page.locator('details.planner-assumptions').waitFor({ timeout: 30_000 });
  const restored = await page.locator(
    'details.planner-assumptions input[type="text"]',
  ).first().inputValue();
  if (restored !== 'Refresh-safe city') {
    throw new Error(`city planning was lost on immediate reload: ${JSON.stringify(restored)}`);
  }
  console.log('ok: city planning survives an immediate refresh');
} finally {
  await browser.close();
}
