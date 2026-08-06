import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('scrap profit UI keeps the legacy table and exposes both border targets', async () => {
  const [app, i18n, runtimeConfig] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/runtime/runtime_config.js'), 'utf8'),
  ]);
  assert.match(app, /rankUsedMarketBorderRoutes/);
  assert.match(app, /function renderLegacyScrapProfitTable/);
  assert.match(app, /RUNTIME_CONFIG\.scrapProfitTable === 'legacy'/);
  assert.match(app, /targetBorder/);
  assert.match(app, /targetCurrency/);
  assert.match(app, /fleetScrap.*Profit/);
  assert.match(app, /'RUB'/);
  assert.match(app, /'USD'/);
  assert.equal((i18n.match(/fleetScrapBorderHeading:/g) ?? []).length, 2);
  assert.equal((i18n.match(/fleetScrapWorthBuying:/g) ?? []).length, 2);
  assert.match(runtimeConfig, /scrapProfitTable/);

  const legacyStart = app.indexOf('function renderLegacyScrapProfitTable');
  const renderLogistics = app.indexOf('function renderLogistics');
  assert.ok(legacyStart >= 0 && legacyStart < renderLogistics, 'legacy renderer should be extracted before logistics');
  const legacy = app.slice(legacyStart, renderLogistics);
  assert.match(legacy, /cur\(\)/);
  assert.match(legacy, /fleetScrapBuyPrice/);
});
