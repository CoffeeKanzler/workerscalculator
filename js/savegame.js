// Local-only parser for W&R save files used by the /beta/ importer.
// The buildings_game traversal mirrors the current game's writer order; it
// does not search for plausible strings or infer record boundaries.

const MAX_COUNT = 10_000_000;
const ascii = new TextDecoder('utf-8');
const utf16 = new TextDecoder('utf-16le');

class BinaryCursor {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  require(size, context) {
    if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.bytes.length) {
      throw new Error(`${context}: need ${size} bytes at 0x${this.offset.toString(16)}, file ends at 0x${this.bytes.length.toString(16)}`);
    }
  }

  skip(size, context) {
    this.require(size, context);
    this.offset += size;
  }

  countAt(offset, context) {
    if (offset < 0 || offset + 4 > this.bytes.length) throw new Error(`${context}: count is outside the file`);
    const value = this.view.getInt32(offset, true);
    if (value < 0 || value > MAX_COUNT) throw new Error(`${context}: invalid count ${value} at 0x${offset.toString(16)}`);
    return value;
  }

  u32(context) {
    this.require(4, context);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i32(context) {
    this.require(4, context);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32(context) {
    this.require(4, context);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f64beAt(offset, context) {
    if (offset < 0 || offset + 8 > this.bytes.length) throw new Error(`${context}: value is outside the file`);
    return this.view.getFloat64(offset, false);
  }

  asciiZ(offset, size) {
    let end = offset;
    const limit = offset + size;
    while (end < limit && this.bytes[end] !== 0) end += 1;
    return ascii.decode(this.bytes.subarray(offset, end));
  }

  asciiZStrict(offset, size, context) {
    if (offset < 0 || offset + size > this.bytes.length) throw new Error(`${context}: string is outside the file`);
    let end = offset;
    const limit = offset + size;
    while (end < limit && this.bytes[end] !== 0) end += 1;
    if (end === limit) throw new Error(`${context}: missing NUL terminator`);
    return ascii.decode(this.bytes.subarray(offset, end));
  }

  utf16Z(offset, size) {
    let end = offset;
    const limit = offset + size;
    while (end + 1 < limit && this.view.getUint16(end, true) !== 0) end += 2;
    return utf16.decode(this.bytes.subarray(offset, end));
  }

  utf16ZStrict(offset, size, context) {
    if (offset < 0 || offset + size > this.bytes.length) throw new Error(`${context}: string is outside the file`);
    let end = offset;
    const limit = offset + size;
    while (end + 1 < limit && this.view.getUint16(end, true) !== 0) end += 2;
    if (end + 1 >= limit) throw new Error(`${context}: missing NUL terminator`);
    return utf16.decode(this.bytes.subarray(offset, end));
  }
}

export function parseNamepoints(buffer) {
  const c = new BinaryCursor(buffer);
  const count = c.u32('settlement count');
  if (count > 100_000) throw new Error(`implausible settlement count ${count}`);
  const settlements = [];

  for (let id = 0; id < count; id += 1) {
    const start = c.offset;
    c.require(0x130, `settlement ${id} fixed block`);
    const x = c.view.getFloat32(start, true);
    const y = c.view.getFloat32(start + 4, true);
    const z = c.view.getFloat32(start + 8, true);
    const name = c.utf16Z(start + 0x0c, 0x100);
    const type = c.view.getUint8(start + 0x114);
    const memberCount = c.view.getUint32(start + 0x118, true);
    const hasExtraName = c.view.getUint32(start + 0x11c, true) !== 0;
    if (memberCount > MAX_COUNT) throw new Error(`settlement ${id}: invalid member count ${memberCount}`);
    c.offset += 0x130;
    const members = [];
    for (let i = 0; i < memberCount; i += 1) members.push(c.i32(`settlement ${id} member ${i}`));
    let extraName = '';
    if (hasExtraName) {
      c.require(0x80, `settlement ${id} extra name`);
      extraName = c.utf16Z(c.offset, 0x80);
      c.offset += 0x80;
    }
    settlements.push({ id, name, extraName, type, x, y, z, members });
  }
  if (c.offset !== c.bytes.length) throw new Error(`namepoints.bin has ${c.bytes.length - c.offset} trailing bytes`);
  return settlements;
}

export function parseHeader(buffer) {
  const c = new BinaryCursor(buffer);
  c.require(0x204, 'header fixed metadata');
  return {
    saveVersion: c.view.getUint32(0, true),
    title: c.utf16Z(4, 0x100),
    savePath: c.asciiZ(0x104, Math.min(0x100, c.bytes.length - 0x104)),
    settings: {
      seasonsEnabled: c.view.getInt32(0x1c0, true) !== 0,
      globalEventsLevel: c.view.getInt32(0x1c4, true),
      trafficSimulationEnabled: c.view.getUint32(0x1f0, true) !== 0,
      realisticModeEnabled: c.view.getUint32(0x1f4, true) !== 0,
      researchEnabled: c.view.getUint32(0x1f8, true) !== 0,
      wasteManagementLevel: c.view.getInt32(0x1fc, true),
      maintenanceEnabled: c.view.getInt32(0x200, true) !== 0,
      // These aliases name independently verified downstream economic effects.
      vehicleSaleAdjustmentLevel: c.view.getInt32(0x1fc, true),
      depreciationLevel: c.view.getInt32(0x200, true),
    },
  };
}

export function parseMapClimate(text) {
  const source = String(text ?? '').toLowerCase();
  if (source.includes('dlc2/tiles_middleeast/')) return { id: 'middleeast', heatingRequired: false };
  if (source.includes('dlc2/tiles_asia/')) return { id: 'asia', heatingRequired: false };
  if (source.includes('dlc2/tiles_siberia/')) return { id: 'siberia', heatingRequired: true };
  return { id: 'temperate', heatingRequired: true };
}

export function parseEvents(buffer) {
  const c = new BinaryCursor(buffer);
  const count = c.u32('emergency event count');
  if (count > 1_000_000) throw new Error(`implausible emergency event count ${count}`);
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const eventType = c.i32(`event ${index} type`);
    const location = {
      objectIndex: c.i32(`event ${index} location index`),
      objectKind: c.i32(`event ${index} location kind`),
    };
    const subject = {
      objectIndex: c.i32(`event ${index} subject index`),
      objectKind: c.i32(`event ${index} subject kind`),
    };
    const assignmentCount = c.i32(`event ${index} assignment count`);
    if (assignmentCount < 0 || assignmentCount > 100_000) {
      throw new Error(`event ${index}: invalid assignment count ${assignmentCount}`);
    }
    const assignmentIndices = [];
    for (let item = 0; item < assignmentCount; item += 1) {
      assignmentIndices.push(c.i32(`event ${index} assignment ${item} index`));
    }
    const assignments = assignmentIndices.map((objectIndex, item) => ({
      objectIndex,
      objectKind: c.i32(`event ${index} assignment ${item} kind`),
    }));
    const event = { index, eventType, location, subject, assignments };
    if (eventType >= 3 && eventType <= 5) {
      Object.assign(event, {
        accumulatedProgress: c.f32(`event ${index} accumulated progress`),
        priorProgress: c.f32(`event ${index} prior progress`),
        normalizedStageProgress: c.f32(`event ${index} normalized stage progress`),
        state: c.i32(`event ${index} state`),
        field68: c.f32(`event ${index} field 68`),
        field6c: c.f32(`event ${index} field 6c`),
      });
      c.skip(0x20, `event ${index} reserved tail`);
    }
    events.push(event);
  }
  if (c.offset !== c.bytes.length) throw new Error(`events.bin has ${c.bytes.length - c.offset} trailing bytes`);
  return events;
}

export function parseResearch(buffer) {
  const c = new BinaryCursor(buffer);
  const count = c.u32('research count');
  if (count > 100_000) throw new Error(`implausible research count ${count}`);
  const expected = 4 + count * 0x58;
  if (c.bytes.length !== expected) {
    throw new Error(`research.bin expected ${expected} bytes for ${count} records, got ${c.bytes.length}`);
  }
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const start = 4 + index * 0x58;
    records.push({
      key: c.asciiZ(start, 0x40),
      progress: c.view.getFloat32(start + 0x40, true),
      buildingIndex: c.view.getInt32(start + 0x44, true),
      flags: c.view.getUint16(start + 0x48, true),
    });
  }
  return records;
}

