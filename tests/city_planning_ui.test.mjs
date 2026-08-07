import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('city planning exposes the category quick-start and productivity scenarios', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  assert.match(app, /addMissingCityCategoryRows/);
  assert.match(app, /evaluateCityProductivityScenarios/);
  assert.match(app, /worstCaseProductivity/);
  assert.match(app, /cityCoreCategories/);
  assert.match(app, /cityProductivityWorstCase/);
  assert.match(app, /requiredProductivity/);
  assert.match(app, /worstCaseUtilization/);
  assert.match(app, /cityWorkshopBuildings/);
  assert.match(app, /resolveCityWorkshopRows/);
  assert.match(app, /city\.workshops/);
  assert.match(app, /cityWorkshopSection/);
  assert.match(app, /workshopWorkers/);
  assert.equal((i18n.match(/cityCoreCategories:/g) ?? []).length, 2);
  assert.equal((i18n.match(/cityProductivityWorstCase:/g) ?? []).length, 2);
  assert.equal((i18n.match(/cityRequiredProductivity:/g) ?? []).length, 2);
  assert.equal((i18n.match(/cityWorkshopSection:/g) ?? []).length, 2);
  assert.equal((i18n.match(/cityWorkshopUnavailable:/g) ?? []).length, 2);
});
