import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

try {
  await page.goto(`${BASE}#/city`, { waitUntil: 'load' });
  await page.locator('.langswitch button', { hasText: 'DE' }).click();
  const panel = page.locator('.city-services-panel');
  await panel.waitFor({ timeout: 30_000 });
  const layout = await panel.evaluate(element => {
    const wrapper = element.querySelector('.tablewrap');
    const table = element.querySelector('table');
    const headers = [...table.querySelectorAll('th')];
    return {
      wrapperWidth: wrapper.clientWidth,
      tableWidth: table.getBoundingClientRect().width,
      horizontalOverflow: wrapper.scrollWidth - wrapper.clientWidth,
      headersAllowWrapping: headers.every(header => getComputedStyle(header).whiteSpace === 'normal'),
    };
  });

  if (layout.horizontalOverflow > 1) {
    throw new Error(`service table still needs ${layout.horizontalOverflow}px horizontal scrolling`);
  }
  if (layout.tableWidth > layout.wrapperWidth + 1) {
    throw new Error(`service table ${layout.tableWidth}px exceeds its ${layout.wrapperWidth}px panel`);
  }
  if (!layout.headersAllowWrapping) {
    throw new Error('long service headers still force the table width');
  }
  console.log('ok: city service table fits a 1366px screen without horizontal scrolling');
} finally {
  await browser.close();
}
