import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

const totalRows = async () => Number(await page.locator('.virtual-tablewrap')
  .getAttribute('data-virtual-total'));

async function searchFor(query) {
  const search = page.locator('.analysis-filterbar input[type="search"]');
  await search.fill(query);
  await page.waitForTimeout(80);
  return totalRows();
}

async function assertExcludedBuildingsStayHidden(dataset) {
  for (const query of [
    'Müllbehandlungsanlage', 'Müllverbrennung', 'Wasserbrunnen', 'Klärwerk', 'Heizwerk',
  ]) {
    const count = await searchFor(query);
    if (count !== 0) throw new Error(`${dataset} analysis still shows ${count} row(s) for ${query}`);
  }
  await searchFor('');
}

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.locator('.langswitch button', { hasText: 'DE' }).click();
  await page.locator('.section-tabs button', { hasText: /Plan|Planen/i }).first().click();
  await page.locator('.context-tabs button', { hasText: /Price analysis ₽|Preisanalyse ₽/i }).first().click();

  const filter = page.locator('select.analysis-resource-select');
  if (!await filter.count()) throw new Error('produced-resource filter is missing');

  const optionLabels = await filter.locator('option').allTextContents();
  for (const excludedResource of ['Wasser', 'Heißwasser', 'Asche']) {
    if (optionLabels.includes(excludedResource)) {
      throw new Error(`resource filter still offers excluded output ${excludedResource}`);
    }
  }
  if (!optionLabels.includes('Stahl') || !optionLabels.includes('Fleisch')) {
    throw new Error(`resource filter is missing tradable outputs: ${JSON.stringify(optionLabels)}`);
  }

  await assertExcludedBuildingsStayHidden('game');

  await filter.selectOption({ label: 'Stahl' });
  if (await searchFor('Stahlwerk') < 1) throw new Error('steel filter hides the steel mill');
  await filter.selectOption({ label: 'Fleisch' });
  if (await totalRows() !== 0) throw new Error('resource filter does not combine with building search');
  await searchFor('');
  await filter.selectOption('all');

  const dataset = page.locator('header select').filter({ has: page.locator('option[value="sheet"]') });
  await dataset.selectOption('sheet');
  await page.waitForTimeout(100);
  await assertExcludedBuildingsStayHidden('sheet');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: price analysis filters produced resources and hides non-tradable utility/waste rows');
} finally {
  await browser.close();
}
