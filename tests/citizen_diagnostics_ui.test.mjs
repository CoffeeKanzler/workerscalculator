import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('Cities exposes searchable save-grounded housing pressure diagnostics', async () => {
  const [app, i18n, css] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8'),
  ]);
  const renderCities = app.slice(
    app.indexOf('function renderCities()'),
    app.indexOf('function renderCity()'),
  );

  assert.match(renderCities, /state\.saveImport\?\.citizenDiagnostics\?\.areas/);
  assert.match(renderCities, /filterCitizenDiagnostics/);
  assert.match(renderCities, /data-citizen-diagnostics/);
  assert.match(renderCities, /type: 'search'/);
  assert.match(renderCities, /adultSpaceBalance/);
  assert.match(renderCities, /approachingAdulthood/);
  assert.match(renderCities, /vacantCompletedResidences/);
  assert.match(renderCities, /occupiedUnknownCapacityResidences/);
  assert.equal((i18n.match(/citizenDiagnosticsTitle:/g) ?? []).length, 2);
  assert.equal((i18n.match(/housingPressureHint:/g) ?? []).length, 2);
  assert.match(css, /\.citizen-diagnostics/);
});
