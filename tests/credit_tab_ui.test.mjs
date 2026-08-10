import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('dedicated credit tab owns decisions, relevant investments, and amortization corridor', async () => {
  const [app, navigation, i18n, css] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/ui/command_center.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8'),
  ]);

  assert.match(app, /'history', 'credits', 'construction'/);
  assert.match(app, /credits: 'tabCredits'/);
  assert.match(navigation, /'history', 'credits', 'construction'/);
  assert.match(app, /case 'credits': return renderCredits\(\)/);
  assert.match(app, /function renderCredits\(\)/);
  assert.match(app, /rankRelevantCreditOpportunities/);
  assert.match(app, /amortizationCorridor/);
  assert.match(app, /forecastElectronicsPrices/);
  assert.match(app, /futureExchangePath/);
  assert.doesNotMatch(app.match(/function renderRepublicHistory\(\)[\s\S]*?\n}\n/)?.[0] ?? '',
    /renderEconomicDecisionSurface/);
  assert.match(css, /\.credit-center/);
  assert.match(css, /\.amortization-corridor/);

  for (const key of [
    'tabCredits', 'creditCenterTitle', 'creditCenterHint', 'creditActionTitle',
    'creditActiveContracts', 'creditHypotheticalTitle', 'creditAmount', 'creditTermYears',
    'creditRelevantInvestments', 'creditNoRelevantElectronics', 'creditBreakEvenBase',
    'creditBreakEvenAdverse', 'creditExitCurrency', 'creditAssessmentAdverse',
    'creditAssessmentBaseOnly', 'creditAmortizationTitle', 'creditHistoricalBoundary',
    'creditForecastEvidence', 'creditShipResidualZero', 'creditTakeLoanAction',
    'creditNoLoanAction', 'creditScenarioBase', 'creditScenarioFavorable', 'creditScenarioAdverse',
    'creditHistoricalTitle', 'creditHistoricalBalance', 'creditHistoricalInterest',
    'creditAlternateExits', 'creditRequiredPrincipal', 'loanPenalty', 'creditLoanPreviewHint',
    'creditFinancingTerms', 'creditHypotheticalTerms', 'creditActiveTerms',
  ]) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});
