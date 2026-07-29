import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/tests/access_graph.html';
const output = process.env.WORKERS_SCREENSHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 15_000 });
  const graph = page.locator('.worker-access-graph');
  if (await graph.getAttribute('data-access-node-count') !== '7') {
    throw new Error('the exact access corridor did not render all fixture nodes');
  }
  const workplace = page.locator('[data-access-node="mill"]');
  await workplace.focus();
  await page.keyboard.press('Enter');
  if (await workplace.getAttribute('aria-pressed') !== 'true') {
    throw new Error('keyboard selection did not reach the workplace');
  }
  const inspector = page.locator('[data-access-inspector]');
  if (!(await inspector.innerText()).includes('≤ 72')) {
    throw new Error('the inspector omitted the theoretical worker upper bound');
  }
  if (!(await inspector.innerText()).includes('ride · ≤72')) {
    throw new Error('the inspector omitted the access bottleneck');
  }
  await inspector.getByRole('button', { name: 'Locate on map' }).click();
  if (await page.locator('body').getAttribute('data-located-building') !== '801') {
    throw new Error('map synchronization did not receive the selected building');
  }
  const unavailable = page.locator('[data-access-unavailable="missing"]');
  if (await unavailable.count() !== 1) {
    throw new Error('missing walking evidence did not produce a specific unavailable state');
  }
  if (errors.length) throw new Error(errors.join('\n'));

  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, 'worker-access-light.png'),
      fullPage: true,
    });
    await page.locator('#theme').click();
    await page.screenshot({
      path: path.join(output, 'worker-access-dark.png'),
      fullPage: true,
    });
  }
  console.log('ok: bounded access graph, keyboard selection, bottleneck, and map synchronization');
} finally {
  await browser.close();
}
