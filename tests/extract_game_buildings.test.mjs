import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('game extraction preserves menu category and literal building name', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'workers-building-'));
  const fixture = path.join(dir, 'building.ini');
  writeFileSync(fixture, [
    '$NAME_STR "Wooden house"',
    '$MENU_SFX building_residential_small',
    '$TYPE_LIVING',
    '$QUALITY_OF_LIVING 0.85',
    '$STORAGE RESOURCE_TRANSPORT_PASSANGER 5',
  ].join('\n'));
  const program = [
    'import json, sys',
    'from tools.extract_from_gamefiles import parse_building, attach_names',
    'item = parse_building(sys.argv[1], ident="dlc3/residential_wood2")',
    'attach_names([item], {})',
    'print(json.dumps(item))',
  ].join('; ');
  const run = spawnSync('python3', ['-c', program, fixture], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stderr);
  const item = JSON.parse(run.stdout);
  assert.equal(item.menuSfx, 'building_residential_small');
  assert.equal(item.nameStr, 'Wooden house');
  assert.equal(item.de, 'Wooden house');
  assert.equal(item.en, 'Wooden house');
});
