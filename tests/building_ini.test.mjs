import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const parseBuilding = script => {
  const root = mkdtempSync(join(tmpdir(), 'workers-building-ini-'));
  const path = join(root, 'building.ini');
  writeFileSync(path, script);
  try {
    const source = [
      'import json, sys',
      "sys.path.insert(0, 'tools')",
      'from extract_from_gamefiles import parse_building',
      "print(json.dumps(parse_building(sys.argv[1], keep_all=True)))",
    ].join('; ');
    return JSON.parse(execFileSync('python3', ['-c', source, path], { encoding: 'utf8' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('building parser keeps year-dependent production recipe directives', () => {
  const building = parseBuilding(`
$TYPE_FACTORY
$WORKERS_NEEDED 150
$PRODUCTION eletronic 0.03
$CONSUMPTION ecomponents 0.01
$CONSUMPTION_INCREASE_ACCORDING_YEAR 1960 100 2.0
$PRODUCTION_DECREASE_ACCORDING_YEAR 1960 110 0.3
`);

  assert.deepEqual(building.consumptionIncreaseAccordingYear, {
    startYear: 1960,
    yearSpan: 100,
    maximumFactor: 2,
  });
  assert.deepEqual(building.productionDecreaseAccordingYear, {
    startYear: 1960,
    yearSpan: 110,
    minimumFactor: 0.3,
  });
});

test('malformed year-dependent recipe directives stay unavailable', () => {
  const building = parseBuilding(`
$TYPE_FACTORY
$CONSUMPTION_INCREASE_ACCORDING_YEAR 1960 nope 2.0
$PRODUCTION_DECREASE_ACCORDING_YEAR 1960 110
`);

  assert.equal('consumptionIncreaseAccordingYear' in building, false);
  assert.equal('productionDecreaseAccordingYear' in building, false);
});