export function parseWorkers(buffer, { saveVersion = 124 } = {}) {
  const c = new BinaryCursor(buffer);
  const count = c.u32('citizen count');
  if (count > 10_000_000) throw new Error(`implausible citizen count ${count}`);
  const citizens = [];

  for (let index = 0; index < count; index += 1) {
    const start = c.offset;
    c.require(0x718, `citizen ${index} fixed block`);
    citizens.push({
      index,
      id: c.view.getInt32(start, true),
      residenceBuildingIndex: c.view.getInt32(start + 0x10, true),
      education: c.view.getFloat32(start + 0x74, true),
      age: c.view.getFloat32(start + 0x84, true),
      happiness: c.view.getFloat32(start + 0x88, true),
      food: c.view.getFloat32(start + 0x8c, true),
      health: c.view.getFloat32(start + 0x90, true),
      loyalty: c.view.getFloat32(start + 0x94, true),
      criminality: c.view.getFloat32(start + 0xa4, true),
      citizenType: c.view.getInt8(start + 0x700),
      sentenceProgress: c.view.getInt16(start + 0x708, true),
      sentenceTotal: c.view.getInt16(start + 0x70a, true),
    });
    const citizenType = c.view.getInt8(start + 0x700);
    const hasExtraName = c.view.getUint8(start + 0x70c) !== 0;
    c.offset = start + 0x718;
    if (saveVersion > 0x71) c.skip(0x10, `citizen ${index} version extension`);
    if (citizenType > 0 && saveVersion > 0x71) c.skip(9, `citizen ${index} type extension`);
    if (hasExtraName) c.skip(0x80, `citizen ${index} extra name`);
  }

  if (c.offset !== c.bytes.length) throw new Error(`workers.bin has ${c.bytes.length - c.offset} trailing bytes`);
  return {
    citizens,
    summary: { recordCount: count, byteLength: c.bytes.length, trailingBytes: 0 },
  };
}

