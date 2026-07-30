import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkerAccessEvidence } from '../js/models/worker_access_evidence.js';
import { workerAccessAvailability, buildWorkerAccessGraph } from '../js/models/access_graph.js';

// A straight footpath of five lit 100 m edges: node 0 .. node 5.
function corridor(edgeCount = 5, length = 100) {
  const nodes = Array.from({ length: edgeCount + 1 }, (_, id) => ({ id, x: id * length, y: 0, z: 0 }));
  const edges = Array.from({ length: edgeCount }, (_, id) => ({
    id, from: id, to: id + 1, length, points: [],
    surfaceType: 2, surfaceSubtype: 0, networkClass: 4,
  }));
  return { nodes, edges };
}

function building(index, type, edgeIds, extra = {}) {
  return {
    index, type, name: `${type} ${index}`,
    walkingEdgeRefs: edgeIds.map(id => [4, id]),
    ...extra,
  };
}

const HOME = building(1, 'panelak', [0]);
const NEAR = building(2, 'factory', [1], { configuredWorkers: 12 });
// Edge 5 sits 500 m along the corridor, past the 480 m budget.
const FAR = building(3, 'mine', [5], { configuredWorkers: 40 });

test('a residence gets a walking edge only to the workplaces it can actually reach', () => {
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(6),
    buildings: [HOME, NEAR, FAR],
    residenceOccupancy: [{ buildingIndex: 1, residents: 30, adults: 20 }],
  });
  assert.equal(workerAccessAvailability(evidence).available, true);
  const walks = evidence.edges.filter(edge => edge.kind === 'walk');
  assert.deepEqual(walks.map(edge => edge.target), ['workplace:2']);
  assert.equal(walks[0].distanceMeters, 100);
  assert.equal(walks[0].pathType, 'asphaltLit');
  assert.equal(walks[0].evidence, 'exact');
  assert.equal(evidence.summary.walkingBudgetMeters, 480);
});

test('the corridor bound is the smallest exact count on it, never a fabricated rate', () => {
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(),
    buildings: [HOME, NEAR],
    residenceOccupancy: [{ buildingIndex: 1, residents: 30, adults: 7 }],
  });
  const graph = buildWorkerAccessGraph(evidence, { focusId: 'residence:1' });
  assert.deepEqual(graph.upperBounds, [
    { nodeId: 'workplace:2', workers: 7, slots: 12, coverage: 7 / 12, bottleneckEdgeId: 'walk:1:2' },
  ]);
});

test('a stop reached by a line starts a fresh walking search of its own', () => {
  // Two footpaths that never touch: home and stop A on one, stop B and the
  // workplace on the other. Only the saved line can join them.
  const network = {
    nodes: [0, 1, 2, 3].map(id => ({ id, x: id, y: 0, z: 0 })),
    edges: [
      { id: 0, from: 0, to: 1, length: 40, points: [], surfaceType: 2, surfaceSubtype: 0, networkClass: 4 },
      { id: 1, from: 2, to: 3, length: 40, points: [], surfaceType: 2, surfaceSubtype: 0, networkClass: 4 },
    ],
  };
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: network,
    buildings: [
      building(1, 'panelak', [0]),
      building(5, 'bus_stop', [0]),
      building(6, 'bus_stop', [1]),
      building(3, 'mine', [1], { configuredWorkers: 40 }),
    ],
    residenceOccupancy: [{ buildingIndex: 1, residents: 10, adults: 9 }],
    vehicleLines: [{ slot: 0, name: 'Line 1', stopIds: [5, 6], vehicleIds: [11] }],
  });
  const kinds = new Set(evidence.edges.map(edge => edge.kind));
  assert.deepEqual([...kinds].sort(), ['board', 'ride', 'walk']);
  const graph = buildWorkerAccessGraph(evidence, { focusId: 'residence:1' });
  assert.deepEqual(graph.upperBounds.map(bound => bound.nodeId), ['workplace:3']);
  assert.equal(graph.upperBounds[0].workers, 9);
});

