import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.locator('.section-tabs button', { hasText: /Plan|Planen/i }).first().click();
  await page.locator('.context-tabs button', { hasText: /Price analysis \$|Preisanalyse \$/i }).first().click();

  const usdHeaders = await page.locator('.analysis-table th').allTextContents();
  if (!usdHeaders.some(header => header.includes('$'))) {
    throw new Error(`USD analysis headers missing currency marker: ${JSON.stringify(usdHeaders)}`);
  }

  await page.locator('.context-tabs button', { hasText: /Price analysis ₽|Preisanalyse ₽/i }).first().click();
  const rubHeaders = await page.locator('.analysis-table th').allTextContents();
  if (!rubHeaders.some(header => header.includes('₽'))) {
    throw new Error(`RUB analysis headers missing currency marker: ${JSON.stringify(rubHeaders)}`);
  }

  const viewport = page.locator('.virtual-tablewrap');
  await viewport.waitFor({ state: 'visible', timeout: 10_000 });
  const initial = await viewport.evaluate(node => ({
    total: Number(node.dataset.virtualTotal),
    start: Number(node.dataset.virtualStart),
    mounted: node.querySelectorAll('tbody tr:not(.virtual-spacer)').length,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));
  if (!(initial.total > initial.mounted && initial.mounted > 0)) {
    throw new Error(`rows were not virtualized: ${JSON.stringify(initial)}`);
  }
  if (!(initial.scrollHeight > initial.clientHeight)) {
    throw new Error(`virtual viewport did not preserve full scroll height: ${JSON.stringify(initial)}`);
  }

  await viewport.focus();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(150);
  const afterPageDown = Number(await viewport.getAttribute('data-virtual-start'));
  if (!(afterPageDown > initial.start)) {
    throw new Error(`PageDown did not advance the virtual window: ${initial.start} -> ${afterPageDown}`);
  }
  const sticky = await viewport.evaluate(node => {
    const wrapper = node.getBoundingClientRect();
    const header = node.querySelector('th').getBoundingClientRect();
    return { wrapperTop: wrapper.top, headerTop: header.top };
  });
  if (Math.abs(sticky.headerTop - sticky.wrapperTop) > 2) {
    throw new Error(`header did not stay sticky: ${JSON.stringify(sticky)}`);
  }

  const buildingHeader = page.locator('.analysis-table th').first();
  await buildingHeader.click();
  await page.waitForTimeout(100);
  if (!await page.locator('.analysis-table th.sorted').count()) {
    throw new Error('sorting removed the sorted-column marker');
  }

  const firstCell = page.locator('.analysis-table tbody tr:not(.virtual-spacer) td').first();
  const name = (await firstCell.innerText()).trim().split(/\s+/)[0];
  const search = page.locator('section input[type="search"]').first();
  await search.fill(name);
  await page.waitForTimeout(150);
  const focused = await search.evaluate(node => document.activeElement === node);
  if (!focused) throw new Error('search lost focus during the application re-render');

  const visibleCell = page.locator('.analysis-table tbody tr:not(.virtual-spacer) td').first();
  const box = await visibleCell.boundingBox();
  await page.mouse.click(box.x + Math.min(box.width / 2, 70), box.y + box.height / 2,
    { clickCount: 2, delay: 80 });
  const selected = await page.evaluate(() => window.getSelection().toString().trim());
  if (!selected) throw new Error('visible table text could not be selected with a real double-click');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`ok: ${initial.mounted}/${initial.total} Analysis rows mounted; keyboard, sticky header, sort, search, and selection work`);
} finally {
  await browser.close();
}
