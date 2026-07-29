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
const PEDESTRIAN_SURFACES = new Map([
  [-1, { key: 'mud', factor: 0.6 }],
  [0, { key: 'gravel', factor: 1.05 }],
  [1, { key: 'asphalt', factor: 1.15, bySubtype: new Map([[1, 'brick']]) }],
  [2, { key: 'asphaltLit', factor: 1.2, bySubtype: new Map([[1, 'brickLit']]) }],
  [10, { key: 'bridge', factor: 1 }],
  [20, { key: 'tunnel', factor: 1 }],
]);

// Citizens walk beside roads too: the reach search seeds a building's road
// connection as readily as its footpath one, and the same speed table answers
// for class 0. Roads are slower than dedicated footpaths, which is what the
// factors below say — a dirt road is 50%, a paved one 87.5%.
const ROAD_SURFACES = new Map([
  [-1, { key: 'roadMud', factor: 0.6 }],
  [0, { key: 'roadGravel', factor: 0.75 }],
  [1, { key: 'roadAsphalt', factor: 0.95 }],
  [2, { key: 'roadSidewalk', factor: 1.05 }],
  [3, { key: 'roadSidewalk', factor: 1.05 }],
  [4, { key: 'roadSidewalk', factor: 1.05 }],
  [10, { key: 'roadBridge', factor: 0.75 }],
  [20, { key: 'roadTunnel', factor: 0.65 }],
]);

export const ROAD_NETWORK_CLASS = 0;
const SURFACES_BY_CLASS = new Map([
  [PEDESTRIAN_NETWORK_CLASS, PEDESTRIAN_SURFACES],
  [ROAD_NETWORK_CLASS, ROAD_SURFACES],
]);

export function walkingSurface(edge) {
  const table = SURFACES_BY_CLASS.get(edge?.networkClass);
  if (!table) return null;
  const entry = table.get(edge?.surfaceType) ?? DEFAULT_SURFACE;
  const key = entry.bySubtype?.get(edge?.surfaceSubtype) ?? entry.key;
  return { key, percent: percentOf(entry.factor) };
}

export function pedestrianSurface(edge) {
  return walkingSurface({ networkClass: PEDESTRIAN_NETWORK_CLASS, ...edge });
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

// The slots the game's own reach search seeds: kind 2 always, kind 0 unless the
// asset opts out. Kind 2 is the footpath connection and kind 0 the road one,
// which is why a building with only a road frontage is still walkable to.
const WALKING_SLOT_KINDS = new Set([0, 2]);

// The walkable edges a building is bound to, taken either from the raw
// connection slots or from the compact list an imported snapshot carries. Each
// is a (class, id) pair because the id only means anything within its network.
export function walkingEdgeRefsOf(building) {
  if (Array.isArray(building?.walkingEdgeRefs)) return building.walkingEdgeRefs;
  // A snapshot taken before roads were walkable stored footpath ids only. It
  // still describes a real, if incomplete, attachment, so it degrades to
  // footpaths rather than leaving the reader with an empty graph and no reason.
  if (Array.isArray(building?.pedestrianEdgeIds)) {
    return building.pedestrianEdgeIds.map(id => [PEDESTRIAN_NETWORK_CLASS, id]);
  }
  const refs = [];
  const seen = new Set();
  for (const connection of building?.connections ?? []) {
    if (!WALKING_SLOT_KINDS.has(connection.kind)) continue;
    for (const reference of connection.references ?? []) {
      if (!SURFACES_BY_CLASS.has(reference.networkClass)) continue;
      const key = `${reference.networkClass}:${reference.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push([reference.networkClass, reference.id]);
    }
  }
  return refs;
}

// Kept because removing an export is not a private change: a browser holding a
// cached older copy of an importer can never link against a module that dropped
// the name it asks for, and the page then fails to start at all rather than
// merely running stale. Deprecated — walkingEdgeRefsOf covers roads too.
export function pedestrianEdgeIdsOf(building) {
  return walkingEdgeRefsOf(building)
    .filter(([networkClass]) => networkClass === PEDESTRIAN_NETWORK_CLASS)
    .map(([, id]) => id);
}

// A building's connection slots name the network edge the game bound them to,
// so attachment needs no proximity guess. The search seeds those edges with
// zero distance walked and charges every edge it steps onto afterwards, which
// is why the graph below is walked edge to edge rather than node to node.
export function buildWalkingNetwork(networks, buildings = []) {
  // A bare network keeps meaning "the footpaths", which is what the unit tests
  // and any direct caller pass.
  const byClass = networks?.edges
    ? new Map([[PEDESTRIAN_NETWORK_CLASS, networks]])
    : new Map([
      [PEDESTRIAN_NETWORK_CLASS, networks?.pedestrian],
      [ROAD_NETWORK_CLASS, networks?.road],
    ].filter(([, network]) => network?.edges?.length));

  // Node ids are per-file, so the two graphs are joined on the coordinates
  // themselves. They meet exactly: on the test saves 433 and 794 junctions
  // match to the bit in x and z, every one of them with the same 0.38 m
  // difference in height between the footpath surface and the road surface.
  const nodeIds = new Map();
  const nodeIdFor = node => {
    const key = `${node.x}|${node.z}`;
    if (!nodeIds.has(key)) nodeIds.set(key, nodeIds.size);
    return nodeIds.get(key);
  };
  const localNodeIds = new Map();
  for (const [networkClass, network] of byClass) {
    localNodeIds.set(networkClass, network.nodes.map(nodeIdFor));
  }

  const edges = [];
  const adjacency = Array.from({ length: nodeIds.size }, () => []);
  const edgeIndex = new Map();
  let rawEdgeCount = 0;
  let unusableEdges = 0;
  for (const [networkClass, network] of byClass) {
    const local = localNodeIds.get(networkClass);
    for (const edge of network.edges) {
      rawEdgeCount += 1;
      const from = local[edge.from];
      const to = local[edge.to];
      const surface = walkingSurface({ networkClass, ...edge });
      if (!surface || !Number.isFinite(edge.length) || edge.length < 0
        || from === undefined || to === undefined) {
        unusableEdges += 1;
        continue;
      }
      const index = edges.length;
      edges.push({
        id: edge.id, networkClass, from, to, length: edge.length, ...surface,
      });
      edgeIndex.set(`${networkClass}:${edge.id}`, index);
      adjacency[from].push(index);
      adjacency[to].push(index);
    }
  }

  const buildingEdges = new Map();
  const edgeBuildings = new Map();
  let danglingReferences = 0;
  let attachedBuildings = 0;
  for (const building of buildings) {
    const attached = [];
    for (const [networkClass, id] of walkingEdgeRefsOf(building)) {
      // A reference into a network this save did not ship is not a decoding
      // failure, it is simply a network we were not given.
      if (!byClass.has(networkClass)) continue;
      const index = edgeIndex.get(`${networkClass}:${id}`);
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
    nodeCount: nodeIds.size,
    edges,
    adjacency,
    buildingEdges,
    edgeBuildings,
    completeness: {
      networkClasses: [...byClass.keys()],
      edgeCount: rawEdgeCount,
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
