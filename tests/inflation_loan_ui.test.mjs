import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

const requiredCreditCopy = [
  'creditDataStatusTitle', 'creditActivePositionTitle', 'creditNewCalculatorTitle',
  'creditTotalRepayment', 'creditAdditionalCost', 'creditMaximumDailyPayment',
  'creditExpectedRealRate', 'creditInflationExceeds', 'creditCostsSimilar',
  'creditCostsExceed', 'creditInflationUnavailable', 'creditAssessmentDetails',
  'creditHistoryNeedsStats',
];

test('credit tab renders normal, import, and export inflation with saved loan decisions', async () => {
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
  assert.match(app, /function renderCredits\(\)/);
  assert.match(app, /case 'credits': return renderCredits\(\)/);
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

test('plain-language credit burden and insufficient-history labels are translated in both languages', async () => {
  const i18n = await fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8');

  for (const key of requiredCreditCopy) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});

test('history visibility follows the selected range and inflation series', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const start = app.indexOf('function renderCreditHistoryEvidence(');
  const end = app.indexOf('\nfunction ', start + 1);
  const history = app.slice(start, end);

  assert.match(app,
    /const visibleInflationSufficient = Number\.isFinite\(visibleSummary\.latestAnnual\)/,
    'history sufficiency must be derived from the selected visible index summary');
  assert.doesNotMatch(history, /hypotheticalSummary\.hasInflationEvidence/,
    'history must not reuse the all-history base-series credit verdict gate');
  assert.match(history, /context\.visibleInflationSufficient\s*\?\s*renderRepublicLineChart/,
    'an insufficient selected series must show the actionable history state instead of a chart');
  assert.match(history, /context\.visibleInflationSufficient\s*\?\s*el\('dl'/,
    'an insufficient selected series must not render dash history metrics');
});
