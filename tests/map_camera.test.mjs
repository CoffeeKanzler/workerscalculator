import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cameraTransform, cameraTransformCss, isIdentity, shouldCommit, zoomAround, pointerWorld,
  withViewportAspect,
} from '../js/ui/map_camera.js';

const viewport = { width: 1000, height: 500 };
const view = { x: 0, y: 0, width: 100, height: 50 };

// The property that matters: content drawn for the committed view, put through
// the transform, must land where content drawn for the desired view would.
const drawnAt = (world, committed) => ({
  x: ((world.x - committed.x) / committed.width) * viewport.width,
  y: ((world.y - committed.y) / committed.height) * viewport.height,
});
const transformed = (point, { x, y, scale }) => ({
  x: x + scale * point.x,
  y: y + scale * point.y,
});

test('the transform puts a world point where the desired view would draw it', () => {
  const committed = { x: 0, y: 0, width: 100, height: 50 };
  const desired = { x: 20, y: 5, width: 40, height: 20 };
  const transform = cameraTransform(committed, desired, viewport);
  for (const world of [{ x: 20, y: 5 }, { x: 60, y: 25 }, { x: 35, y: 12 }]) {
    const actual = transformed(drawnAt(world, committed), transform);
    const expected = drawnAt(world, desired);
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `x ${actual.x} vs ${expected.x}`);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `y ${actual.y} vs ${expected.y}`);
  }
});

test('an unchanged view needs no transform at all', () => {
  const transform = cameraTransform(view, { ...view }, viewport);
  assert.ok(isIdentity(transform));
  assert.equal(cameraTransformCss(transform), '');
});

test('a pure pan translates without scaling', () => {
  const transform = cameraTransform(view, { ...view, x: 10 }, viewport);
  assert.equal(transform.scale, 1);
  assert.equal(transform.x, -100);
  assert.equal(transform.y, 0);
});

test('zooming in scales up and zooming out scales down', () => {
  const zoomedIn = cameraTransform(view, { ...view, width: 50, height: 25 }, viewport);
  assert.equal(zoomedIn.scale, 2);
  const zoomedOut = cameraTransform(view, { ...view, width: 200, height: 100 }, viewport);
  assert.equal(zoomedOut.scale, 0.5);
});

test('the css puts translate before scale, which is the order the maths assumes', () => {
  const css = cameraTransformCss({ x: 12, y: -4, scale: 1.5 });
  assert.equal(css, 'translate(12px, -4px) scale(1.5)');
  assert.ok(css.indexOf('translate') < css.indexOf('scale'));
});

test('zoomAround keeps the anchored world point under the pointer', () => {
  const anchor = { x: 30, y: 10 };
  const zoomed = zoomAround(view, anchor, 0.5, view.height / view.width);
  const before = drawnAt(anchor, view);
  const after = drawnAt(anchor, zoomed);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
});

test('zoomAround preserves the aspect ratio it is given', () => {
  const zoomed = zoomAround(view, { x: 0, y: 0 }, 0.4, 0.5);
  assert.equal(zoomed.height / zoomed.width, 0.5);
});

test('pointerWorld converts a pointer offset into world coordinates', () => {
  assert.deepEqual(pointerWorld(view, { x: 0, y: 0 }, viewport), { x: 0, y: 0 });
  assert.deepEqual(pointerWorld(view, { x: 1000, y: 500 }, viewport), { x: 100, y: 50 });
  assert.deepEqual(pointerWorld(view, { x: 500, y: 250 }, viewport), { x: 50, y: 25 });
});

test('the commit waits for the gesture to pause', () => {
  // A continuous scroll must stay on the cheap transform path throughout,
  // rather than paying for a re-render part-way through.
  assert.equal(shouldCommit(1000, 1050), false);
  assert.equal(shouldCommit(1000, 1140), true);
});

test('a long-running gesture still commits once it stops', () => {
  assert.equal(shouldCommit(0, 10_000), true);
});

// The svg letterboxes a view that does not match its container; the canvas
// stretches it. Reshaping the view to the container makes both agree.
test('a view is reshaped to the container it is drawn in', () => {
  const shaped = withViewportAspect({ x: 0, y: 0, width: 100, height: 100 },
    { width: 1000, height: 500 });
  assert.equal(shaped.height / shaped.width, 0.5);
});

test('reshaping expands rather than crops, so nothing visible is lost', () => {
  const view = { x: 0, y: 0, width: 100, height: 100 };
  const shaped = withViewportAspect(view, { width: 1000, height: 500 });
  // Wider container than the view is tall: the width grows and the height is
  // untouched, so every point that was inside still is.
  assert.ok(shaped.width >= view.width);
  assert.ok(shaped.height >= view.height);
  assert.ok(shaped.x <= view.x);
  assert.ok(shaped.y <= view.y);
});

test('reshaping keeps the view centred on the same point', () => {
  const view = { x: 10, y: 20, width: 100, height: 100 };
  const shaped = withViewportAspect(view, { width: 1000, height: 500 });
  assert.equal(shaped.x + shaped.width / 2, view.x + view.width / 2);
  assert.equal(shaped.y + shaped.height / 2, view.y + view.height / 2);
});

test('a view already matching its container is left alone', () => {
  const view = { x: 3, y: 4, width: 200, height: 100 };
  assert.deepEqual(withViewportAspect(view, { width: 1000, height: 500 }), view);
});

test('a tall container reshapes the other way', () => {
  const shaped = withViewportAspect({ x: 0, y: 0, width: 200, height: 100 },
    { width: 500, height: 1000 });
  assert.equal(shaped.height / shaped.width, 2);
  assert.equal(shaped.width, 200);
});

test('reshaping survives a container measured before layout', () => {
  const view = { x: 0, y: 0, width: 100, height: 50 };
  assert.deepEqual(withViewportAspect(view, { width: 0, height: 0 }), view);
});

// Reshaping is what makes the letterbox vanish: once the view matches the
// container, fitting it uniformly and stretching it are the same thing.
test('after reshaping, a uniform fit and a stretch agree', () => {
  const viewport = { width: 1652, height: 756 };
  const shaped = withViewportAspect({ x: 195.7, y: 141.4, width: 183.4, height: 115.8 }, viewport);
  const meet = Math.min(viewport.width / shaped.width, viewport.height / shaped.height);
  assert.ok(Math.abs(meet - viewport.width / shaped.width) < 1e-9);
  assert.ok(Math.abs(meet - viewport.height / shaped.height) < 1e-9);
});
