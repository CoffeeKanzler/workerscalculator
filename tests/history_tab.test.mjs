import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { sectionForTab, tabsForSection } from '../js/ui/command_center.js';
import { STRINGS } from '../js/i18n.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

// The republic history was already built — twelve charts covering births and
// deaths, migration, education, electronics ownership, longevity, crime, loans
// and per-resource trade. It was collapsed by default at the bottom of the
// republic overview, 92% of the way down the page, behind a summary reading
// "Republic-wide stats.ini history". Forty years of a save's history is not a
// footnote to another tab.
test('history is a first-class Observe tab', () => {
  assert.equal(sectionForTab('history'), 'observe');
  assert.deepEqual(tabsForSection('observe'),
    ['home', 'republic', 'map', 'cities', 'history', 'prices']);
});

test('the history tab is named in both languages', () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    assert.ok(table.tabHistory, `${lang} is missing tabHistory`);
  }
});

test('the shipped app registers and renders the history tab', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');

  assert.match(app, /TABS = \[[\s\S]*'history'/);
  assert.match(app, /case 'history': return renderRepublicHistory\(\)/);
  assert.match(app, /history: 'tabHistory'/);
});

test('the charts moved out of the republic overview rather than being duplicated', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');

  // Exactly one place builds them, and it is the new tab.
  assert.equal((app.match(/renderRepublicLineChart\(t\('citizenHistory'\)/g) ?? []).length, 1);
  assert.match(app, /function renderRepublicHistory\(\)/);

  // The overview must no longer hide them behind a collapsed disclosure.
  const republic = app.slice(app.indexOf('function renderRepublic()'));
  const body = republic.slice(0, republic.indexOf('\nfunction '));
  assert.doesNotMatch(body, /details', \{ class: 'history-section/);
});

test('the overview still points at the history instead of dropping it', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const republic = app.slice(app.indexOf('function renderRepublic()'));
  const body = republic.slice(0, republic.indexOf('\nfunction '));

  // Someone reading the overview should still be able to find the history.
  assert.match(body, /state\.tab = 'history'/);
});

test('the history tab renders its charts expanded, not behind a disclosure', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const start = app.indexOf('function renderRepublicHistory()');
  const fn = app.slice(start, app.indexOf('\nfunction ', start + 10));

  assert.doesNotMatch(fn, /el\('details'/);
  assert.match(fn, /chart-grid/);
});
