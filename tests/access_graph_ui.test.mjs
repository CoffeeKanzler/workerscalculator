import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  accessGraphReasonKey,
  workerAccessEdgeLabel,
} from '../js/ui/access_graph.js';

test('access evidence failures map to specific reader-facing explanations', () => {
  assert.equal(accessGraphReasonKey('walking-evidence-missing'), 'missing');
  assert.equal(accessGraphReasonKey('walking-evidence-incomplete'), 'incomplete');
  assert.equal(accessGraphReasonKey('walking-edge-not-exact'), 'notExact');
  assert.equal(accessGraphReasonKey('access-evidence-invalid'), 'invalid');
  assert.equal(accessGraphReasonKey('unexpected'), 'invalid');
});

test('edge labels preserve exact path facts and upper-bound semantics', () => {
  assert.equal(workerAccessEdgeLabel({
    kind: 'walk',
    pathType: 'gravel-footpath',
    distanceMeters: 241.4,
    capacityUpperBound: 72,
  }), '241 m · gravel-footpath · ≤72');
  assert.equal(workerAccessEdgeLabel({
    kind: 'ride',
    capacityUpperBound: 88,
  }), 'ride · ≤88');
  assert.equal(workerAccessEdgeLabel({ kind: 'transfer' }), 'transfer');
});
