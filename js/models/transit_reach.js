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

export function transitReachFrom(index, {
  reachOf,
  stopIndices = new Set(),
  servicesByStop = new Map(),
  bySlot = new Map(),
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

  // Anything already within walking distance is reported as a walk, not as a
  // ride: the shorter, surer answer is the one the reader wants.
  const transit = new Map();
  const seen = new Set(walkReach.buildings.keys());
  seen.add(index);
  for (const stop of alightStops) {
    const onward = reachOf(stop);
    if (!onward?.available) continue;
    for (const target of [stop, ...onward.buildings.keys()]) {
      if (seen.has(target)) continue;
      seen.add(target);
      const leg = target === stop ? null : onward.buildings.get(target);
      transit.set(target, {
        buildingIndex: target,
        alightStop: stop,
        // The last walk, which is what decides whether the corridor is usable.
        distanceMeters: leg?.distanceMeters ?? 0,
        budgetUsed: leg?.budgetUsed ?? 0,
        limitingSurface: leg?.limitingSurface ?? null,
      });
    }
  }
  return {
    available: true,
    walk: walkReach.buildings,
    transit,
    boardStops,
    serviceSlots,
    budgetMeters: walkReach.budgetMeters,
  };
}
