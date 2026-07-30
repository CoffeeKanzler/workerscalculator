// What the access model can still be asked: is the evidence usable at all, and
// how many workers can a corridor carry. Laying the graph out was this module's
// other job until the view moved to a canvas that places its own nodes; see
// models/access_ego.js.
const NODE_KINDS = new Set(['residence', 'stop', 'line', 'transfer', 'workplace']);

function finiteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function workerAccessAvailability(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return { available: false, reason: 'walking-evidence-missing' };
  }
  if (evidence.completeness !== 'complete' || evidence.walkingEdgesComplete !== true) {
    return { available: false, reason: 'walking-evidence-incomplete' };
  }
  if (!Array.isArray(evidence.nodes) || !Array.isArray(evidence.edges)) {
    return { available: false, reason: 'access-evidence-invalid' };
  }
  const ids = new Set();
  for (const node of evidence.nodes) {
    if (!node || typeof node.id !== 'string' || ids.has(node.id)
      || !NODE_KINDS.has(node.kind) || !finiteNonnegative(node.stage)) {
      return { available: false, reason: 'access-evidence-invalid' };
    }
    ids.add(node.id);
  }
  for (const edge of evidence.edges) {
    if (!edge || typeof edge.id !== 'string' || !ids.has(edge.source) || !ids.has(edge.target)) {
      return { available: false, reason: 'access-evidence-invalid' };
    }
    if (edge.kind === 'walk' && (edge.evidence !== 'exact'
      || !finiteNonnegative(edge.distanceMeters) || !edge.pathType)) {
      return { available: false, reason: 'walking-edge-not-exact' };
    }
  }
  return { available: true, reason: null };
}

function nodeCapacity(node) {
  if (finiteNonnegative(node?.people)) return node.people;
  if (finiteNonnegative(node?.workerSlots)) return node.workerSlots;
  return Number.POSITIVE_INFINITY;
}

export function widestWorkplaceBounds(nodes, edges, focusId) {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge);
  }
  const capacity = new Map([[focusId, nodeCapacity(nodeById.get(focusId))]]);
  const predecessor = new Map();
  // Widest path: always extend the best-so-far frontier, so each node settles
  // once instead of the graph being swept until it stops changing.
  const frontier = [focusId];
  while (frontier.length) {
    let bestAt = 0;
    for (let index = 1; index < frontier.length; index += 1) {
      if (capacity.get(frontier[index]) > capacity.get(frontier[bestAt])) bestAt = index;
    }
    const current = frontier.splice(bestAt, 1)[0];
    for (const edge of outgoing.get(current) ?? []) {
      const limit = finiteNonnegative(edge.capacityUpperBound)
        ? edge.capacityUpperBound : Number.POSITIVE_INFINITY;
      const candidate = Math.min(capacity.get(current), limit,
        nodeCapacity(nodeById.get(edge.target)));
      if (candidate <= (capacity.get(edge.target) ?? -1)) continue;
      capacity.set(edge.target, candidate);
      predecessor.set(edge.target, edge);
      frontier.push(edge.target);
    }
  }
  return nodes.filter(node => node.kind === 'workplace' && capacity.has(node.id))
    .map(node => {
      let cursor = node.id;
      let bottleneck = null;
      let bottleneckLimit = Number.POSITIVE_INFINITY;
      let guard = nodes.length + 1;
      while (cursor !== focusId && guard-- > 0) {
        const edge = predecessor.get(cursor);
        if (!edge) break;
        const limit = finiteNonnegative(edge.capacityUpperBound)
          ? edge.capacityUpperBound : Number.POSITIVE_INFINITY;
        if (limit < bottleneckLimit) { bottleneck = edge; bottleneckLimit = limit; }
        cursor = edge.source;
      }
      // A bound of 18 means nothing on its own: the reader needs to know
      // whether that fills the workplace or leaves it two thirds empty.
      const workers = capacity.get(node.id);
      const slots = finiteNonnegative(node.workerSlots) ? node.workerSlots : null;
      return {
        nodeId: node.id,
        workers,
        slots,
        coverage: slots ? Math.min(1, workers / slots) : null,
        bottleneckEdgeId: bottleneck?.id ?? null,
      };
    })
    .sort((a, b) => b.workers - a.workers
      || nodeById.get(a.nodeId).label.localeCompare(nodeById.get(b.nodeId).label));
}
