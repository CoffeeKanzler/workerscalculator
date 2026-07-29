import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { sectionForTab, tabsForSection } from '../js/ui/command_center.js';
import { STRINGS } from '../js/i18n.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const app = () => fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');

// The republic overview had grown into six tabs' worth of material behind 65
// collapsed disclosures: 5,453px closed against 13,139px open. Each section
// below answers a different question and now has somewhere of its own.
test('the sliced tab table is what ships', () => {
  assert.deepEqual(tabsForSection('observe'),
    ['home', 'republic', 'map', 'cities', 'history', 'construction', 'logistics', 'prices']);
  assert.deepEqual(tabsForSection('diagnose'), ['analysis', 'environment']);
  assert.deepEqual(tabsForSection('compare'), ['saveimport', 'snapshots', 'help']);
});

test('the moved surfaces resolve to the section that matches their question', () => {
  // What is happening: observation.
  assert.equal(sectionForTab('construction'), 'observe');
  assert.equal(sectionForTab('logistics'), 'observe');
  // What is wrong: diagnosis.
  assert.equal(sectionForTab('environment'), 'diagnose');
  // Versus another save: comparison.
  assert.equal(sectionForTab('snapshots'), 'compare');
});

test('every new tab is named in both languages', async () => {
  for (const key of ['tabConstruction', 'tabLogistics', 'tabEnvironment', 'tabSnapshots']) {
    for (const [lang, table] of Object.entries(STRINGS)) {
      assert.ok(table[key], `${lang} is missing ${key}`);
    }
  }
});

test('the shipped app registers and dispatches each new tab', async () => {
  const source = await app();
  for (const [tab, renderer] of [
    ['construction', 'renderConstruction'],
    ['logistics', 'renderLogistics'],
    ['environment', 'renderEnvironment'],
    ['snapshots', 'renderSnapshots'],
  ]) {
    assert.match(source, new RegExp(`TABS = \\[[\\s\\S]*'${tab}'`), `TABS is missing ${tab}`);
    assert.match(source, new RegExp(`case '${tab}': return ${renderer}\\(\\)`), `no dispatch for ${tab}`);
    assert.match(source, new RegExp(`function ${renderer}\\(\\)`), `${renderer} is not defined`);
  }
});

// Moved, not copied: two renderers building the same thing drift apart.
test('each moved surface is built in exactly one place', async () => {
  const source = await app();
  for (const marker of [
    'activeConstructionProjects\\(state\\.saveImport\\?\\.observedBuildings\\)',
    'const pollutionDiagnostics = state\\.saveImport\\?\\.pollutionDiagnostics',
    'const criminalityOutliers = state\\.saveImport\\?\\.criminalityOutliers',
    'const lineOperations = state\\.saveImport\\?\\.vehicleLines',
  ]) {
    const hits = (source.match(new RegExp(marker, 'g')) ?? []).length;
    assert.equal(hits, 1, `${marker} should be built once, found ${hits}`);
  }
});

test('the overview no longer renders a second copy of the map', async () => {
  const source = await app();
  // The Republic map tab already renders this; the overview drew it again into
  // a collapsed disclosure, paying for 2,170 buildings nobody had opened.
  const hits = (source.match(/renderSchematicRepublicMap\(/g) ?? []).length;
  assert.equal(hits, 2, 'expected one definition and one call, from the map tab only');
  const republic = source.slice(source.indexOf('function renderRepublic()'));
  const body = republic.slice(0, republic.indexOf('\nfunction '));
  assert.doesNotMatch(body, /renderSchematicRepublicMap\(/);
});

test('the overview keeps what someone reads first', async () => {
  const source = await app();
  const republic = source.slice(source.indexOf('function renderRepublic()'));
  const body = republic.slice(0, republic.indexOf('\nfunction '));

  // Identity, the alert list and the area table are the overview.
  assert.match(body, /areaTable/);
  assert.match(body, /republicAlertFilter/);
});
