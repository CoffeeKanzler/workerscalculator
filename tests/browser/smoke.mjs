// Does the app boot, and does every tab render without throwing?
//
// This is deliberately save-less. Real saves are 150 MB to 1 GB and gitignored,
// so nothing here can import one. What it can catch is the class of failure
// that repeatedly looked like something else:
//
//   - a module whose ?v= marker moved without its export landing, which left
//     the page showing nothing but its loading glyph
//   - a render that throws part-way through building a tab, which leaves the
//     previous tab on screen and reads to a user as a dead button
//   - an unhandled error in an empty state, where there is no save to hide it
//
// Run: node tests/browser/smoke.mjs [baseUrl]
// Exits non-zero on the first failure, with the page error that caused it.

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';

const SECTIONS = ['Observe', 'Diagnose', 'Plan', 'Compare'];

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exitCode = 1;
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  // The shell replaces its loading glyph once the data files resolve.
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });

  if (errors.length) {
    fail('the page raised errors while booting', errors.join('\n'));
  }

  let visited = 0;
  for (const section of SECTIONS) {
    await page.locator('.section-tabs button', { hasText: section }).first().click();
    await page.waitForTimeout(250);

    const tabs = await page.locator('.context-tabs button').allInnerTexts();
    if (!tabs.length) fail(`section ${section} offered no tabs`);

    for (const tab of tabs) {
      const before = errors.length;
      await page.locator('.context-tabs button', { hasText: tab }).first().click();
      // Every tab renders a section element; if the render threw part-way, the
      // previous tab's content is what stays on screen.
      await page.waitForSelector('section', { timeout: 15_000 });
      await page.waitForTimeout(120);
      visited += 1;
      if (errors.length > before) {
        fail(`tab "${tab}" (${section}) raised an error`, errors.slice(before).join('\n'));
      }
    }
  }

  // The theme is applied to the document root, so a broken toggle is invisible
  // to a render check but obvious here.
  const themeButton = page.locator('.themeswitch').first();
  if (await themeButton.count()) {
    const seen = new Set();
    for (let step = 0; step < 3; step += 1) {
      seen.add(await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme') ?? 'auto'));
      await themeButton.click();
      await page.waitForTimeout(200);
    }
    if (seen.size < 2) fail('the theme toggle did not change the document theme');
  }

  if (process.exitCode) {
    console.error(`\nvisited ${visited} tab(s) before failing`);
  } else {
    console.log(`ok: booted and rendered ${visited} tabs with no page errors`);
  }
} catch (error) {
  fail('the smoke run could not complete', String(error?.stack ?? error));
} finally {
  await browser.close();
}
