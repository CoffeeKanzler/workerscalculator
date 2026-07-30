import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkerAccessGraph,
  workerAccessAvailability,
} from '../js/models/access_graph.js';

const exactEvidence = {
  completeness: 'complete',
  walkingEdgesComplete: true,
  nodes: [
    { id: 'home:1', kind: 'residence', stage: 0, label: 'House 1', buildingIndex: 1 },
    { id: 'stop:2:a', kind: 'stop', stage: 1, label: 'October Square', buildingIndex: 2 },
    { id: 'line:7', kind: 'line', stage: 2, label: 'Line 7' },
    { id: 'stop:3:b', kind: 'stop', stage: 3, label: 'Steelworks', buildingIndex: 3 },
    { id: 'work:4', kind: 'workplace', stage: 4, label: 'Steel mill', buildingIndex: 4 },
    { id: 'work:5', kind: 'workplace', stage: 4, label: 'Heating plant', buildingIndex: 5 },
  ],
  edges: [
    {
      id: 'walk:1:2', source: 'home:1', target: 'stop:2:a', kind: 'walk',
      evidence: 'exact', pathType: 'footpath', distanceMeters: 190, capacityUpperBound: 140,
    },
    {
      id: 'board:2:7', source: 'stop:2:a', target: 'line:7', kind: 'board',
      evidence: 'exact', capacityUpperBound: 88,
    },
    {
      id: 'ride:7:3', source: 'line:7', target: 'stop:3:b', kind: 'ride',
      evidence: 'exact', capacityUpperBound: 72,
    },
    {
      id: 'walk:3:4', source: 'stop:3:b', target: 'work:4', kind: 'walk',
      evidence: 'exact', pathType: 'gravel-footpath', distanceMeters: 240,
      capacityUpperBound: 100,
    },
    {
      id: 'walk:3:5', source: 'stop:3:b', target: 'work:5', kind: 'walk',
      evidence: 'exact', pathType: 'gravel-footpath', distanceMeters: 80,
      capacityUpperBound: 30,
    },
  ],
};

test('walking access stays unavailable without a complete exact walking edge set', () => {
  assert.deepEqual(workerAccessAvailability(null), {
    available: false, reason: 'walking-evidence-missing',
  });
  assert.deepEqual(workerAccessAvailability({
    ...exactEvidence, walkingEdgesComplete: false,
  }), {
    available: false, reason: 'walking-evidence-incomplete',
  });
  assert.deepEqual(workerAccessAvailability({
    ...exactEvidence,
    edges: exactEvidence.edges.map(edge =>
      edge.kind === 'walk' ? { ...edge, evidence: 'derived' } : edge),
  }), {
    available: false, reason: 'walking-edge-not-exact',
  });
});

test('the focused access corridor reports max-worker upper bounds and its bottleneck', () => {
  const graph = buildWorkerAccessGraph(exactEvidence, {
    focusId: 'home:1', maxNodes: 20, depth: 5,
  });

  assert.equal(graph.available, true);
  assert.equal(graph.focusId, 'home:1');
  assert.equal(graph.nodes.length, 6);
  assert.equal(graph.edges.length, 5);
  assert.deepEqual(graph.upperBounds, [
    { nodeId: 'work:4', workers: 72, slots: null, coverage: null, bottleneckEdgeId: 'ride:7:3' },
    { nodeId: 'work:5', workers: 30, slots: null, coverage: null, bottleneckEdgeId: 'walk:3:5' },
  ]);
  assert.equal(graph.edges.find(edge => edge.id === 'ride:7:3').bottleneck, true);
  assert.equal(graph.hiddenNodes, 0);
});

test('large republic graphs render a deterministic bounded neighborhood', () => {
  const branches = Array.from({ length: 200 }, (_, index) => ({
    id: `work:${index}`,
    kind: 'workplace',
    stage: 1,
    label: `Work ${index}`,
    buildingIndex: index + 100,
  }));
  const evidence = {
    completeness: 'complete',
    walkingEdgesComplete: true,
    nodes: [
      { id: 'home', kind: 'residence', stage: 0, label: 'Home', buildingIndex: 1 },
      ...branches,
    ],
    edges: branches.map((node, index) => ({
      id: `edge:${index}`,
      source: 'home',
      target: node.id,
      kind: 'walk',
      evidence: 'exact',
      pathType: 'footpath',
      distanceMeters: index + 1,
      capacityUpperBound: 50,
    })),
  };

  const graph = buildWorkerAccessGraph(evidence, {
    focusId: 'home', maxNodes: 24, depth: 1, maxPerStage: 6,
  });

  // Six workplaces plus the focus, and they are the six nearest — the picture
  // stays inside the canvas rather than scrolling the focus out of view.
  assert.equal(graph.nodes.length, 7);
  assert.equal(graph.edges.length, 6);
  assert.equal(graph.hiddenNodes, 194);
  assert.equal(graph.hiddenEdges, 194);
  assert.deepEqual(graph.nodes.map(node => node.id), [
    'home', 'work:0', 'work:1', 'work:2', 'work:3', 'work:4', 'work:5',
  ]);
});

test('expansion adds a selected node neighborhood without exceeding the cap', () => {
  const graph = buildWorkerAccessGraph(exactEvidence, {
    focusId: 'home:1',
    depth: 1,
    expandedIds: ['line:7'],
    expansionDepth: 2,
    maxNodes: 5,
  });

  assert.deepEqual(graph.nodes.map(node => node.id), [
    'home:1', 'stop:2:a', 'line:7', 'stop:3:b', 'work:4',
  ]);
  assert.equal(graph.hiddenNodes, 1);
});

test('the corridor is followed towards the end the reader did not pick', () => {
  // A refinery reachable only by tram: its housing is six hops away, on the
  // far side of a stop, a line and another stop.
  const nodes = [
    { id: 'home', kind: 'residence', stage: 0, label: 'Flats', buildingIndex: 1, people: 40 },
    { id: 'board', kind: 'stop', stage: 1, label: 'Tram A', buildingIndex: 2 },
    { id: 'line', kind: 'line', stage: 2, label: 'Line 1', lineSlot: 0 },
    { id: 'alight', kind: 'stop', stage: 5, label: 'Tram B', buildingIndex: 3 },
    { id: 'work', kind: 'workplace', stage: 6, label: 'Refinery', buildingIndex: 4, workerSlots: 30 },
  ];
  const edges = [
    { id: 'w1', source: 'home', target: 'board', kind: 'walk', evidence: 'exact', distanceMeters: 60, pathType: 'asphalt' },
    { id: 'b1', source: 'board', target: 'line', kind: 'board', evidence: 'exact' },
    { id: 'r1', source: 'line', target: 'alight', kind: 'ride', evidence: 'exact' },
    { id: 'w2', source: 'alight', target: 'work', kind: 'walk', evidence: 'exact', distanceMeters: 90, pathType: 'asphalt' },
  ];
  const evidence = { completeness: 'complete', walkingEdgesComplete: true, nodes, edges };

  const fromWork = buildWorkerAccessGraph(evidence, { focusId: 'work' });
  assert.deepEqual(fromWork.nodes.map(node => node.id).sort(),
    ['alight', 'board', 'home', 'line', 'work'], 'a workplace shows where its workers come from');

  const fromHome = buildWorkerAccessGraph(evidence, { focusId: 'home' });
  assert.deepEqual(fromHome.nodes.map(node => node.id).sort(),
    ['alight', 'board', 'home', 'line', 'work'], 'a residence shows where its people can get to');
});
