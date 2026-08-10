import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const SAVE = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:8765/index.html';
const LIGHT_SCREENSHOT = process.argv[4] ?? '/tmp/workers-electronics-loan-hedge-light.png';
const DARK_SCREENSHOT = process.argv[5] ?? '/tmp/workers-electronics-loan-hedge-dark.png';
if (!SAVE) {
  throw new Error('usage: electronics_loan_hedge.mjs <save-dir> [base-url] [light-screenshot] [dark-screenshot]');
}

const resources = {
  workers: 10, steel: 100, plastics: 220, fabric: 180,
  mcomponents: 300, ecomponents: 550, boards: 90, chemicals: 340, gravel: 45,
  waste_steel: 20, waste_other: -5, eletronics: 1000,
};
const block = (heading, factor) => `${heading}\n${Object.entries(resources)
  .map(([key, value]) => `${key} ${value * factor}`).join('\n')}`;
const record = (year, electronicsSell) => {
  const ratio = electronicsSell / resources.eletronics;
  return `$STAT_RECORD
$DATE_YEAR ${year}
$DATE_DAY 1
$Economy_WorkdayCostRUB ${10 * ratio}
$Economy_WorkdayCostUSD ${ratio}
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

const normalizeDisplay = text => text.replace(/(\d),(\d)/g, '$1.$2')
  .replace(/\s+/g, ' ').trim();
const integerFromLocaleAmount = text => Number([...text]
  .filter(character => /\d/.test(character)).join(''));

async function definitionValue(page, listSelector, label) {
  return page.locator(`${listSelector} > div`).evaluateAll((rows, expectedLabel) => {
    const row = rows.find(candidate => candidate.querySelector(':scope > dt')
      ?.textContent.trim() === expectedLabel);
    return row?.querySelector(':scope > dd')?.textContent.trim() ?? null;
  }, label);
}

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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.clear();
    const databases = typeof indexedDB.databases === 'function'
      ? await indexedDB.databases() : [];
    await Promise.all(databases.map(database => new Promise(resolve => {
      const request = indexedDB.deleteDatabase(database.name);
      request.onsuccess = request.onerror = request.onblocked = resolve;
    })));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.locator('.start-card.primary-start.importpicker input[type=file]')
    .setInputFiles([SAVE]);
  await page.waitForFunction(() => document.body.innerText.length > 2000
    && !document.querySelector('.start-hero') && !document.querySelector('.import-spinner'),
  null, { timeout: 600_000 });
  console.log(`browser: complete save imported from ${SAVE}`);

  await openPrices(page);
  await page.locator('#fileInput').setInputFiles({
    name: 'electronics-loan-stats.ini', mimeType: 'text/plain', buffer: Buffer.from(stats),
  });
  await page.waitForFunction(() => document.querySelector('.dropzone')
    ?.textContent.includes('electronics-loan-stats.ini'));
  console.log('browser: controlled loan and electronics history loaded');

  await openCredits(page);
  if (await page.locator('details.credit-electronics-disclosure').getAttribute('open') !== null) {
    throw new Error('optional electronics was not initially closed');
  }
  if (await page.locator('details.credit-history-disclosure').getAttribute('open') !== null) {
    throw new Error('history and evidence was not initially closed');
  }
  if (/Take the loan|Kredit aufnehmen/i.test(await page.locator('.credit-center').innerText())) {
    throw new Error('an imperative take-loan action is visible before expansion');
  }

  await page.locator('details.credit-electronics-disclosure > summary').click();
  await page.waitForFunction(() => document.querySelector(
    'details.credit-electronics-disclosure')?.open === true);
  const electronicsText = await page.locator('details.credit-electronics-disclosure').innerText();
  for (const expected of [
    'Experimental long-term forecast, not a general recommendation to borrow.',
    'Under these assumptions, the electronics strategy would be profitable after about',
  ]) {
    if (!electronicsText.includes(expected)) throw new Error(`expanded electronics is missing: ${expected}`);
  }
  const principalText = await definitionValue(page, '.electronics-primary-facts', 'Required loan');
  const expectedHold = normalizeDisplay(await definitionValue(
    page, '.electronics-primary-facts', 'Expected holding time') ?? '');
  const cautiousHold = normalizeDisplay(await definitionValue(
    page, '.electronics-primary-facts', 'Cautious holding time') ?? '');
  const primaryExit = await definitionValue(page, '.electronics-primary-facts', 'Sell in');
  const calculatorAmount = Number(await page.locator(
    '.credit-calculator-controls label', { hasText: 'Credit amount' }).locator('input').inputValue());
  const requiredPrincipal = integerFromLocaleAmount(principalText ?? '');
  if (requiredPrincipal !== 323429 || requiredPrincipal === calculatorAmount
      || calculatorAmount !== 100000) {
    throw new Error(`electronics principal was not distinct from calculator amount: ${JSON.stringify({
      principalText, requiredPrincipal, calculatorAmount,
    })}`);
  }
  if (expectedHold !== '2.6 Years' || cautiousHold !== '3 Years' || primaryExit !== 'RUB') {
    throw new Error(`electronics primary facts do not match the fixture: ${JSON.stringify({
      expectedHold, cautiousHold, primaryExit,
    })}`);
  }
  if (/Take the loan|Kredit aufnehmen|Assembly hall|Montagehalle/i.test(electronicsText)) {
    throw new Error('expanded electronics retains imperative or assembly-hall wording');
  }
  console.log('browser: optional warning, conditional break-even, principal, and holding labels verified');

  await page.locator('details.credit-electronics-assumptions > summary').click();
  await page.waitForFunction(() => document.querySelector(
    'details.credit-electronics-assumptions')?.open === true);
  await page.waitForSelector('details.credit-electronics-assumptions .republic-chart .uplot');
  const assumptionsText = await page.locator('details.credit-electronics-assumptions').innerText();
  if (/Assembly hall|Montagehalle/i.test(assumptionsText)) {
    throw new Error('expanded assumptions retain an Assembly hall/Montagehalle label');
  }
  const alternateExitRows = page.locator(
    'details.credit-electronics-assumptions .credit-investment-table tbody tr');
  if (await alternateExitRows.count() !== 1) {
    throw new Error(`expected exactly one alternate exit row, got ${await alternateExitRows.count()}`);
  }
  const alternateExitCells = (await alternateExitRows.first().locator('td').allInnerTexts())
    .map(normalizeDisplay);
  if (primaryExit !== 'RUB' || alternateExitCells[0] !== 'USD') {
    throw new Error(`primary and alternate exit rows do not match the fixture: ${JSON.stringify({
      primaryExit, alternateExitCells,
    })}`);
  }

  const plotOver = page.locator(
    'details.credit-electronics-assumptions .republic-chart .uplot .u-over').first();
  await plotOver.scrollIntoViewIfNeeded();
  const plotBox = await plotOver.boundingBox();
  if (!plotBox) throw new Error('amortization chart has no pointer target');
  await page.mouse.move(plotBox.x + plotBox.width * .45, plotBox.y + plotBox.height * .55);
  await page.waitForTimeout(300);
  const tooltip = await page.locator(
    'details.credit-electronics-assumptions .chart-tooltip').evaluate(node => ({
    visible: getComputedStyle(node).opacity !== '0',
    text: node.innerText.trim(),
    rows: node.querySelectorAll('.chart-tooltip-row').length,
  }));
  if (!tooltip.visible || tooltip.rows < 3
      || !tooltip.text.includes('Expected assumption')
      || !tooltip.text.includes('Optimistic assumption')
      || !tooltip.text.includes('Cautious assumption')) {
    throw new Error(`amortization hover did not expose all three forecast paths: ${JSON.stringify(tooltip)}`);
  }
  console.log('browser: both exit currencies and chart hover paths verified');

  await setResolvedTheme(page, 'light');
  await page.locator('details.credit-electronics-disclosure').scrollIntoViewIfNeeded();
  await capture(page, LIGHT_SCREENSHOT);
  await setResolvedTheme(page, 'dark');
  if (await page.locator('details.credit-electronics-assumptions').getAttribute('open') === null) {
    throw new Error('theme rerender closed the nested assumptions disclosure');
  }
  await page.waitForSelector('details.credit-electronics-assumptions .republic-chart .uplot');
  await page.locator('details.credit-electronics-disclosure').scrollIntoViewIfNeeded();
  await capture(page, DARK_SCREENSHOT);
  console.log(`browser: desktop screenshots captured: ${LIGHT_SCREENSHOT}, ${DARK_SCREENSHOT}`);

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: real used-market electronics experiment and simplified credit disclosures verified');
} finally {
  await browser.close();
}