function skipVehicleNested(c, context) {
  c.require(0x18, `${context} header`);
  const count = c.countAt(c.offset + 8, `${context} entry count`);
  c.skip(0x18 + count * 0x48, context);
}

export function parseVehicles(buffer, { onProgress } = {}) {
  const c = new BinaryCursor(buffer);
  const total = c.u32('vehicle count');
  if (total > 1_000_000) throw new Error(`implausible vehicle count ${total}`);
  const vehicles = [];
  const fixedSize = 0x7e8;
  const headerSize = 0x40;

  for (let index = 0; index < total; index += 1) {
    const start = c.offset;
    c.require(fixedSize + headerSize, `vehicle ${index} fixed/header blocks`);
    const h = start + fixedSize;
    const count = (offset, context) => c.countAt(start + offset, `vehicle ${index} ${context}`);
    const headerCount = (offset, context) => c.countAt(h + offset, `vehicle ${index} ${context}`);
    const childCount = count(0x008, 'child count');
    const cargoCount = count(0x00c, 'cargo count');
    const nestedCount = count(0x0b0, 'nested-pair count');
    const routeTargetCount = count(0x0b4, 'route target count');
    const currentScheduleCursor = c.view.getInt32(start + 0x0b8, true);
    const blobSize = headerCount(0x24, 'state blob size');
    const trailingNameCount = headerCount(0x34, 'trailing-name count');

    c.offset = h + headerSize;
    c.skip(childCount * 4, `vehicle ${index} children`);
    const cargoStart = c.offset;
    c.skip(cargoCount * 0x48, `vehicle ${index} cargo`);
    c.skip(count(0x7c0, 'linked count') * 4, `vehicle ${index} linked IDs`);
    c.skip(count(0x018, 'pointer-ID count') * 4, `vehicle ${index} pointer IDs`);
    for (let item = 0; item < nestedCount; item += 1) {
      skipVehicleNested(c, `vehicle ${index} nested ${item}.0`);
      skipVehicleNested(c, `vehicle ${index} nested ${item}.1`);
    }
    const routeTargetBuildingIndices = Array.from({ length: routeTargetCount }, (_, item) =>
      c.i32(`vehicle ${index} route target ${item}`));
    c.skip(count(0x0c0, 'paired A count') * 8, `vehicle ${index} paired A`);
    c.skip(count(0x0c4, 'paired B count') * 8, `vehicle ${index} paired B`);
    c.skip(count(0x0d0, 'triples A count') * 0x0c, `vehicle ${index} triples A`);
    c.skip(count(0x0d4, 'triples B count') * 0x0c, `vehicle ${index} triples B`);
    c.skip(count(0x0a8, 'triples C count') * 0x0c, `vehicle ${index} triples C`);
    c.skip(count(0x100, 'paired C count') * 8, `vehicle ${index} paired C`);
    c.skip(count(0x720, 'row A count') * 0x18, `vehicle ${index} rows A`);
    c.skip(count(0x724, 'row B count') * 0x18, `vehicle ${index} rows B`);
    if (c.view.getUint32(start + 0x7dc, true) !== 0) c.skip(0x200, `vehicle ${index} optional 0x200 block`);
    if (c.view.getInt32(start + 0x7d4, true) === -1) c.skip(0x0c, `vehicle ${index} optional 0x0c block`);
    c.skip(headerCount(0x00, 'attachment count') * 0x0c, `vehicle ${index} attachments`);
    c.skip(headerCount(0x10, 'quad count') * 0x10, `vehicle ${index} quads`);
    if (c.view.getUint8(h + 0x14) !== 0) c.skip(0x80, `vehicle ${index} optional name block`);
    const blobStart = c.offset;
    c.skip(blobSize, `vehicle ${index} state blob`);
    c.skip(trailingNameCount * 0x80, `vehicle ${index} trailing names`);

    const cargo = [];
    for (let item = 0; item < cargoCount; item += 1) {
      const offset = cargoStart + item * 0x48;
      const entry = {
        resource: c.asciiZStrict(offset, 0x40, `vehicle ${index} cargo ${item} resource`),
        amount: c.view.getFloat32(offset + 0x40, true),
        flags: c.view.getUint32(offset + 0x44, true),
      };
      if (entry.amount > 0) cargo.push(entry);
    }
    const hasValidScheduleCursor = currentScheduleCursor >= 0
      && currentScheduleCursor < routeTargetBuildingIndices.length;
    vehicles.push({
      index,
      id: c.view.getInt32(start, true),
      parentVehicleId: c.view.getInt32(start + 0x04, true),
      currentBuildingIndex: c.view.getInt32(start + 0x1c, true),
      homeWorkplaceBuildingIndex: c.view.getInt32(start + 0x20, true),
      stationBuildingIndex: c.view.getInt32(start + 0x30, true),
      stationEnteringBuildingIndex: c.view.getInt32(start + 0x34, true),
      shouldExitStationTargetBuildingIndex: c.view.getInt32(start + 0xa4, true),
      movingInsideBuildingIndex: c.view.getInt32(start + 0x1b8, true),
      schedulePairCount: nestedCount,
      routeTargetBuildingIndices,
      currentScheduleCursor,
      hasValidScheduleCursor,
      currentScheduleTargetBuildingIndex: hasValidScheduleCursor
        ? routeTargetBuildingIndices[currentScheduleCursor] : null,
      currentLineIntervalRaw: c.view.getFloat32(h + 0x18, true),
      model: c.asciiZStrict(start + 0x728, 0x80, `vehicle ${index} model`),
      ownershipField: c.view.getInt32(start + 0x10, true),
      fuel: c.view.getFloat32(start + 0x7b8, true),
      // Exact sale/depreciation formula input; not a universal operating state.
      saleAdjustmentState: c.view.getInt32(start + 0x7cc, true),
      accumulatedUsage: blobSize >= 8
        ? c.f64beAt(blobStart, `vehicle ${index} accumulated usage`) : null,
      age: blobSize >= 16 ? c.f64beAt(blobStart + 8, `vehicle ${index} age`) : null,
      cargo,
    });
    if (onProgress && (index % 100 === 0 || index + 1 === total)) onProgress(index + 1, total);
  }

  if (c.offset !== c.bytes.length) throw new Error(`vehicles.bin has ${c.bytes.length - c.offset} trailing bytes`);
  return {
    vehicles,
    summary: { recordCount: total, byteLength: c.bytes.length, trailingBytes: 0 },
  };
}

