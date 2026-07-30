import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// app.js needs a DOM to import, so the helper is exercised on its own. Extracted
// from the source rather than copied, so the test cannot drift from it.
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = source.indexOf('export function readableSaveType');
const end = source.indexOf('}', source.indexOf('.trim();', start)) + 1;
const file = join(tmpdir(), `readable-save-type-${process.pid}.mjs`);
writeFileSync(file, source.slice(start, end));
const { readableSaveType } = await import(`file://${file}`);
rmSync(file, { force: true });

// A Workshop building the catalogue has never heard of falls back to its saved
// type, and "3564803239/shed" told a reader nothing in an alert that was
// otherwise plain English.
test('a Workshop package id is not a name', () => {
  assert.equal(readableSaveType('3564803239/shed'), 'shed');
  assert.equal(readableSaveType('MIRRORZ_3275043845/piersmall'), 'piersmall');
  assert.equal(readableSaveType('2534548528/tartak'), 'tartak');
});

test('the mirror marker is bookkeeping, not part of the name', () => {
  assert.equal(readableSaveType('MIRRORZ_waste_steelrecycling'), 'waste steelrecycling');
});

test('an ordinary saved type keeps its own words', () => {
  assert.equal(readableSaveType('panelak'), 'panelak');
  assert.equal(readableSaveType('DLC3_repair_station1'), 'DLC3 repair station1');
});

test('nothing at all is not a crash', () => {
  assert.equal(readableSaveType(null), '');
  assert.equal(readableSaveType(undefined), '');
});
