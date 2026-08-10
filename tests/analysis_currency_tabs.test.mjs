import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { sectionForTab, tabsForSection } from '../js/ui/command_center.js';
import { STRINGS } from '../js/i18n.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('price analysis exposes explicit RUB and USD tabs in Plan', () => {
  assert.deepEqual(
    tabsForSection('plan').filter(tab => tab.startsWith('analysis')),
    ['analysisRUB', 'analysisUSD'],
  );
  assert.equal(sectionForTab('analysisRUB'), 'plan');
  assert.equal(sectionForTab('analysisUSD'), 'plan');
  assert.equal(sectionForTab('analysis'), 'plan');
});

test('the shipped app dispatches both price-analysis currency tabs', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);

  for (const tab of ['analysisRUB', 'analysisUSD']) {
    assert.match(app, new RegExp(`TABS = \\[[\\s\\S]*'${tab}'`), `TABS is missing ${tab}`);
    assert.match(app, new RegExp(`case '${tab}': return renderAnalysis\\(`), `no dispatch for ${tab}`);
  }
  for (const key of ['tabAnalysisRUB', 'tabAnalysisUSD']) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});

test('analysis rows and labels use the selected analysis currency', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const renderAnalysis = app.slice(
    app.indexOf('function renderAnalysis('),
    app.indexOf('\nfunction renderVehicleProduction('),
  );

  assert.match(renderAnalysis, /function renderAnalysis\(currency = state\.currency\)/);
  assert.match(renderAnalysis, /buildingProfit\(b, currency,/);
  assert.match(renderAnalysis, /buildCost\(b, currency\)/);
  assert.match(renderAnalysis, /currencySymbol\(currency\)/);
});

test('analysis lets profit per worker use resident or guest-worker costs', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  const renderAnalysis = app.slice(
    app.indexOf('function renderAnalysis('),
    app.indexOf('\nfunction renderVehicleProduction('),
  );

  assert.match(renderAnalysis, /state\.analysisWorkerType/);
  assert.match(renderAnalysis, /profitPerWorkerAfterLabor/);
  assert.match(renderAnalysis, /workerCostForType/);
  assert.match(renderAnalysis, /workerResident/);
  assert.match(renderAnalysis, /workerGuest/);
  assert.match(renderAnalysis, /workerNoDirectCost/);
  for (const key of ['workerType', 'workerResident', 'workerGuest', 'workerNoDirectCost']) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});
