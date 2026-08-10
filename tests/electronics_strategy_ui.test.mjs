import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

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
