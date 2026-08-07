import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');

test('LowTech research renders imported save values instead of only plan defaults', () => {
  assert.match(app, /lowTechSaveValues\(/);
  assert.match(app, /lowTechDisplayValues\(/);
  assert.match(app, /state\.planning\?\.evidence\?\.gameDate/);
  assert.match(app, /saveValues\.startYear/);
  assert.match(app, /ltHistoryStart/);
  assert.equal((i18n.match(/ltHistoryStart:/g) ?? []).length, 2);
});
