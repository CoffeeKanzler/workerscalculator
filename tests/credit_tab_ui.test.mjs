import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must be a dedicated Credits section renderer`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function assertDirectFactsContainer(source, { name, sectionClass, factsClass, copyKeys, factKeys }) {
  const body = functionBody(source, name);
  const sectionStart = body.indexOf(`class: '${sectionClass}'`);
  const factsStart = body.indexOf(`class: '${factsClass}'`);

  assert.match(body, new RegExp(
    `return\\s+el\\('(?:section|div)',\\s*\\{\\s*class:\\s*'${sectionClass}'`),
    `${name} must directly return its visible primary section`);
  assert.ok(factsStart > sectionStart,
    `${name} must directly construct a ${factsClass} container inside its primary section`);
  assert.match(body.slice(factsStart), /el\('(strong|output|span)'/,
    `${name} must directly construct visible metric or output nodes in ${factsClass}`);

  for (const key of copyKeys) {
    const position = body.indexOf(`t('${key}')`);
    assert.ok(position > sectionStart,
      `${name} must render ${key} directly in its ${sectionClass} primary section`);
  }
  for (const key of factKeys) {
    const position = body.indexOf(`t('${key}')`);
    assert.ok(position > factsStart,
      `${name} must render ${key} in its direct ${factsClass} output container`);
  }
}

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

test('credits keeps current facts visible before progressively disclosed experiments and evidence', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const credits = functionBody(app, 'renderCredits');
  const sectionNames = [
    'renderCreditDataStatus',
    'renderActiveCreditPosition',
    'renderNewCreditCalculator',
    'renderOptionalElectronicsStrategy',
    'renderCreditHistoryEvidence',
  ];
  const positions = sectionNames.map(name => credits.indexOf(`${name}(`));

  assert.ok(positions.every(position => position >= 0),
    'renderCredits must compose the five dedicated sections');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions,
    'current credit facts must precede the optional electronics experiment and history evidence');
  assert.doesNotMatch(app, /t\('creditTakeLoanAction'\)/,
    'no Credits renderer may present an imperative borrowing recommendation');

  assertDirectFactsContainer(app, {
    name: 'renderCreditDataStatus', sectionClass: 'credit-data-status',
    factsClass: 'credit-data-status-facts',
    copyKeys: ['creditDataStatusTitle', 'creditForecastEvidence'],
    factKeys: ['creditForecastEvidence'],
  });
  assertDirectFactsContainer(app, {
    name: 'renderActiveCreditPosition', sectionClass: 'active-credit-card',
    factsClass: 'active-credit-facts',
    copyKeys: ['creditActivePositionTitle', 'creditTotalRepayment', 'creditMaximumDailyPayment',
      'creditExpectedRealRate'],
    factKeys: ['creditTotalRepayment', 'creditMaximumDailyPayment', 'creditExpectedRealRate'],
  });
  assertDirectFactsContainer(app, {
    name: 'renderNewCreditCalculator', sectionClass: 'credit-calculator',
    factsClass: 'credit-calculator-results',
    copyKeys: ['creditNewCalculatorTitle', 'creditAmount', 'creditTotalRepayment', 'creditAdditionalCost',
      'creditMaximumDailyPayment', 'creditExpectedRealRate'],
    factKeys: ['creditTotalRepayment', 'creditAdditionalCost', 'creditMaximumDailyPayment',
      'creditExpectedRealRate'],
  });
});
