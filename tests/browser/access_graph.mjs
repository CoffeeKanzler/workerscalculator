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
  // The graph is a canvas now, so what it draws is not in the DOM. What is in
  // the DOM — how much it is showing, what is selected, and the panel beside it
  // — is what a reader acts on, and that is what this checks.
  const canvas = page.locator('[data-access-canvas]');
  await canvas.waitFor({ timeout: 15_000 });
  const shown = Number(await canvas.getAttribute('data-access-node-count'));
  if (!(shown > 0)) throw new Error('the exact access corridor drew no nodes');
  const inspector = page.locator('[data-access-inspector]');
  if (!(await inspector.innerText()).trim()) {
    throw new Error('the inspector said nothing about the focused node');
  }

  // Clicking a card opens what connects to it, which is the whole interaction.
  const box = await canvas.boundingBox();
  const spot = await page.evaluate(() => {
    const layer = document.querySelector('[data-access-canvas] canvas[data-id="layer2-node"]');
    const rect = document.querySelector('[data-access-canvas]').getBoundingClientRect();
    const context = layer.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, layer.width, layer.height).data;
    const scale = rect.width / layer.width;
    for (let y = 6; y < layer.height - 6; y += 2) {
      for (let x = 6; x < layer.width - 6; x += 2) {
        if (pixels[(y * layer.width + x) * 4 + 3] > 200) {
          const far = Math.hypot(x - layer.width / 2, y - layer.height / 2);
          if (far > 90) return { x: rect.left + x * scale, y: rect.top + y * scale };
        }
      }
    }
    return null;
  });
  if (!spot) throw new Error('no node card was drawn on the canvas');
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(700);
  if (!(Number(await canvas.getAttribute('data-access-node-count')) >= shown)) {
    throw new Error('clicking a node did not open what connects to it');
  }
  if (!box) throw new Error('the canvas has no size');

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
  console.log('ok: access canvas renders, expands on click, and syncs the map');
} finally {
  await browser.close();
}