test('a saved line keeps its stop order and its own vehicle facts', () => {
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(),
    buildings: [
      building(1, 'panelak', [0]),
      building(5, 'bus_stop', [0]),
      building(6, 'bus_stop', [2]),
      building(7, 'bus_stop', [3]),
    ],
    residenceOccupancy: [{ buildingIndex: 1, residents: 4, adults: 4 }],
    vehicleLines: [{ slot: 0, name: 'Ring', stopIds: [5, 7, 6], vehicleIds: [1, 2] }],
  });
  const line = evidence.nodes.find(node => node.kind === 'line');
  assert.equal(line.label, 'Ring');
  assert.equal(line.vehicleCount, 2);
  assert.equal(line.stopCount, 3);
  // The saved order is 5, 7, 6 — not sorted, and not the order the stops appear
  // along the footpath.
  const rides = evidence.edges.filter(edge => edge.kind === 'ride');
  assert.deepEqual(new Map(rides.map(edge => [edge.target, edge.stopOrder])), new Map([
    ['stop:5:alight', 0], ['stop:7:alight', 1], ['stop:6:alight', 2],
  ]));
});

test('line operations are accepted in the shape the import actually stores them', () => {
  const buildings = [
    building(1, 'panelak', [0]),
    building(5, 'bus_stop', [0]),
    building(6, 'bus_stop', [2]),
  ];
  const occupancy = [{ buildingIndex: 1, residents: 4, adults: 4 }];
  const lines = [{ slot: 0, name: 'Ring', stopIds: [5, 6], vehicleIds: [] }];
  const asArray = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(), buildings, residenceOccupancy: occupancy, vehicleLines: lines,
  });
  const asOperations = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(),
    buildings,
    residenceOccupancy: occupancy,
    vehicleLines: { lines, summary: { lineCount: 1 } },
  });
  assert.ok(asArray.summary.lineCount > 0);
  assert.deepEqual(asOperations.nodes, asArray.nodes);
  assert.deepEqual(asOperations.edges, asArray.edges);
});

test('a change between two saved lines is shown as a transfer', () => {
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(6),
    buildings: [
      building(1, 'panelak', [0]),
      building(5, 'bus_stop', [0]),
      building(6, 'bus_stop', [2]),
      building(7, 'bus_stop', [4]),
    ],
    residenceOccupancy: [{ buildingIndex: 1, residents: 4, adults: 4 }],
    vehicleLines: [
      { slot: 0, name: 'A', stopIds: [5, 6], vehicleIds: [] },
      { slot: 1, name: 'B', stopIds: [6, 7], vehicleIds: [] },
    ],
  });
  assert.equal(evidence.summary.transferCount, 1);
  assert.ok(evidence.edges.some(edge => edge.kind === 'transfer'));
  assert.ok(evidence.nodes.some(node => node.id === 'line:1:2'));
});

test('a dense corridor is bounded rather than drawn as a hairball', () => {
  // Twenty residences and twenty workplaces all within reach of each other is
  // 400 links; the view must keep the focus legible and admit what it dropped.
  const workplaces = Array.from({ length: 20 }, (_, index) =>
    building(100 + index, 'factory', [1], { configuredWorkers: 5 }));
  const residences = Array.from({ length: 20 }, (_, index) => building(index, 'panelak', [0]));
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(3),
    buildings: [...residences, ...workplaces],
    residenceOccupancy: residences.map(item => ({
      buildingIndex: item.index, residents: 10, adults: 10,
    })),
  });
  assert.ok(evidence.edges.length > 300);
  const graph = buildWorkerAccessGraph(evidence, { focusId: 'residence:0' });
  assert.ok(graph.edges.every(edge => graph.nodes.some(node => node.id === edge.source)
    && graph.nodes.some(node => node.id === edge.target)));
  // Picking one residence must not put nineteen unrelated ones on screen just
  // because they happen to share a workplace with it.
  assert.deepEqual(graph.nodes.filter(node => node.kind === 'residence').map(node => node.id),
    ['residence:0']);
  // No stage may grow past what fits in the canvas, so the picked node is never
  // scrolled off the top of its own corridor.
  const perStage = new Map();
  for (const node of graph.nodes) perStage.set(node.stage, (perStage.get(node.stage) ?? 0) + 1);
  assert.ok(Math.max(...perStage.values()) <= 6, `stages: ${[...perStage]}`);
  assert.ok(graph.hiddenNodes > 0 && graph.hiddenEdges > 0);
});

