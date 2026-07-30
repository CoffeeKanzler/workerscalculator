import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PEDESTRIAN_NETWORK_CLASS, WALKING_BUDGET_METRES,
  pedestrianSurface, walkingSurface, buildWalkingNetwork, walkingReachFrom,
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

test('citizens walk beside roads, not only on footpaths', () => {
  // The game's reach search seeds a building's road connection as readily as
  // its footpath one, so a building with only a road frontage is reachable.
  const roadEdge = (id, from, to, length, surfaceType = 1) => ({
    id, from, to, length, points: [], surfaceType, surfaceSubtype: 0, networkClass: 0,
  });
  const networks = {
    pedestrian: {
      nodes: [{ id: 0, x: 0, y: 0.38, z: 0 }, { id: 1, x: 100, y: 0.38, z: 0 }],
      edges: [{
        id: 0, from: 0, to: 1, length: 100, points: [],
        surfaceType: 2, surfaceSubtype: 0, networkClass: PEDESTRIAN_NETWORK_CLASS,
      }],
    },
    // The road meets the footpath at exactly the shared x/z of node 1; the
    // saved height differs by the constant surface offset, so the join is on
    // the horizontal coordinates.
    road: {
      nodes: [{ id: 0, x: 100, y: 0, z: 0 }, { id: 1, x: 200, y: 0, z: 0 }],
      edges: [roadEdge(0, 0, 1, 100)],
    },
  };
  const network = buildWalkingNetwork(networks, [
    { index: 1, connections: [{ kind: 2, references: [{ id: 0, networkClass: 4 }] }] },
    { index: 2, connections: [{ kind: 0, references: [{ id: 0, networkClass: 0 }] }] },
  ]);
  assert.equal(network.nodeCount, 3, 'the shared node is one node, not two');
  assert.equal(network.completeness.walkingEdgesComplete, true);
  const reach = walkingReachFrom(network, 1);
  assert.equal(reach.buildings.get(2).distanceMeters, 100);
  assert.equal(reach.buildings.get(2).limitingSurface, 'roadAsphalt');
});

test('road surfaces carry their own percentages, slower than a footpath', () => {
  const percent = surfaceType =>
    walkingSurface({ networkClass: 0, surfaceType, surfaceSubtype: 0 }).percent;
  assert.equal(percent(-1), 0.5);
  assert.equal(percent(0), 0.625);
  assert.equal(percent(2), 0.875);
  assert.equal(walkingSurface({ networkClass: 0, surfaceType: 1 }).key, 'roadAsphalt');
  // Rails and pipes are not walkable and must not be given a made-up speed.
  assert.equal(walkingSurface({ networkClass: 1, surfaceType: 0 }), null);
  assert.equal(walkingSurface({ networkClass: 9, surfaceType: 0 }), null);
});

test('a slot kind the reach search never seeds does not attach a building', () => {
  const network = buildWalkingNetwork(chain([10]), [{
    index: 3,
    // Kind 6 is the conveyor slot; the game seeds only kinds 0 and 2.
    connections: [{ kind: 6, references: [{ id: 0, networkClass: PEDESTRIAN_NETWORK_CLASS }] }],
  }]);
  assert.equal(network.buildingEdges.has(3), false);
});

// A metro entrance has a door on the surface and another underground, and
// declares both in its own connection slots. The search only ever stepped
// between edges sharing a node, so it never walked in one door and out of the
// other — which left a dozen buildings on the far side looking like an island
// with no housing and no stops, while the game staffed a repair station there.
//
// Node ids are array positions, and the graph joins networks on coordinates, so
// the second chain continues the numbering and sits well away in z.
function twoNetworks(surfaceLengths, platformLengths) {
  const nodes = [];
  const edges = [];
  const addChain = (lengths, z, edgeId) => {
    const first = nodes.length;
    lengths.forEach((_, index) => nodes.push({ id: first + index, x: index, y: 0, z }));
    nodes.push({ id: first + lengths.length, x: lengths.length, y: 0, z });
    lengths.forEach((length, index) => edges.push({
      id: edgeId + index, from: first + index, to: first + index + 1, length, points: [],
      surfaceType: 2, surfaceSubtype: 0, networkClass: PEDESTRIAN_NETWORK_CLASS,
    }));
  };
  addChain(surfaceLengths, 0, 0);
  addChain(platformLengths, 999, 100);
  return { nodes, edges };
}

test('a building with two doors joins the networks they stand on', () => {
  // Surface edges 0 and 1; platform edges 100 and 101, sharing no node.
  const network = twoNetworks([60, 60], [60, 60]);
  const walking = buildWalkingNetwork(network,
    [attach(1, [0]), attach(2, [101]), attach(9, [1, 100])]);

  assert.equal(walking.completeness.walkingEdgesComplete, true, 'the fixture is sound');
  const reach = walkingReachFrom(walking, 1);

  assert.ok(reach.available);
  assert.ok(reach.buildings.has(9), 'the entrance itself is reached');
  assert.ok(reach.buildings.has(2),
    'the workplace on the far network is reached through the entrance');
});

test('walking through a door still costs what the walk costs', () => {
  const network = twoNetworks([60, 60], [300, 300]);
  const walking = buildWalkingNetwork(network,
    [attach(1, [0]), attach(2, [101]), attach(9, [1, 100])]);

  const reach = walkingReachFrom(walking, 1);

  // 60 m to the entrance edge, 300 m through the platform, 300 m more to the
  // far end: past the budget whatever door it went through.
  assert.ok(!reach.buildings.has(2), 'a passage is not a shortcut past the budget');
});
