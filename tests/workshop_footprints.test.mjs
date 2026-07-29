import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { footprintBesideIni } from '../tools/workshop_fetch.mjs';

// A `.bbox` is a u32 count then that many 540-byte records, each carrying its
// local box as six floats at +516. Building the bytes here rather than
// shipping a fixture keeps the expectation and the format in one place.
function bboxFile(boxes) {
  const buffer = Buffer.alloc(4 + boxes.length * 540);
  buffer.writeUInt32LE(boxes.length, 0);
  boxes.forEach((box, index) => {
    const at = 4 + index * 540 + 516;
    for (const [offset, value] of box.entries()) buffer.writeFloatLE(value, at + offset * 4);
  });
  return buffer;
}

const withFolder = run => {
  const dir = mkdtempSync(path.join(tmpdir(), 'workshop-bbox-'));
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('a building outline is read from the bbox beside its ini', () => {
  withFolder(dir => {
    // minX, minY, minZ, maxX, maxY, maxZ
    writeFileSync(path.join(dir, 'building.bbox'), bboxFile([[-5, 0, -3, 5, 8, 3]]));
    const footprint = footprintBesideIni(dir);
    assert.deepEqual(footprint.boxes, [[-5, -3, 5, 3]]);
    assert.equal(footprint.height, 8);
  });
});

test('a building with several parts keeps every box', () => {
  withFolder(dir => {
    writeFileSync(path.join(dir, 'building.bbox'),
      bboxFile([[-5, 0, -3, 5, 8, 3], [5, 0, -1, 9, 4, 1]]));
    const footprint = footprintBesideIni(dir);
    assert.equal(footprint.boxes.length, 2);
    // The tallest part decides the building's height.
    assert.equal(footprint.height, 8);
  });
});

test('a box below ground still counts towards the height', () => {
  withFolder(dir => {
    writeFileSync(path.join(dir, 'building.bbox'), bboxFile([[-2, -3, -2, 2, 5, 2]]));
    // A basement at -3 with a roof at 5 is 8 tall, not 5.
    assert.equal(footprintBesideIni(dir).height, 8);
  });
});

test('coordinates are rounded to centimetres to keep the catalogue small', () => {
  withFolder(dir => {
    writeFileSync(path.join(dir, 'building.bbox'), bboxFile([[-1.23456, 0, -2.98765, 3.5, 2, 4.5]]));
    assert.deepEqual(footprintBesideIni(dir).boxes, [[-1.23, -2.99, 3.5, 4.5]]);
  });
});

test('a box that rounds away to a line is dropped', () => {
  withFolder(dir => {
    // Two millimetres wide: it rounds to zero width and would draw as nothing.
    writeFileSync(path.join(dir, 'building.bbox'), bboxFile([[0, 0, 0, 0.002, 3, 4]]));
    assert.equal(footprintBesideIni(dir), null);
  });
});

test('a mod with no bbox has no outline rather than failing', () => {
  withFolder(dir => assert.equal(footprintBesideIni(dir), null));
});

test('a malformed bbox costs the building its outline, not its definition', () => {
  withFolder(dir => {
    // A count that does not match the file length: the parser rejects it, and
    // the extraction has to survive that rather than abandoning the whole mod.
    writeFileSync(path.join(dir, 'building.bbox'), Buffer.from([9, 0, 0, 0, 1, 2, 3]));
    assert.equal(footprintBesideIni(dir), null);
  });
});