test('an undecoded pedestrian network yields no graph rather than a guessed one', () => {
  const evidence = buildWorkerAccessEvidence({ pedestrianNetwork: null, buildings: [HOME] });
  assert.deepEqual(workerAccessAvailability(evidence), {
    available: false, reason: 'walking-evidence-incomplete',
  });
  const dangling = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(),
    buildings: [building(1, 'panelak', [99])],
    residenceOccupancy: [{ buildingIndex: 1, residents: 1, adults: 1 }],
  });
  assert.equal(dangling.completeness, 'unavailable');
  assert.equal(workerAccessAvailability(dangling).available, false);
});

// A Seilbahn is public transport that no line describes: nothing in lines.bin
// mentions it, so a republic that moves its workers by cableway reported no
// transport at all until the route itself stood in for a line.
test('a cableway route carries workers even though no saved line mentions it', () => {
  // Two footpaths that never touch: home and the valley station on one, the
  // mountain station and the mine on the other.
  const network = {
    nodes: [0, 1, 2, 3].map(id => ({ id, x: id, y: 0, z: 0 })),
    edges: [
      { id: 0, from: 0, to: 1, length: 40, points: [], surfaceType: 2, surfaceSubtype: 0, networkClass: 4 },
      { id: 1, from: 2, to: 3, length: 40, points: [], surfaceType: 2, surfaceSubtype: 0, networkClass: 4 },
    ],
  };
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: network,
    buildings: [
      building(1, 'panelak', [0]),
      building(5, 'cableway_station_small', [0]),
      building(6, 'cableway_station_small', [1]),
      building(3, 'mine', [1], { configuredWorkers: 40 }),
    ],
    residenceOccupancy: [{ buildingIndex: 1, residents: 12, adults: 8 }],
    cablewayRoutes: {
      routes: [{ id: 'cableway:0', edgeIds: [0, 1], stationIndices: [5, 6], lengthMeters: 600 }],
    },
    cablewayLabel: 'Cableway',
  });

  const line = evidence.nodes.find(node => node.kind === 'line');
  assert.equal(line.label, 'Cableway 1');
  assert.equal(line.mode, 'cableway');
  assert.equal(line.vehicleCount, 0, 'the save assigns no vehicle to a cable');
  assert.equal(evidence.summary.cablewayRouteCount, 1);
  const graph = buildWorkerAccessGraph(evidence, { focusId: 'residence:1' });
  assert.deepEqual(graph.upperBounds.map(bound => bound.nodeId), ['workplace:3']);
  assert.equal(graph.upperBounds[0].workers, 8);
  assert.equal(evidence.catchment.get(3).transitAdults, 8,
    'the mine can count the people the cableway brings it');
});

test('cableway routes and saved lines change onto one another at a shared station', () => {
  const evidence = buildWorkerAccessEvidence({
    pedestrianNetwork: corridor(4),
    buildings: [
      building(1, 'panelak', [0]),
      building(5, 'cableway_station_small', [0]),
      building(6, 'cableway_station_small', [2]),
      building(7, 'bus_stop', [3]),
      building(3, 'mine', [3], { configuredWorkers: 5 }),
    ],
    residenceOccupancy: [{ buildingIndex: 1, residents: 4, adults: 4 }],
    vehicleLines: [{ slot: 0, name: 'Bus 1', stopIds: [6, 7], vehicleIds: [1] }],
    cablewayRoutes: {
      routes: [{ id: 'cableway:0', edgeIds: [0], stationIndices: [5, 6], lengthMeters: 200 }],
    },
    cablewayLabel: 'Cableway',
  });

  // Each line appears twice: once as the first leg, once as the leg after a change.
  const labels = [...new Set(evidence.nodes.filter(node => node.kind === 'line')
    .map(node => `${node.label}/${node.mode}`))].sort();
  assert.deepEqual(labels, ['Bus 1/vehicle', 'Cableway 1/cableway']);
  assert.ok(evidence.nodes.some(node => node.kind === 'transfer' && node.buildingIndex === 6),
    'the station both serve is a place to change');
});