function readLineScheduleBlock(c, context) {
  const start = c.offset;
  c.require(0x18, `${context} header`);
  const count = c.countAt(start + 8, `${context} entry count`);
  c.skip(0x18, `${context} header`);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const row = c.offset;
    c.require(0x48, `${context} entry ${index}`);
    entries.push({
      key: c.asciiZStrict(row, 0x40, `${context} entry ${index} key`),
      valueA: c.view.getFloat32(row + 0x40, true),
      valueB: c.view.getFloat32(row + 0x44, true),
    });
    c.skip(0x48, `${context} entry ${index}`);
  }
  return {
    rawByte00: c.view.getUint8(start),
    rawField04: c.view.getInt32(start + 4, true),
    flags: [...c.bytes.subarray(start + 0x0c, start + 0x15)],
    entries,
  };
}

export function parseLines(buffer, { saveVersion = 124 } = {}) {
  const c = new BinaryCursor(buffer);
  const total = c.u32('line count');
  if (total > 100_000) throw new Error(`implausible line count ${total}`);
  const lines = [];
  for (let slot = 0; slot < total; slot += 1) {
    const header = c.offset;
    c.require(0x18, `line ${slot} header`);
    const stopCount = c.countAt(header + 0x0c, `line ${slot} stop count`);
    const scheduleCount = c.countAt(header + 0x10, `line ${slot} schedule count`);
    const vehicleCount = c.countAt(header + 0x14, `line ${slot} vehicle count`);
    const rawField00 = c.view.getInt32(header, true);
    const rawField04 = c.view.getInt32(header + 4, true);
    const rawField08 = c.view.getInt32(header + 8, true);
    c.skip(0x18, `line ${slot} header`);
    const nameOffset = c.offset;
    c.require(0x200, `line ${slot} name`);
    const name = c.utf16ZStrict(nameOffset, 0x200, `line ${slot} name`);
    c.skip(0x200, `line ${slot} name`);
    const stopIds = Array.from({ length: stopCount }, (_, index) => c.i32(`line ${slot} stop ${index}`));
    const schedules = Array.from({ length: scheduleCount }, (_, index) => ({
      primary: readLineScheduleBlock(c, `line ${slot} schedule ${index} primary`),
      secondary: readLineScheduleBlock(c, `line ${slot} schedule ${index} secondary`),
    }));
    const vehicleIds = Array.from({ length: vehicleCount }, (_, index) =>
      c.i32(`line ${slot} vehicle ${index}`));
    const observedIntervals = saveVersion > 0x77
      ? Array.from({ length: stopCount }, (_, index) => c.f32(`line ${slot} observed interval ${index}`))
      : [];
    lines.push({
      slot, name, rawField00, rawField04, rawField08,
      stopIds, schedules, vehicleIds, observedIntervals,
    });
  }
  if (c.offset !== c.bytes.length) throw new Error(`lines.bin has ${c.bytes.length - c.offset} trailing bytes`);
  return {
    lines,
    summary: { recordCount: total, byteLength: c.bytes.length, trailingBytes: 0 },
  };
}

