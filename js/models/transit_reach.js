// Everywhere a person standing at one building can get to.
//
// The map's click overlay used to answer only the walking half of this, which
// made a republic that moves its workers by cableway or by train look as though
// its industry were unreachable. The rule here is the one the access graph
// already uses for its corridors: walk within the budget, board any service
// calling at a stop inside that walk, leave at any other stop it calls at,
// change services at most once, and walk again from wherever that puts you.
//
// Riding is not charged against the walking budget — the budget is a walking
// rule — so each leg's walk starts again from the stop.

// The services a republic runs, whatever describes them: saved lines, the
// routes individual vehicles carry, and cableway routes with nothing scheduling
// them at all. A cable whose cabins already carry a route is described by that
// route and is not counted twice.
export function composeServices({
  vehicleLines = null,
  vehicleRoutes = null,
  cablewayRoutes = null,
  cablewayLabel = null,
} = {}) {
  const savedLines = Array.isArray(vehicleLines) ? vehicleLines : vehicleLines?.lines ?? [];
  const routeLines = (vehicleRoutes?.routes ?? []).map(route => ({
    slot: route.id,
    name: route.name,
    stopIds: route.stopIds,
    vehicleIds: route.vehicleIds ?? [],
    mode: route.mode ?? 'vehicleRoute',
    stopSignature: route.stopSignature,
  }));
  const routeSignatures = new Set(routeLines.map(line => line.stopSignature));
  const cablewayLines = (cablewayRoutes?.routes ?? []).map((route, order) => ({
    slot: route.id,
    name: cablewayLabel ? `${cablewayLabel} ${order + 1}` : `#${order + 1}`,
    stopIds: route.stationIndices,
    vehicleIds: [],
    mode: 'cableway',
    lengthMeters: route.lengthMeters,
    stopSignature: [...route.stationIndices].sort((a, b) => a - b).join('-'),
  })).filter(line => !routeSignatures.has(line.stopSignature));
  return [...savedLines, ...routeLines, ...cablewayLines]
    .filter(line => (line.stopIds ?? []).filter(stop => stop >= 0).length >= 2);
}

// A stop only counts if a citizen can walk the last metre to it, so a station
// bound to no footpath or road serves nobody however many services call there.
export function indexServices(services, isAttached = () => true) {
  const stopIndices = new Set();
  const servicesByStop = new Map();
  const bySlot = new Map();
  for (const service of services ?? []) {
    bySlot.set(service.slot, service);
    for (const stop of service.stopIds ?? []) {
      if (stop < 0 || !isAttached(stop)) continue;
      stopIndices.add(stop);
      if (!servicesByStop.has(stop)) servicesByStop.set(stop, []);
      if (!servicesByStop.get(stop).includes(service.slot)) {
        servicesByStop.get(stop).push(service.slot);
      }
    }
  }
  return { stopIndices, servicesByStop, bySlot };
}

// Which buildings can walk to which stop, measured from each building outward
// and computed once. Done inside the per-residence search instead it was
// 600 residences times 1400 buildings, and the evidence build went from a third
// of a second to three and a half.
export function indexStopWalkers(candidates, reachOf, stopIndices) {
  const byStop = new Map();
  for (const candidate of candidates ?? []) {
    const outward = reachOf?.(candidate);
    if (!outward?.available) continue;
    for (const [reached, leg] of outward.buildings) {
      if (!stopIndices.has(reached)) continue;
      if (!byStop.has(reached)) byStop.set(reached, []);
      byStop.get(reached).push({ buildingIndex: candidate, leg });
    }
  }
  return byStop;
}

export function transitReachFrom(index, {
  reachOf,
  stopIndices = new Set(),
  servicesByStop = new Map(),
  bySlot = new Map(),
  stopWalkers = new Map(),
} = {}) {
  const empty = {
    available: false, walk: new Map(), transit: new Map(),
    boardStops: [], serviceSlots: new Set(),
  };
  const walkReach = reachOf?.(index);
  if (!walkReach?.available) return empty;

  const boardStops = [...walkReach.buildings.keys()].filter(stop => stopIndices.has(stop));
  const servedStopsOf = slot => (bySlot.get(slot)?.stopIds ?? [])
    .filter(stop => stop >= 0 && stopIndices.has(stop));

  // The services boardable from here, then — one change, and no more — the
  // services reachable from anywhere those first ones call at.
  const serviceSlots = new Set();
  for (const stop of boardStops) {
    for (const slot of servicesByStop.get(stop) ?? []) serviceSlots.add(slot);
  }
  const alightStops = new Set();
  for (const slot of [...serviceSlots]) {
    for (const stop of servedStopsOf(slot)) {
      alightStops.add(stop);
      for (const other of servicesByStop.get(stop) ?? []) {
        if (serviceSlots.has(other)) continue;
        serviceSlots.add(other);
        for (const onward of servedStopsOf(other)) alightStops.add(onward);
      }
    }
  }

  // The last leg is measured from the far building outward, not from the stop
  // towards it. The walking rule is not symmetric — a short slow stub beside a
  // building passes as the first step of a walk and fails as the last — and on
  // the test save two workplaces the game staffs 5 of 5 came out unreachable
  // when the leg was walked from the stop. Measured from the building, no
  // staffed building the game fills is reported unreachable at all.
  const transit = new Map();
  const seen = new Set(walkReach.buildings.keys());
  seen.add(index);
  for (const stop of alightStops) {
    if (seen.has(stop)) continue;
    seen.add(stop);
    transit.set(stop, {
      buildingIndex: stop, alightStop: stop,
      distanceMeters: 0, budgetUsed: 0, limitingSurface: null,
    });
  }
  for (const stop of alightStops) {
    for (const { buildingIndex, leg } of stopWalkers.get(stop) ?? []) {
      if (seen.has(buildingIndex)) continue;
      const held = transit.get(buildingIndex);
      if (held && held.distanceMeters <= leg.distanceMeters) continue;
      transit.set(buildingIndex, {
        buildingIndex,
        alightStop: stop,
        distanceMeters: leg.distanceMeters,
        budgetUsed: leg.budgetUsed,
        limitingSurface: leg.limitingSurface ?? null,
      });
    }
  }
  for (const buildingIndex of transit.keys()) seen.add(buildingIndex);
  return {
    available: true,
    walk: walkReach.buildings,
    transit,
    boardStops,
    serviceSlots,
    budgetMeters: walkReach.budgetMeters,
  };
}
