import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const SCREENSHOT = process.argv[3] ?? '/tmp/workers-inflation-loans.png';

const priceRecord = (year, base, purchase, sell) => `$STAT_RECORD
$DATE_YEAR ${year}
$DATE_DAY 0
$Economy_BaseRUB
food ${base}
steel ${base * 4}
$Economy_BaseUSD
food ${base / 10}
steel ${base * 0.4}
$Economy_PurchaseCostRUB
food ${purchase}
steel ${purchase * 4}
$Economy_PurchaseCostUSD
food ${purchase / 10}
steel ${purchase * 0.4}
$Economy_SellCostRUB
food ${sell}
steel ${sell * 4}
$Economy_SellCostUSD
food ${sell / 10}
steel ${sell * 0.4}
$end`;

const loan = (type, rate, amount) => `$LoanStart
$YearInterestRate ${rate}
$YearInterestRatePenalty ${rate * 2}
$LoanType ${type}
$LoanSubType 3
$CurrentDurationDays 365
$CurrentAmount ${amount}
$CurrentAmountForPenalty 0
$Stat_InitialAmount ${amount}
$Stat_ContractDurationDays 365
$Stat_PaidAmount 0`;

const stats = [
  priceRecord(1980, 100, 100, 90),
  priceRecord(1981, 108, 120, 92),
  priceRecord(1982, 116.64, 126, 99),
  priceRecord(1983, 125.9712, 130, 105),
  loan(1, 5, 100000),
  loan(2, 4, 25000),
].join('\n');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  console.log('browser: shell loaded');
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.locator('.section-tabs button', { hasText: 'Observe' }).click();
  await page.locator('.context-tabs button', { hasText: 'Prices' }).click();
  console.log('browser: prices opened');
  await page.locator('#fileInput').setInputFiles({
    name: 'stats.ini', mimeType: 'text/plain', buffer: Buffer.from(stats),
  });
  await page.waitForFunction(() => document.querySelector('.dropzone')?.textContent.includes('stats.ini'));
  console.log('browser: synthetic stats loaded');
  await page.locator('.section-tabs button', { hasText: 'Observe' }).click();
  await page.locator('.context-tabs button', { hasText: 'History' }).click();
  await page.waitForSelector('.economic-decision-strip');
  console.log('browser: history decision surface opened');

  const controls = page.locator('.economic-decision-controls select');
  if (await controls.nth(0).inputValue() !== 'RUB') throw new Error('RUB was not the default currency');
  if (await controls.nth(1).inputValue() !== 'base') throw new Error('normal inflation was not the default');
  if (await page.locator('.loan-decision-table tbody tr').count() !== 1) {
    throw new Error('the active RUB loan was not rendered');
  }

  await controls.nth(1).selectOption('purchase');
  console.log('browser: import inflation selected');
  await page.waitForFunction(() => document.querySelector('.economic-inflation-panel h3')
    ?.textContent.includes('Import price inflation'));
  const marketHint = await page.locator('.economic-inflation-panel > .hint').innerText();
  if (!marketHint.includes('loan assessment')) throw new Error('market view hid the normal-inflation loan basis');

  await controls.nth(0).selectOption('USD');
  console.log('browser: USD selected');
  await page.waitForFunction(() => document.querySelector('.economic-loan-panel h3')?.textContent.includes('USD'));
  if (await page.locator('.loan-decision-table tbody tr').count() !== 1) {
    throw new Error('the active USD loan was not rendered after switching currency');
  }

  await page.locator('.themeswitch').click();
  await page.locator('.themeswitch').click();
  if (await page.locator('.themeswitch').getAttribute('data-theme-resolved') !== 'dark') {
    throw new Error('the decision surface was not exercised in dark mode');
  }
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`ok: normal/import inflation and RUB/USD loan decisions rendered; screenshot ${SCREENSHOT}`);
} finally {
  await browser.close();
}
