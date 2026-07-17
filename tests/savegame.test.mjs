import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBuildingsGame, parseWorkers, parseHeader, parseResearch,
} from '../js/savegame.js';

function writeUtf16(bytes, offset, text) {
  const encoded = new TextEncoder().encode(text);
  encoded.forEach((byte, index) => {
    bytes[offset + index * 2] = byte;
    bytes[offset + index * 2 + 1] = 0;
  });
}

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

test('worker records expose residence and citizen status fields', () => {
  const buffer = new ArrayBuffer(4 + 0x728);
  const view = new DataView(buffer);
  view.setUint32(0, 1, true);
  const start = 4;
  view.setInt32(start, 77, true);
  view.setInt32(start + 0x10, 7, true);
  view.setFloat32(start + 0x74, 2, true);
  view.setFloat32(start + 0x84, 40, true);
  view.setFloat32(start + 0x88, 0.8, true);
  view.setFloat32(start + 0x8c, 1, true);
  view.setFloat32(start + 0x90, 0.9, true);
  view.setFloat32(start + 0x94, 0.7, true);

  const parsed = parseWorkers(buffer, { saveVersion: 124 });

  assert.deepEqual(parsed.summary, { recordCount: 1, byteLength: 1836, trailingBytes: 0 });
  assert.equal(parsed.citizens[0].id, 77);
  assert.equal(parsed.citizens[0].residenceBuildingIndex, 7);
  assert.equal(parsed.citizens[0].education, 2);
  assert.equal(parsed.citizens[0].age, 40);
  assert.ok(Math.abs(parsed.citizens[0].happiness - 0.8) < 1e-6);
});

test('header exposes save version title and source path', () => {
  const buffer = new ArrayBuffer(0x204);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 124, true);
  writeUtf16(bytes, 4, 'Republic 2001\0');
  bytes.set(new TextEncoder().encode('save/453 - Republic 2001\0'), 0x104);

  assert.deepEqual(parseHeader(buffer), {
    saveVersion: 124,
    title: 'Republic 2001',
    savePath: 'save/453 - Republic 2001',
  });
});

test('research records expose exact progress and building reference', () => {
  const buffer = new ArrayBuffer(4 + 0x58);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 1, true);
  bytes.set(new TextEncoder().encode('vaccine_development\0'), 4);
  view.setFloat32(4 + 0x40, 0.5, true);
  view.setInt32(4 + 0x44, 221, true);
  view.setUint16(4 + 0x48, 3, true);

  assert.deepEqual(parseResearch(buffer)[0], {
    key: 'vaccine_development', progress: 0.5, buildingIndex: 221, flags: 3,
  });
});
