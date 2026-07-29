import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PEDESTRIAN_NETWORK_CLASS, WALKING_BUDGET_METRES,
  pedestrianSurface, buildWalkingNetwork, walkingReachFrom,
} from '../js/models/walking_access.js';

function chain(lengths, { surfaceType = 2, surfaceSubtype = 0 } = {}) {
  const nodes = lengths.map((_, index) => ({ id: index, x: index, y: 0, z: 0 }));
  nodes.push({ id: lengths.length, x: lengths.length, y: 0, z: 0 });
  const edges = lengths.map((length, index) => ({
    id: index, from: index, to: index + 1, length, points: [],
    surfaceType, surfaceSubtype, networkClass: PEDESTRIAN_NETWORK_CLASS,
  }));
  return { nodes, edges };
}

function mixedChain(legs) {
  const nodes = legs.map((_, index) => ({ id: index, x: index, y: 0, z: 0 }));
  nodes.push({ id: legs.length, x: legs.length, y: 0, z: 0 });
  const edges = legs.map(([length, surfaceType], index) => ({
    id: index, from: index, to: index + 1, length, points: [],
    surfaceType, surfaceSubtype: 0, networkClass: PEDESTRIAN_NETWORK_CLASS,
  }));
  return { nodes, edges };
}

function attach(index, edgeIds) {
  return {
    index,
    connections: edgeIds.map(id => ({
      kind: 2, x: 0, y: 0, z: 0,
      references: [{ id, networkClass: PEDESTRIAN_NETWORK_CLASS }],
    })),
  };
}

test('surface percentages match the figures the build menu prints', () => {
  const percent = (surfaceType, surfaceSubtype = 0) =>
    pedestrianSurface({ surfaceType, surfaceSubtype }).percent;
  assert.equal(percent(-1), 0.5);
  assert.equal(percent(2), 1);
  assert.equal(percent(2, 1), 1);
  assert.equal(percent(0), 0.875);
  assert.ok(Math.abs(percent(1) - 23 / 24) < 1e-6);
  assert.ok(Math.abs(percent(20) - 5 / 6) < 1e-6);
  assert.deepEqual(
    [-1, 0, 1, 2, 10, 20, 7].map(type => pedestrianSurface({ surfaceType: type, surfaceSubtype: 0 }).key),
    ['mud', 'gravel', 'asphalt', 'asphaltLit', 'bridge', 'tunnel', 'other'],
  );
  assert.equal(pedestrianSurface({ surfaceType: 1, surfaceSubtype: 1 }).key, 'brick');
  assert.equal(pedestrianSurface({ surfaceType: 2, surfaceSubtype: 1 }).key, 'brickLit');
});

test('a mud path runs out at half the budget and a lit path at all of it', () => {
  const budget = WALKING_BUDGET_METRES;
  for (const [surfaceType, reach] of [[-1, budget / 2], [2, budget]]) {
    const network = buildWalkingNetwork(chain([1, reach], { surfaceType }), [
      attach(1, [0]), attach(2, [1]),
    ]);
    const result = walkingReachFrom(network, 1);
    assert.equal(result.available, true);
    assert.equal(result.buildings.get(2).distanceMeters, reach);
    const tooFar = buildWalkingNetwork(chain([1, reach + 1], { surfaceType }), [
      attach(1, [0]), attach(2, [1]),
    ]);
    assert.equal(walkingReachFrom(tooFar, 1).buildings.has(2), false);
  }
});

test('the step being taken decides the limit, not the surface already walked', () => {
  // 300 m of lit path is well inside the budget, but stepping onto mud measures
  // the whole 320 m against the mud percentage, which 480 m cannot cover.
  const network = buildWalkingNetwork(mixedChain([
    [1, 2], [300, 2], [20, -1],
  ]), [attach(1, [0]), attach(2, [2])]);
  assert.equal(walkingReachFrom(network, 1).buildings.has(2), false);
});

test('the edge a building is bound to is free from that building', () => {
  // Charging the 470 m seed edge would put the far building at 870 m and out of
  // reach; the game never charges it, so the walk measures 400 m.
  const network = buildWalkingNetwork(chain([470, 200, 200]), [attach(1, [0]), attach(2, [2])]);
  const reach = walkingReachFrom(network, 1).buildings.get(2);
  assert.equal(reach.distanceMeters, 400);
  assert.equal(reach.limitingSurface, 'asphaltLit');
});

test('two buildings sharing one edge are reachable without walking', () => {
  const network = buildWalkingNetwork(chain([10]), [attach(1, [0]), attach(2, [0])]);
  assert.equal(walkingReachFrom(network, 1).buildings.get(2).distanceMeters, 0);
});

test('the reported limiting leg is the step that came closest to the budget', () => {
  const network = buildWalkingNetwork(mixedChain([
    [1, 2], [200, -1], [30, 2],
  ]), [attach(1, [0]), attach(2, [2])]);
  const reach = walkingReachFrom(network, 1).buildings.get(2);
  assert.equal(reach.distanceMeters, 230);
  assert.equal(reach.limitingSurface, 'mud');
  assert.equal(reach.limitingEdgeId, 1);
  assert.equal(reach.budgetUsed, 400);
});

test('a building with no saved pedestrian connection is unavailable, never guessed', () => {
  const network = buildWalkingNetwork(chain([10]), [attach(1, [0]), { index: 9, connections: [] }]);
  assert.deepEqual(walkingReachFrom(network, 9), {
    available: false, reason: 'building-not-attached',
    budgetMeters: WALKING_BUDGET_METRES, buildings: new Map(),
  });
  assert.equal(walkingReachFrom(network, 1).buildings.has(9), false);
});

test('references to other networks and to missing edges never attach a building', () => {
  const network = buildWalkingNetwork(chain([10]), [{
    index: 4,
    connections: [{
      kind: 0, x: 0, y: 0, z: 0,
      references: [{ id: 0, networkClass: 0 }, { id: 77, networkClass: PEDESTRIAN_NETWORK_CLASS }],
    }],
  }]);
  assert.equal(network.buildingEdges.has(4), false);
  assert.equal(network.completeness.danglingReferences, 1);
  assert.equal(network.completeness.walkingEdgesComplete, false);
});
