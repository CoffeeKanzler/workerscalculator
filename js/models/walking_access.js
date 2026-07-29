// Walking reachability, taken from the game's own rule rather than a radius.
//
// Three facts were decoded from the executable and confirmed against real saves:
//
//   * a network edge stores its class, type and subtype at save offsets 0x4c,
//     0x40 and 0x44 — the same triple the runtime asset resolver switches on to
//     name an edge, which is why the surface can be identified exactly;
//   * class 4 is the pedestrian network, and the speed-factor table the build
//     menu prints as a percentage maps type/subtype to the values below;
//   * the reach search walks with a budget of 480 and rejects a step when the
//     distance walked so far, divided by the percentage of the step being
//     taken, exceeds it.
//
// That last rule is what reproduces the published figures exactly: a mud path
// is 50%, so 240 m of it exhausts the budget, and an illuminated path is 100%,
// so it carries the full 480 m.
export const PEDESTRIAN_NETWORK_CLASS = 4;
export const WALKING_BUDGET_METRES = 480;

// The game derives the printed percentage as `factor * 400 / 480` in single
// precision. Keeping the same arithmetic keeps our comparisons on the exact
// same side of the budget as the game's.
const REACH_NUMERATOR = 400;
const percentOf = factor => Math.fround(Math.fround(factor * REACH_NUMERATOR) / WALKING_BUDGET_METRES);

const DEFAULT_SURFACE = { key: 'other', factor: 1 };
const SURFACE_BY_TYPE = new Map([
  [-1, { key: 'mud', factor: 0.6 }],
  [0, { key: 'gravel', factor: 1.05 }],
  [1, { key: 'asphalt', factor: 1.15, bySubtype: new Map([[1, 'brick']]) }],
  [2, { key: 'asphaltLit', factor: 1.2, bySubtype: new Map([[1, 'brickLit']]) }],
  [10, { key: 'bridge', factor: 1 }],
  [20, { key: 'tunnel', factor: 1 }],
]);

export function pedestrianSurface(edge) {
  const entry = SURFACE_BY_TYPE.get(edge?.surfaceType) ?? DEFAULT_SURFACE;
  const key = entry.bySubtype?.get(edge?.surfaceSubtype) ?? entry.key;
  return { key, percent: percentOf(entry.factor) };
}

class MinHeap {
  #items = [];

