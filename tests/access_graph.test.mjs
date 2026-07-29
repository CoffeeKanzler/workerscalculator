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
    { nodeId: 'work:4', workers: 72, bottleneckEdgeId: 'ride:7:3' },
    { nodeId: 'work:5', workers: 30, bottleneckEdgeId: 'walk:3:5' },
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
    focusId: 'home', maxNodes: 24, depth: 1,
  });

  assert.equal(graph.nodes.length, 24);
  assert.equal(graph.edges.length, 23);
  assert.equal(graph.hiddenNodes, 177);
  assert.deepEqual(graph.nodes.slice(0, 4).map(node => node.id), [
    'home', 'work:0', 'work:1', 'work:2',
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
