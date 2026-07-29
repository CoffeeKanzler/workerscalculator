import test from 'node:test';
import assert from 'node:assert/strict';

const virtualTable = await import('../js/ui/virtual_table.js').catch(() => ({}));

test('the first viewport renders visible rows plus lower overscan', () => {
  assert.equal(typeof virtualTable.virtualWindow, 'function');
  assert.deepEqual(virtualTable.virtualWindow({
    rowCount: 1000, scrollTop: 0, viewportHeight: 180, rowHeight: 36, overscan: 2,
  }), { start: 0, end: 7, topHeight: 0, bottomHeight: 35748 });
});

test('a middle viewport keeps overscan on both sides', () => {
  assert.equal(typeof virtualTable.virtualWindow, 'function');
  assert.deepEqual(virtualTable.virtualWindow({
    rowCount: 1000, scrollTop: 360, viewportHeight: 180, rowHeight: 36, overscan: 2,
  }), { start: 8, end: 17, topHeight: 288, bottomHeight: 35388 });
});

test('the final viewport clamps rather than requesting rows past the end', () => {
  assert.equal(typeof virtualTable.virtualWindow, 'function');
  assert.deepEqual(virtualTable.virtualWindow({
    rowCount: 10, scrollTop: 9999, viewportHeight: 180, rowHeight: 36, overscan: 2,
  }), { start: 7, end: 10, topHeight: 252, bottomHeight: 0 });
});

test('an empty table has a stable empty window', () => {
  assert.equal(typeof virtualTable.virtualWindow, 'function');
  assert.deepEqual(virtualTable.virtualWindow({
    rowCount: 0, scrollTop: -10, viewportHeight: 0, rowHeight: 36, overscan: 2,
  }), { start: 0, end: 0, topHeight: 0, bottomHeight: 0 });
});
