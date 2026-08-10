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

test('credit strategy wires save prices, dynamic recipes, used ships, and future loan paths', async () => {
  const [app, i18n, css, buildings] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8'),
    fs.readFile(path.join(ROOT, 'data/game/buildings_raw.json'), 'utf8'),
  ]);

  assert.match(app, /buildResourcePriceIndex/);
  assert.match(app, /electronicsComponentIndex/);
  assert.match(app, /rankRelevantCreditOpportunities/);
  assert.match(app, /state\.saveImport\?\.usedVehicleOffers/);
  assert.match(app, /amortizationCorridor/);
  assert.match(app, /function renderCredits\(\)/);
  assert.match(css, /\.credit-investment-table/);

  const raw = JSON.parse(buildings);
  for (const id of ['eletronic_factory', 'dlc3/electronics_factory']) {
    const building = raw.find(entry => entry.id === id);
    assert.ok(building?.consumptionIncreaseAccordingYear, `${id} consumption curve`);
    assert.ok(building?.productionDecreaseAccordingYear, `${id} production curve`);
  }

  for (const key of [
    'electronicsStrategyTitle', 'electronicsStrategyHint', 'electronicsBuyNow',
    'electronicsSellNow', 'electronicsLatestExportInflation', 'electronicsCandidateCount',
    'electronicsRecipeVanilla', 'electronicsRecipeDlc3', 'electronicsRecipePressure',
    'electronicsRecipeCaveat', 'electronicsLoanTerms', 'electronicsCapital',
    'electronicsRepayment', 'electronicsBreakEvenZero', 'electronicsCurrentRecovery',
    'electronicsFutureBase', 'electronicsBaseResult', 'electronicsWorstZeroResult',
    'creditAssessmentAdverse', 'creditAssessmentBaseOnly', 'creditNoRelevantElectronics',
    'creditForecastEvidence',
  ]) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});

test('electronics is an optional closed experiment with plain-language production labels', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  const electronics = functionBody(app, 'renderOptionalElectronicsStrategy');
  const history = functionBody(app, 'renderCreditHistoryEvidence');

  assert.match(electronics, /el\('details', \{[^}]*class: 'credit-electronics-disclosure'[^}]*\}/,
    'electronics must be a named native disclosure');
  assert.match(app, /let creditElectronicsOpen = false;/,
    'electronics must start closed before any user toggle');
  assert.match(electronics, /\.\.\.\(creditElectronicsOpen \? \{ open: '' \} : \{\}\)/,
    'electronics must restore its open state after a selector rerender');
  assert.match(electronics,
    /ontoggle: event => \{ creditElectronicsOpen = event\.currentTarget\.open; \}/,
    'electronics must persist user disclosure toggles');
  assert.match(electronics,
    /el\('summary',\s*\{\},\s*el\('span',\s*\{\},\s*t\('electronicsOptionalTitle'\)\)/,
    'the optional electronics title must remain in the visible disclosure summary');
  assert.match(history, /el\('details', \{[^}]*class: 'credit-history-disclosure'[^}]*\}/,
    'history evidence must be a named native disclosure');
  assert.match(app, /let creditHistoryOpen = false;/,
    'history evidence must start closed before any user toggle');
  assert.match(history, /\.\.\.\(creditHistoryOpen \? \{ open: '' \} : \{\}\)/,
    'history evidence must restore its open state after a selector rerender');
  assert.match(history,
    /ontoggle: event => \{ creditHistoryOpen = event\.currentTarget\.open; \}/,
    'history evidence must persist user disclosure toggles');
  assert.match(electronics, /t\('electronicsProductionChain'\)/,
    'the optional experiment must visibly name its production-chain selector');
  assert.match(electronics, /\['vanilla', t\('electronicsProductionChainVanilla'\)\]/,
    'the optional experiment must visibly offer the standard production chain');
  assert.match(electronics, /\['dlc3', t\('electronicsProductionChainDlc3'\)\]/,
    'the optional experiment must visibly offer the DLC production chain');
  assert.match(app, /let creditElectronicsAssumptionsOpen = false;/,
    'nested assumptions must start closed');
  assert.match(electronics,
    /\.\.\.\(creditElectronicsAssumptionsOpen \? \{ open: '' \} : \{\}\)/,
    'nested assumptions must restore its open state after a theme rerender');
  assert.match(electronics,
    /ontoggle: event => \{ creditElectronicsAssumptionsOpen = event\.currentTarget\.open; \}/,
    'nested assumptions must persist user disclosure toggles');
  assert.match(electronics, /context\.electronicsAvailability\.messageKey/,
    'expanded missing and no-strategy states must use the explicit availability result');
  assert.match(electronics, /electronicsAvailability\.requiresUsedMarket/,
    'the closed summary must expose the used-market requirement when it blocks evaluation');

  for (const key of [
    'electronicsExperimentalWarning', 'electronicsMissingCosts', 'electronicsBreakEvenConditional',
    'electronicsHoldingExpected', 'electronicsHoldingCautious', 'electronicsTradeCaveat',
    'electronicsAssumptionsDetails', 'creditScenarioBase', 'creditScenarioFavorable',
    'creditScenarioAdverse',
  ]) {
    assert.match(electronics, new RegExp(`t\\('${key}'\\)`),
      `${key} must be visible in the optional electronics experiment`);
  }
  assert.match(history, /t\('creditHistoryNeedsStats'\)/,
    'history evidence must tell the user when more stats.ini records are needed');

  for (const key of [
    'electronicsOptionalTitle', 'electronicsExperimentalWarning', 'electronicsMissingCosts',
    'electronicsBreakEvenConditional', 'electronicsHoldingExpected', 'electronicsHoldingCautious',
    'electronicsAssumptionsDetails', 'electronicsProductionChain',
    'electronicsProductionChainVanilla', 'electronicsProductionChainDlc3', 'electronicsTradeCaveat',
    'creditScenarioBase', 'creditScenarioFavorable', 'creditScenarioAdverse',
    'electronicsNoUsedOffers', 'electronicsNoHistory', 'electronicsNoCompatibleShips',
  ]) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }

  for (const key of ['electronicsProductionChainVanilla', 'electronicsProductionChainDlc3']) {
    const values = i18n.match(new RegExp(`${key}: '([^']*)'`, 'g')) ?? [];
    assert.equal(values.length, 2, `${key} must have a German and English visible value`);
    assert.ok(values.every(value => !/Assembly hall|Montagehalle/.test(value)),
      `${key} must not retain an Assembly hall/Montagehalle label`);
  }

  const caveats = i18n.match(/electronicsTradeCaveat: '([^']*)'/g) ?? [];
  assert.equal(caveats.length, 2, 'the assumptions caveat must exist in both languages');
  assert.ok(caveats.every(value => !/Robust|Speculative|Spekulativ|Recyclingwert|recycling value/i.test(value)),
    'the caveat must not describe removed recommendation classes or current recycling value');
  assert.ok(caveats.every(value => /Erwartete|Expected/.test(value) && /null|zero/i.test(value)),
    'the caveat must describe expected scenarios and the zero ship-residual assumption');
});
