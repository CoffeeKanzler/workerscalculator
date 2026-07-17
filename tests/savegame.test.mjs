import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBuildingsGame } from '../js/savegame.js';

test('live building exposes configured caps, current workers and mine quality', () => {
  // A zero-count record traverses only the writer's 0x6d8 fixed payload and
  // mandatory 0x80 tail, so it is a compact exact parser fixture.
  const currentWorkerIdsBytes = 95 * 4;
  const buffer = new ArrayBuffer(4 + 0x758 + currentWorkerIdsBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 1, true);
  bytes.set(new TextEncoder().encode('coal_mine'), 4);
  view.setInt32(4 + 0x100, 31, true);
  view.setInt32(4 + 0x478, 95, true);
  view.setInt32(4 + 0x4a0, 120, true);
  view.setInt32(4 + 0x4a4, 0, true);
  view.setFloat32(4 + 0x4a8, 0.56467056, true);

  const [building] = parseBuildingsGame(buffer);

  assert.equal(building.type, 'coal_mine');
  assert.equal(building.settlementId, 31);
  assert.equal(building.currentWorkers, 95);
  assert.equal(building.configuredWorkers, 120);
  assert.equal(building.configuredWorkersHighEducation, 0);
  assert.ok(Math.abs(building.mineQuality - 0.56467056) < 1e-6);
});