export function parseUsedVehicles(buffer) {
  const c = new BinaryCursor(buffer);
  c.require(0x48, 'usedveh.bin header');
  const u24be = offset => (c.bytes[offset] << 16) | (c.bytes[offset + 1] << 8) | c.bytes[offset + 2];
  const declaredCount = c.view.getUint32(0x44, true);
  if (declaredCount > 1_000_000) throw new Error(`implausible used vehicle count ${declaredCount}`);
  const declaredDataStart = u24be(0x28);
  const declaredDataLength = u24be(0x30);
  const dataStart = c.bytes.length - declaredDataLength;
  if (declaredDataStart !== dataStart) {
    throw new Error(`usedveh.bin data start mismatch: header=${declaredDataStart}, EOF-derived=${dataStart}`);
  }
  if (dataStart < 0x48 || dataStart > c.bytes.length) throw new Error(`usedveh.bin invalid data start ${dataStart}`);

  const offers = [];
  const spans = [];
  let cursor = dataStart;
  while (cursor < c.bytes.length) {
    const start = cursor;
    if (start + 0x20 > c.bytes.length) throw new Error(`usedveh.bin truncated record header at 0x${start.toString(16)}`);
    const valueCount = c.view.getUint16(start, false);
    const age = c.view.getFloat64(start + 2, false);
    const accumulatedUsage = c.view.getFloat64(start + 10, false);
    const modifier = c.view.getFloat64(start + 18, false);
    const taggedLength = c.view.getUint32(start + 26, false);
    const taggedStart = start + 30;
    const taggedEnd = taggedStart + taggedLength;
    if (taggedEnd + 2 > c.bytes.length) throw new Error(`usedveh.bin truncated tagged block at 0x${start.toString(16)}`);
    let tagCursor = taggedStart;
    let model = null;
    let metadata = null;
    while (tagCursor < taggedEnd) {
      if (tagCursor + 4 > taggedEnd) throw new Error(`usedveh.bin truncated tag header at 0x${tagCursor.toString(16)}`);
      const id = c.view.getUint16(tagCursor, false);
      const length = c.view.getUint16(tagCursor + 2, false);
      const valueStart = tagCursor + 4;
      const valueEnd = valueStart + length;
      if (valueEnd > taggedEnd) throw new Error(`usedveh.bin tag ${id} overruns record at 0x${start.toString(16)}`);
      if (id === 1) {
        if (!length || c.bytes[valueEnd - 1] !== 0) throw new Error(`usedveh.bin model tag is not NUL-terminated at 0x${start.toString(16)}`);
        model = ascii.decode(c.bytes.subarray(valueStart, valueEnd - 1));
      } else if (id === 2) {
        if (length !== 4) throw new Error(`usedveh.bin metadata tag length ${length}, expected 4`);
        metadata = c.view.getInt32(valueStart, false);
      }
      tagCursor = valueEnd;
    }
    if (c.view.getUint16(taggedEnd, false) !== 0) throw new Error(`usedveh.bin record terminator is not zero at 0x${start.toString(16)}`);
    if (valueCount !== 1 || model === null || metadata === null
        || ![age, accumulatedUsage, modifier].every(Number.isFinite)) {
      throw new Error(`usedveh.bin invalid record ${offers.length} at 0x${start.toString(16)}`);
    }
    cursor = taggedEnd + 2;
    spans.push({ start, length: cursor - start });
    offers.push({ index: offers.length, model, age, accumulatedUsage, modifier, metadata });
  }
  if (offers.length !== declaredCount) {
    throw new Error(`usedveh.bin count mismatch: header=${declaredCount}, traversed=${offers.length}`);
  }

  const expectedIndex = [];
  for (let index = 0; index < spans.length; index += 1) {
    const relativeStart = spans[index].start - dataStart;
    if (spans[index].length > 0xff) throw new Error('usedveh.bin unsupported compact-index record width');
    expectedIndex.push(relativeStart & 0xff, 0, 0, 0, spans[index].length);
    if (index + 1 < spans.length) {
      const next = spans[index + 1].start - dataStart;
      expectedIndex.push((next >>> 24) & 0xff, (next >>> 16) & 0xff, (next >>> 8) & 0xff);
    }
  }
  const actualIndex = c.bytes.subarray(0x48, dataStart);
  if (actualIndex.length !== expectedIndex.length
      || expectedIndex.some((value, index) => actualIndex[index] !== value)) {
    throw new Error('usedveh.bin compact span index does not match traversed records');
  }
  return {
    offers,
    summary: { recordCount: declaredCount, byteLength: c.bytes.length, trailingBytes: 0 },
  };
}

