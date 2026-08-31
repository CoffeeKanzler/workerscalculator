// The reset must clear the app's local data without deleting an IndexedDB that
// the current page still has open. Deleting it used to race the reload and left
// the next boot waiting until the whole browser was restarted.

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.evaluate(async () => {
    localStorage.setItem('reset-test', 'present');
    sessionStorage.setItem('reset-test', 'present');
    const request = indexedDB.open('wr-planner', 2);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['snapshots', 'planning'], 'readwrite');
    transaction.objectStore('snapshots').put({ name: 'reset-test' });
    transaction.objectStore('planning').put({ key: 'reset-test', value: true });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.locator('.section-tabs button', { hasText: /Compare|Vergleichen/i }).click();
  await page.locator('.context-tabs button', { hasText: /Save import|Spielstand/i }).click();
  await page.locator('.stored-data-reset summary').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-stored-data-reset]').click();
  await page.waitForURL(url => url.searchParams.has('reset'), { timeout: 15_000 });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });

  const remaining = await page.evaluate(async () => {
    const request = indexedDB.open('wr-planner', 2);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['snapshots', 'planning'], 'readonly');
    const count = name => new Promise((resolve, reject) => {
      const result = transaction.objectStore(name).count();
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    });
    const result = {
      snapshots: await count('snapshots'),
      planning: await count('planning'),
      local: localStorage.getItem('reset-test'),
      session: sessionStorage.getItem('reset-test'),
    };
    database.close();
    return result;
  });

  if (JSON.stringify(remaining) !== JSON.stringify({ snapshots: 0, planning: 0, local: null, session: null })) {
    throw new Error(`stored data remained after reset: ${JSON.stringify(remaining)}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('ok: stored data reset cleared data and rebooted without a browser restart');
} finally {
  await browser.close();
}
