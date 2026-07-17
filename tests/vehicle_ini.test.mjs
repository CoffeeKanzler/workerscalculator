import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const parseVehicle = script => {
  const root = mkdtempSync(join(tmpdir(), 'workers-vehicle-ini-'));
  const vehicleDir = join(root, 'vehicle');
  mkdirSync(vehicleDir);
  const path = join(vehicleDir, 'script.ini');
  writeFileSync(path, script);
  try {
    const source = [
      'import json, sys',
      "sys.path.insert(0, 'tools')",
      'from extract_from_gamefiles import parse_vehicle',
      "print(json.dumps(parse_vehicle(sys.argv[1], 'test')))",
    ].join('; ');
    return JSON.parse(execFileSync('python3', ['-c', source, path], { encoding: 'utf8' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('vehicle script parser exposes exact category-1 recipe branch facts', () => {
  const ordinary = parseVehicle(`
\ufeff$TYPE VEHICLETYPE_ROAD
// $HORSE 0 0 0 team
-- $SINGLE_HORSE_POWER 2
`);
  assert.equal(ordinary.roadRecipeBranch, 'ordinary');
  assert.equal('singleHorsePower' in ordinary, false);

  const team = parseVehicle(`
$TYPE VEHICLETYPE_ROAD
$HORSE 0 1 2 single
$SINGLE_HORSE_POWER 3
$HORSE 3 4 5 team // referenced model is intentionally private
`);
  assert.equal(team.roadRecipeBranch, 'horse-team');
  assert.equal('singleHorsePower' in team, false);

  const single = parseVehicle(`
$TYPE VEHICLETYPE_ROAD
$HORSE 0 1 2 single
$SINGLE_HORSE_POWER 2.3
`);
  assert.equal(single.roadRecipeBranch, 'single-horse');
  assert.equal(single.singleHorsePower, 2.3);
});

test('malformed relevant road facts remain unavailable', () => {
  const malformed = parseVehicle(`
$TYPE VEHICLETYPE_ROAD
$HORSE nope 1 2 team
`);
  assert.equal('roadRecipeBranch' in malformed, false);
});