const first = stackOffset => 0x728 - stackOffset;
const second = stackOffset => 0x548 + 0x8b8 - stackOffset;

function readEbc70(c, context, storageIndex) {
  const start = c.offset;
  c.require(0x20, context);
  const n48 = c.countAt(start, `${context}.n48`);
  const n188 = c.countAt(start + 0x14, `${context}.n188`);
  const n12a = c.countAt(start + 0x18, `${context}.n12a`);
  const n12b = c.countAt(start + 0x1c, `${context}.n12b`);
  const resources = [];
  for (let index = 0; index < n48; index += 1) {
    const offset = start + 0x20 + index * 0x48;
    resources.push({
      resource: c.asciiZStrict(offset, 0x40, `${context}.resource[${index}]`),
      amount: c.view.getFloat32(offset + 0x40, true),
      secondary: c.view.getFloat32(offset + 0x44, true),
    });
  }
  c.skip(0x20 + n48 * 0x48 + n188 * 0xbc + (n12a + n12b) * 0xc, context);
  return {
    storageIndex,
    inputFlag: c.view.getUint8(start + 4),
    outputFlag: c.view.getUint8(start + 5),
    selector: c.view.getInt32(start + 8, true),
    capacity: c.view.getFloat32(start + 0x0c, true),
    mode: c.view.getInt32(start + 0x10, true),
    resources,
  };
}

function readEc470(c, context) {
  const start = c.offset;
  c.require(0x10, context);
  const count = c.countAt(start, `${context}.count`);
  c.skip(0x10, `${context}.header`);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    entries.push({
      resource: c.asciiZStrict(c.offset, 0x40, `${context}.resource[${index}]`),
      amount: c.view.getFloat32(c.offset + 0x40, true),
      secondary: c.view.getFloat32(c.offset + 0x44, true),
    });
    c.skip(0x48, `${context}.resource[${index}]`);
  }
  return entries;
}

function skipEc730(c, context) {
  c.require(0x2c, context);
  const n5c = c.countAt(c.offset + 0x0c, `${context}.n5c`);
  const n58 = c.countAt(c.offset + 0x10, `${context}.n58`);
  const n54 = c.countAt(c.offset + 0x14, `${context}.n54`);
  const n50 = c.countAt(c.offset + 0x18, `${context}.n50`);
  const n4c = c.countAt(c.offset + 0x1c, `${context}.n4c`);
  const n48 = c.countAt(c.offset + 0x20, `${context}.n48`);
  const n44 = c.countAt(c.offset + 0x24, `${context}.n44`);
  const n40 = c.countAt(c.offset + 0x28, `${context}.n40`);
  c.skip(0x2c + (n58 + n54 + n4c + n44 + n40) * 4 + (n5c + n50) * 8 + n48 * 0xc, context);
}

function skipEd0c0(c, context) {
  c.require(0x24, context);
  const n54 = c.countAt(c.offset + 4, `${context}.n54`);
  const n50 = c.countAt(c.offset + 8, `${context}.n50`);
  const n4c = c.countAt(c.offset + 0xc, `${context}.n4c`);
  c.skip(0x24 + (n54 + n50) * 8 + n4c * 4, context);
}

function skipCompound(c, context) {
  c.require(0x18, context);
  const count = c.countAt(c.offset + 8, `${context}.count`);
  c.skip(0x18 + count * 0x48, context);
}

function readDistributionCompound(c, context) {
  const start = c.offset;
  c.require(0x18, context);
  const count = c.countAt(start + 8, `${context}.count`);
  const enabled = c.view.getUint8(start) !== 0;
  const threshold = c.view.getFloat32(start + 4, true);
  c.skip(0x18, `${context}.header`);
  const resources = [];
  for (let index = 0; index < count; index += 1) {
    resources.push(c.asciiZStrict(c.offset, 0x40, `${context}.resource[${index}]`));
    c.skip(0x48, `${context}.resource[${index}]`);
  }
  return { enabled, threshold, resources };
}

function skipEd810(c, context) {
  c.require(0x28, context);
  const count = c.countAt(c.offset + 0x24, `${context}.count`);
  c.skip(0x28 + count * 0x48, context);
}

