import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapLayerReport, MAP_LAYER_KEYS } from '../js/models/map_layer_report.js';

// "Some optional map layers are unavailable" is true but useless: it does not
// say which layers, and it does not say the one thing most likely to explain
// it. Save-format offsets are version-dependent, so an older save can fail
// exactly here while every required source parses cleanly.
test('a report names the failed layers and the save version', () => {
  const report = mapLayerReport({
    warnings: [
      { file: 'road', message: 'implausible road network counts 2145945040/3969735434' },
      { file: 'rail', message: 'implausible road network counts 3628370331/2225573186' },
    ],
    saveVersion: 117,
  });

  assert.equal(report.failed, true);
  assert.deepEqual(report.layers, ['road', 'rail']);
  assert.equal(report.saveVersion, 117);
  assert.match(report.summary, /road/);
  assert.match(report.summary, /rail/);
  assert.match(report.summary, /117/);
});

test('a clean import reports nothing to say', () => {
  const report = mapLayerReport({ warnings: [], saveVersion: 124 });
  assert.equal(report.failed, false);
  assert.deepEqual(report.layers, []);
  assert.equal(report.summary, '');
});

// Warnings that are not about a map layer must not be dressed up as one; the
// membership audit emits warnings through the same channel.
test('only map layer warnings count towards the report', () => {
  const report = mapLayerReport({
    warnings: [
      { file: 'buildings', message: '1 duplicate member reference(s)' },
      { file: 'heightmap', message: 'heightmap.dds is not a supported DDS file' },
    ],
    saveVersion: 124,
  });

  assert.deepEqual(report.layers, ['heightmap']);
  assert.equal(report.failed, true);
  assert.doesNotMatch(report.summary, /duplicate/);
});

test('an unknown save version is left out rather than guessed at', () => {
  const report = mapLayerReport({
    warnings: [{ file: 'pollution', message: 'requires verified terrain world bounds' }],
    saveVersion: null,
  });

  assert.equal(report.failed, true);
  assert.equal(report.saveVersion, null);
  assert.match(report.summary, /pollution/);
  assert.doesNotMatch(report.summary, /version/i);
});

test('the detail keeps each layer message for a bug report', () => {
  const report = mapLayerReport({
    warnings: [{ file: 'road', message: 'implausible road network counts 1/2/3' }],
    saveVersion: 120,
  });

  assert.equal(report.detail.length, 1);
  assert.match(report.detail[0], /road/);
  assert.match(report.detail[0], /implausible road network counts 1\/2\/3/);
});

test('malformed input is treated as nothing to report', () => {
  for (const warnings of [null, undefined, 'nonsense', [null], [{}]]) {
    const report = mapLayerReport({ warnings });
    assert.equal(report.failed, false, `${JSON.stringify(warnings)} should report nothing`);
  }
});

test('every deferred map layer is a known key', () => {
  assert.deepEqual([...MAP_LAYER_KEYS].sort(),
    ['heightmap', 'pedestrian', 'pollution', 'rail', 'road'].sort());
});
