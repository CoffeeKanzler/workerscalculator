import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('price analysis defaults to cash purchase cost and retains opportunity cost', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  const analysis = app.slice(
    app.indexOf('function renderAnalysis('),
    app.indexOf('\nfunction renderVehicleProduction('),
  );

  assert.match(app, /analysisCostBasis: 'purchase'/);
  assert.match(analysis, /state\.analysisCostBasis === 'opportunity'/);
  assert.match(analysis, /buildingProfit\(b, currency, 1, 1, 1, costBasis\)/);
  assert.match(analysis, /\[\['purchase', t\('costBasisPurchase'\)\], \['opportunity', t\('costBasisOpportunity'\)\]\]/);
  for (const key of [
    'costBasis', 'costBasisPurchase', 'costBasisOpportunity',
    'costBasisPurchaseHint', 'costBasisOpportunityHint',
  ]) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});
