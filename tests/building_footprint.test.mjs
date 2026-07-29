import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  footprintKeyFor, footprintRingsFor, mergedFootprints, rotateLocalPoint,
} from '../js/models/building_footprint.js';
import { parseBoundingBoxes } from '../tools/extract_building_footprints.mjs';

const FOOTPRINTS = {
  panelak: { boxes: [[-5, -10, 5, 10]], height: 20 },
  'dlc3/residential5': { boxes: [[-23.5, -6.25, 23.5, 8.75]], height: 15.22 },
};

function bboxFixture(boxes) {
  const buffer = new ArrayBuffer(4 + boxes.length * 540);
  const view = new DataView(buffer);
  view.setUint32(0, boxes.length, true);
  boxes.forEach((box, index) => {
    const at = 4 + index * 540 + 516;
    box.forEach((value, item) => view.setFloat32(at + item * 4, value, true));
  });
  return Buffer.from(buffer);
}

test('a bbox companion is read as a count and fixed-size records', () => {
  const buffer = bboxFixture([[-1, -0.5, -2, 3, 4, 5], [0, 0, 0, 1, 1, 1]]);
  assert.deepEqual(parseBoundingBoxes(buffer), [
    { minX: -1, minZ: -2, maxX: 3, maxZ: 5, height: 4.5 },
    { minX: 0, minZ: 0, maxX: 1, maxZ: 1, height: 1 },
  ]);
  assert.throws(() => parseBoundingBoxes(buffer.subarray(0, buffer.length - 1)), /does not match/);
});

test('degenerate boxes are dropped rather than drawn as slivers', () => {
  assert.deepEqual(parseBoundingBoxes(bboxFixture([[5, 0, 5, 5, 1, 5]])), []);
});

test('the installed dataset covers the buildings it was extracted from', () => {
  const data = JSON.parse(readFileSync(new URL('../data/building_footprints.json', import.meta.url)));
  assert.equal(data.version, 1);
  const entries = Object.entries(data.footprints);
  assert.ok(entries.length > 500, `expected a full extraction, got ${entries.length}`);
  for (const [id, entry] of entries) {
    assert.ok(entry.boxes.length > 0, `${id} has no boxes`);
    for (const [minX, minZ, maxX, maxZ] of entry.boxes) {
      assert.ok(maxX > minX && maxZ > minZ, `${id} has a degenerate box`);
      assert.ok(Math.abs(minX) < 5000 && Math.abs(maxZ) < 5000, `${id} is implausibly large`);
    }
  }
});

test('save type names are matched to dataset ids the same way the category index matches them', () => {
  assert.equal(footprintKeyFor('panelak', FOOTPRINTS), 'panelak');
  assert.equal(footprintKeyFor('MIRRORZ_panelak', FOOTPRINTS), 'panelak');
  assert.equal(footprintKeyFor('DLC3_residential5', FOOTPRINTS), 'dlc3/residential5');
  assert.equal(footprintKeyFor('2114329588/unknown', FOOTPRINTS), null);
});

test('a quarter turn swaps the footprint axes', () => {
  const rings = footprintRingsFor(
    { type: 'panelak', x: 100, z: 200, rotation: { x: 0, y: Math.PI / 2, z: 0 } }, FOOTPRINTS,
  );
  const xs = rings[0].map(point => point.x);
  const zs = rings[0].map(point => point.z);
  assert.ok(Math.abs(Math.min(...xs) - 90) < 1e-6);
  assert.ok(Math.abs(Math.max(...xs) - 110) < 1e-6);
  assert.ok(Math.abs(Math.min(...zs) - 195) < 1e-6);
  assert.ok(Math.abs(Math.max(...zs) - 205) < 1e-6);
});

test('the rotation runs in the direction the saves agree with', () => {
  const rotated = rotateLocalPoint(1, 0, Math.PI / 2);
  assert.ok(Math.abs(rotated.x) < 1e-9);
  assert.ok(Math.abs(rotated.z + 1) < 1e-9);
});

test('a type with no extracted geometry stays a marker instead of an invented box', () => {
  assert.equal(footprintRingsFor({ type: 'no_such_building', x: 0, z: 0 }, FOOTPRINTS), null);
  assert.equal(footprintRingsFor({ type: 'panelak', x: NaN, z: 0 }, FOOTPRINTS), null);
});

test('workshop outlines overlay the extracted ones without disturbing them', () => {
  const base = { panelak: { boxes: [[-5, -10, 5, 10]], height: 20 } };
  const merged = mergedFootprints(base, [
    { id: '2114329588/ConveyorTower', footprint: { boxes: [[-1, -1, 1, 1]], height: 5 } },
    { id: 'panelak', footprint: { boxes: [[-2, -2, 2, 2]], height: 9 } },
  ]);
  // Save types are matched lowercased, so a mod folder's casing cannot hide it.
  assert.equal(footprintKeyFor('2114329588/conveyortower', merged), '2114329588/conveyortower');
  assert.equal(merged.panelak.height, 9, 'a mod may replace a type it overrides');
  assert.deepEqual(base.panelak.boxes, [[-5, -10, 5, 10]], 'the shared base is never mutated');
});

test('a mod with no usable outline is skipped rather than keyed to nothing', () => {
  const merged = mergedFootprints({}, [
    { id: 'mod/no-footprint' },
    { id: 'mod/empty', footprint: { boxes: [], height: 3 } },
    { footprint: { boxes: [[0, 0, 1, 1]], height: 1 } },
    null,
  ]);
  assert.deepEqual(merged, {});
});

test('merging without a catalogue leaves the extracted dataset alone', () => {
  const base = { panelak: { boxes: [[0, 0, 1, 1]], height: 2 } };
  assert.deepEqual(mergedFootprints(base), base);
  assert.deepEqual(mergedFootprints(null, []), {});
});
