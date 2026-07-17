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

  asciiZ(offset, size) {
    let end = offset;
    const limit = offset + size;
    while (end < limit && this.bytes[end] !== 0) end += 1;
    return ascii.decode(this.bytes.subarray(offset, end));
  }

  utf16Z(offset, size) {
    let end = offset;
    const limit = offset + size;
    while (end + 1 < limit && this.view.getUint16(end, true) !== 0) end += 2;
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

const first = stackOffset => 0x728 - stackOffset;
const second = stackOffset => 0x548 + 0x8b8 - stackOffset;

function skipEbc70(c, context) {
  c.require(0x20, context);
  const n48 = c.countAt(c.offset, `${context}.n48`);
  const n188 = c.countAt(c.offset + 0x14, `${context}.n188`);
  const n12a = c.countAt(c.offset + 0x18, `${context}.n12a`);
  const n12b = c.countAt(c.offset + 0x1c, `${context}.n12b`);
  c.skip(0x20 + n48 * 0x48 + n188 * 0xbc + (n12a + n12b) * 0xc, context);
}

function skipEc470(c, context) {
  c.require(0x10, context);
  const count = c.countAt(c.offset, `${context}.count`);
  c.skip(0x10 + count * 0x48, context);
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
    for (let i = 0; i < n310; i += 1) skipEbc70(c, `building ${index}.310a[${i}]`);
    const typePlusOne = c.view.getInt32(start + second(0x89c), true);
    if (typePlusOne === 0x20 || typePlusOne === 0x21) c.skip(n310 * 4, `building ${index}.310extra`);
    for (let i = 0; i < n310; i += 1) skipEc470(c, `building ${index}.310b[${i}]`);
    c.skip(c.view.getUint8(start + second(0x821)), `building ${index}.821`);

    c.skip(fixedCount(start, 0x304) * 0x3c, `building ${index}.304`);
    c.skip(fixedCount(start, 0x300) * 0x3c, `building ${index}.300`);
    c.skip(fixedCount(start, 0x2fc) * 0x20, `building ${index}.2fc`);
    c.skip(fixedCount(start, 0x2d8) * 0x20, `building ${index}.2d8`);
    for (const stack of [0x2b0, 0x2ac, 0x2a8, 0x2a4]) c.skip(fixedCount(start, stack) * 4, `building ${index}.${stack.toString(16)}`);
    c.skip(fixedCount(start, 0x7d0, true) * 4, `building ${index}.7d0`);
    c.skip(fixedCount(start, 0x2a0) * 4, `building ${index}.2a0`);
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
    for (let i = 0, n = fixedCount(start, 0x1f4); i < n; i += 1) {
      c.skip(4, `building ${index}.1f4[${i}].id`);
      skipCompound(c, `building ${index}.1f4[${i}].a`);
      skipCompound(c, `building ${index}.1f4[${i}].b`);
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
