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

test('game extraction evaluates automatic construction costs from building bbox nodes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'workers-building-cost-'));
  const fixture = path.join(dir, 'building.ini');
  writeFileSync(fixture, [
    '$TYPE_LIVING',
    '$STORAGE RESOURCE_TRANSPORT_PASSANGER 5',
    '$COST_WORK SOVIET_CONSTRUCTION_GROUNDWORKS 0.0',
    '$COST_WORK_BUILDING_ALL',
    '$COST_RESOURCE_AUTO ground 1.0',
  ].join('\n'));
  const bbox = Buffer.alloc(544);
  bbox.writeUInt32LE(1, 0);
  bbox.write('house', 4, 'ascii');
  bbox.writeUInt32LE(0, 516);
  for (const [offset, value] of [[520, 0], [524, 0], [528, 0],
    [532, 10], [536, 5], [540, 6]]) bbox.writeFloatLE(value, offset);
  writeFileSync(path.join(dir, 'building.bbox'), bbox);
  const program = [
    'import json, sys',
    'from tools.extract_from_gamefiles import parse_building',
    'print(json.dumps(parse_building(sys.argv[1], keep_all=True)))',
  ].join('; ');
  const run = spawnSync('python3', ['-c', program, fixture], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stderr);
  const costs = JSON.parse(run.stdout).constructionResources;
  assert.ok(Math.abs(costs.workers - 15.6) < 1e-6);
  assert.ok(Math.abs(costs.concrete - 1.352) < 1e-6);
  assert.ok(Math.abs(costs.gravel - 1.04) < 1e-6);
  assert.equal('steel' in costs, false);
});
