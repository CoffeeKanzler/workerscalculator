// Cableways as public transport.
//
// A Seilbahn carries no line: the cabins simply run the cable, so nothing in
// lines.bin describes it and a model built only from saved lines reports a
// republic that moves its workers by cableway as having no public transport at
// all. Everything needed is in the save all the same:
//
//   * cableway.bin is a network file in the same layout as road.bin, and its
//     edges carry network class 12 (proven: every edge in the file reports 12,
//     and the only connection slots that reference class 12 belong to cableway
//     stations and pylons);
//   * the file's own node ids do not join one span to the next — each span is
//     an isolated pair of nodes. What joins them is the pylon standing between
//     them, which references both spans in its connection slots. So a route is
//     the transitive closure of "carried by the same building";
//   * a pylon and a station are told apart by the save's own asset type:
//     savedTypePlusOne is 12 for every cableway pylon and 2 for every station.
//     Type 2 is the game's passenger-stop type in general — bus stops, tram
//     stops, passenger rail platforms and heliports all report it — which is
//     exactly the set a citizen can board at.
//
// What is derived rather than read: that a passenger boarding at one station of
// a route can leave at any other station of that route. The cable is one closed
// loop of cabins, so this is the topology the save records; it is not a claim
// about waiting times or cabin capacity, and this module states no capacity.
export const CABLEWAY_NETWORK_CLASS = 12;
export const PASSENGER_STATION_SAVED_TYPE = 2;

// The cableway edges a building is bound to, from the raw connection slots or
// from the compact list an imported snapshot carries.
export function cablewayEdgeIdsOf(building) {
  if (Array.isArray(building?.cablewayEdgeIds)) return building.cablewayEdgeIds;
  const ids = [];
  for (const connection of building?.connections ?? []) {
    for (const reference of connection.references ?? []) {
      if (reference.networkClass !== CABLEWAY_NETWORK_CLASS) continue;
      if (!ids.includes(reference.id)) ids.push(reference.id);
    }
  }
  return ids;
}

export function isPassengerStation(building) {
  return building?.savedTypePlusOne === PASSENGER_STATION_SAVED_TYPE;
}

class DisjointSet {
  #parent = new Map();

  find(item) {
    if (!this.#parent.has(item)) this.#parent.set(item, item);
    let root = item;
    while (this.#parent.get(root) !== root) root = this.#parent.get(root);
    let cursor = item;
    while (this.#parent.get(cursor) !== root) {
      const next = this.#parent.get(cursor);
      this.#parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.#parent.set(rootB, rootA);
  }
}

export function buildCablewayRoutes(network, buildings = []) {
  const empty = {
    routes: [],
    completeness: {
      edgeCount: 0, attachedBuildings: 0, stationCount: 0, danglingReferences: 0,
    },
  };
  if (!network?.edges?.length) return empty;

  const lengthById = new Map();
  for (const edge of network.edges) {
    if (edge.networkClass !== CABLEWAY_NETWORK_CLASS) continue;
    lengthById.set(edge.id, Number.isFinite(edge.length) ? edge.length : 0);
  }
  if (!lengthById.size) return empty;

  const spans = new DisjointSet();
  const carried = new Map();
  let danglingReferences = 0;
  let attachedBuildings = 0;
  for (const building of buildings) {
    const ids = cablewayEdgeIdsOf(building).filter(id => {
      if (lengthById.has(id)) return true;
      danglingReferences += 1;
      return false;
    });
    if (!ids.length) continue;
    attachedBuildings += 1;
    for (const id of ids.slice(1)) spans.union(ids[0], id);
    carried.set(building.index, { building, ids });
  }

  const routes = new Map();
  const routeFor = id => {
    const root = spans.find(id);
    if (!routes.has(root)) {
      routes.set(root, { id: `cableway:${root}`, edgeIds: [], stationIndices: [], lengthMeters: 0 });
    }
    return routes.get(root);
  };
  for (const id of lengthById.keys()) {
    const route = routeFor(id);
    route.edgeIds.push(id);
    route.lengthMeters += lengthById.get(id);
  }
  let stationCount = 0;
  for (const { building, ids } of carried.values()) {
    if (!isPassengerStation(building)) continue;
    stationCount += 1;
    const route = routeFor(ids[0]);
    if (!route.stationIndices.includes(building.index)) route.stationIndices.push(building.index);
  }

  // A route nobody can both board and leave carries no worker, so it is left
  // out rather than drawn as a corridor that goes nowhere.
  const usable = [...routes.values()]
    .filter(route => route.stationIndices.length >= 2)
    .map(route => ({
      ...route,
      edgeIds: route.edgeIds.slice().sort((a, b) => a - b),
      stationIndices: route.stationIndices.slice().sort((a, b) => a - b),
    }))
    .sort((a, b) => a.stationIndices[0] - b.stationIndices[0]);

  return {
    routes: usable,
    completeness: {
      edgeCount: lengthById.size,
      attachedBuildings,
      stationCount,
      danglingReferences,
    },
  };
}
