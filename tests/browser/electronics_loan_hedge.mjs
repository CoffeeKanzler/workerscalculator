import { chromium } from 'playwright';

const SAVE = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:8765/index.html';
const SCREENSHOT = process.argv[4] ?? '/tmp/workers-electronics-loan-hedge.png';
if (!SAVE) throw new Error('usage: electronics_loan_hedge.mjs <save-dir> [base-url] [screenshot]');

const resources = {
  workers: 10, steel: 100, plastics: 220, fabric: 180,
  mcomponents: 300, ecomponents: 550, boards: 90,
  waste_steel: 20, waste_other: -5, eletronics: 1000,
};
const block = (heading, factor) => `${heading}\n${Object.entries(resources)
  .map(([key, value]) => `${key} ${value * factor}`).join('\n')}`;
const record = (year, electronicsSell) => {
  const ratio = electronicsSell / resources.eletronics;
  return `$STAT_RECORD
$DATE_YEAR ${year}
$DATE_DAY 1
${block('$Economy_BaseRUB', ratio)}
${block('$Economy_BaseUSD', ratio / 10)}
${block('$Economy_PurchaseCostRUB', ratio * 1.15)}
${block('$Economy_PurchaseCostUSD', ratio * 0.115)}
${block('$Economy_SellCostRUB', ratio)}
${block('$Economy_SellCostUSD', ratio / 10)}
$end`;
};
const stats = [
  record(2000, 1000), record(2001, 1120), record(2002, 1288), record(2003, 1481.2),
  `$LoanStart
$YearInterestRate 5
$YearInterestRatePenalty 10
$LoanType 1
$LoanSubType 3
$CurrentDurationDays 730
$CurrentAmount 100000
$CurrentAmountForPenalty 0
$Stat_InitialAmount 100000
$Stat_ContractDurationDays 730
$Stat_PaidAmount 0`,
].join('\n');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.setInputFiles('.importpicker input[type=file]', [SAVE]);
  await page.waitForFunction(() => document.body.innerText.length > 2000
    && !document.querySelector('.start-hero') && !document.querySelector('.import-spinner'),
  null, { timeout: 600_000 });
  console.log('browser: real save and used market imported');

  await page.locator('.section-tabs button', { hasText: 'Observe' }).first().click();
  await page.locator('.context-tabs button', { hasText: 'Prices' }).first().click();
  await page.locator('#fileInput').setInputFiles({
    name: 'electronics-loan-stats.ini', mimeType: 'text/plain', buffer: Buffer.from(stats),
  });
  await page.waitForFunction(() => document.querySelector('.dropzone')
    ?.textContent.includes('electronics-loan-stats.ini'));
  console.log('browser: controlled loan and electronics history loaded');

  await page.locator('.section-tabs button', { hasText: 'Observe' }).first().click();
  await page.locator('.context-tabs button', { hasText: 'Credits' }).first().click();
  await page.waitForSelector('.credit-center');
  const strategy = page.locator('.credit-center');
  if (await strategy.locator('.credit-investment-table tbody tr').count() < 1) {
    throw new Error('real used market produced no electronics ship trade row');
  }
  const text = await strategy.innerText();
  for (const expected of ['River cargo ship', 'Holding time', 'Amortization corridor']) {
    if (!text.includes(expected)) throw new Error(`strategy is missing ${expected}`);
  }
  if (await strategy.locator('.credit-investment-table .loan-recommendation').count() < 1) {
    throw new Error('the controlled profitable path received no direct assessment');
  }
  if (text.includes('Robust') || text.includes('Speculative')) throw new Error('legacy labels remain visible');
  await page.locator('.themeswitch').click();
  await page.locator('.themeswitch').click();
  if (await page.locator('.themeswitch').getAttribute('data-theme-resolved') !== 'dark') {
    throw new Error('the electronics strategy was not exercised in dark mode');
  }
  await strategy.scrollIntoViewIfNeeded();
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`ok: real used ship, dynamic recipes, electronics history, and loan decision rendered; ${SCREENSHOT}`);
} finally {
  await browser.close();
}
