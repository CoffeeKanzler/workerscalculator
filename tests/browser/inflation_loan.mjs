import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const LIGHT_SCREENSHOT = process.argv[3] ?? '/tmp/workers-inflation-loans-light.png';
const DARK_SCREENSHOT = process.argv[4] ?? '/tmp/workers-inflation-loans-dark.png';

const priceRecord = (year, base, purchase, sell, baseUSD = 10) => `$STAT_RECORD
$DATE_YEAR ${year}
$DATE_DAY 0
$Economy_BaseRUB
food ${base}
steel ${base * 4}
$Economy_BaseUSD
food ${baseUSD}
steel ${baseUSD * 4}
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

const zeroCoverageStats = [
  priceRecord(1980, 0, 100, 90, 0),
  priceRecord(1981, 0, 110, 95, 0),
  loan(1, 5, 100000),
].join('\n');

const noLoanStats = [
  priceRecord(1980, 100, 100, 90),
  priceRecord(1981, 108, 120, 92),
  priceRecord(1982, 116.64, 126, 99),
  priceRecord(1983, 125.9712, 130, 105),
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

async function selectShortRepublicHistoryRange(page) {
  await page.locator('.section-tabs button', { hasText: 'Observe' }).first().click();
  await page.locator('.context-tabs button', { hasText: 'History' }).first().click();
  await page.waitForSelector('.history-section .chart-controls');
  await page.locator('.history-section .chart-controls button', { hasText: 'Month' }).click();
  await page.waitForFunction(() => document.querySelector(
    '.history-section .chart-controls button.active')?.textContent.trim() === 'Month');
}

async function setDisclosureOpen(page, details, open) {
  const isOpen = await details.getAttribute('open') !== null;
  if (isOpen !== open) await details.locator(':scope > summary').click();
  const selector = await details.evaluate(node => {
    if (!node.id) node.id = `browser-disclosure-${Math.random().toString(36).slice(2)}`;
    return `#${node.id}`;
  });
  await page.waitForFunction(({ selector: target, expected }) =>
    Boolean(document.querySelector(target)?.open) === expected, {
    selector,
    expected: open,
  });
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
  await selectShortRepublicHistoryRange(page);
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
  const creditCards = page.locator('.active-credit-card .credit-ledger-card');
  if (await creditCards.count() !== 2) {
    throw new Error(`both active currencies were not rendered: ${await creditCards.count()} cards`);
  }
  const rubCard = page.locator('.active-credit-card .credit-ledger-card[data-credit-currency="RUB"]');
  const usdCard = page.locator('.active-credit-card .credit-ledger-card[data-credit-currency="USD"]');
  if (await rubCard.count() !== 1 || await usdCard.count() !== 1) {
    throw new Error('the active-credit cards do not expose their own RUB/USD currencies');
  }
  const rubText = await rubCard.innerText();
  const usdText = await usdCard.innerText();
  if (!rubText.includes('Inflation exceeds credit costs') || !rubText.includes('₽')) {
    throw new Error(`RUB credit did not use RUB inflation and amounts: ${rubText}`);
  }
  if (!usdText.includes('Credit costs clearly exceed inflation') || !usdText.includes('$')) {
    throw new Error(`USD credit did not use USD inflation and amounts: ${usdText}`);
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
  const statusText = await page.locator('.credit-data-status').innerText();
  for (const expected of ['entered calculation', 'stats.ini inflation', 'forecast evidence unavailable']) {
    if (!statusText.includes(expected)) {
      throw new Error(`stats-only provenance omitted ${expected}: ${statusText}`);
    }
  }
  if (statusText.includes('save-derived forecast') || statusText.includes('imported-save evidence')) {
    throw new Error(`stats-only provenance claims imported save evidence: ${statusText}`);
  }
  const electronics = page.locator('details.credit-electronics-disclosure');
  const electronicsSummary = await electronics.locator(':scope > summary').innerText();
  if (!/used-market offers from an imported save are required/i.test(electronicsSummary)) {
    throw new Error(`closed electronics summary omitted the used-market requirement: ${electronicsSummary}`);
  }
  await setDisclosureOpen(page, electronics, true);
  const electronicsEmpty = await electronics.locator('.empty-state').innerText();
  if (!/used-market offers from an imported save are required/i.test(electronicsEmpty)
      || /No relevant loan-financed electronics strategy/i.test(electronicsEmpty)) {
    throw new Error(`expanded electronics conflated missing offers with a losing evaluation: ${electronicsEmpty}`);
  }
  await setDisclosureOpen(page, electronics, false);
  console.log('browser: mixed-credit facts, stats-only provenance, and missing-offer state verified');

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

  await page.locator('.credit-calculator-controls label', { hasText: 'Currency' })
    .locator('select').selectOption('USD');
  await page.waitForFunction(() => document.querySelectorAll(
    '.active-credit-card .credit-ledger-card').length === 2);
  if (await page.locator('.active-credit-card [data-credit-currency="RUB"]').count() !== 1
      || await page.locator('.active-credit-card [data-credit-currency="USD"]').count() !== 1) {
    throw new Error('changing calculator currency hid an active contract');
  }

  const allHistory = page.locator('details.credit-history-disclosure');
  await setDisclosureOpen(page, allHistory, true);
  if (await allHistory.locator('.republic-chart').count() !== 1
      || await allHistory.locator('.empty-state').count()) {
    throw new Error('Credits inherited the hidden one-month history range instead of using all records');
  }
  await setDisclosureOpen(page, allHistory, false);
  console.log('browser: calculator currency isolation and all-history Credits evidence verified');

  await setResolvedTheme(page, 'light');
  await capture(page, LIGHT_SCREENSHOT);
  await setResolvedTheme(page, 'dark');
  await capture(page, DARK_SCREENSHOT);
  console.log(`browser: desktop screenshots captured: ${LIGHT_SCREENSHOT}, ${DARK_SCREENSHOT}`);

  await loadStats(page, 'one-record-credit-stats.ini', oneRecordStats);
  await openCredits(page);
  const history = page.locator('details.credit-history-disclosure');
  await setDisclosureOpen(page, history, true);
  const emptyMessage = await history.locator('.empty-state').innerText();
  if (!/Import a stats\.ini with multiple dated price records/i.test(emptyMessage)) {
    throw new Error(`one-record history omitted the actionable stats.ini message: ${emptyMessage}`);
  }
  if (await history.locator('.credit-history-values, .metric-card, .republic-chart').count()) {
    throw new Error('one-record history rendered inflation value/chart cards instead of the empty state');
  }
  console.log('browser: one-record history shows the actionable stats.ini empty state without dash cards');

  await setDisclosureOpen(page, history, false);
  await loadStats(page, 'zero-coverage-credit-stats.ini', zeroCoverageStats);
  await openCredits(page);
  const zeroCoverageVerdict = await page.locator('.credit-calculator .credit-verdict-strip').innerText();
  if (!/General price development is unavailable/i.test(zeroCoverageVerdict)) {
    throw new Error(`zero-coverage records became inflation evidence: ${zeroCoverageVerdict}`);
  }
  const zeroCoverageHistory = page.locator('details.credit-history-disclosure');
  await setDisclosureOpen(page, zeroCoverageHistory, true);
  if (!await zeroCoverageHistory.locator('.empty-state').count()
      || await zeroCoverageHistory.locator('.republic-chart').count()) {
    throw new Error('zero-coverage history rendered finite inflation evidence');
  }
  const zeroCoverageAssessment = page.locator('details.credit-assessment-disclosure');
  await setDisclosureOpen(page, zeroCoverageAssessment, true);
  const zeroCoverageAssessmentText = await zeroCoverageAssessment.innerText();
  if (!/General price development is unavailable/i.test(zeroCoverageAssessmentText)
      || /\d(?:[.,]\d+)?\s*%/.test(zeroCoverageAssessmentText)) {
    throw new Error(`zero-coverage active-credit assessment leaked finite rates: ${zeroCoverageAssessmentText}`);
  }
  console.log('browser: two dated zero-coverage records remain unavailable across all credit evidence');

  await setDisclosureOpen(page, zeroCoverageAssessment, false);
  await setDisclosureOpen(page, zeroCoverageHistory, false);
  await loadStats(page, 'no-active-credit-stats.ini', noLoanStats);
  await openCredits(page);
  if (await page.locator('.active-credit-card .credit-ledger-card').count()
      || await page.locator('.active-credit-ledger-head').count()) {
    throw new Error('no-contract state retained an orphan active-credit header');
  }
  const noCreditText = await page.locator('.active-credit-card .empty-state').innerText();
  if (!/No active loans/i.test(noCreditText)) {
    throw new Error(`no-contract state omitted its single empty message: ${noCreditText}`);
  }
  console.log('browser: no-contract state has one message and no orphan ledger header');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: mixed credits, evidence states, all-history scope, provenance, and empty states verified');
} finally {
  await browser.close();
}
