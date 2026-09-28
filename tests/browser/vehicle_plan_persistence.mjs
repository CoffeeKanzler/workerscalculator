// A vehicle-production plan has to survive the pool being rebuilt, and a
// re-extraction does rebuild it: the game files are the pool's authority, and
// naming the DLC vehicles added 264 of them, which moved 321 vehicles that
// already had a row. The app used to resolve a row by its index alone and then
// overwrite the stored index, so every saved plan quietly started describing a
// different truck.
//
// Drives the real tab: stores a row, reorders the pool underneath it, reloads,
// and checks the row still names the vehicle that was chosen.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8000/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(`${BASE}#/vehicleprod`, { waitUntil: 'load' });
  await page.waitForSelector('.section-tabs button', { timeout: 30_000 });
  await page.waitForSelector('.vehicle-recommendation-decade', { timeout: 30_000 });

  const planTable = page.locator('section table.data').nth(1);
  const typeSelect = planTable.locator('tbody tr').first().locator('select').nth(0);
  await typeSelect.selectOption({ label: 'LKW' });
  const vehicleSelect = planTable.locator('tbody tr').first().locator('select').nth(1);
  const chosen = 'Skd 706R Covered';
  const value = await vehicleSelect.locator('option')
    .filter({ hasText: chosen }).first().getAttribute('value');
  if (!value) throw new Error(`${chosen} is not in the LKW choices`);
  await vehicleSelect.selectOption(value);
  await page.waitForTimeout(500);

  // The plan lives in IndexedDB, not localStorage, so read it from there.
  const stored = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('wr-planner');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = [...db.objectStoreNames];
      if (!names.length) { resolve(null); return; }
      const store = db.transaction(names[0], 'readonly').objectStore(names[0]);
      const read = store.getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => resolve(read.result);
    };
  }));
  const rows = (stored ?? []).flatMap(entry =>
    entry?.vehicleProduction?.rows ?? entry?.planning?.vehicleProduction?.rows ?? []);
  if (!rows.length) {
    throw new Error(`no persisted vehicle production row: ${JSON.stringify(stored).slice(0, 300)}`);
  }
  const row = rows[0];
  if (!row.vehicleRef) {
    throw new Error(`the plan row stores no stable reference: ${JSON.stringify(row)}`);
  }
  console.log('stored row:', JSON.stringify(row));

  // Reproduce the state a re-extraction leaves behind: the row's index now
  // names a different vehicle of the same type, because the pool was rebuilt
  // around it. Writing that index back into the persisted plan is exactly what
  // the old build did to every user who had a row.
  const displaced = await page.evaluate(async (original) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('wr-planner');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const name = [...db.objectStoreNames][0];
    const store = db.transaction(name, 'readwrite').objectStore(name);
    const all = await new Promise((resolve, reject) => {
      const read = store.getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    let touched = null;
    for (const entry of all) {
      const rows = entry?.vehicleProduction?.rows ?? entry?.planning?.vehicleProduction?.rows;
      if (!rows?.length) continue;
      for (const planRow of rows) {
        if (planRow.vehicleRef !== original.vehicleRef) continue;
        // A different index that still lands on the same type, so a build that
        // resolves by index accepts it as a valid match instead of noticing.
        planRow.vehicleIndex = original.vehicleIndex === 0 ? 1 : original.vehicleIndex - 1;
        touched = { ref: planRow.vehicleRef, index: planRow.vehicleIndex };
      }
      store.put(entry);
    }
    await new Promise(resolve => {
      const flush = db.transaction(name, 'readonly');
      flush.oncomplete = () => resolve();
      flush.onerror = () => resolve();
    });
    return touched;
  }, row);
  if (!displaced) throw new Error('could not displace the stored index');
  console.log('row after simulating a re-extraction:', JSON.stringify(displaced));

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.vehicle-recommendation-decade', { timeout: 30_000 });
  const after = await planTable.locator('tbody tr').first().innerText();
  if (!after.includes(chosen)) {
    throw new Error(`after reload the row shows:\n${after.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  const selection = await planTable.locator('tbody tr').first().locator('select').nth(1)
    .inputValue();
  if (selection !== value) {
    throw new Error(`the row selected index ${selection}, expected ${value}`);
  }
  if ((await planTable.innerText()).includes('no longer exists')) {
    throw new Error('a row that still resolves was flagged as rematched');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`ok: the plan row survived a reload still naming ${chosen}`);
} finally {
  await browser.close();
}
