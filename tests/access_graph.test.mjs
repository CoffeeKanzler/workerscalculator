import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  widestWorkplaceBounds,
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

test('the corridor ceiling is the smallest exact count along it', () => {
  const bounds = widestWorkplaceBounds(exactEvidence.nodes, exactEvidence.edges, 'home:1');

  assert.deepEqual(bounds, [
    { nodeId: 'work:4', workers: 72, slots: null, coverage: null, bottleneckEdgeId: 'ride:7:3' },
    { nodeId: 'work:5', workers: 30, slots: null, coverage: null, bottleneckEdgeId: 'walk:3:5' },
  ]);
});
