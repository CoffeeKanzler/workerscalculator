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

function adjacencyFor(nodes, edges) {
  const adjacency = new Map(nodes.map(node => [node.id, []]));
  edges.forEach((edge, order) => {
    adjacency.get(edge.source)?.push({ nodeId: edge.target, order });
    adjacency.get(edge.target)?.push({ nodeId: edge.source, order });
  });
  return adjacency;
}

function addNeighborhood(selected, startId, adjacency, depth, maximum) {
  if (!adjacency.has(startId) || selected.size >= maximum) return;
  const queued = new Set([startId]);
  const queue = [{ id: startId, distance: 0 }];
  while (queue.length && selected.size < maximum) {
    const current = queue.shift();
    selected.add(current.id);
    if (current.distance >= depth) continue;
    for (const neighbor of adjacency.get(current.id) ?? []) {
      if (queued.has(neighbor.nodeId)) continue;
      queued.add(neighbor.nodeId);
      queue.push({ id: neighbor.nodeId, distance: current.distance + 1 });
    }
  }
}

// The bound a corridor can carry is the smallest of the exact counts along it:
// the adults living at the source, the worker slots at the destination, and any
// leg that states a limit of its own. A leg that states none — walking has no
// capacity — must not cut the corridor off, which is why an absent
// capacityUpperBound reads as unbounded rather than as zero.
function nodeCapacity(node) {
  if (finiteNonnegative(node?.people)) return node.people;
  if (finiteNonnegative(node?.workerSlots)) return node.workerSlots;
  return Number.POSITIVE_INFINITY;
}

function widestWorkplaceBounds(nodes, edges, focusId) {
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
      return {
        nodeId: node.id,
        workers: capacity.get(node.id),
        bottleneckEdgeId: bottleneck?.id ?? null,
      };
    })
    .sort((a, b) => b.workers - a.workers
      || nodeById.get(a.nodeId).label.localeCompare(nodeById.get(b.nodeId).label));
}

function layoutNodes(nodes) {
  const byStage = new Map();
  for (const node of nodes) {
    if (!byStage.has(node.stage)) byStage.set(node.stage, []);
    byStage.get(node.stage).push(node);
  }
  const maxRows = Math.max(1, ...[...byStage.values()].map(group => group.length));
  const width = 900;
  const height = Math.max(320, maxRows * 88 + 72);
  const stages = [...byStage.keys()].sort((a, b) => a - b);
  const stageSpan = Math.max(1, stages.at(-1) - stages[0]);
  const positions = new Map();
  for (const [stage, group] of byStage) {
    const x = 82 + ((stage - stages[0]) / stageSpan) * (width - 164);
    const rowSpan = Math.max(1, group.length - 1);
    group.forEach((node, index) => {
      const y = group.length === 1 ? height / 2 : 58 + index / rowSpan * (height - 116);
      positions.set(node.id, { x, y });
    });
  }
  return { width, height, positions };
}

// A residence in a dense city can reach sixty workplaces, and every one of its
// neighbours can reach the same sixty. Drawing all of that is a hairball in
// which no single corridor can be read, so the view keeps the focus node's own
// links and then the shortest walks around it, and says how much it left out.
function boundEdges(edges, focusId, maximum) {
  if (edges.length <= maximum) return edges;
  const rank = edge => (edge.source === focusId || edge.target === focusId ? 0 : 1);
  return [...edges]
    .sort((a, b) => rank(a) - rank(b)
      || (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0)
      || a.id.localeCompare(b.id))
    .slice(0, maximum);
}

export function buildWorkerAccessGraph(evidence, {
  focusId = null,
  expandedIds = [],
  depth = 2,
  expansionDepth = 1,
  maxNodes = 72,
  maxEdges = 60,
} = {}) {
  const availability = workerAccessAvailability(evidence);
  if (!availability.available) return { ...availability, nodes: [], edges: [] };
  const nodes = evidence.nodes;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const resolvedFocus = nodeById.has(focusId)
    ? focusId
    : nodes.find(node => node.kind === 'residence')?.id ?? nodes[0]?.id ?? null;
  if (!resolvedFocus) {
    return {
      available: true,
      reason: null,
      focusId: null,
      nodes: [],
      edges: [],
      upperBounds: [],
      hiddenNodes: 0,
      width: 900,
      height: 320,
    };
  }
  const boundedMaximum = Math.max(1, Math.floor(maxNodes));
  const adjacency = adjacencyFor(nodes, evidence.edges);
  const selected = new Set();
  addNeighborhood(selected, resolvedFocus, adjacency, Math.max(0, depth), boundedMaximum);
  for (const id of expandedIds) {
    addNeighborhood(selected, id, adjacency, Math.max(0, expansionDepth), boundedMaximum);
  }
  const candidateEdges = evidence.edges.filter(edge =>
    selected.has(edge.source) && selected.has(edge.target));
  const visibleEdges = boundEdges(candidateEdges, resolvedFocus, Math.max(1, Math.floor(maxEdges)));
  const drawn = new Set([resolvedFocus]);
  for (const edge of visibleEdges) { drawn.add(edge.source); drawn.add(edge.target); }
  const visibleNodes = nodes.filter(node => drawn.has(node.id));
  const upperBounds = widestWorkplaceBounds(nodes, evidence.edges, resolvedFocus);
  const bottlenecks = new Set(upperBounds.map(bound => bound.bottleneckEdgeId).filter(Boolean));
  const layout = layoutNodes(visibleNodes);
  return {
    available: true,
    reason: null,
    focusId: resolvedFocus,
    nodes: visibleNodes.map(node => ({ ...node, ...layout.positions.get(node.id) })),
    edges: visibleEdges.map(edge => ({ ...edge, bottleneck: bottlenecks.has(edge.id) })),
    upperBounds,
    hiddenNodes: Math.max(0, nodes.length - visibleNodes.length),
    hiddenEdges: Math.max(0, candidateEdges.length - visibleEdges.length),
    width: layout.width,
    height: layout.height,
  };
}
