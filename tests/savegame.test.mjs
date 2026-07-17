import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBuildingsGame, parseWorkers, parseHeader, parseMapClimate, parseResearch,
} from '../js/savegame.js';
import * as savegame from '../js/savegame.js';

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
  const dynamicIdsBytes = (95 + 9 + 3) * 4;
  const buffer = new ArrayBuffer(4 + 0x758 + dynamicIdsBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 1, true);
  bytes.set(new TextEncoder().encode('coal_mine'), 4);
  view.setInt32(4 + 0x100, 31, true);
  view.setInt32(4 + 0x478, 95, true);
  view.setInt32(4 + 0x47c, 9, true);
  view.setFloat32(4 + 0x490, 21.75, true);
  view.setFloat32(4 + 0x4b8, 2, true);
  view.setFloat32(4 + 0x4bc, 3.5, true);
  view.setInt32(4 + 0x594, 3, true);
  view.setFloat32(4 + 0x3e8, 1, true);
  view.setInt32(4 + 0x4a0, 120, true);
  view.setInt32(4 + 0x4a4, 0, true);
  view.setFloat32(4 + 0x4a8, 0.56467056, true);

  const [building] = parseBuildingsGame(buffer);

  assert.equal(building.type, 'coal_mine');
  assert.equal(building.settlementId, 31);
  assert.equal(building.currentWorkers, 95);
  assert.equal(building.currentVisitors, 9);
  assert.equal(building.effectiveServiceCapacity, 21.75);
  assert.equal(building.incompleteCaseCount, 2);
  assert.equal(building.currentWorkPerActiveCase, 3.5);
  assert.equal(building.savedAssignedEventCount, 3);
  assert.equal(building.constructionProgress, 1);
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
  view.setInt16(start + 0x708, 6, true);
  view.setInt16(start + 0x70a, 18, true);

  const parsed = parseWorkers(buffer, { saveVersion: 124 });

  assert.deepEqual(parsed.summary, { recordCount: 1, byteLength: 1836, trailingBytes: 0 });
  assert.equal(parsed.citizens[0].id, 77);
  assert.equal(parsed.citizens[0].residenceBuildingIndex, 7);
  assert.equal(parsed.citizens[0].education, 2);
  assert.equal(parsed.citizens[0].age, 40);
  assert.equal(parsed.citizens[0].citizenType, 0);
  assert.equal(parsed.citizens[0].sentenceProgress, 6);
  assert.equal(parsed.citizens[0].sentenceTotal, 18);
  assert.ok(Math.abs(parsed.citizens[0].happiness - 0.8) < 1e-6);
});

test('header exposes save version title and source path', () => {
  const buffer = new ArrayBuffer(0x204);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 124, true);
  view.setInt32(0x1c4, 1, true);
  writeUtf16(bytes, 4, 'Republic 2001\0');
  bytes.set(new TextEncoder().encode('save/453 - Republic 2001\0'), 0x104);

  assert.deepEqual(parseHeader(buffer), {
    saveVersion: 124,
    title: 'Republic 2001',
    savePath: 'save/453 - Republic 2001',
    settings: { seasonsEnabled: true },
  });
});

test('map terrain material identifies climate heating rules', () => {
  assert.deepEqual(parseMapClimate('$TEXTURE 5 dlc2/tiles_middleeast/newdesert1d.dds'),
    { id: 'middleeast', heatingRequired: false });
  assert.deepEqual(parseMapClimate('$TEXTURE 5 dlc2/tiles_siberia/grass2.dds'),
    { id: 'siberia', heatingRequired: true });
  assert.deepEqual(parseMapClimate('$TEXTURE 5 tiles_normal/grass2.dds'),
    { id: 'temperate', heatingRequired: true });
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

test('live emergency events preserve object references and crime stage', () => {
  assert.equal(typeof savegame.parseEvents, 'function', 'parseEvents must be exported');
  const buffer = new ArrayBuffer(4 + 24 + 24 + 8 + 56);
  const view = new DataView(buffer);
  let offset = 0;
  const i32 = value => { view.setInt32(offset, value, true); offset += 4; };
  const f32 = value => { view.setFloat32(offset, value, true); offset += 4; };
  i32(2);
  i32(1); i32(91); i32(0); i32(301); i32(2); i32(0);
  i32(4); i32(122); i32(0); i32(302); i32(2); i32(1);
  i32(44); i32(0);
  f32(2.5); f32(1.25); f32(0.5); i32(3); f32(7.5); f32(8.5);
  for (let index = 0; index < 8; index += 1) i32(0);

  assert.deepEqual(savegame.parseEvents(buffer), [
    {
      index: 0, eventType: 1,
      location: { objectIndex: 91, objectKind: 0 },
      subject: { objectIndex: 301, objectKind: 2 }, assignments: [],
    },
    {
      index: 1, eventType: 4,
      location: { objectIndex: 122, objectKind: 0 },
      subject: { objectIndex: 302, objectKind: 2 },
      assignments: [{ objectIndex: 44, objectKind: 0 }],
      accumulatedProgress: 2.5, priorProgress: 1.25,
      normalizedStageProgress: 0.5, state: 3, field68: 7.5, field6c: 8.5,
    },
  ]);
});
