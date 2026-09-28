import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname;

function runExtractor(program, args) {
  const run = spawnSync('python3', ['-c', program, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

test('game extraction keeps a vehicle whose only name is a literal $NAME_STR', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'workers-vehicle-'));
  const fixture = path.join(dir, 'script.ini');
  writeFileSync(fixture, [
    '$TYPE VEHICLETYPE_ROAD',
    '$NAME_STR "Skd 706R Covered"',
    '$COST_RUB 4300',
    '$RESOURCE_CAPACITY 7.5',
    '$RESOURCE_TRANSPORT_TYPE RESOURCE_TRANSPORT_COVERED',
    '$MOVEMENT_SPEED 62',
    '$MOVEMENT_POWER_KW 118',
    '$MOVEMENT_EMPTY_WEIGHT 6',
    '$AVAILABLE 1945 1955',
  ].join('\n'));
  const program = [
    'import json, sys',
    'from tools.extract_from_gamefiles import parse_vehicle, attach_names',
    'item = parse_vehicle(sys.argv[1], "dlc3/vehicles")',
    'attach_names([item], {})',
    'print(json.dumps(item))',
  ].join('; ');
  const item = JSON.parse(runExtractor(program, [fixture]));
  rmSync(dir, { recursive: true, force: true });
  // DLC vehicle packs ship a literal name instead of a $NAME localization id.
  // Reading only $NAME left every one of them nameless, and the site drops a
  // game vehicle it cannot name.
  assert.equal(item.nameStr, 'Skd 706R Covered');
  assert.equal(item.de, 'Skd 706R Covered');
  assert.equal(item.en, 'Skd 706R Covered');
  assert.equal(item.nameId, undefined);
  assert.equal(item.from, 1945);
  assert.equal(item.to, 1955);
});

test('game extraction prefers a localized $NAME id over a literal name', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'workers-vehicle-name-'));
  const fixture = path.join(dir, 'script.ini');
  writeFileSync(fixture, [
    '$TYPE VEHICLETYPE_ROAD',
    '$NAME 5181',
    '$NAME_STR "ignored literal"',
    '$AVAILABLE 1958 1985',
  ].join('\n'));
  const program = [
    'import json, sys',
    'from tools.extract_from_gamefiles import parse_vehicle, attach_names',
    'item = parse_vehicle(sys.argv[1], "vehicles")',
    'attach_names([item], {"de": {5181: "Skd-706 RT Abgedeckt"}, "en": {5181: "Skd-706 RT Covered"}})',
    'print(json.dumps(item))',
  ].join('; ');
  const item = JSON.parse(runExtractor(program, [fixture]));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(item.nameStr, 'ignored literal');
  assert.equal(item.de, 'Skd-706 RT Abgedeckt');
  assert.equal(item.en, 'Skd-706 RT Covered');
});

test('a vehicle the game leaves without any name stays nameless', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'workers-vehicle-unnamed-'));
  const fixture = path.join(dir, 'script.ini');
  writeFileSync(fixture, [
    '$TYPE VEHICLETYPE_RAIL_VAGON',
    '$NAME',
    '$DESCRIPTION ',
    '$AVAILABLE 1972 1997',
  ].join('\n'));
  const program = [
    'import json, sys',
    'from tools.extract_from_gamefiles import parse_vehicle, attach_names',
    'item = parse_vehicle(sys.argv[1], "trains")',
    'attach_names([item], {})',
    'print(json.dumps(item))',
  ].join('; ');
  const item = JSON.parse(runExtractor(program, [fixture]));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(item.de, undefined);
  assert.equal(item.en, undefined);
});

test('the shipped raw vehicle dataset names every DLC vehicle the game defines', () => {
  const raw = JSON.parse(readFileSync(
    new URL('../data/game/vehicles_raw.json', import.meta.url)));
  const dlc = raw.filter(vehicle => vehicle.dlc);
  assert.ok(dlc.length > 0, 'the dataset no longer contains any DLC vehicle');
  for (const vehicle of dlc) {
    assert.ok(vehicle.de || vehicle.en,
      `DLC vehicle ${vehicle.id} has no name and cannot be listed`);
  }
});

test('the shipped raw vehicle dataset keeps the game-curated Skoda DLC names', () => {
  const raw = JSON.parse(readFileSync(
    new URL('../data/game/vehicles_raw.json', import.meta.url)));
  const expected = new Map([
    ['covered_skd706r', 'Skd 706R Covered'],
    ['bust_skd_6Tr_d4', 'Skd 6T + D4'],
    ['bus_skoda706ro_d4', 'Skd 706 RO + D4'],
    ['bust_skd_9Tr_po1e', 'Skd 9T + PO-1'],
  ]);
  for (const [id, name] of expected) {
    const vehicle = raw.find(entry => entry.id === id);
    assert.ok(vehicle, `${id} is missing from the raw vehicle dataset`);
    assert.equal(vehicle.de, name);
    assert.equal(vehicle.en, name);
  }
});
