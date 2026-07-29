import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformBuildingLocalXZ } from '../js/building_geometry.js';

test('building-local map points follow the saved planar rotation and translation', () => {
  const building = {
    x: 100,
    y: 5,
    z: 200,
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
  };

  const result = transformBuildingLocalXZ(building, { x: 12, z: -4 });

  assert.ok(Math.abs(result.x - 96) < 1e-9);
  assert.ok(Math.abs(result.z - 188) < 1e-9);
});

test('building-local transform rejects missing saved geometry', () => {
  assert.equal(transformBuildingLocalXZ({ x: 1, z: 3 }, { x: 4, z: 6 }), null);
  assert.equal(transformBuildingLocalXZ(
    { x: 1, z: 3, rotation: { x: 0, y: 0, z: 0 } },
    { x: Number.NaN, z: 6 },
  ), null);
  assert.equal(transformBuildingLocalXZ(
    { x: 1, z: 3, rotation: { x: 0.1, y: 0, z: 0 } },
    { x: 4, z: 6 },
  ), null);
});
