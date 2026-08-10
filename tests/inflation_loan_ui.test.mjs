import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('history renders normal, import, and export inflation with saved loan decisions', async () => {
  const [app, i18n, css] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8'),
  ]);

  assert.match(app, /buildPriceIndex/);
  assert.match(app, /evaluateLoanScenarios/);
  assert.match(app, /historyCurrency: 'RUB'/);
  assert.match(app, /historyInflationBasis: 'base'/);
  assert.match(app, /\[\['base', t\('inflationNormal'\)\], \['purchase', t\('inflationImport'\)\], \['sell', t\('inflationExport'\)\]\]/);
  assert.match(app, /buildPriceIndex\(state\.statsRecords, \{ currency, basis: 'base' \}\)/);
  assert.match(app, /renderEconomicDecisionSurface\(historyRecords\)/);
  assert.match(app, /state\.activeLoans\.filter/);
  assert.match(css, /\.economic-decision-strip/);
  assert.match(css, /\.loan-decision-table/);

  for (const key of [
    'economicDecisionTitle', 'economicDecisionHint', 'inflationCurrency', 'inflationSeries',
    'inflationNormal', 'inflationImport', 'inflationExport', 'inflationLatestAnnual',
    'inflationFiveYear', 'inflationAllHistory', 'inflationIndex', 'inflationCoverage',
    'loanDecisionTitle', 'loanDecisionHint', 'noActiveLoans', 'loanPrincipal', 'loanDays',
    'loanApr', 'loanEffectiveRate', 'loanRealBase', 'loanRealBest', 'loanRealWorst',
    'loanNominalPaid', 'loanMaxDailyPayment', 'loanRecommendation', 'loanFavorable',
    'loanTight', 'loanRisky', 'normalInflationLoanEvidence', 'marketInflationRiskHint',
  ]) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});