export function parseBuildingsGame(buffer, { onProgress } = {}) {
  const c = new BinaryCursor(buffer);
  const total = c.u32('building count');
  if (total > 1_000_000) throw new Error(`implausible building count ${total}`);
  const records = [];
  const fixedCount = (start, stack, extension = false) =>
    c.countAt(start + (extension ? second(stack) : first(stack)), `fixed local_${stack.toString(16)}`);

  for (let index = 0; index < total; index += 1) {
    const start = c.offset;
    c.require(0x6d8, `building ${index} fixed block`);
    const record = {
      index,
      start,
      type: c.asciiZ(start, 0x100),
      settlementId: c.view.getInt32(start + 0x100, true),
      name: c.utf16Z(start + 0x11c, 0x200),
      x: c.view.getFloat32(start + 0x39c, true),
      y: c.view.getFloat32(start + 0x3a0, true),
      z: c.view.getFloat32(start + 0x3a4, true),
      currentWorkers: c.view.getInt32(start + first(0x2b0), true),
      currentVisitors: c.view.getInt32(start + 0x47c, true),
      effectiveServiceCapacity: c.view.getFloat32(start + 0x490, true),
      savedTypePlusOne: c.view.getInt32(start + 0x564, true),
      // These four offsets are polymorphic. They acquire production semantics
      // only after the asset type and declared outputs pass the strict model gate.
      polymorphicRolling: {
        currentRate: c.view.getFloat32(start + 0x490, true),
        previousQuantity: c.view.getFloat32(start + 0x494, true),
        partialQuantity: c.view.getFloat32(start + 0x498, true),
        dayProgress: c.view.getFloat32(start + 0x49c, true),
      },
      incompleteCaseCount: c.view.getFloat32(start + 0x4b8, true),
      currentWorkPerActiveCase: c.view.getFloat32(start + 0x4bc, true),
      savedAssignedEventCount: c.view.getInt32(start + 0x594, true),
      configuredWorkers: c.view.getInt32(start + first(0x288), true),
      configuredWorkersHighEducation: c.view.getInt32(start + first(0x284), true),
      mineQuality: c.view.getFloat32(start + first(0x280), true),
      constructionProgress: c.view.getFloat32(start + 0x3e8, true),
    };
    c.offset = start + 0x6d8;

    const n338 = fixedCount(start, 0x338);
    for (let i = 0; i < n338; i += 1) {
      c.require(0x2020, `building ${index}.338[${i}]`);
      const entries = c.countAt(c.offset + 0x14, `building ${index}.338[${i}].entries`);
      const nested = c.countAt(c.offset + 0x201c, `building ${index}.338[${i}].nested`);
      c.skip(0x2020 + nested * 0x20 + entries * 0x48, `building ${index}.338[${i}]`);
    }
    c.skip(fixedCount(start, 0x328) * 0xbc, `building ${index}.328`);
    c.skip(fixedCount(start, 0x324) * 4, `building ${index}.324`);
    c.skip(fixedCount(start, 0x31c) * 0xbc, `building ${index}.31c`);
    c.skip(fixedCount(start, 0x320) * 4, `building ${index}.320`);

    const n310 = fixedCount(start, 0x310);
    record.storages = [];
    for (let i = 0; i < n310; i += 1) {
      record.storages.push(readEbc70(c, `building ${index}.310a[${i}]`, i));
    }
    const typePlusOne = record.savedTypePlusOne;
    if (typePlusOne === 0x20 || typePlusOne === 0x21) c.skip(n310 * 4, `building ${index}.310extra`);
    for (let i = 0; i < n310; i += 1) {
      const controls = readEc470(c, `building ${index}.310b[${i}]`);
      if (controls.length) record.storages[i].controls = controls;
    }
    c.skip(c.view.getUint8(start + second(0x821)), `building ${index}.821`);

    c.skip(fixedCount(start, 0x304) * 0x3c, `building ${index}.304`);
    c.skip(fixedCount(start, 0x300) * 0x3c, `building ${index}.300`);
    c.skip(fixedCount(start, 0x2fc) * 0x20, `building ${index}.2fc`);
    c.skip(fixedCount(start, 0x2d8) * 0x20, `building ${index}.2d8`);
    for (const stack of [0x2b0, 0x2ac, 0x2a8, 0x2a4]) c.skip(fixedCount(start, stack) * 4, `building ${index}.${stack.toString(16)}`);
    c.skip(fixedCount(start, 0x7d0, true) * 4, `building ${index}.7d0`);
    const associatedVehicleCount = fixedCount(start, 0x2a0);
    const associatedVehicleIds = Array.from({ length: associatedVehicleCount }, (_, item) =>
      c.i32(`building ${index}.2a0[${item}]`));
    for (let i = 0, n = fixedCount(start, 0x29c); i < n; i += 1) skipEc730(c, `building ${index}.29c[${i}]`);
    for (let i = 0, n = fixedCount(start, 0x21c); i < n; i += 1) skipEd0c0(c, `building ${index}.21c[${i}]`);

    c.skip(fixedCount(start, 0x260) * 0xc, `building ${index}.260`);
    c.skip(fixedCount(start, 0x224) * 0xc, `building ${index}.224`);
    c.skip(fixedCount(start, 0x25c) * 0x1c, `building ${index}.25c`);
    for (const stack of [0x24c, 0x248, 0x244]) c.skip(fixedCount(start, stack) * 0xc, `building ${index}.${stack.toString(16)}`);
    c.skip(fixedCount(start, 0x88c, true) * 0xc, `building ${index}.88c`);
    c.skip(fixedCount(start, 0x240) * 8, `building ${index}.240`);
    c.skip(fixedCount(start, 0x23c) * 8, `building ${index}.23c`);
    c.skip(fixedCount(start, 0x314) * 4, `building ${index}.314`);
    c.skip(fixedCount(start, 0x234) * 4, `building ${index}.234`);
    c.skip(fixedCount(start, 0x804, true) * 4, `building ${index}.804`);

    if (fixedCount(start, 0x230) > 0) {
      const firstCount = c.countAt(c.offset, `building ${index}.230a`);
      c.skip(4 + firstCount * 0x20, `building ${index}.230a`);
      const secondCount = c.countAt(c.offset, `building ${index}.230b`);
      c.skip(4 + secondCount * 0x10 + 0x14, `building ${index}.230b`);
    }
    c.skip(fixedCount(start, 0x204) * 4, `building ${index}.204`);
    if (fixedCount(start, 0x1fc) === 1) c.skip(0x100, `building ${index}.1fc`);
    if (fixedCount(start, 0x1f8) === 1) for (let i = 0; i < 4; i += 1) skipCompound(c, `building ${index}.1f8[${i}]`);
    const distributionAssignments = [];
    for (let i = 0, n = fixedCount(start, 0x1f4); i < n; i += 1) {
      const targetBuildingIndex = c.i32(`building ${index}.1f4[${i}].id`);
      const load = readDistributionCompound(c, `building ${index}.1f4[${i}].load`);
      const unload = readDistributionCompound(c, `building ${index}.1f4[${i}].unload`);
      distributionAssignments.push({ targetBuildingIndex, load, unload });
    }
    c.skip(fixedCount(start, 0x1e8) * 4, `building ${index}.1e8`);
    c.skip(0x80, `building ${index}.fixed32`);
    const textLength = fixedCount(start, 0x1f0);
    if (textLength > 0) c.skip((textLength + 1) * 2, `building ${index}.1f0`);
    c.skip(fixedCount(start, 0x1e4) * 4, `building ${index}.1e4`);
    c.skip(fixedCount(start, 0x8ac, true) * 0x88, `building ${index}.8ac`);
    c.skip(fixedCount(start, 0x8a0, true) * 4, `building ${index}.8a0`);
    c.skip(fixedCount(start, 0x880, true) * 0x10, `building ${index}.880`);
    c.skip(fixedCount(start, 0x87c, true) * (0xbc + 4), `building ${index}.87c`);
    c.skip(fixedCount(start, 0x878, true) * 4, `building ${index}.878`);
    c.skip(fixedCount(start, 0x86c, true) * 4, `building ${index}.86c`);
    if (fixedCount(start, 0x820, true) !== 0) c.skip(0x80, `building ${index}.820`);
    for (let i = 0, n = fixedCount(start, 0x7cc, true); i < n; i += 1) skipEd810(c, `building ${index}.7cc[${i}]`);
    c.skip(fixedCount(start, 0x7c8, true) * 4, `building ${index}.7c8`);
    c.skip(fixedCount(start, 0x7b0, true) * 0x10, `building ${index}.7b0`);

    if (typePlusOne === 0x2c || typePlusOne === 0x35) {
      record.distributionKind = typePlusOne === 0x2c ? 'road' : 'rail';
      record.associatedVehicleIds = associatedVehicleIds;
      record.distributionAssignments = distributionAssignments;
    }
    record.end = c.offset;
    records.push(record);
    if (onProgress && (index % 50 === 0 || index + 1 === total)) onProgress(index + 1, total);
  }

  if (c.offset !== c.bytes.length) throw new Error(`buildings_game.bin has ${c.bytes.length - c.offset} trailing bytes`);
  return records;
}

export function reconcileSettlementMembership(settlements, buildings) {
  const owners = new Map();
  const invalidMemberRefs = [];
  for (const settlement of settlements) {
    for (const index of settlement.members) {
      if (index < 0 || index >= buildings.length) {
        invalidMemberRefs.push({ settlementId: settlement.id, buildingIndex: index });
        continue;
      }
      const list = owners.get(index) ?? [];
      list.push(settlement.id);
      owners.set(index, list);
    }
  }

  let fallbackAssignments = 0;
  let unassigned = 0;
  for (const building of buildings) {
    if (building.settlementId >= 0 && building.settlementId < settlements.length) {
      building.scopeId = building.settlementId;
      continue;
    }
    const candidates = owners.get(building.index) ?? [];
    if (candidates.length === 1) {
      building.scopeId = candidates[0];
      fallbackAssignments += 1;
    } else {
      building.scopeId = null;
      unassigned += 1;
    }
  }

  const duplicateMembers = [...owners.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([buildingIndex, settlementIds]) => ({ buildingIndex, settlementIds }));
  return { invalidMemberRefs, duplicateMembers, fallbackAssignments, unassigned };
}