  get size() { return this.#items.length; }

  push(key, value) {
    const items = this.#items;
    items.push({ key, value });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].key <= items[index].key) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop() {
    const items = this.#items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left].key < items[smallest].key) smallest = left;
        if (right < items.length && items[right].key < items[smallest].key) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

// The pedestrian edges a building is bound to, taken either from the raw
// connection slots or from the compact list an imported snapshot carries.
export function pedestrianEdgeIdsOf(building) {
  if (Array.isArray(building?.pedestrianEdgeIds)) return building.pedestrianEdgeIds;
  const ids = [];
  for (const connection of building?.connections ?? []) {
    for (const reference of connection.references ?? []) {
      if (reference.networkClass !== PEDESTRIAN_NETWORK_CLASS) continue;
      if (!ids.includes(reference.id)) ids.push(reference.id);
    }
  }
  return ids;
}

// A building's connection slots name the network edge the game bound them to,
// so attachment needs no proximity guess. The search seeds those edges with
// zero distance walked and charges every edge it steps onto afterwards, which
// is why the graph below is walked edge to edge rather than node to node.
export function buildWalkingNetwork(pedestrianNetwork, buildings = []) {
  const nodes = pedestrianNetwork?.nodes ?? [];
  const rawEdges = pedestrianNetwork?.edges ?? [];
  const edges = [];
  const adjacency = Array.from({ length: nodes.length }, () => []);
  let unusableEdges = 0;
  for (const edge of rawEdges) {
    const usable = Number.isFinite(edge.length) && edge.length >= 0
      && adjacency[edge.from] && adjacency[edge.to];
    if (!usable) { unusableEdges += 1; continue; }
    const surface = pedestrianSurface(edge);
    const index = edges.length;
    edges.push({ id: edge.id, from: edge.from, to: edge.to, length: edge.length, ...surface });
    adjacency[edge.from].push(index);
    adjacency[edge.to].push(index);
  }
  const edgeById = new Map(edges.map((edge, index) => [edge.id, index]));

  const buildingEdges = new Map();
  const edgeBuildings = new Map();
  let danglingReferences = 0;
  let attachedBuildings = 0;
  for (const building of buildings) {
    const attached = [];
    for (const id of pedestrianEdgeIdsOf(building)) {
      const index = edgeById.get(id);
      if (index === undefined) { danglingReferences += 1; continue; }
      if (!attached.includes(index)) attached.push(index);
    }
    if (!attached.length) continue;
    attachedBuildings += 1;
    buildingEdges.set(building.index, attached);
    for (const index of attached) {
      if (!edgeBuildings.has(index)) edgeBuildings.set(index, []);
      edgeBuildings.get(index).push(building.index);
    }
  }

  return {
    nodeCount: nodes.length,
    edges,
    adjacency,
    buildingEdges,
    edgeBuildings,
    completeness: {
      edgeCount: rawEdges.length,
      usableEdgeCount: edges.length,
      unusableEdges,
      danglingReferences,
      attachedBuildings,
      walkingEdgesComplete: unusableEdges === 0 && danglingReferences === 0 && edges.length > 0,
    },
  };
}

// Dijkstra over metres actually walked, expanding edge to edge. The budget test
// is applied to each step exactly as the game applies it, and shortest-by-
// distance is the right relaxation because a shorter prefix is never worse for
// a later step.
export function walkingReachFrom(network, buildingIndex, {
  budgetMeters = WALKING_BUDGET_METRES, maxVisitedEdges = 200_000,
} = {}) {
  const seedEdges = network?.buildingEdges?.get(buildingIndex);
  if (!seedEdges?.length) {
    return {
      available: false, reason: 'building-not-attached', budgetMeters, buildings: new Map(),
    };
  }
  const distance = new Float64Array(network.edges.length).fill(Infinity);
  const worstRatio = new Float64Array(network.edges.length);
  const worstEdge = new Array(network.edges.length).fill(null);
  const queue = new MinHeap();
  for (const index of seedEdges) {
    if (distance[index] === 0) continue;
    distance[index] = 0;
    queue.push(0, index);
  }
  let visited = 0;
  let truncated = false;
  while (queue.size) {
    const { key, value: index } = queue.pop();
    if (key > distance[index]) continue;
    visited += 1;
    if (visited > maxVisitedEdges) { truncated = true; break; }
    const edge = network.edges[index];
    for (const node of [edge.from, edge.to]) {
      for (const candidate of network.adjacency[node]) {
        if (candidate === index) continue;
        const next = network.edges[candidate];
        const walked = key + next.length;
        const ratio = walked / next.percent;
        if (ratio > budgetMeters) continue;
        if (walked >= distance[candidate]) continue;
        distance[candidate] = walked;
        const carried = Math.max(worstRatio[index], ratio);
        worstRatio[candidate] = carried;
        worstEdge[candidate] = carried === ratio ? next : worstEdge[index];
        queue.push(walked, candidate);
      }
    }
  }

  const reached = new Map();
  for (const [index, buildingIndices] of network.edgeBuildings) {
    const walked = distance[index];
    if (!Number.isFinite(walked)) continue;
    for (const reachedIndex of buildingIndices) {
      const previous = reached.get(reachedIndex);
      if (previous && previous.distanceMeters <= walked) continue;
      const limiting = worstEdge[index];
      reached.set(reachedIndex, {
        buildingIndex: reachedIndex,
        distanceMeters: walked,
        budgetUsed: worstRatio[index],
        limitingSurface: limiting?.key ?? null,
        limitingEdgeId: limiting?.id ?? null,
      });
    }
  }
  reached.delete(buildingIndex);
  return {
    available: true, reason: null, truncated, visitedEdges: visited,
    budgetMeters, buildings: reached,
  };
}
