import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBuildingsGame, parseWorkers, parseHeader, parseMapClimate, parseResearch,
  parseVehicles, parseUsedVehicles, parseLines,
} from '../js/savegame.js';
import * as savegame from '../js/savegame.js';

function writeUtf16(bytes, offset, text) {
  const encoded = new TextEncoder().encode(text);
  encoded.forEach((byte, index) => {
    bytes[offset + index * 2] = byte;
    bytes[offset + index * 2 + 1] = 0;
  });
}

function lineFixture({ saveVersion = 124 } = {}) {
  const scheduleSizes = (0x18 + 0x48) + 0x18 + 0x18 + 0x18;
  const elapsedSize = saveVersion > 0x77 ? 8 : 0;
  const buffer = new ArrayBuffer(4 + 0x18 + 0x200 + 8 + scheduleSizes + 8 + elapsedSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  const i32 = value => { view.setInt32(offset, value, true); offset += 4; };
  const f32 = value => { view.setFloat32(offset, value, true); offset += 4; };
  const block = ({ enabled = 0, field04 = 0, flags = [], rows = [] } = {}) => {
    bytes[offset] = enabled;
    view.setInt32(offset + 4, field04, true);
    view.setInt32(offset + 8, rows.length, true);
    flags.forEach((value, index) => { bytes[offset + 0x0c + index] = value; });
    offset += 0x18;
    for (const row of rows) {
      bytes.set(new TextEncoder().encode(`${row.key}\0`), offset);
      view.setFloat32(offset + 0x40, row.valueA, true);
      view.setFloat32(offset + 0x44, row.valueB, true);
      offset += 0x48;
    }
  };
  i32(1);
  i32(-7); i32(3); i32(9); i32(2); i32(2); i32(2);
  writeUtf16(bytes, offset, 'Oil route\0');
  offset += 0x200;
  i32(4); i32(-1);
  block({ enabled: 1, field04: 6, flags: [1, 2, 3],
    rows: [{ key: 'oil', valueA: 0.25, valueB: -11 }] });
  block();
  block();
  block({ enabled: 1, flags: [9] });
  i32(12); i32(13);
  if (saveVersion > 0x77) { f32(10.5); f32(20.25); }
  assert.equal(offset, buffer.byteLength);
  return buffer;
}

function vehicleFixture({ cargo = [], optionalBranches = false, routeTargetIds = [],
  currentCursor = -1, schedulePairCount = routeTargetIds.length, refs = {},
  currentLineIntervalRaw = 0 } = {}) {
  const fixed = 0x7e8;
  const header = 0x40;
  const blobSize = 16;
  const dynamicSize = cargo.length * 0x48
    + schedulePairCount * 0x30 + routeTargetIds.length * 4
    + (optionalBranches ? 0x200 + 0x0c + 0x0c + 0x10 + 0x80 + 0x80 : 0)
    + blobSize;
  const buffer = new ArrayBuffer(4 + fixed + header + dynamicSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const start = 4;
  const h = start + fixed;
  view.setUint32(0, 1, true);
  view.setInt32(start, 0, true);
  view.setInt32(start + 0x04, refs.parentVehicleId ?? -1, true);
  view.setUint32(start + 0x0c, cargo.length, true);
  view.setInt32(start + 0x1c, refs.currentBuildingIndex ?? -1, true);
  view.setInt32(start + 0x20, refs.homeWorkplaceBuildingIndex ?? -1, true);
  view.setInt32(start + 0x30, refs.stationBuildingIndex ?? -1, true);
  view.setInt32(start + 0x34, refs.stationEnteringBuildingIndex ?? -1, true);
  view.setInt32(start + 0xa4, refs.shouldExitStationTargetBuildingIndex ?? -1, true);
  view.setUint32(start + 0xb0, schedulePairCount, true);
  view.setUint32(start + 0xb4, routeTargetIds.length, true);
  view.setInt32(start + 0xb8, currentCursor, true);
  view.setInt32(start + 0x1b8, refs.movingInsideBuildingIndex ?? -1, true);
  bytes.set(new TextEncoder().encode('tanker\0'), start + 0x728);
  view.setFloat32(start + 0x7b8, 93.6, true);
  view.setInt32(start + 0x7cc, -1, true);
  view.setFloat32(start + 0x7d0, 0.75, true);
  view.setUint32(h + 0x24, blobSize, true);
  view.setFloat32(h + 0x18, currentLineIntervalRaw, true);
  let cursor = h + header;
  for (const item of cargo) {
    bytes.set(new TextEncoder().encode(`${item.resource}\0`), cursor);
    view.setFloat32(cursor + 0x40, item.amount, true);
    view.setUint32(cursor + 0x44, item.flags ?? 0, true);
    cursor += 0x48;
  }
  for (let index = 0; index < schedulePairCount; index += 1) cursor += 0x30;
  for (const targetId of routeTargetIds) {
    view.setInt32(cursor, targetId, true);
    cursor += 4;
  }
  if (optionalBranches) {
    view.setUint32(start + 0x7dc, 1, true);
    view.setInt32(start + 0x7d4, -1, true);
    view.setUint32(h, 1, true);
    view.setUint32(h + 0x10, 1, true);
    view.setUint8(h + 0x14, 1);
    view.setUint32(h + 0x34, 1, true);
    cursor += 0x200 + 0x0c + 0x0c + 0x10 + 0x80;
  }
  view.setFloat64(cursor, 21772.365181054876, false);
  view.setFloat64(cursor + 8, 630.9812399897511, false);
  return buffer;
}

test('vehicle records expose decision and exact route-position fields and require exact EOF', () => {
  const buffer = vehicleFixture({
    cargo: [{ resource: 'oil', amount: 4338.07470703125, flags: 3 }],
    routeTargetIds: [7, 9], currentCursor: 1, currentLineIntervalRaw: 75.77782440185547,
    refs: { parentVehicleId: 4, currentBuildingIndex: 7, homeWorkplaceBuildingIndex: 8,
      stationBuildingIndex: 9, stationEnteringBuildingIndex: -1,
      shouldExitStationTargetBuildingIndex: 10, movingInsideBuildingIndex: 11 },
  });
  const parsed = parseVehicles(buffer);

  assert.deepEqual(parsed.summary, { recordCount: 1, byteLength: buffer.byteLength, trailingBytes: 0 });
  assert.equal(parsed.vehicles[0].id, 0);
  assert.equal(parsed.vehicles[0].model, 'tanker');
  assert.equal(parsed.vehicles[0].saleAdjustmentState, -1);
  assert.equal('state' in parsed.vehicles[0], false);
  assert.equal('progress' in parsed.vehicles[0], false);
  assert.ok(Math.abs(parsed.vehicles[0].fuel - 93.6) < 1e-4);
  assert.equal(parsed.vehicles[0].accumulatedUsage, 21772.365181054876);
  assert.equal(parsed.vehicles[0].age, 630.9812399897511);
  assert.equal(parsed.vehicles[0].parentVehicleId, 4);
  assert.equal(parsed.vehicles[0].currentBuildingIndex, 7);
  assert.equal(parsed.vehicles[0].homeWorkplaceBuildingIndex, 8);
  assert.equal(parsed.vehicles[0].stationBuildingIndex, 9);
  assert.equal(parsed.vehicles[0].stationEnteringBuildingIndex, -1);
  assert.equal(parsed.vehicles[0].shouldExitStationTargetBuildingIndex, 10);
  assert.equal(parsed.vehicles[0].movingInsideBuildingIndex, 11);
  assert.equal(parsed.vehicles[0].schedulePairCount, 2);
  assert.deepEqual(parsed.vehicles[0].routeTargetBuildingIndices, [7, 9]);
  assert.equal(parsed.vehicles[0].currentScheduleCursor, 1);
  assert.equal(parsed.vehicles[0].hasValidScheduleCursor, true);
  assert.equal(parsed.vehicles[0].currentScheduleTargetBuildingIndex, 9);
  assert.ok(Math.abs(parsed.vehicles[0].currentLineIntervalRaw - 75.77782440185547) < 1e-5);
  assert.deepEqual(parsed.vehicles[0].cargo, [{ resource: 'oil', amount: 4338.07470703125, flags: 3 }]);

  const appended = new Uint8Array(buffer.byteLength + 1);
  appended.set(new Uint8Array(buffer));
  assert.throws(() => parseVehicles(appended.buffer), /trailing bytes/);
  assert.throws(() => parseVehicles(buffer.slice(0, -1)), /state blob/);
});

test('a raw vehicle cursor outside its route vector is not a current target', () => {
  const [vehicle] = parseVehicles(vehicleFixture({ routeTargetIds: [7], currentCursor: 2 })).vehicles;
  assert.equal(vehicle.hasValidScheduleCursor, false);
  assert.equal(vehicle.currentScheduleTargetBuildingIndex, null);
});

test('vehicle traversal consumes writer-proven optional blocks', () => {
  const buffer = vehicleFixture({ optionalBranches: true });
  const parsed = parseVehicles(buffer);
  assert.equal(parsed.vehicles.length, 1);
  assert.equal(parsed.summary.byteLength, buffer.byteLength);
});

test('vehicle lines preserve exact stops schedules assignments and observed intervals', () => {
  const buffer = lineFixture();
  const parsed = parseLines(buffer, { saveVersion: 124 });

  assert.deepEqual(parsed.summary, { recordCount: 1, byteLength: buffer.byteLength, trailingBytes: 0 });
  assert.deepEqual(parsed.lines, [{
    slot: 0, name: 'Oil route', rawField00: -7, rawField04: 3, rawField08: 9,
    stopIds: [4, -1],
    schedules: [
      {
        primary: { rawByte00: 1, rawField04: 6, flags: [1, 2, 3, 0, 0, 0, 0, 0, 0],
          entries: [{ key: 'oil', valueA: 0.25, valueB: -11 }] },
        secondary: { rawByte00: 0, rawField04: 0, flags: [0, 0, 0, 0, 0, 0, 0, 0, 0], entries: [] },
      },
      {
        primary: { rawByte00: 0, rawField04: 0, flags: [0, 0, 0, 0, 0, 0, 0, 0, 0], entries: [] },
        secondary: { rawByte00: 1, rawField04: 0, flags: [9, 0, 0, 0, 0, 0, 0, 0, 0], entries: [] },
      },
    ],
    vehicleIds: [12, 13], observedIntervals: [10.5, 20.25],
  }]);
  const appended = new Uint8Array(buffer.byteLength + 1);
  appended.set(new Uint8Array(buffer));
  assert.throws(() => parseLines(appended.buffer, { saveVersion: 124 }), /trailing bytes/);
  assert.throws(() => parseLines(buffer.slice(0, -1), { saveVersion: 124 }), /observed interval/);
});

test('vehicle line observed intervals follow the save-version gate', () => {
  const buffer = lineFixture({ saveVersion: 0x77 });
  const parsed = parseLines(buffer, { saveVersion: 0x77 });
  assert.deepEqual(parsed.lines[0].observedIntervals, []);
});

function usedVehicleFixture() {
  const model = new TextEncoder().encode('tanker\0');
  const taggedLength = 4 + model.length + 8;
  const recordLength = 0x20 + taggedLength;
  const dataStart = 0x4d;
  const buffer = new ArrayBuffer(dataStart + recordLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set([(dataStart >>> 16) & 0xff, (dataStart >>> 8) & 0xff, dataStart & 0xff], 0x28);
  bytes.set([(recordLength >>> 16) & 0xff, (recordLength >>> 8) & 0xff, recordLength & 0xff], 0x30);
  view.setUint32(0x44, 1, true);
  bytes.set([0, 0, 0, 0, recordLength], 0x48);
  const start = dataStart;
  view.setUint16(start, 1, false);
  view.setFloat64(start + 2, 12.5, false);
  view.setFloat64(start + 10, 4.25, false);
  view.setFloat64(start + 18, -0.1, false);
  view.setUint32(start + 26, taggedLength, false);
  let cursor = start + 30;
  view.setUint16(cursor, 1, false);
  view.setUint16(cursor + 2, model.length, false);
  bytes.set(model, cursor + 4);
  cursor += 4 + model.length;
  view.setUint16(cursor, 2, false);
  view.setUint16(cursor + 2, 4, false);
  view.setInt32(cursor + 4, 118, false);
  view.setUint16(start + recordLength - 2, 0, false);
  return buffer;
}

test('used market records expose model and saved offer factors at exact EOF', () => {
  const buffer = usedVehicleFixture();
  const parsed = parseUsedVehicles(buffer);

  assert.deepEqual(parsed.summary, { recordCount: 1, byteLength: buffer.byteLength, trailingBytes: 0 });
  assert.deepEqual(parsed.offers, [{
    index: 0, model: 'tanker', age: 12.5, accumulatedUsage: 4.25,
    modifier: -0.1, metadata: 118,
  }]);
  assert.throws(() => parseUsedVehicles(buffer.slice(0, -1)), /data start mismatch|truncated/);
});

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
  view.setFloat32(4 + 0x494, 0.7818065881729126, true);
  view.setFloat32(4 + 0x498, 0.25, true);
  view.setFloat32(4 + 0x49c, 0.75, true);
  view.setInt32(4 + 0x564, 7, true);
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
  assert.equal(building.savedTypePlusOne, 7);
  assert.deepEqual(building.polymorphicRolling, {
    currentRate: 21.75, previousQuantity: 0.7818065881729126,
    partialQuantity: 0.25, dayProgress: 0.75,
  });
  assert.equal(building.incompleteCaseCount, 2);
  assert.equal(building.currentWorkPerActiveCase, 3.5);
  assert.equal(building.savedAssignedEventCount, 3);
  assert.equal(building.constructionProgress, 1);
  assert.equal(building.configuredWorkers, 120);
  assert.equal(building.configuredWorkersHighEducation, 0);
  assert.ok(Math.abs(building.mineQuality - 0.56467056) < 1e-6);
});

test('live building preserves exact first-pass storage inventories', () => {
  const rows = [
    { resource: 'plants', amount: 3.430112838745117, secondary: 0 },
    { resource: 'oil', amount: 21.581411361694336, secondary: 0 },
  ];
  const firstPassSize = 0x20 + rows.length * 0x48;
  const secondPassSize = 0x10 + 0x48;
  const buffer = new ArrayBuffer(4 + 0x6d8 + firstPassSize + secondPassSize + 0x80);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const start = 4;
  view.setUint32(0, 1, true);
  bytes.set(new TextEncoder().encode('chemical_plant\0'), start);
  view.setUint32(start + 0x418, 1, true); // n310
  const storage = start + 0x6d8;
  view.setUint32(storage, rows.length, true);
  view.setUint8(storage + 4, 1);
  view.setUint8(storage + 5, 0);
  view.setInt32(storage + 8, -1, true);
  view.setFloat32(storage + 0x0c, 20, true);
  view.setInt32(storage + 0x10, 3, true);
  rows.forEach((row, index) => {
    const offset = storage + 0x20 + index * 0x48;
    bytes.set(new TextEncoder().encode(`${row.resource}\0`), offset);
    view.setFloat32(offset + 0x40, row.amount, true);
    view.setFloat32(offset + 0x44, row.secondary, true);
  });
  const controls = storage + firstPassSize;
  view.setUint32(controls, 1, true);
  bytes.set(new TextEncoder().encode('plants\0'), controls + 0x10);
  view.setFloat32(controls + 0x50, 0.25, true);
  view.setFloat32(controls + 0x54, 0, true);

  const [building] = parseBuildingsGame(buffer);
  assert.deepEqual(building.storages, [{
    storageIndex: 0, inputFlag: 1, outputFlag: 0, selector: -1,
    capacity: 20, mode: 3, resources: rows,
    controls: [{ resource: 'plants', amount: 0.25, secondary: 0 }],
  }]);
});

test('distribution offices expose exact associated vehicles and configured target rules', () => {
  const dynamicSize = 8 + 4 + 0x18 + 0x48 + 0x18;
  const buffer = new ArrayBuffer(4 + 0x6d8 + dynamicSize + 0x80);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const start = 4;
  view.setUint32(0, 1, true);
  bytes.set(new TextEncoder().encode('road_office\0'), start);
  view.setInt32(start + 0x564, 0x2c, true);
  view.setInt32(start + 0x488, 2, true); // n2a0 associated vehicle vector
  view.setInt32(start + 0x534, 1, true); // n1f4 configured targets
  let offset = start + 0x6d8;
  view.setInt32(offset, 12, true); offset += 4;
  view.setInt32(offset, 13, true); offset += 4;
  view.setInt32(offset, 7, true); offset += 4;
  bytes[offset] = 1;
  view.setFloat32(offset + 4, 0.8, true);
  view.setInt32(offset + 8, 1, true);
  bytes.set([1, 2, 3, 4, 5, 6, 7, 8, 9], offset + 0x0c);
  offset += 0x18;
  bytes.set(new TextEncoder().encode('coal\0'), offset);
  view.setFloat32(offset + 0x40, 0, true);
  view.setFloat32(offset + 0x44, 0, true);
  offset += 0x48;
  bytes[offset] = 0;
  view.setFloat32(offset + 4, 0.2, true);
  view.setInt32(offset + 8, 0, true);

  const [building] = parseBuildingsGame(buffer);
  assert.equal(building.distributionKind, 'road');
  assert.deepEqual(building.associatedVehicleIds, [12, 13]);
  assert.deepEqual(building.distributionAssignments, [{
    targetBuildingIndex: 7,
    load: { enabled: true, threshold: 0.800000011920929, resources: ['coal'] },
    unload: { enabled: false, threshold: 0.20000000298023224, resources: [] },
  }]);
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
  view.setInt32(0x1c0, 1, true);
  view.setInt32(0x1c4, 2, true);
  view.setUint32(0x1e8, 1, true);
  view.setUint32(0x1f0, 1, true);
  view.setUint32(0x1f4, 0, true);
  view.setUint32(0x1f8, 1, true);
  view.setInt32(0x1fc, 2, true);
  view.setInt32(0x200, 1, true);
  writeUtf16(bytes, 4, 'Republic 2001\0');
  bytes.set(new TextEncoder().encode('save/453 - Republic 2001\0'), 0x104);

  assert.deepEqual(parseHeader(buffer), {
    saveVersion: 124,
    title: 'Republic 2001',
    savePath: 'save/453 - Republic 2001',
    settings: {
      seasonsEnabled: true,
      globalEventsLevel: 2,
      crimeJusticeEnabled: true,
      trafficSimulationEnabled: true,
      realisticModeEnabled: false,
      researchEnabled: true,
      wasteManagementLevel: 2,
      maintenanceEnabled: true,
      vehicleSaleAdjustmentLevel: 2,
      depreciationLevel: 1,
    },
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
