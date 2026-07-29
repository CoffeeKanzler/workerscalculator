import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/tests/time_series_chart.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 15_000 });
  const plots = page.locator('.uplot');
  if (await plots.count() !== 2) throw new Error('expected two mounted uPlot charts');

  const firstPlot = plots.first();
  const box = await firstPlot.boundingBox();
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .5);
  await page.waitForTimeout(250);

  const hover = await page.evaluate(() => ({
    tooltip: document.querySelector('#chart-a .chart-tooltip')?.innerText.trim() ?? '',
    linkedCursor: !document.querySelector('#chart-b .u-cursor-x')?.classList.contains('u-off'),
    tooltipLeft: document.querySelector('#chart-a .chart-tooltip')?.getBoundingClientRect().left ?? 0,
    chartLeft: document.querySelector('#chart-a')?.getBoundingClientRect().left ?? 0,
  }));
  if (!hover.tooltip.includes('Adults')) throw new Error('hover tooltip omitted the visible series');
  if (!hover.linkedCursor) throw new Error('the second chart cursor did not follow the first');
  if (hover.tooltipLeft < hover.chartLeft + 100) {
    throw new Error('the hover card stayed pinned to the chart edge instead of following the cursor');
  }

  const over = firstPlot.locator('.u-over');
  const overBox = await over.boundingBox();
  await page.mouse.move(overBox.x + overBox.width * .2, overBox.y + overBox.height * .5);
  await page.mouse.down();
  await page.mouse.move(overBox.x + overBox.width * .65, overBox.y + overBox.height * .5,
    { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const zoomed = await page.evaluate(() => window.testCharts.map(({ plot }) => ({
    min: plot.scales.x.min,
    max: plot.scales.x.max,
  })));
  if (zoomed.some(range => range.max - range.min >= 190)) {
    throw new Error(`drag zoom did not narrow both charts: ${JSON.stringify(zoomed)}`);
  }
  const exposedZoom = await page.locator('.history-chart-host').evaluateAll(nodes =>
    nodes.map(node => Number(node.dataset.chartMax) - Number(node.dataset.chartMin)));
  if (exposedZoom.some(span => !(span < 190))) {
    throw new Error(`mounted charts did not expose their zoom range: ${exposedZoom}`);
  }

  await page.locator('#chart-a .chart-reset').click();
  await page.waitForTimeout(250);
  const reset = await page.evaluate(() => window.testCharts.map(({ plot }) =>
    plot.scales.x.max - plot.scales.x.min));
  if (reset.some(span => span < 199)) throw new Error(`reset did not restore both charts: ${reset}`);

  const legend = page.locator('#chart-a .chart-legend-item').first();
  await legend.click();
  if (await legend.getAttribute('aria-pressed') !== 'false') {
    throw new Error('a real legend click did not hide its series');
  }
  if (await page.locator('#chart-a').getAttribute('data-visible-series') !== '1') {
    throw new Error('the mounted chart did not expose its visible-series count');
  }

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: chart hover, linked cursor, zoom, reset, and legend toggle');
} finally {
  await browser.close();
}
