// Smooth panning and zooming for the republic map.
//
// The map re-rendered on every animation frame of a gesture: the svg's viewBox
// changed, which relayouts several thousand road and rail path nodes, and the
// canvas re-rasterised all its markers. Both are correct and both are far too
// slow to do sixty times a second, so a zoom lurched rather than glided.
//
// What map software does instead is separate what you are looking at from what
// has been drawn. During a gesture nothing is re-rendered at all — the already
// drawn layers are moved and scaled as a single composited image, which the
// compositor does on the GPU without touching layout. When the gesture settles,
// the real view is committed once and the transform goes back to identity.
//
// The cost is that the picture is momentarily scaled: strokes thicken slightly
// and a zoomed-in view is briefly soft until it settles. That is the same
// trade every slippy map makes, and it buys a gesture that keeps up with the
// pointer.

// The transform that makes content rendered for `committed` look as though it
// were rendered for `desired`.
//
// A point at world x is currently drawn at ((x - committed.x) / committed.width)
// * width. It needs to appear at ((x - desired.x) / desired.width) * width.
// Solving the one for the other gives a uniform scale plus a translation, which
// is exactly what a single CSS transform expresses.
export function cameraTransform(committed, desired, viewport) {
  const scale = committed.width / desired.width;
  return {
    scale,
    x: ((committed.x - desired.x) / desired.width) * viewport.width,
    y: ((committed.y - desired.y) / desired.height) * viewport.height,
  };
}

// `translate` before `scale` maps a point p to translate + scale * p, which is
// the order the derivation above assumes. The origin must be the top-left
// corner for the same reason.
export function cameraTransformCss(transform) {
  const { x, y, scale } = transform;
  if (isIdentity(transform)) return '';
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

export function isIdentity({ x, y, scale }, { epsilon = 0.0005 } = {}) {
  return Math.abs(scale - 1) < epsilon && Math.abs(x) < epsilon && Math.abs(y) < epsilon;
}

// A gesture is followed by a re-render, and re-rendering while the user is
// still moving is what made the map lurch. The commit waits for a short pause
// instead, so a continuous scroll or drag stays on the cheap path throughout
// and pays for one render at the end.
export function shouldCommit(lastGestureAt, now, { idleMs = 140 } = {}) {
  return now - lastGestureAt >= idleMs;
}

// Zooming toward the pointer: the world point under the cursor must stay under
// the cursor. Everything else about the view follows from that.
export function zoomAround(view, anchor, factor, aspect) {
  const width = view.width * factor;
  const height = width * aspect;
  return {
    x: anchor.x - (anchor.x - view.x) * (width / view.width),
    y: anchor.y - (anchor.y - view.y) * (height / view.height),
    width,
    height,
  };
}

// Where a pointer sits in world coordinates, given the view currently on
// screen. Used to anchor a zoom and to convert a drag into a camera move.
export function pointerWorld(view, offset, viewport) {
  return {
    x: view.x + (offset.x / viewport.width) * view.width,
    y: view.y + (offset.y / viewport.height) * view.height,
  };
}
