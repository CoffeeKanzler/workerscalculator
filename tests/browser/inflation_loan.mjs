import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const LIGHT_SCREENSHOT = process.argv[3] ?? '/tmp/workers-inflation-loans-light.png';
const DARK_SCREENSHOT = process.argv[4] ?? '/tmp/workers-inflation-loans-dark.png';

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

const multiYearStats = [
  priceRecord(1980, 100, 100, 90),
  priceRecord(1981, 108, 120, 92),
  priceRecord(1982, 116.64, 126, 99),
  priceRecord(1983, 125.9712, 130, 105),
  loan(1, 5, 100000),
  loan(2, 4, 25000),
].join('\n');

const oneRecordStats = [
  priceRecord(1983, 125.9712, 130, 105),
  loan(1, 5, 100000),
].join('\n');

const numberFromAmount = text => Number(text.replace(/[^\d-]/g, ''));

async function setResolvedTheme(page, expected) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resolved = await page.locator('.themeswitch').getAttribute('data-theme-resolved');
    if (resolved === expected) return;
    await page.locator('.themeswitch').click();
  }
  throw new Error(`could not switch the page to ${expected} mode`);
}

async function capture(page, screenshotPath) {
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

async function openPrices(page) {
  await page.locator('.section-tabs button', { hasText: 'Observe' }).first().click();
  await page.locator('.context-tabs button', { hasText: 'Prices' }).first().click();
  await page.waitForSelector('#fileInput', { state: 'attached' });
}

async function openCredits(page) {
  await page.locator('.section-tabs button', { hasText: 'Observe' }).first().click();
  await page.locator('.context-tabs button', { hasText: 'Credits' }).first().click();
  await page.waitForSelector('.credit-center');
}

async function loadStats(page, name, contents) {
  await openPrices(page);
  await page.locator('#fileInput').setInputFiles({
    name, mimeType: 'text/plain', buffer: Buffer.from(contents),
  });
  await page.waitForFunction(expected => document.querySelector('.dropzone')
    ?.textContent.includes(expected), name);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  console.log('browser: shell loaded with fresh local state');

  await loadStats(page, 'multi-year-credit-stats.ini', multiYearStats);
  console.log('browser: controlled multi-year stats loaded');
  await openCredits(page);

  const hierarchy = await page.locator('.credit-center').evaluate(center => {
    const current = center.querySelector('.active-credit-card');
    const calculator = center.querySelector('.credit-calculator');
    return {
      currentVisible: Boolean(current && current.getClientRects().length),
      calculatorVisible: Boolean(calculator && calculator.getClientRects().length),
      currentPrecedesCalculator: Boolean(current && calculator
        && (current.compareDocumentPosition(calculator) & Node.DOCUMENT_POSITION_FOLLOWING)),
    };
  });
  if (!hierarchy.currentVisible || !hierarchy.calculatorVisible
      || !hierarchy.currentPrecedesCalculator) {
    throw new Error(`current credit does not visibly precede the calculator: ${JSON.stringify(hierarchy)}`);
  }
  if (await page.locator('.active-credit-card .credit-ledger-card').count() !== 1) {
    throw new Error('the current RUB credit was not rendered as a visible ledger card');
  }
  if (await page.locator('details.credit-electronics-disclosure').getAttribute('open') !== null) {
    throw new Error('optional electronics was not initially closed');
  }
  if (await page.locator('details.credit-history-disclosure').getAttribute('open') !== null) {
    throw new Error('history and evidence was not initially closed');
  }
  const initiallyVisibleText = await page.locator('.credit-center').innerText();
  if (/Take the loan|Kredit aufnehmen/i.test(initiallyVisibleText)) {
    throw new Error('an imperative take-loan action is still visible');
  }
  console.log('browser: current credit, calculator, and closed optional sections verified');

  const repaymentOutput = () => page.locator('.credit-calculator-result-grid output', {
    hasText: 'Total repayment',
  }).locator('strong');
  const additionalCostOutput = () => page.locator('.credit-calculator-result-grid output', {
    hasText: 'Additional credit cost',
  }).locator('strong');
  const initialRepayment = numberFromAmount(await repaymentOutput().innerText());
  const enteredAmount = 200000;
  await page.locator('.credit-calculator-controls label', { hasText: 'Credit amount' })
    .locator('input').click();
  await page.locator('.credit-calculator-controls label', { hasText: 'Credit amount' })
    .locator('input').fill(String(enteredAmount));
  await page.waitForFunction(expected => document.querySelector(
    '.credit-calculator-controls label input')?.value === String(expected), enteredAmount);
  const repayment = numberFromAmount(await repaymentOutput().innerText());
  const additionalCost = numberFromAmount(await additionalCostOutput().innerText());
  if (Math.abs(repayment - initialRepayment * 2) > 2) {
    throw new Error(`calculator repayment did not scale with entered amount: ${initialRepayment} -> ${repayment}`);
  }
  if (Math.abs(repayment - enteredAmount - additionalCost) > 2) {
    throw new Error(`calculator totals are incoherent for ${enteredAmount}: repayment ${repayment}, cost ${additionalCost}`);
  }
  console.log(`browser: calculator amount ${enteredAmount} coherently produced repayment ${repayment}`);

  await setResolvedTheme(page, 'light');
  await capture(page, LIGHT_SCREENSHOT);
  await setResolvedTheme(page, 'dark');
  await capture(page, DARK_SCREENSHOT);
  console.log(`browser: desktop screenshots captured: ${LIGHT_SCREENSHOT}, ${DARK_SCREENSHOT}`);

  await loadStats(page, 'one-record-credit-stats.ini', oneRecordStats);
  await openCredits(page);
  await page.locator('details.credit-history-disclosure > summary').click();
  await page.waitForFunction(() => document.querySelector(
    'details.credit-history-disclosure')?.open === true);
  const history = page.locator('details.credit-history-disclosure');
  const emptyMessage = await history.locator('.empty-state').innerText();
  if (!/Import a stats\.ini with multiple dated price records/i.test(emptyMessage)) {
    throw new Error(`one-record history omitted the actionable stats.ini message: ${emptyMessage}`);
  }
  if (await history.locator('.credit-history-values, .metric-card, .republic-chart').count()) {
    throw new Error('one-record history rendered inflation value/chart cards instead of the empty state');
  }
  console.log('browser: one-record history shows the actionable stats.ini empty state without dash cards');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: simplified credit hierarchy, amount coherence, themes, and empty history verified');
} finally {
  await browser.close();
}
